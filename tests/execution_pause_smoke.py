"""Run with ComfyUI's Python; no model files required."""
import importlib.util
import math
from pathlib import Path
import sys
import types

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parents[1]))
from comfy.cli_args import args

args.cpu = True
from comfy_execution.graph import ExecutionBlocker

package = types.ModuleType("vantage_pause_test")
package.__path__ = [str(root)]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location("vantage_pause_test.execution_pause", root / "execution_pause.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
node = module.VantageExecutionPauseV2()
for value in [None, 0, False, "text", [1, 2], {"samples": object()}]:
    stopped = node.pause(value)
    assert isinstance(stopped["result"][0], ExecutionBlocker)
    assert stopped["ui"]["paused"] == [True]
    resumed = node.pause(value, resume=True)
    assert resumed["result"][0] is value
    assert resumed["ui"]["paused"] == [False]
assert math.isnan(node.IS_CHANGED())
print("Backend blocker, unchanged pass-through of arbitrary values and cache invalidation passed")
