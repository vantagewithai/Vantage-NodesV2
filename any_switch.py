class AnyType(str):
    def __ne__(self, other):
        return False


ANY = AnyType("*")


class SwitchInputs(dict):
    def __contains__(self, key):
        return isinstance(key, str) and key.startswith("any_") and key[4:].isdigit()

    def __getitem__(self, key):
        if key not in self:
            raise KeyError(key)
        return (ANY,)


class VantageanySwitchV2:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": SwitchInputs({f"any_{index:02}": (ANY,) for index in range(1, 6)})}

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("*",)
    FUNCTION = "switch"
    CATEGORY = "Vantage/Utils"

    def switch(self, **kwargs):
        for name in sorted((key for key in kwargs if key.startswith("any_") and key[4:].isdigit()), key=lambda key: int(key[4:])):
            value = kwargs[name]
            if value is None:
                continue
            if isinstance(value, dict) and "model" in value and "clip" in value and all(item is None for item in value.values()):
                continue
            return (value,)
        return (None,)


class VantageSwitchIndex:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"index": ("INT", {"default": 0, "min": 0, "max": 2147483647,
                                            "tooltip": "Zero-based input index: 0 selects any_01."})},
            "optional": SwitchInputs({f"any_{index:02}": (ANY,) for index in range(1, 6)}),
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("*",)
    FUNCTION = "switch"
    CATEGORY = "Vantage/Utils"

    def switch(self, index=0, **kwargs):
        return (kwargs.get(f"any_{index + 1:02}") if index >= 0 else None,)
