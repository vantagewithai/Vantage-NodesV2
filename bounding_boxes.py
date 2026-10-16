import asyncio
import hashlib
import io
import math
import json
import os

import numpy as np
import torch
import torch.nn.functional as F
from aiohttp import web
from PIL import Image, ImageColor, ImageEnhance, ImageFilter, ImageOps

import folder_paths
from comfy.utils import common_upscale
from comfy_extras.nodes_resolution import ASPECT_RATIOS, ResolutionSelector
from server import PromptServer
from comfy_extras.nodes_bounding_boxes import (
    boxes_from_input,
    boxes_to_regions,
    build_elements,
    fractions_to_bbox_frame,
    render_preview,
)


def _background_path(filename):
    input_dir = os.path.realpath(folder_paths.get_input_directory())
    path = os.path.realpath(os.path.join(input_dir, filename))
    if os.path.commonpath((input_dir, path)) != input_dir:
        raise ValueError("Background image must be inside the ComfyUI input folder")
    return path


_RESIZE_METHODS = ("nearest-exact", "bilinear", "area", "bicubic", "lanczos")
_RESIZE_MODES = ("stretch", "resize", "pad", "pad_edge", "pad_edge_pixel", "crop", "pillarbox_blur", "total_pixels")
_POSITIONS = ("center", "top", "bottom", "left", "right")


def _image_to_pil(image):
    return Image.fromarray((image[0].numpy() * 255).clip(0, 255).astype(np.uint8))


def _position_offsets(dx, dy, position):
    x = 0 if position == "left" else dx if position == "right" else dx // 2
    y = 0 if position == "top" else dy if position == "bottom" else dy // 2
    return x, y


def _resize_background(image, options):
    _, original_h, original_w, _ = image.shape
    if not options.get("enabled", False):
        return image, [1, 1, 0, 0]
    method = options.get("upscale_method", "lanczos")
    mode = options.get("keep_proportion", "resize")
    position = options.get("crop_position", "center")
    if method not in _RESIZE_METHODS or mode not in _RESIZE_MODES or position not in _POSITIONS:
        raise ValueError("Unsupported resize method, aspect mode or crop position")
    width = max(0, int(options.get("width", 1024)))
    height = max(0, int(options.get("height", 1024)))
    divisor = max(1, int(options.get("divisible_by", 2)))
    pad = mode.startswith("pad") or mode == "pillarbox_blur"
    target_w, target_h = width or original_w, height or original_h
    crop_x = crop_y = 0
    crop_w, crop_h = original_w, original_h
    if mode == "total_pixels":
        pixels = (width or original_w) * (height or original_h)
        width = int(math.sqrt(pixels * original_w / original_h))
        height = int(math.sqrt(pixels * original_h / original_w))
    elif mode == "resize" or pad:
        ratio = min(width / original_w if width else float("inf"), height / original_h if height else float("inf"))
        if not width and not height:
            ratio = 1
        width, height = round(original_w * ratio), round(original_h * ratio)
        target_w = target_w if options.get("width", 1024) else width
        target_h = target_h if options.get("height", 1024) else height
    else:
        width, height = target_w, target_h
    width = max(divisor, width - width % divisor)
    height = max(divisor, height - height % divisor)
    source = image.movedim(-1, 1)
    if mode == "crop":
        if original_w / original_h > width / height:
            crop_w = max(1, round(original_h * width / height))
        else:
            crop_h = max(1, round(original_w * height / width))
        crop_x, crop_y = _position_offsets(original_w - crop_w, original_h - crop_h, position)
        source = source[:, :, crop_y:crop_y + crop_h, crop_x:crop_x + crop_w]
    resized = common_upscale(source, width, height, method, "disabled")
    left = top = 0
    if pad:
        target_w = max(width, math.ceil(target_w / divisor) * divisor)
        target_h = max(height, math.ceil(target_h / divisor) * divisor)
        left, top = _position_offsets(target_w - width, target_h - height, position)
        right, bottom = target_w - width - left, target_h - height - top
        if mode == "pad_edge_pixel":
            resized = F.pad(resized, (left, right, top, bottom), mode="replicate")
        else:
            if mode == "pillarbox_blur":
                bg = common_upscale(resized, target_w, target_h, "bilinear", "center").movedim(1, -1)
                pil = _image_to_pil(bg).filter(ImageFilter.GaussianBlur(max(1, min(target_w, target_h) * 0.006)))
                pil = ImageEnhance.Brightness(ImageEnhance.Color(pil).enhance(0.8)).enhance(0.35)
                padded = torch.from_numpy(np.asarray(pil, dtype=np.float32) / 255).permute(2, 0, 1).unsqueeze(0)
            else:
                padded = resized.new_empty((1, 3, target_h, target_w))
                if mode == "pad_edge":
                    padded[:, :, :top] = resized[:, :, :1].mean(dim=3, keepdim=True)
                    padded[:, :, top + height:] = resized[:, :, -1:].mean(dim=3, keepdim=True)
                    padded[:, :, :, :left] = resized[:, :, :, :1].mean(dim=2, keepdim=True)
                    padded[:, :, :, left + width:] = resized[:, :, :, -1:].mean(dim=2, keepdim=True)
                else:
                    value = options.get("pad_color", "0, 0, 0")
                    rgb = ImageColor.getrgb(value) if value.startswith("#") else tuple(int(c.strip()) for c in value.split(","))
                    if len(rgb) != 3 or any(c < 0 or c > 255 for c in rgb):
                        raise ValueError("Pad color must be #RRGGBB or three RGB values from 0 to 255")
                    for channel, value in enumerate(rgb):
                        padded[:, channel].fill_(value / 255)
            padded[:, :, top:top + height, left:left + width] = resized
            resized = padded
    sx, sy = width / crop_w, height / crop_h
    return resized.movedim(1, -1), [sx, sy, left - crop_x * sx, top - crop_y * sy]


