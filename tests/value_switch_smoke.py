import importlib.util
import json
from pathlib import Path
import sys
import types

root = Path(__file__).resolve().parents[1]
package = types.ModuleType("vantage_value_switch_test")
package.__path__ = [str(root)]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location(f"{package.__name__}.value_switch", root / "value_switch.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for cls, selected, missed, condition in [
    (module.VantageBoolValueSwitchV2, True, False, True),
    (module.VantageIntValueSwitchV2, 2, 3, 2),
    (module.VantageFloatValueSwitchV2, 0.25, 0.26, 0.25),
    (module.VantageStringValueSwitchV2, "cat", "Cat", "cat"),
]:
    node = cls()
    for output_type, value, expected_type in [("BOOLEAN",False,bool),("INT",-7,int),("FLOAT",0.125,float),("STRING","",str)]:
        rules = json.dumps([dict(name="First",operator="=",value=condition,output=value),dict(name="Second",operator="=",value=condition,output="unused")])
        result = node.switch(selected, output_type, rules)[0]
        assert type(result) is expected_type and result == value
        assert node.switch(missed, output_type, rules) == (None,)
        assert node.switch(selected, output_type, "[]") == (None,)
        assert node.switch(selected, output_type, json.dumps(json.loads(rules))) == (result,)
    assert set(node.INPUT_TYPES()["required"]) == {"value", "output_type", "conditions"}
print("All four value switches: four output types, named rules, first-match order, missing matches, decimals, case sensitivity and saved settings passed")

boolean = module.VantageBoolValueSwitchV2()
rules = json.dumps([dict(name="False branch",operator="=",value=False,output="off"),dict(name="True branch",operator="=",value=True,output="on")])
assert boolean.switch(False,"STRING",rules) == ("off",)
assert boolean.switch(True,"STRING",rules) == ("on",)
assert boolean.INPUT_TYPES()["required"]["value"][0] == "BOOLEAN"
assert json.loads(boolean.INPUT_TYPES()["required"]["conditions"][1]["default"])[0]["value"] is False
