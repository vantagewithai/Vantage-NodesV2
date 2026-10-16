"""Run with Python; no models required."""
import importlib.util
import json
from pathlib import Path
import sys
import types

root = Path(__file__).resolve().parents[1]
package = types.ModuleType("vantage_int_switch_test")
package.__path__ = [str(root)]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location(f"{package.__name__}.int_switch", root / "int_switch.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
node = module.VantageIntSwitchV2()
rules = json.dumps([{"operator":"=", "value":0, "input":0}, {"operator":"<", "value":4, "input":1}, {"operator":">=", "value":5, "input":3}])
for value, expected in [(0,"zero"),(1,"small"),(3,"small"),(4,None),(5,"large"),(12,"large")]:
    assert node.switch(value, rules, input_0="zero",input_1="small",input_3="large") == (expected,)
assert node.check_lazy_status(5,rules,input_0=None,input_1=None,input_3=None) == ["input_3"]
assert node.check_lazy_status(4,rules) == []
assert node.switch(5,rules) == (None,)
for operator, match, miss in [("=",2,3),("!=",3,2),("<",1,2),("<=",2,3),(">",3,2),(">=",2,1)]:
    conditions = json.dumps([dict(operator=operator,value=2,input=0)])
    assert node.switch(match,conditions,input_0=False) == (False,)
    assert node.switch(miss,conditions,input_0=False) == (None,)
assert node.switch(0,"[]") == (None,)
assert node.INPUT_TYPES()["optional"]["input_100"][1]["lazy"]
print("Integer comparisons, ordered matches, gaps, missing values, false outputs, lazy selection and dynamic schema passed")
