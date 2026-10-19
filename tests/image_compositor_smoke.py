"""Run with ComfyUI's Python; no models or Enrico nodes required."""
import importlib.util
import json
import logging
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

import numpy as np
from PIL import Image
import torch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parents[1]))
from comfy.cli_args import args

args.cpu = True
from comfy_execution.graph import ExecutionBlocker

spec = importlib.util.spec_from_file_location("vantage_compositor_test", root / "image_compositor.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
node = module.VantageImageCompositor()
images = torch.zeros((2, 4, 6, 3))
images[0, :, :, 0] = 1
images[1, :, :, 2] = 1
with tempfile.TemporaryDirectory() as directory, patch.object(module.folder_paths, "get_temp_directory", return_value=directory):
    first = node.compose(images, width=12, height=8)
    assert all(isinstance(value, ExecutionBlocker) for value in first["result"])
    assert first["ui"]["paused"] == [True]
    assert len(first["ui"]["layers"]) == 2
    state = json.loads(first["ui"]["composition"][0])
    state["layers"][0].update(x=3, y=2)
    state["layers"][1].update(x=9, y=6)
    signature = first["ui"]["signature"][0]
    result = node.compose(images, width=12, height=8, composition=json.dumps(state), input_signature=signature)
    output = result["result"][0]
    assert output.shape == (1, 8, 12, 3)
    np.testing.assert_allclose(output[0, 1, 1].numpy(), [1, 0, 0])
    np.testing.assert_allclose(output[0, 5, 8].numpy(), [0, 0, 1])
    assert json.loads(result["result"][1])["layers"] == state["layers"]
    changed = node.compose(images * 0.5, width=12, height=8, composition=json.dumps(state), input_signature=signature)
    assert changed["ui"]["paused"] == [True]
    automatic = node.compose(images, width=12, height=8, auto_continue=True)
    assert isinstance(automatic["result"][0], torch.Tensor)
    assert automatic["ui"]["paused"] == [False]
    assert not any(Path(directory).glob("*.png"))
    assert len(list((Path(directory) / "vantage_compositor").glob("*.png"))) == 4

masked = module.prepare_layers(images, torch.zeros((1, 2, 3)), False, 8, False)
assert all(np.asarray(layer)[..., 3].max() == 0 for layer in masked)
inverted = module.prepare_layers(images, torch.zeros((1, 2, 3)), False, 8, True)
assert all(np.asarray(layer)[..., 3].min() == 255 for layer in inverted)
normalized = module.prepare_layers(images, None, True, 8, False)
assert all(layer.size == (12, 8) for layer in normalized)
rgba = torch.ones((1, 4, 6, 4))
rgba[..., 3] = 0.5
assert np.asarray(module.prepare_layers(rgba, torch.ones((1, 4, 6)) * 0.5, False, 4, False)[0])[0, 0, 3] == 64

source = Image.new("RGBA", (2, 2), (255, 0, 0, 255))
layer = module.default_layer(0, source, 4, 4)
layer.update(width=2, height=2, x=1, y=1)
rendered = module.render_composition([source], {"layers":[layer], "background":"#000000"}, 4, 4)
assert rendered.getpixel((0, 0)) == (255, 0, 0)
assert rendered.getpixel((3, 3)) == (0, 0, 0)
layer.update(opacity=0.5)
assert module.render_composition([source], {"layers":[layer], "background":"#000000"}, 4, 4).getpixel((0, 0)) == (128, 0, 0)
layer.update(visible=False)
assert module.render_composition([source], {"layers":[layer], "background":"#000000"}, 4, 4).getbbox() is None
pattern = Image.new("RGBA", (4, 2), (255, 0, 0, 255))
for y in range(2):
    for x in range(2, 4):
        pattern.putpixel((x,y), (0,0,255,255))
layer = module.default_layer(0, pattern, 4, 4)
layer.update(flip_x=True)
flipped = module.render_composition([pattern], {"layers":[layer]}, 4, 4)
assert flipped.getpixel((0, 1)) == (0,0,255)
layer.update(flip_x=False, angle=90)
rotated = module.render_composition([pattern], {"layers":[layer]}, 4, 4)
assert rotated.getpixel((1, 0)) == (255,0,0)
assert rotated.getpixel((1, 3)) == (0,0,255)
state = {"layers":[], "background":"#000000", "strokes":[
    {"points":[[2,2],[6,2]], "size":2,"color":"#ff0000"},
    {"points":[[2,2]], "size":2,"erase":True},
]}
painted = module.render_composition([],state,8,8)
assert painted.getpixel((6,2)) == (255,0,0)
assert painted.getpixel((2,2)) == (0,0,0)
logging.basicConfig(level=logging.INFO)
logging.info("Compositor pause/continue, input changes, image batches, mask resize/inversion, alpha, transforms, drawing and temporary previews passed")
