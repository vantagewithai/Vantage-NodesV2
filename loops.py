from comfy_execution.graph_utils import GraphBuilder, is_link

from .any_switch import ANY


def _start_schema(required):
    return {"required": required, "optional": {"initial_value": (ANY,)}, "hidden": {"unique_id": "UNIQUE_ID"}}


def _flow(unique_id, kind, index, total, condition, initial_value):
    return {"start": unique_id, "kind": kind, "index": index, "total": total,
            "active": bool(condition), "initial_value": initial_value}


def _repeat(flow, value, dynprompt, unique_id):
    start_id = flow["start"]
    upstream = {}
    pending = [unique_id]
    visited = set()
    while pending:
        node_id = pending.pop()
        if node_id in visited:
            continue
        visited.add(node_id)
        if node_id == start_id:
            continue
        for item in dynprompt.get_node(node_id)["inputs"].values():
            if is_link(item):
                upstream.setdefault(item[0], set()).add(node_id)
                pending.append(item[0])
    contained = {start_id}
    pending = [start_id]
    while pending:
        for child in upstream.get(pending.pop(), ()):
            if child not in contained:
                contained.add(child)
                pending.append(child)
    if unique_id not in contained:
        raise ValueError("Loop End must be connected to its matching Loop Start")
    graph = GraphBuilder()
    copies = {}
    for node_id in sorted(contained):
        original = dynprompt.get_node(node_id)
        copy = graph.node("VantageLoopIteration" if node_id == start_id else original["class_type"])
        copy.set_override_display_id(dynprompt.get_display_node_id(node_id))
        copies[node_id] = copy
    for node_id, copy in copies.items():
        if node_id == start_id:
            for name, item in {"kind": flow["kind"], "index": flow["index"] + 1, "total": flow["total"], "initial_value": value}.items():
                copy.set_input(name, item)
            continue
        for name, item in dynprompt.get_node(node_id)["inputs"].items():
            copy.set_input(name, copies[item[0]].out(item[1]) if is_link(item) and item[0] in copies else item)
    return {"result": (copies[unique_id].out(0),), "expand": graph.finalize()}


class VantageForLoopStart:
    @classmethod
    def INPUT_TYPES(cls):
        return _start_schema({"total": ("INT", {"default": 1, "min": 0, "max": 2147483647})})

    RETURN_TYPES = ("VANTAGE_LOOP", "INT", ANY)
    RETURN_NAMES = ("flow", "index", "value")
    FUNCTION = "start"
    CATEGORY = "Vantage/Loops"

    def start(self, total, initial_value=None, unique_id=None):
        return _flow(unique_id, "for", 0, total, total > 0, initial_value), 0, initial_value


class VantageWhileLoopStart:
    @classmethod
    def INPUT_TYPES(cls):
        return _start_schema({"condition": ("BOOLEAN", {"default": True})})

    RETURN_TYPES = VantageForLoopStart.RETURN_TYPES
    RETURN_NAMES = VantageForLoopStart.RETURN_NAMES
    FUNCTION = "start"
    CATEGORY = "Vantage/Loops"

    def start(self, condition, initial_value=None, unique_id=None):
        return _flow(unique_id, "while", 0, 0, condition, initial_value), 0, initial_value


class VantageLoopIteration:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"kind": (["for", "while"],), "index": ("INT",), "total": ("INT",)},
                "optional": {"initial_value": (ANY,)}, "hidden": {"unique_id": "UNIQUE_ID"}}

    RETURN_TYPES = VantageForLoopStart.RETURN_TYPES
    RETURN_NAMES = VantageForLoopStart.RETURN_NAMES
    FUNCTION = "start"
    CATEGORY = "Vantage/Loops/Internal"

    def start(self, kind, index, total, initial_value=None, unique_id=None):
        return _flow(unique_id, kind, index, total, True, initial_value), index, initial_value


class VantageForLoopEnd:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"flow": ("VANTAGE_LOOP",)}, "optional": {"value": (ANY, {"lazy": True})},
                "hidden": {"dynprompt": "DYNPROMPT", "unique_id": "UNIQUE_ID"}}

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "end"
    CATEGORY = "Vantage/Loops"

    def check_lazy_status(self, flow, value=None, **kwargs):
        return ["value"] if flow["active"] and value is None else []

    def end(self, flow, value=None, dynprompt=None, unique_id=None):
        if flow["kind"] != "for":
            raise ValueError("For Loop End requires a For Loop Start")
        if not flow["active"]:
            return (flow["initial_value"],)
        if flow["index"] + 1 >= flow["total"]:
            return (value,)
        return _repeat(flow, value, dynprompt, unique_id)


class VantageWhileLoopEnd:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = VantageForLoopEnd.INPUT_TYPES()
        inputs["required"]["condition"] = ("BOOLEAN", {"default": False, "lazy": True,
                                                      "tooltip": "Continue with another iteration when true."})
        return inputs

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "end"
    CATEGORY = "Vantage/Loops"

    def check_lazy_status(self, flow, condition=None, value=None, **kwargs):
        if not flow["active"]:
            return []
        return (["condition"] if condition is None else []) + (["value"] if value is None else [])

    def end(self, flow, condition=False, value=None, dynprompt=None, unique_id=None):
        if flow["kind"] != "while":
            raise ValueError("While Loop End requires a While Loop Start")
        if not flow["active"]:
            return (flow["initial_value"],)
        if not condition:
            return (value,)
        return _repeat(flow, value, dynprompt, unique_id)
