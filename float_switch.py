from .int_switch import VantageIntSwitchV2


class VantageFloatSwitchV2(VantageIntSwitchV2):
    value_type = float

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs["required"]["value"] = ("FLOAT", {"default": 0.0, "step": 0.01})
        return inputs
