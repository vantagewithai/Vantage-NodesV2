"""Run from the ComfyUI directory with ComfyUI's Python."""
import importlib.util
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

from PIL import Image
import torch

node_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(node_dir.parents[1]))
from comfy.cli_args import args

args.cpu = True
spec = importlib.util.spec_from_file_location("vantage_loader_test", node_dir / "multi_image_loader.py")
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)
node = loader.VantageMultiImageLoaderV2()
for source_shape, longer, shorter in [((32, 64), (8, 16), (16, 32)), ((64, 32), (16, 8), (32, 16))]:
    source = torch.zeros(1, *source_shape, 3)
    assert node._fit_dimensions(source, 16, 16, "longer").shape[1:3] == longer
    assert node._fit_dimensions(source, 16, 16, "shorter").shape[1:3] == shorter
small = torch.rand(1, 8, 12, 3)
assert node._fit_dimensions(small, 16, 16, "longer") is small
assert node._fit_dimensions(small, 16, 16, "shorter") is small
wide = torch.rand(1, 8, 32, 3)
assert node._fit_dimensions(wide, 16, 16, "shorter") is wide
assert node._fit_dimensions(wide, 16, 16, "longer").shape[1:3] == (4, 16)
with tempfile.TemporaryDirectory() as directory, patch.object(loader.folder_paths, "get_input_directory", return_value=directory):
    Image.new("RGB", (64, 32), "red").save(Path(directory) / "large.png")
    Image.new("RGB", (12, 8), "blue").save(Path(directory) / "small.png")
    controls = dict(width=16, height=16, img_compression=0)
    result = node.load_images("large.png\nsmall.png\n./small.png", **controls)
    images, masks = result[:2]
    assert len(result) == 12
    assert result[2].shape == (1, 8, 16, 4)
    assert result[3].shape == (1, 8, 12, 4)
    assert all(value is None for value in result[4:])
    assert images.shape == (2, 8, 16, 4)
    assert (images[1, ..., 3] > 0).sum() == 12 * 8
    assert masks.shape == (2, 8, 16)
    background = torch.ones(1, 32, 64, 3)
    result = node.load_images("large.png\nsmall.png", background=background, max_images=2, **controls)
    assert len(result) == 4
    images = result[0]
    assert images.shape[0] == 2
    assert (images[0, ..., 3] > 0).sum() == 16 * 8
    compressed = node.load_images("small.png", width=16, height=16, img_compression=18)[0]
    assert compressed.shape == (1, 8, 12, 4)
    try:
        node.load_images("../escape.png", **controls)
    except ValueError:
        pass
    else:
        raise AssertionError("Path containment")
    many = node.load_images("small.png", max_images=15, **controls)
    assert len(many) == 17 and all(value is None for value in many[3:])
    assert node.load_images("", max_images=3) == (None,) * 5
    assert node.RETURN_TYPES[16] == "IMAGE" and node.RETURN_TYPES[1] == "MASK"
schema = node.INPUT_TYPES()["required"]
assert "resolution" not in schema and {"width", "height", "fit_edge"} <= schema.keys()
print("Edge fitting, no enlargement, aspect ratios, padding, background, capacity, deduplication and compression passed")
