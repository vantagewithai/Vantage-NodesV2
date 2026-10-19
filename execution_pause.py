from comfy_execution.graph import ExecutionBlocker

from .any_switch import ANY


class VantageExecutionPauseV2:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"value": (ANY,), "resume": ("BOOLEAN", {"default": False})}}

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "pause"
    CATEGORY = "Vantage/Utils"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def pause(self, value, resume=False):
        return {"ui": {"paused": [not resume]}, "result": (value if resume else ExecutionBlocker(None),)}
