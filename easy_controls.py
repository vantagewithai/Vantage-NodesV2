import json


class StateOutputTypes(tuple):
    def __getitem__(self, index):
        if isinstance(index, int) and index >= len(self):
            return "BOOLEAN"
        return super().__getitem__(index)


class VantageEasyControls:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"states": ("STRING", {"default": "[]"})}}

    RETURN_TYPES = StateOutputTypes(())
    FUNCTION = "emit"
    CATEGORY = "Vantage/Controls"

    def emit(self, states="[]"):
        return tuple(bool(state) for state in json.loads(states))
