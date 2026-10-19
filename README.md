# Vantage-NodesV2

Custom nodes for ComfyUI: interactive bounding boxes, a multi-image gallery, hierarchical workflow controls, switches, and loops.

This is a separate nodeset from **Vantage-Nodes**. It does not require Vantage-Nodes to be installed.

## Contents

- [Installation](#installation)
- [Compatibility and dependencies](#compatibility-and-dependencies)
- [Node overview](#node-overview)
- [Bounding-box editor](#vantage-bounding-boxes)
- [Multi-image loader](#vantage-multiple-image-loader-v2)
- [Image Compositor](#vantage-image-compositor)
- [Execution Pause](#execution-pause-vantagev2)
- [Easy Controls](#vantage-easy-controls)
- [Any Switch](#any-switch-vantagev2)
- [Switch index](#switch-index-vantagev2)
- [Condition switches](#condition-switches)
- [Named value switches](#named-value-switches)
- [For loops](#for-loop-start--end-vantagev2)
- [While loops](#while-loop-start--end-vantagev2)
- [Troubleshooting](#troubleshooting)
- [Development checks](#development-checks)

## Installation

### Install from Git

1. Stop ComfyUI.
2. Open a terminal in your ComfyUI installation directory.
3. Clone this repository into `custom_nodes/Vantage-NodesV2`:

   ```bash
   git clone https://github.com/vantagewithai/Vantage-NodesV2.git custom_nodes/Vantage-NodesV2
   ```

4. Start ComfyUI and refresh the browser. If an older interface remains visible, use a hard refresh.
5. Search for the node names below, or browse the **Vantage** categories in the Add Node menu.

For Windows portable ComfyUI, use the `ComfyUI` folder inside the portable installation as the directory in step 2.

### Install from a ZIP

1. Download the [repository ZIP](https://github.com/vantagewithai/Vantage-NodesV2/archive/HEAD.zip) and extract it.
2. Rename the extracted folder to `Vantage-NodesV2`.
3. Place that folder in `ComfyUI/custom_nodes`.
4. Restart ComfyUI and refresh the browser.

The directory should look like this, without an extra nested repository folder:

```text
ComfyUI/
└── custom_nodes/
    └── Vantage-NodesV2/
        ├── __init__.py
        ├── bounding_boxes.py
        ├── multi_image_loader.py
        ├── web/
        └── README.md
```

### Update

For a Git installation, run this from the ComfyUI directory:

```bash
git -C custom_nodes/Vantage-NodesV2 pull
```

Restart ComfyUI after Python changes and refresh the browser after frontend changes. Existing workflows store node settings, group configuration, and editor data. When an update changes a node's input schema, a newly created instance may be needed to expose the new controls.

## Compatibility and dependencies

- Uses dependencies supplied by ComfyUI. No additional package installation or dependency downgrades are required for this nodeset.
- Requires a recent ComfyUI installation with `comfy_extras/nodes_bounding_boxes.py`, `comfy_extras/nodes_resolution.py`, graph expansion, and lazy input evaluation.
- The frontend uses ComfyUI's title-button and widget APIs. An older frontend without these APIs is not supported.
- The bounding-box editor works with Nodes 2.0 disabled. Nodes use standard widgets or DOM widgets rather than requiring a Nodes 2.0-only image input.
- Tested and confirmed working in both classic node mode and Nodes 2.0. Backend execution and frontend regression checks are included.
- Image drops use ComfyUI's local upload endpoint. This pack does not add remote uploads or model downloads.

## Node overview

| Display name | Internal class / workflow ID | Category |
| --- | --- | --- |
| Vantage-Bounding-Boxes | `Vantage-Bounding-Boxes` | `Vantage/Image` |
| Vantage Multiple Image Loader V2 | `VantageMultiImageLoaderV2` | `Vantage/Image` |
| Vantage-Easy-Controls | `Vantage-Easy-Controls` | `Vantage/Controls` |
| Any Switch (VantageV2) | `VantageanySwitchV2` | `Vantage/Utils` |
| Switch index (VantageV2) | `VantageSwitchIndex` | `Vantage/Utils` |
| Int Switch (VantageV2) | `VantageIntSwitchV2` | `Vantage/Utils` |
| Float Switch (VantageV2) | `VantageFloatSwitchV2` | `Vantage/Utils` |
| String Switch (VantageV2) | `VantageStringSwitchV2` | `Vantage/Utils` |
| Int Value Switch (VantageV2) | `VantageIntValueSwitchV2` | `Vantage/Utils` |
| Float Value Switch (VantageV2) | `VantageFloatValueSwitchV2` | `Vantage/Utils` |
| String Value Switch (VantageV2) | `VantageStringValueSwitchV2` | `Vantage/Utils` |
| Bool Value Switch (VantageV2) | `VantageBoolValueSwitchV2` | `Vantage/Utils` |
| For Loop Start (VantageV2) | `VantageForLoopStart` | `Vantage/Loops` |
| For Loop End (VantageV2) | `VantageForLoopEnd` | `Vantage/Loops` |
| While Loop Start (VantageV2) | `VantageWhileLoopStart` | `Vantage/Loops` |
| While Loop End (VantageV2) | `VantageWhileLoopEnd` | `Vantage/Loops` |

`VantageLoopIteration` is an internal execution helper. It is not intended for manual placement.

## Vantage-Bounding-Boxes

An interactive region editor for drawing and annotating bounding boxes over an image or blank canvas.

### Load an image

Use the searchable **Background** picker to select an image from ComfyUI's input folder, including subfolders. Alternatively, drop a local image onto the node to upload and select it.

Drops follow ComfyUI's normal upload behavior: matching filenames and file bytes reuse the existing file; a matching filename with different bytes is saved under a numbered filename. The picker updates to the saved name. **R / Refresh Node Definitions** updates the file list after changes outside the node.

Choose `(none)` for a blank canvas. With resizing disabled, a blank canvas is 1024 × 1024. Loaded images use their original dimensions, including EXIF orientation.

### Edit regions

- Drag empty canvas space to draw a box. Shift-drag draws over an existing box.
- Select a box on the canvas or from the region picker.
- Drag inside a selected box to move it; drag a corner or edge handle to resize it.
- Enter exact `x`, `y`, `width`, and `height` values in the inspector.
- Choose **Object** or **Text**, enter text content where applicable, and add a description.
- Set palette colors using color pickers or comma-separated hex values. Up to five output palette colors are supported.
- Duplicate or delete a selected box. Use the order arrows to place background regions before foreground regions.
- Toggle Grid for an editing guide. Undo/redo includes region edits and resize settings.

| Shortcut | Action |
| --- | --- |
| `B` / `V` | Draw / Select |
| `Delete` or `Backspace` | Delete selected region |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` | Redo |
| `Ctrl/Cmd+D` | Duplicate |
| Arrow keys | Nudge by 1 pixel |
| Shift + arrow keys | Nudge by 10 pixels |
| Escape | Deselect or cancel the current drag |

Shortcuts apply while the editor is focused; text fields retain normal editing behavior.

### Resize the background

Enable **Resize** to activate **Aspect ratio**, **Megapixels**, and **Multiple**. These use ComfyUI's ResolutionSelector calculation, where 1 MP represents 1024 × 1024 pixels. Changes update the grid without running the workflow.

The **Resize…** button opens additional processing options:

| Setting | Choices |
| --- | --- |
| Interpolation | nearest-exact, bilinear, area, bicubic, lanczos |
| Aspect mode | stretch, resize, pad, pad_edge, pad_edge_pixel, crop, pillarbox_blur, total_pixels |
| Crop/pad position | center, top, bottom, left, right |
| Pad color | RGB triplet or hex color |

Padding is the default and produces the selected target dimensions. `resize` fits within the target and can produce a smaller image; `crop` fills the target by cropping; `stretch` changes aspect ratio; `total_pixels` treats the target dimensions as a pixel budget. Edge and blur padding provide alternatives to solid borders.

Apply processes the image and transforms existing boxes with it. Cancel discards popup edits. Disabling Resize restores the original image dimensions. The read-only dimensions below the grid always describe the applied image.

The canvas fits centered without changing its viewport height. The node preserves its saved size, with a minimum of 520 × 1060.

### Inputs and outputs

Optional **bboxes** accepts bounding boxes, elements, or a JSON string. Run once to initialize incoming regions. Changed upstream values replace the editor contents; local edits take priority until the upstream value changes again.

| Output | Type | Contents |
| --- | --- | --- |
| `preview` | IMAGE | Annotated region preview |
| `bboxes` | BOUNDING_BOX | Regions in pixel coordinates |
| `elements` | ARRAY | Region data using ComfyUI's bounding-box helpers |
| `image` | IMAGE | Applied background without annotations or dimming; black canvas when no image is loaded |
| `width` | INT | Applied image width |
| `height` | INT | Applied image height |

Connect `width`, `height`, and optionally `image` to the multi-image loader for consistent sizing and a background image.

## Vantage Multiple Image Loader V2

Build an ordered image collection from the input folder and output either a batch or individual images.

### Gallery

Select a filename using the searchable picker and click **Add**, or drop local images onto the node. Drops use the same filename-and-content handling as the bounding-box editor. Duplicate selected paths cannot be added twice.

Drag thumbnails to reorder them. Remove a single thumbnail or use **Remove All**. The gallery preserves the workflow's node size; tiles resize to fit down to 112 × 112 pixels, after which the gallery scrolls.

### Settings

| Input | Default | Behavior |
| --- | --- | --- |
| `width` / `height` | 1024 / 1024 | Target dimensions; can receive the bounding-box node's INT outputs |
| `fit_edge` | longer | `longer` fits inside the rectangle; `shorter` scales to cover it and can exceed one dimension |
| `img_compression` | 18 | JPEG compression amount for gallery images; 0 disables compression, larger values reduce quality |
| `max_images` | 10 | Maximum total images and number of individual output sockets |
| `background` | Optional IMAGE | Prepended before gallery images and included in the count |

Sizing preserves aspect ratio and never enlarges an image. Images already within both target dimensions stay unchanged. In `shorter` mode, an image that exceeds just one dimension may stay unchanged rather than being enlarged to fill the other. The same sizing rule applies to the connected background; JPEG compression applies only to gallery images.

Connecting `background` from an active source reserves one gallery slot immediately. A muted or bypassed source does not reserve a slot and its background is ignored during execution. Mode changes update the count automatically; disconnecting also frees the slot. Lowering the limit or connecting a background removes excess gallery items from the end. At execution, a background batch consumes one slot per frame; the frontend can reserve only one slot before those frames are known. Backend execution enforces the total limit.

### Outputs

| Output | Type | Contents |
| --- | --- | --- |
| `IMAGE` | IMAGE | Full batch in background-then-gallery order |
| `MASK` | MASK | Zero masks matching the batch dimensions |
| `image_0` … `image_N` | IMAGE | One resized image per slot; `N = max_images - 1` |

Different image sizes are center-padded with transparent borders to form the batch. Individual outputs keep their own resized dimensions without that batch padding. Unused individual outputs return `None`.

Changing `max_images` updates individual sockets immediately. Reducing it removes trailing sockets and their connections. Background-removal models and controls are not included.

## Vantage-Easy-Controls

Organize nodes into named groups and nested subgroups, then control them using On/Off toggles. Open the title-bar **⚙ Configure** button to edit the hierarchy.

### Assign nodes

Each group has one searchable `Name (ID)` picker and two assignment columns:

| Column | Group On | Group Off |
| --- | --- | --- |
| **Follow toggle** | Always | Selected off mode |
| **Opposite toggle** | Selected off mode | Always |

Choose a node and use **Add to Follow** or **Add to Opposite**. Only selected nodes appear in the columns. Adding a node to one column removes it from the other within that group.

Select the off mode independently for each group:

- **Bypass:** mode 4; skips the node and routes compatible inputs to outputs.
- **Mute:** mode 2, also called Never; stops execution without bypass routing.

Selecting a ComfyUI subgraph node also controls the nodes inside it, including nested subgraphs.

### Nested groups and exclusive selections

Parent Off gates its descendants using the parent's off mode, including both assignment columns. Child toggle preferences are retained. Turning the parent back On restores those preferences instead of enabling every child.

When an enabled ancestor and a deeper subgroup both assign the same node, the deeper assignment wins. Shared nodes at the same depth favor an active assignment. Independent root groups can overlap; the most recently applied root group determines the shared node's mode.

Each parent can choose a rule for its immediate subgroups:

| Subgroup behavior | Rule |
| --- | --- |
| `default` | Children toggle independently |
| `max one` | Zero or one child may be On; enabling one switches siblings Off |
| `always one` | One child must remain On when children exist; the last active child cannot be switched Off |

The restriction is local to the parent. Parent Off still gates the children, even in Always one mode, while retaining their selection.

### Reorder and change hierarchy

Drag a **⠿** handle onto a reorder gap to change order. Drop inside another group to make it a subgroup, or in a root-group area to promote it to the root. Children and settings move with the group. Cyclic nesting is blocked.

Names must be unique among groups sharing the same parent. **Save** applies configuration and mode changes; **Cancel** discards the dialog's edits. Configuration is stored in the workflow. Restoring a workflow rebuilds controls without applying toggle actions to its nodes.

### Emit State

Enable **Emit State** separately for any group or subgroup to create a BOOLEAN output for that item. Only checked items get output sockets.

Names are sanitized: punctuation and spaces become underscores, leading digits receive a prefix, and collisions receive numeric suffixes. For example, `Image Edit` becomes `Image_Edit`.

Outputs report effective state. A child whose preference is On emits False while an ancestor is Off, then returns to True when that ancestor is enabled. State-output identities are saved so renaming, reordering, or removing another output preserves surviving connections.

## Any Switch (VantageV2)

**Class:** `VantageanySwitchV2`

Returns the first non-None input in numbered socket order. Starts with five sockets and adds a spare socket as connections grow. Socket types follow connections.

False, zero, empty strings, empty lists, and ordinary empty dictionaries are valid values. An rgthree-style context containing `model` and `clip` with all values set to None is skipped. If no value is available, the output is None.

Use this for fallback selection: preferred source first, alternatives below it. This node does not use lazy branch evaluation; upstream connected inputs may execute even when an earlier input is selected.

## Switch index (VantageV2)

**Class:** `VantageSwitchIndex`

Selects an input by its zero-based integer **index**. Index 0 selects `input_0`, index 1 selects `input_1`, and so on. Inputs expand dynamically as with Any Switch.

An unconnected, None, or out-of-range selection returns None. It does not fall back to another input. Convert the index widget to an input when connecting an upstream INT. Connected branch inputs are not lazy.

## Condition switches

These nodes choose among connected data inputs using ordered rules. Use the title-bar gear to add, delete, and reorder rules. Each rule chooses a comparison, comparison constant, and zero-based input index. The input count expands to cover the indices used by the rules.

The first matching rule wins. No match or an unconnected selected input returns None. Only the selected data branch is requested for execution through ComfyUI's lazy input evaluation.

### Int Switch (VantageV2)

**Class:** `VantageIntSwitchV2` · **Comparison input:** INT

Supports `=`, `!=`, `<`, `<=`, `>`, and `>=`.

Example:

| Order | Condition | Selected input |
| --- | --- | --- |
| 1 | `value = 0` | `input_0` |
| 2 | `value < 4` | `input_1` |
| 3 | `value >= 5` | `input_3` |

Value 0 selects the first rule, 3 selects the second, 5 selects the third, and 4 produces None. Rules may select the same input more than once.

### Float Switch (VantageV2)

**Class:** `VantageFloatSwitchV2` · **Comparison input:** FLOAT

Supports the same six numeric operators with decimal comparison constants. For example, `< 0.5` can select one branch and `>= 0.5` another. Equality uses exact floating-point comparison rather than a tolerance; use ranges when appropriate.

### String Switch (VantageV2)

**Class:** `VantageStringSwitchV2` · **Comparison input:** STRING

Supports `=`, `!=`, `contains`, `not contains`, `starts with`, and `ends with`. Matching is case-sensitive, preserves whitespace, and accepts empty strings.

For example, `starts with "portrait"` can select one input while `contains "landscape"` selects another. Put more-specific rules first when they overlap.

Rules and their order save with the workflow. Removing the highest referenced input indices removes the corresponding trailing sockets and links.

## Named value switches

These four nodes evaluate conditions like the branch switches, but return values entered directly on the node instead of receiving data branches through sockets. The comparison **value** remains available as a widget or connected input.

In the title-bar configuration:

1. Choose output type: **BOOLEAN**, **INT**, **FLOAT**, or **STRING**.
2. Add conditions with unique display names.
3. Choose each condition's operator and comparison constant.
4. Save, then enter the desired result in each named field on the node.

The first matching condition returns its field's value. No match returns None. The output socket follows the chosen output type. Names, conditions, and entered results save with the workflow.

Changing the output type resets result fields to the new type's defaults and disconnects incompatible existing output links. Restoring an unchanged saved workflow preserves links.

### Int Value Switch (VantageV2)

**Class:** `VantageIntValueSwitchV2`

Compares an INT using `=`, `!=`, `<`, `<=`, `>`, or `>=`. For example, name two rules `Low steps` and `High steps`, then return different numeric settings for each range.

### Float Value Switch (VantageV2)

**Class:** `VantageFloatValueSwitchV2`

Compares a FLOAT with decimal constants using the six numeric operators. Useful for mapping a continuous setting into named output values. Equality is exact, as in Float Switch.

### String Value Switch (VantageV2)

**Class:** `VantageStringValueSwitchV2`

Compares text using equals, not equals, contains, not contains, starts with, or ends with. Matching is case-sensitive. For example, map a named mode to an integer, Boolean, or prompt string.

### Bool Value Switch (VantageV2)

**Class:** `VantageBoolValueSwitchV2`

Compares a BOOLEAN against True or False using `=` or `!=`. For example, a `True` condition named `Enabled prompt` and a `False` condition named `Disabled prompt` can each return a different STRING.

## For Loop Start / End (VantageV2)

**Classes:** `VantageForLoopStart`, `VantageForLoopEnd`

Executes the connected body **total** times, carrying one value between iterations.

### For Loop Start

| Input | Purpose |
| --- | --- |
| `total` | Iteration count; default 1 |
| `initial_value` | Optional value supplied to the first iteration |

| Output | Purpose |
| --- | --- |
| `flow` | Connect directly to the matching For Loop End |
| `index` | Current zero-based iteration index |
| `value` | Initial value on iteration 0, then the previous iteration's result |

### For Loop End

Connect Start's `flow` to End's `flow`, and the body's updated result to End's `value`. End outputs the final carried value. With `total = 0`, it skips the body and returns the initial value.

Conceptually, an initial value of 0, a body that adds 1, and total 3 produce indices 0, 1, 2 and a final result of 3.

## While Loop Start / End (VantageV2)

**Classes:** `VantageWhileLoopStart`, `VantageWhileLoopEnd`

Repeats the connected body while its continuation condition remains True.

### While Loop Start

- **condition:** whether to enter the loop; default True.
- **initial_value:** optional starting value.
- Outputs **flow**, zero-based **index**, and carried **value**, as with For Loop Start.

### While Loop End

- Connect Start's **flow** to End's **flow**.
- Connect the body's updated value to End's **value**.
- Connect a computed Boolean to End's **condition**. True starts another iteration; False finishes and returns the current result. Its default is False.

If Start's initial condition is False, the body is skipped and the initial value is returned. Once entered, the body runs before End checks whether to repeat. Ensure the computed continuation condition eventually becomes False, or stop execution manually.

### Shared loop behavior

Loops use ComfyUI's graph expansion API, not a Python loop around model execution. Nested loops are supported by connecting an outer carried value into the inner Start. Use matching Start/End types.

Each loop carries one arbitrary ComfyUI value. It can be a list or dictionary when multiple items need to travel together, provided the body can consume and update that structure.

Only the dependency path from Start into End is repeated. A disconnected preview or save node is not automatically executed per iteration; required side effects must be part of End's dependency path.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| Nodes are missing | Confirm the folder layout, restart ComfyUI, refresh the browser, and inspect the startup log for import errors. |
| Missing bounding-box or resolution module | Update ComfyUI to a release containing the required core helpers. |
| UI looks unchanged after an update | Hard-refresh the browser and reopen the workflow. |
| New input fields are missing | Create a fresh instance of the changed node and reconnect it. |
| Image picker does not show a new file | Press R / Refresh Node Definitions. Dropped uploads update the receiving picker immediately. |
| A switch returns None | Check rule order, selected index, connected inputs, and case-sensitive string comparisons. |
| An unused image output contains None | This is expected for indices beyond the loaded image count. Downstream nodes must accept None or be disabled for that branch. |
| A child control cannot be enabled | Its ancestor may be Off, or its parent may enforce Max one / Always one. |
| An Off control still passes data | Its off mode is Bypass. Select Mute to stop execution without bypass routing. |
| Old output wires are already missing | Reload an earlier saved workflow or reconnect them and save. Fixes preserve existing wires but cannot recreate connections absent from the saved file. |

## Development checks

From the ComfyUI directory, use the same Python environment used to launch ComfyUI:

```bash
python custom_nodes/Vantage-NodesV2/tests/image_compositor_smoke.py
python custom_nodes/Vantage-NodesV2/tests/bounding_boxes_smoke.py
python custom_nodes/Vantage-NodesV2/tests/multi_image_loader_smoke.py
python custom_nodes/Vantage-NodesV2/tests/loops_smoke.py
python custom_nodes/Vantage-NodesV2/tests/int_switch_smoke.py
python custom_nodes/Vantage-NodesV2/tests/value_switch_smoke.py
```

Frontend logic checks require Node.js for development only; it is not a runtime dependency:

```bash
node custom_nodes/Vantage-NodesV2/tests/image_compositor_smoke.mjs
node custom_nodes/Vantage-NodesV2/tests/easy_controls_smoke.mjs
node custom_nodes/Vantage-NodesV2/tests/image_combo_smoke.mjs
node custom_nodes/Vantage-NodesV2/tests/image_drop_smoke.mjs
node custom_nodes/Vantage-NodesV2/tests/value_switch_restore_smoke.mjs
```

These checks cover backend behavior, graph execution, and selected frontend logic. The live nodes have also been tested in both classic mode and Nodes 2.0.

## License

[MIT](LICENSE).

### Execution Pause (VantageV2)

Class: `VantageExecutionPauseV2`. Connect any value to its input and route downstream nodes through its output. The first Run evaluates the input and blocks that downstream branch. Make your changes and press Run again to pass the current input through unchanged. It then arms itself for the next pause. A status field indicates when it is waiting. Reloading the workflow resets it to pause.

This uses ComfyUI execution blocking, like the compositor: independent branches may finish, and Run submits the updated workflow rather than resuming an old execution snapshot. Upstream nodes may rerun if their inputs change. Use manual Run; automatic queueing or prequeued jobs are not a manual review checkpoint. No extra dependencies.

### Vantage Image Compositor

Class: `VantageImageCompositor`. A single image-batch compositor inspired by Enrico's Compositor V4 pair. Enrico's nodes and Fabric.js are not required.

- `images`: IMAGE batch; each image becomes an independently editable layer, with no eight-layer limit.
- `masks`: optional MASK batch. A single mask applies to every image; otherwise masks match image indices. Missing masks leave the image's alpha unchanged. Masks are resized to image dimensions; 1 is visible and 0 is transparent. `invert_masks` reverses this convention. Existing RGBA alpha is multiplied by the mask.
- `width` / `height`: output canvas dimensions. `padding` adds editor working space around the canvas without enlarging the output.
- `normalize_height`: resize input layers to the canvas height while preserving aspect ratio, then fit their initial placement inside the canvas.
- `auto_continue`: Off pauses the downstream branch when input images, masks, or canvas settings change. Arrange layers, then Run again. On renders immediately using the current layout.

Drag layers to move them. Corner handles resize around the layer center while preserving aspect ratio; hold Shift to change width and height independently. The top handle rotates; hold Shift for 15-degree increments. Numeric fields set position, dimensions, angle, and opacity. The toolbar also provides flips, fit, nine-way alignment, stacking order, grid snapping, background color, reset, and undo/redo. Layer checkboxes control visibility. Draw and Erase edit a separate foreground drawing layer. Arrow keys nudge the selected image; Shift increases the step.

The editor scales and centers its canvas inside the current node size, independent of output resolution. Minimum node size is 680 × 780; workflow layout size is retained on reload. Layer positions, order, visibility, and drawings are saved in the workflow.

Outputs are `image` (one RGB composite) and `transforms` (JSON layout with zero-based layer indices, center positions, dimensions, angles, flips, opacity, visibility, background, and strokes). There is no Save button or image-name output. Input previews are written only to ComfyUI's temporary directory; use a separate Save Image node to save the final composite. Reloading a workflow requests a fresh input review when auto-continue is Off.
