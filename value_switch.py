import json

from .any_switch import ANY
from .int_switch import _selected_input as select_number
from .string_switch import _selected_input as select_string


DEFAULT_CONDITIONS = '[{"name":"Condition 1","operator":"=","value":0,"output":false}]'


class VantageIntValueSwitchV2:
    input_type = "INT"
    input_default = 0
    number_type = int

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "value": (cls.input_type, {"default": cls.input_default}),
            "output_type": (["BOOLEAN", "INT", "FLOAT", "STRING"],),
            "conditions": ("STRING", {"default": DEFAULT_CONDITIONS.replace('"value":0', '"value":""') if cls.input_type == "STRING" else DEFAULT_CONDITIONS.replace('"value":0', '"value":false') if cls.input_type == "BOOLEAN" else DEFAULT_CONDITIONS}),
        }}

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "switch"
    CATEGORY = "Vantage/Utils"

    def switch(self, value, output_type="BOOLEAN", conditions=DEFAULT_CONDITIONS):
        rules = json.loads(conditions)
        comparisons = json.dumps([{**rule, "input": index} for index, rule in enumerate(rules)])
        selected = select_string(value, comparisons) if self.input_type == "STRING" else select_number(value, comparisons, self.number_type)
        if selected is None:
            return (None,)
        result = rules[int(selected[6:])]["output"]
        converters = {"BOOLEAN": bool, "INT": int, "FLOAT": float, "STRING": str}
        if output_type not in converters:
            raise ValueError(f"Unsupported output type: {output_type}")
        return (converters[output_type](result),)


class VantageFloatValueSwitchV2(VantageIntValueSwitchV2):
    input_type = "FLOAT"
    input_default = 0.0
    number_type = float


class VantageStringValueSwitchV2(VantageIntValueSwitchV2):
    input_type = "STRING"
    input_default = ""


class VantageBoolValueSwitchV2(VantageIntValueSwitchV2):
    input_type = "BOOLEAN"
    input_default = False
    number_type = bool
