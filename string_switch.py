import json

from .any_switch import ANY
from .int_switch import ConditionInputs


_OPERATORS = {
    "=": lambda value, text: value == text,
    "!=": lambda value, text: value != text,
    "contains": lambda value, text: text in value,
    "not contains": lambda value, text: text not in value,
    "starts with": lambda value, text: value.startswith(text),
    "ends with": lambda value, text: value.endswith(text),
}
DEFAULT_CONDITIONS = '[{"operator":"=","value":"","input":0}]'


def _selected_input(value, conditions):
    for condition in json.loads(conditions):
        operator = condition["operator"]
        if operator not in _OPERATORS:
            raise ValueError(f"Unsupported string comparison: {operator}")
        index = condition["input"]
        if not isinstance(index, int) or index < 0:
            raise ValueError("Condition input index must be a non-negative integer")
        if _OPERATORS[operator](value, condition["value"]):
            return f"input_{index}"
    return None


class VantageStringSwitchV2:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "value": ("STRING", {"default": ""}),
            "conditions": ("STRING", {"default": DEFAULT_CONDITIONS}),
        }, "optional": ConditionInputs({"input_0": (ANY, {"lazy": True})})}

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "switch"
    CATEGORY = "Vantage/Utils"

    def check_lazy_status(self, value, conditions=DEFAULT_CONDITIONS, **kwargs):
        selected = _selected_input(value, conditions)
        return [selected] if selected is not None and kwargs.get(selected) is None else []

    def switch(self, value, conditions=DEFAULT_CONDITIONS, **kwargs):
        return (kwargs.get(_selected_input(value, conditions)),)