def _resolution_options(resize_options, resize, aspect_ratio, megapixels, multiple):
    options = json.loads(resize_options)
    if not isinstance(options, dict):
        raise ValueError("Resize settings must be a JSON object")
    width, height = ResolutionSelector.execute(aspect_ratio, megapixels, multiple).result
    options.setdefault("keep_proportion", "pad")
    options.update(enabled=resize, width=width, height=height, divisible_by=multiple)
    return options


def _transform_boxes(boxes, before, after):
    ox, oy, dx, dy = before
    sx, sy, tx, ty = after
    return [{**box, "x": round((box["x"] - dx) / ox * sx + tx), "y": round((box["y"] - dy) / oy * sy + ty),
             "width": round(box["width"] / ox * sx), "height": round(box["height"] / oy * sy)} for box in boxes]


def _load_background(filename, resize_options):
    options = json.loads(resize_options)
    if not isinstance(options, dict):
        raise ValueError("Resize settings must be a JSON object")
    with Image.open(_background_path(filename)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = torch.from_numpy(np.asarray(image, dtype=np.float32) / 255).unsqueeze(0)
    return _resize_background(image, options)


def _background_png(filename, options):
    image, transform = _load_background(filename, options)
    buffer = io.BytesIO()
    _image_to_pil(image).save(buffer, format="PNG")
    return buffer.getvalue(), transform


async def background_preview(request):
    try:
        data, transform = await asyncio.to_thread(_background_png, request.query.get("filename", ""), request.query.get("resize_options", "{}"))
    except (ValueError, OSError) as exc:
        raise web.HTTPBadRequest(text=str(exc)) from exc
    return web.Response(body=data, content_type="image/png", headers={"X-Vantage-Transform": json.dumps(transform), "Cache-Control": "no-store"})


if hasattr(PromptServer, "instance") and PromptServer.instance is not None:
    PromptServer.instance.routes.get("/vantage/bounding-boxes/background")(background_preview)


class VantageBoundingBoxes:
    @classmethod
    def INPUT_TYPES(cls):
        files, _ = folder_paths.recursive_search(folder_paths.get_input_directory())
        images = sorted(folder_paths.filter_files_content_types(files, ["image"]))
        return {
            "required": {
                "resize": ("BOOLEAN", {"default": False}),
                "aspect_ratio": ([ratio.value for ratio in ASPECT_RATIOS],),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1}),
                "multiple": ("INT", {"default": 8, "min": 8, "max": 128, "step": 4}),
                "editor_state": ("STRING", {"default": "[]", "multiline": True}),
                "last_incoming": ("STRING", {"default": "[]", "multiline": True}),
                "background_image": (["(none)"] + images,),
                "resize_options": ("STRING", {"default": "{}", "multiline": True}),
                "background_state": ("STRING", {"default": "{}", "multiline": True}),
            },
            "optional": {
                "bboxes": ("BOUNDING_BOX,ARRAY,STRING",),
            },
        }

    RETURN_TYPES = ("IMAGE", "BOUNDING_BOX", "ARRAY", "IMAGE", "INT", "INT")
    RETURN_NAMES = ("preview", "bboxes", "elements", "image", "width", "height")
    FUNCTION = "execute"
    CATEGORY = "Vantage/Image"
    OUTPUT_NODE = True

    def execute(self, resize=False, aspect_ratio="1:1 (Square)", megapixels=1.0, multiple=8, editor_state="[]", last_incoming="[]", background_image="(none)", bboxes=None, resize_options="{}", background_state="{}"):
        state = json.loads(background_state)
        effective = _resolution_options(resize_options, resize, aspect_ratio, megapixels, multiple)
        width, height = (effective["width"], effective["height"]) if resize else (1024, 1024)
        background = None
        transform = [1, 1, 0, 0]
        if background_image != "(none)":
            image, transform = _load_background(background_image, json.dumps(effective))
            background = _image_to_pil(image)
            height, width = image.shape[1:3]
        else:
            image = torch.zeros((1, height, width, 3))
        incoming = boxes_from_input(bboxes, width, height)
        applied = json.loads(last_incoming)
        upstream_changed = bool(incoming) and incoming != applied
        source = incoming if upstream_changed else json.loads(editor_state)
        remap = not upstream_changed and state.get("background_image") == background_image and state.get("transform") is not None and state["transform"] != transform
        if remap:
            source = _transform_boxes(source, state["transform"], transform)
        regions = boxes_to_regions(source, width, height)
        next_state = {"background_image": background_image, "transform": transform}
        ui = {"dims": [width, height], "background_state": [json.dumps(next_state)]}
        if remap:
            ui["editor_state"] = [source]
        if incoming:
            ui["input_bboxes"] = incoming
        return {
            "ui": ui,
            "result": (
                render_preview(regions, width, height, background),
                fractions_to_bbox_frame(regions, width, height),
                build_elements(regions),
                image,
                width,
                height,
            ),
        }

    @classmethod
    def IS_CHANGED(cls, background_image="(none)", **kwargs):
        if background_image == "(none)":
            return ""
        with open(_background_path(background_image), "rb") as image:
            return hashlib.sha256(image.read()).hexdigest()
