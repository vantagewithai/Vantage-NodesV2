import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor, ImageDraw
import torch
import torch.nn.functional as F

import folder_paths
from comfy_execution.graph import ExecutionBlocker


def prepare_layers(images, masks, normalize_height, height, invert_masks):
    layers = []
    for index, image in enumerate(images):
        pixels = image.detach().cpu().float().clamp(0, 1)
        alpha = pixels[..., 3] if pixels.shape[-1] == 4 else torch.ones_like(pixels[..., 0])
        if masks is not None and (len(masks) == 1 or index < len(masks)):
            mask = masks[0 if len(masks) == 1 else index].detach().cpu().float()
            mask = F.interpolate(mask.reshape(1, 1, *mask.shape[-2:]), size=pixels.shape[:2], mode="bilinear", align_corners=False)[0, 0]
            alpha = alpha * (1 - mask if invert_masks else mask).clamp(0, 1)
        rgba = torch.cat((pixels[..., :3], alpha.unsqueeze(-1)), dim=-1)
        layer = Image.fromarray((rgba.numpy() * 255).round().astype(np.uint8), "RGBA")
        if normalize_height:
            layer = layer.resize((max(1, round(layer.width * height / layer.height)), height), Image.Resampling.LANCZOS)
        layers.append(layer)
    return layers


def default_layer(index, image, width, height):
    scale = min(1, width / image.width, height / image.height)
    return {"index": index, "x": width / 2, "y": height / 2, "width": image.width * scale,
            "height": image.height * scale, "angle": 0, "opacity": 1, "visible": True,
            "flip_x": False, "flip_y": False}


def layer_affine(layer, image):
    sx = layer["width"] / image.width * (-1 if layer.get("flip_x") else 1)
    sy = layer["height"] / image.height * (-1 if layer.get("flip_y") else 1)
    angle = math.radians(layer.get("angle", 0))
    c, s = math.cos(angle), math.sin(angle)
    a, b, d, e = c * sx, -s * sy, s * sx, c * sy
    determinant = a * e - b * d
    tx = layer["x"] - a * image.width / 2 - b * image.height / 2
    ty = layer["y"] - d * image.width / 2 - e * image.height / 2
    return (e / determinant, -b / determinant, (b * ty - e * tx) / determinant,
            -d / determinant, a / determinant, (d * tx - a * ty) / determinant)


def render_composition(images, state, width, height):
    canvas = Image.new("RGBA", (width, height), ImageColor.getrgb(state.get("background", "#ffffff")) + (255,))
    for layer in state["layers"]:
        if not layer.get("visible", True) or layer["width"] <= 0 or layer["height"] <= 0:
            continue
        image = images[layer["index"]]
        positioned = image.transform((width, height), Image.Transform.AFFINE, layer_affine(layer, image), Image.Resampling.BICUBIC)
        opacity = max(0, min(1, layer.get("opacity", 1)))
        if opacity != 1:
            positioned.putalpha(positioned.getchannel("A").point(lambda value: round(value * opacity)))
        canvas = Image.alpha_composite(canvas, positioned)
    if not state.get("strokes"):
        return canvas.convert("RGB")
    foreground = Image.new("RGBA", canvas.size)
    draw = ImageDraw.Draw(foreground)
    for stroke in state["strokes"]:
        points = [tuple(point) for point in stroke.get("points", [])]
        if not points:
            continue
        size = max(1, round(stroke.get("size", 10)))
        color = (0, 0, 0, 0) if stroke.get("erase") else ImageColor.getrgb(stroke.get("color", "#ffffff")) + (255,)
        if len(points) > 1:
            draw.line(points, fill=color, width=size, joint="curve")
        for x, y in points:
            radius = size / 2
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    return Image.alpha_composite(canvas, foreground).convert("RGB")


class VantageImageCompositor:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "images": ("IMAGE",),
            "width": ("INT", {"default": 1024, "min": 1, "max": 16384}),
            "height": ("INT", {"default": 1024, "min": 1, "max": 16384}),
            "padding": ("INT", {"default": 100, "min": 0, "max": 16384}),
            "normalize_height": ("BOOLEAN", {"default": False}),
            "auto_continue": ("BOOLEAN", {"default": False}),
            "invert_masks": ("BOOLEAN", {"default": False}),
            "composition": ("STRING", {"default": "{}"}),
            "input_signature": ("STRING", {"default": ""}),
        }, "optional": {"masks": ("MASK",)}}

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "transforms")
    FUNCTION = "compose"
    CATEGORY = "Vantage/Image"
    OUTPUT_NODE = True

    def compose(self, images, width=1024, height=1024, padding=100, normalize_height=False,
                auto_continue=False, invert_masks=False, composition="{}", input_signature="", masks=None):
        layers = prepare_layers(images, masks, normalize_height, height, invert_masks)
        config = [width, height, padding, normalize_height, invert_masks]
        digest = hashlib.sha256(json.dumps(config).encode())
        previews = []
        directory = Path(folder_paths.get_temp_directory()) / "vantage_compositor"
        directory.mkdir(parents=True, exist_ok=True)
        for layer in layers:
            identity = hashlib.sha256(str(layer.size).encode() + layer.tobytes()).hexdigest()
            digest.update(identity.encode())
            filename = f"{identity}.png"
            path = directory / filename
            if not path.exists():
                layer.save(path, compress_level=1)
            previews.append({"filename": filename, "subfolder": "vantage_compositor", "type": "temp",
                             "width": layer.width, "height": layer.height})
        signature = digest.hexdigest()
        state = json.loads(composition)
        saved = {layer["index"]: layer for layer in state.get("layers", [])}
        state["layers"] = [layer for layer in state.get("layers", []) if 0 <= layer["index"] < len(layers)]
        state["layers"].extend(default_layer(i, layer, width, height) for i, layer in enumerate(layers) if i not in saved)
        serialized = json.dumps(state)
        paused = signature != input_signature and not auto_continue
        ui = {"layers": previews, "signature": [signature], "composition": [serialized],
              "canvas_size": [width, height], "padding": [padding], "paused": [paused]}
        if paused:
            return {"ui": ui, "result": (ExecutionBlocker(None), ExecutionBlocker(None))}
        rendered = render_composition(layers, state, width, height)
        output = torch.from_numpy(np.array(rendered).astype(np.float32) / 255).unsqueeze(0)
        return {"ui": ui, "result": (output, serialized)}
