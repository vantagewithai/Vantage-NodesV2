import json

from .any_switch import ANY


_OPERATORS = {
    "=": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
}
DEFAULT_CONDITIONS = '[{"operator":"=","value":0,"input":0}]'


def _selected_input(value, conditions, number_type=int):
    for condition in json.loads(conditions):
        operator = condition["operator"]
        if operator not in _OPERATORS:
            raise ValueError(f"Unsupported numeric comparison: {operator}")
        index = condition["input"]
        if not isinstance(index, int) or index < 0:
            raise ValueError("Condition input index must be a non-negative integer")
        if _OPERATORS[operator](value, number_type(condition["value"])):
            return f"input_{index}"
    return None


class ConditionInputs(dict):
    def __contains__(self, key):
        return isinstance(key, str) and key.startswith("input_") and key[6:].isdigit()

    def __getitem__(self, key):
        if key not in self:
            raise KeyError(key)
        return (ANY, {"lazy": True})


class VantageIntSwitchV2:
    value_type = int

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "value": ("INT", {"default": 0, "min": -2147483648, "max": 2147483647}),
            "conditions": ("STRING", {"default": DEFAULT_CONDITIONS}),
        }, "optional": ConditionInputs({"input_0": (ANY, {"lazy": True})})}

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "switch"
    CATEGORY = "Vantage/Utils"

    def check_lazy_status(self, value, conditions=DEFAULT_CONDITIONS, **kwargs):
        selected = _selected_input(value, conditions, self.value_type)
        return [selected] if selected is not None and kwargs.get(selected) is None else []

    def switch(self, value, conditions=DEFAULT_CONDITIONS, **kwargs):
        return (kwargs.get(_selected_input(value, conditions, self.value_type)),)
