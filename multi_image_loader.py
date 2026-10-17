import io
import os

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

import comfy.utils
import folder_paths


def _pil_to_tensor(image: Image.Image) -> torch.Tensor:
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0)[None, ...]


def _resolve_existing_path(path: str):
    input_dir = os.path.realpath(folder_paths.get_input_directory())
    full_path = os.path.realpath(os.path.join(input_dir, path))
    if os.path.commonpath((input_dir, full_path)) != input_dir:
        raise ValueError("Image must be inside the ComfyUI input folder")
    return full_path


class ImageOutputTypes(tuple):
    def __getitem__(self, index):
        # Prompt validation also needs the type of sockets added beyond the default ten.
        if isinstance(index, int) and index >= len(self):
            return "IMAGE"
        return super().__getitem__(index)


class VantageMultiImageLoaderV2:
    @classmethod
    def INPUT_TYPES(cls):
        files, _ = folder_paths.recursive_search(folder_paths.get_input_directory())
        images = sorted(folder_paths.filter_files_content_types(files, ["image"]))
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True}),
                "width": ("INT", {"default": 1024, "min": 1, "max": 2147483647}),
                "height": ("INT", {"default": 1024, "min": 1, "max": 2147483647}),
                "fit_edge": (["longer", "shorter"], {"tooltip": "Longer fits inside width × height. Shorter covers width × height and may exceed one dimension. Neither mode enlarges images."}),
                "img_compression": ("INT", {"default": 18, "min": 0, "max": 100, "step": 1}),
                "use_background": ("BOOLEAN", {"default": True}),
                "max_images": ("INT", {"default": 10, "min": 1, "max": 2147483647}),
                "image": (["(none)"] + images,),
            },
            "optional": {"background": ("IMAGE", {"lazy": True})},
        }

    RETURN_TYPES = ImageOutputTypes(("IMAGE", "MASK") + ("IMAGE",) * 10)
    RETURN_NAMES = ("IMAGE", "MASK") + tuple(f"image_{index}" for index in range(10))
    FUNCTION = "load_images"
    CATEGORY = "Vantage/Image"

    @staticmethod
    def _fit_dimensions(image, width, height, fit_edge):
        original_h, original_w = image.shape[1:3]
        if original_w <= width and original_h <= height:
            return image
        ratios = (width / original_w, height / original_h)
        scale = min(1.0, min(ratios) if fit_edge == "longer" else max(ratios))
        if scale >= 1:
            return image
        width, height = max(1, int(original_w * scale)), max(1, int(original_h * scale))
        return comfy.utils.common_upscale(image.movedim(-1, 1), width, height, "lanczos", "disabled").movedim(1, -1).clamp(0, 1)

    @staticmethod
    def _empty_mask_like(image_tensor: torch.Tensor):
        return torch.zeros(
            (image_tensor.shape[0], image_tensor.shape[1], image_tensor.shape[2]),
            dtype=image_tensor.dtype,
            device=image_tensor.device,
        )

    @staticmethod
    def _compress_tensor(image_tensor: torch.Tensor, img_compression: int):
        if img_compression <= 0:
            return image_tensor
        img_np = (image_tensor[0].detach().cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
        img_pil = Image.fromarray(img_np).convert("RGB")
        img_byte_arr = io.BytesIO()
        img_pil.save(img_byte_arr, format="JPEG", quality=max(1, 100 - img_compression))
        img_byte_arr.seek(0)
        img_pil = Image.open(img_byte_arr).convert("RGB")
        return torch.from_numpy(np.array(img_pil).astype(np.float32) / 255.0)[None, ...]

    @staticmethod
    def _ensure_rgba(image_tensor: torch.Tensor) -> torch.Tensor:
        if image_tensor.shape[-1] == 4:
            return image_tensor
        if image_tensor.shape[-1] == 3:
            alpha = torch.ones(
                image_tensor.shape[:-1] + (1,),
                dtype=image_tensor.dtype,
                device=image_tensor.device,
            )
            return torch.cat((image_tensor, alpha), dim=-1)
        if image_tensor.shape[-1] == 1:
            rgb = image_tensor.expand(-1, -1, -1, 3)
            alpha = torch.ones(
                image_tensor.shape[:-1] + (1,),
                dtype=image_tensor.dtype,
                device=image_tensor.device,
            )
            return torch.cat((rgb, alpha), dim=-1)
        raise ValueError(f"Unsupported channel count: {image_tensor.shape[-1]}")
    
    def check_lazy_status(self, use_background=True, background=None, **kwargs):
        return ["background"] if use_background and background is None else []

    def load_images(self, image_paths, width=1024, height=1024, fit_edge="longer", img_compression=18, max_images=10, image="(none)", background=None, use_background=True):
        images = []
        limit = max(1, int(max_images))
        if use_background and background is not None:
            images.extend(self._fit_dimensions(frame, width, height, fit_edge) for frame in background[:limit].split(1))
        seen = set()
        for path in image_paths.splitlines():
            path = path.strip()
            if not path:
                continue
            full_path = _resolve_existing_path(path)
            if full_path in seen:
                continue
            seen.add(full_path)
            if len(images) >= limit:
                break
            with Image.open(full_path) as source:
                tensor = _pil_to_tensor(ImageOps.exif_transpose(source).convert("RGB"))
            tensor = self._fit_dimensions(tensor, width, height, fit_edge)
            images.append(self._compress_tensor(tensor, img_compression))
        if not images:
            return (None,) * (limit + 2)
        target_h = max(tensor.shape[1] for tensor in images)
        target_w = max(tensor.shape[2] for tensor in images)
        normalized = []
        for tensor in images:
            tensor = self._ensure_rgba(tensor)
            height, width = tensor.shape[1:3]
            left, top = (target_w - width) // 2, (target_h - height) // 2
            tensor = F.pad(tensor.movedim(-1, 1), (left, target_w - width - left, top, target_h - height - top)).movedim(1, -1)
            normalized.append(tensor.to(device=images[0].device, dtype=images[0].dtype).clamp(0, 1))
        output = torch.cat(normalized, dim=0)
        individual = tuple(self._ensure_rgba(tensor).clone() for tensor in images)
        return (output, self._empty_mask_like(output), *individual, *((None,) * (limit - len(individual))))
