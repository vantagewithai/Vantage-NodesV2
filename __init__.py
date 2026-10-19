from .image_compositor import VantageImageCompositor
from .execution_pause import VantageExecutionPauseV2
from .easy_controls import VantageEasyControls
from .value_switch import VantageBoolValueSwitchV2, VantageIntValueSwitchV2, VantageFloatValueSwitchV2, VantageStringValueSwitchV2
from .float_switch import VantageFloatSwitchV2
from .string_switch import VantageStringSwitchV2
from .int_switch import VantageIntSwitchV2
from .loops import VantageForLoopStart, VantageForLoopEnd, VantageWhileLoopStart, VantageWhileLoopEnd, VantageLoopIteration
from .any_switch import VantageanySwitchV2, VantageSwitchIndex
from .bounding_boxes import VantageBoundingBoxes
from .multi_image_loader import VantageMultiImageLoaderV2

NODE_CLASS_MAPPINGS = {"VantageImageCompositor": VantageImageCompositor, "VantageExecutionPauseV2": VantageExecutionPauseV2, "Vantage-Easy-Controls": VantageEasyControls, "VantageBoolValueSwitchV2": VantageBoolValueSwitchV2, "VantageStringValueSwitchV2": VantageStringValueSwitchV2, "VantageFloatValueSwitchV2": VantageFloatValueSwitchV2, "VantageIntValueSwitchV2": VantageIntValueSwitchV2, "VantageFloatSwitchV2": VantageFloatSwitchV2, "VantageStringSwitchV2": VantageStringSwitchV2, "VantageIntSwitchV2": VantageIntSwitchV2, "VantageForLoopStart": VantageForLoopStart, "VantageForLoopEnd": VantageForLoopEnd, "VantageWhileLoopStart": VantageWhileLoopStart, "VantageWhileLoopEnd": VantageWhileLoopEnd, "VantageLoopIteration": VantageLoopIteration, "VantageSwitchIndex": VantageSwitchIndex, "VantageanySwitchV2": VantageanySwitchV2, "Vantage-Bounding-Boxes": VantageBoundingBoxes, "VantageMultiImageLoaderV2": VantageMultiImageLoaderV2}
NODE_DISPLAY_NAME_MAPPINGS = {"VantageImageCompositor": "Vantage Image Compositor", "VantageExecutionPauseV2": "Execution Pause (VantageV2)", "VantageBoolValueSwitchV2": "Bool Value Switch (VantageV2)", "VantageStringValueSwitchV2": "String Value Switch (VantageV2)", "VantageFloatValueSwitchV2": "Float Value Switch (VantageV2)", "VantageIntValueSwitchV2": "Int Value Switch (VantageV2)", "VantageFloatSwitchV2": "Float Switch (VantageV2)", "VantageStringSwitchV2": "String Switch (VantageV2)", "VantageIntSwitchV2": "Int Switch (VantageV2)", "VantageForLoopStart": "For Loop Start (VantageV2)", "VantageForLoopEnd": "For Loop End (VantageV2)", "VantageWhileLoopStart": "While Loop Start (VantageV2)", "VantageWhileLoopEnd": "While Loop End (VantageV2)", "VantageSwitchIndex": "Switch index (VantageV2)", "VantageanySwitchV2": "Any Switch (VantageV2)", "Vantage-Bounding-Boxes": "Vantage-Bounding-Boxes", "VantageMultiImageLoaderV2": "Vantage Multiple Image Loader V2"}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
