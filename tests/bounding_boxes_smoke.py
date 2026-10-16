"""Run with ComfyUI's Python; no model files or KJNodes installation required."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

import numpy as np
from PIL import Image
import torch

node_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(node_dir.parents[1]))
from comfy.cli_args import args

args.cpu = True
spec = importlib.util.spec_from_file_location("vantage_bbox_test", node_dir / "bounding_boxes.py")
bbox = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bbox)

image = torch.linspace(0, 1, 81 * 53 * 3).reshape(1, 53, 81, 3)
for mode in bbox._RESIZE_MODES:
    for method in bbox._RESIZE_METHODS:
        settings = dict(enabled=True, width=64, height=48, upscale_method=method, keep_proportion=mode, divisible_by=2)
        resized, transform = bbox._resize_background(image, settings)
        assert resized.shape[1] % 2 == 0 and resized.shape[2] % 2 == 0
        assert torch.isfinite(resized).all()
        assert transform[0] > 0 and transform[1] > 0

with tempfile.TemporaryDirectory() as directory, patch.object(bbox.folder_paths, "get_input_directory", return_value=directory):
    Image.new("RGB", (81, 53), (200, 100, 40)).save(Path(directory) / "image.png")
    settings = json.dumps(dict(enabled=True, width=64, height=64, keep_proportion="pad", pad_color="#123456"))
    node = bbox.VantageBoundingBoxes()
    controls = dict(resize=True, megapixels=0.00390625, multiple=8,
                    background_image="image.png", resize_options=json.dumps(dict(keep_proportion="pad", pad_color="#123456")))
    result = node.execute(**controls, editor_state='[{"x":8,"y":16,"width":24,"height":32}]')
    assert result["ui"]["dims"] == [64, 64]
    assert result["result"][4:] == (64, 64)
    output = result["result"][3]
    assert output.shape == (1, 64, 64, 3)
    np.testing.assert_allclose(output[0, 0, 0].numpy(), np.array([18, 52, 86]) / 255, atol=1e-7)
    options = bbox._resolution_options(controls["resize_options"], True, "1:1 (Square)", controls["megapixels"], 8)
    png, transform = bbox._background_png("image.png", json.dumps(options))
    np.testing.assert_allclose(np.asarray(Image.open(io.BytesIO(png))), (output[0].numpy()*255).clip(0,255).astype(np.uint8))
    original = node.execute(background_image="image.png", resize_options=settings)
    assert original["ui"]["dims"] == [81, 53]
    assert original["result"][4:] == (81, 53)
    assert original["result"][3].shape == (1, 53, 81, 3)
    assert node.execute()["result"][3].shape == (1, 1024, 1024, 3)
    default_resize = node.execute(resize=True, megapixels=0.00390625, background_image="image.png")
    assert default_resize["ui"]["dims"] == [64, 64]
    assert default_resize["result"][3].shape == (1, 64, 64, 3)
    default_options = bbox._resolution_options("{}", True, "1:1 (Square)", 0.00390625, 8)
    default_png, _ = bbox._background_png("image.png", json.dumps(default_options))
    assert Image.open(io.BytesIO(default_png)).size == tuple(default_resize["ui"]["dims"])
    schema = node.INPUT_TYPES()
    assert set(schema["optional"]) == {"bboxes"}
    assert "width" not in schema["required"] and "height" not in schema["required"]
    assert "resize" in schema["required"]
    for ratio in bbox.ASPECT_RATIOS:
        opts = bbox._resolution_options("{}", True, ratio, 1, 8)
        expected = bbox.ResolutionSelector.execute(ratio, 1, 8).result
        assert (opts["width"], opts["height"]) == expected
    transformed = node.execute(**controls, editor_state='[{"x":8,"y":16,"width":24,"height":32}]',
                               background_state=original["ui"]["background_state"][0])
    expected = bbox._transform_boxes([dict(x=8,y=16,width=24,height=32)], [1,1,0,0], transform)
    assert transformed["result"][1] == [expected]
    repeated = node.execute(**controls, editor_state=json.dumps(transformed["ui"]["editor_state"][0]),
                            background_state=transformed["ui"]["background_state"][0])
    assert repeated["result"][1] == [expected] and "editor_state" not in repeated["ui"]
    for filename in ["../escape.png", str(Path(directory).parent / "escape.png")]:
        try:
            bbox._background_png(filename, settings)
        except ValueError:
            pass
        else:
            raise AssertionError("Input-folder containment failed")
print("Resize modes, resolution selector, original dimensions, box transforms, image output and path containment passed")
