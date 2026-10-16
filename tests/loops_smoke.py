"""Execute loop workflows with ComfyUI’s CPU executor; no server or models needed."""

import asyncio
import importlib.util
import logging
import pathlib
import sys

node_dir = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(node_dir.parents[1]))
from comfy.cli_args import args

args.cpu = True
import nodes
from execution import PromptExecutor, CacheType

root = node_dir
spec = importlib.util.spec_from_file_location(
    "vantage_loop_test", root / "__init__.py", submodule_search_locations=[str(root)]
)
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
nodes.NODE_CLASS_MAPPINGS.update(m.NODE_CLASS_MAPPINGS)
seen = []


class Add:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"value": ("INT",), "index": ("INT",)}}

    RETURN_TYPES = ("INT", "BOOLEAN")
    FUNCTION = "run"

    def run(self, value, index):
        seen.append(index)
        return value + 1, value + 1 < 3


class Save:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"value": ("*",)}}

    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True

    def run(self, value):
        self.result = value
        return {"ui": {"value": [value]}, "result": ()}


nodes.NODE_CLASS_MAPPINGS.update(TestLoopAdd=Add, TestLoopSave=Save)


class Server:
    client_id = None

    def send_sync(self, *args):
        pass

    def __getattr__(self, name):
        return lambda *a, **k: None


async def main():
    for kind, total, condition, expected in [
        ("For", 3, True, 3),
        ("For", 0, True, 0),
        ("While", 0, True, 3),
        ("While", 0, False, 0),
    ]:
        seen.clear()
        prompt = {
            "1": {
                "class_type": f"Vantage{kind}LoopStart",
                "inputs": {
                    "initial_value": 0,
                    **({"total": total} if kind == "For" else {"condition": condition}),
                },
            },
            "2": {
                "class_type": "TestLoopAdd",
                "inputs": {"value": ["1", 2], "index": ["1", 1]},
            },
            "3": {
                "class_type": f"Vantage{kind}LoopEnd",
                "inputs": {
                    "flow": ["1", 0],
                    "value": ["2", 0],
                    **({"condition": ["2", 1]} if kind == "While" else {}),
                },
            },
            "4": {"class_type": "TestLoopSave", "inputs": {"value": ["3", 0]}},
        }
        executor = PromptExecutor(
            Server(),
            cache_type=CacheType.CLASSIC,
            cache_args={"ram": 0, "ram_inactive": 0},
        )
        await executor.execute_async(
            prompt, f"test-{kind}-{condition}-{total}", execute_outputs=["4"]
        )
        assert executor.success, executor.status_messages
        assert executor.history_result["outputs"]["4"]["value"] == [expected], (
            executor.history_result
        )
        assert seen == list(range(expected)), seen
        logging.info(
            "%s loop passed: total=%s condition=%s result=%s indices=%s",
            kind,
            total,
            condition,
            expected,
            seen,
        )


async def nested():
    seen.clear()
    prompt = {
        "1": {
            "class_type": "VantageForLoopStart",
            "inputs": {"total": 2, "initial_value": 0},
        },
        "2": {
            "class_type": "VantageForLoopStart",
            "inputs": {"total": 3, "initial_value": ["1", 2]},
        },
        "3": {
            "class_type": "TestLoopAdd",
            "inputs": {"value": ["2", 2], "index": ["2", 1]},
        },
        "4": {
            "class_type": "VantageForLoopEnd",
            "inputs": {"flow": ["2", 0], "value": ["3", 0]},
        },
        "5": {
            "class_type": "VantageForLoopEnd",
            "inputs": {"flow": ["1", 0], "value": ["4", 0]},
        },
        "6": {"class_type": "TestLoopSave", "inputs": {"value": ["5", 0]}},
    }
    executor = PromptExecutor(
        Server(), cache_type=CacheType.CLASSIC, cache_args={"ram": 0, "ram_inactive": 0}
    )
    await executor.execute_async(prompt, "nested", execute_outputs=["6"])
    assert executor.success, executor.status_messages
    assert executor.history_result["outputs"]["6"]["value"] == [6], (
        executor.history_result
    )
    assert seen == [0, 1, 2, 0, 1, 2], seen
    logging.info("Nested For loops passed: 2 × 3 iterations")


asyncio.run(main())
asyncio.run(nested())
