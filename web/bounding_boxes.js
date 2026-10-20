import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { installImageDrop } from "./image_drop.js";
import { installImageComboRefresh, createImagePicker } from "./image_combo.js";

const style = document.createElement("style");
style.textContent = `
.vantage-bbox { display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;height:100%;overflow:hidden;background:var(--comfy-menu-bg,#202124);color:var(--input-text,#eee);font:12px system-ui,sans-serif;outline:none }
.vantage-bbox * { box-sizing:border-box }
.vantage-bbox button,.vantage-bbox input,.vantage-bbox textarea,.vantage-bbox select { font:inherit;color:inherit;background:var(--comfy-input-bg,#303238);border:1px solid #ffffff24;border-radius:6px;padding:6px 8px;min-width:0 }
.vantage-bbox button { cursor:pointer;transition:background .12s,border-color .12s }
.vantage-bbox button:hover { background:#ffffff20;border-color:#ffffff60 }
.vantage-bbox button:disabled { opacity:.3;cursor:default }
.vantage-bbox button[aria-pressed=true] { color:#a5d8ff;border-color:#62b5ff;background:#25679c50 }
.vantage-bbox :focus-visible { outline:2px solid #62b5ff;outline-offset:1px }
.vantage-bbox .bar { flex-shrink:0;display:flex;gap:5px;align-items:center;flex-wrap:nowrap }
.vantage-bbox .spacer { flex:1 }
.vantage-bbox .viewport { flex:1;position:relative;background:#151619;border:1px solid #ffffff20;border-radius:8px;overflow:hidden;min-height:200px }
.vantage-bbox canvas { display:block;width:100%;height:100%;object-fit:contain;object-position:center center;touch-action:none;cursor:crosshair }
.vantage-bbox .status { flex-shrink:0;overflow:hidden;white-space:nowrap;display:flex;justify-content:space-between;gap:8px;color:#b5bbc4;font-size:11px;font-variant-numeric:tabular-nums }
.vantage-bbox .status span:last-child { overflow:hidden;text-overflow:ellipsis }
.vantage-bbox .details { flex-shrink:0;height:430px }
.vantage-bbox .hint { height:100%;display:flex;align-items:center;justify-content:center;white-space:pre-line;margin:0;padding:12px;text-align:center;color:#a4aab4;border:1px dashed #ffffff25;border-radius:7px;line-height:1.6 }
.vantage-bbox .inspector { height:100%;display:flex;flex-direction:column;gap:8px;padding:9px;border:1px solid #ffffff25;border-radius:8px }
.vantage-bbox .geometry { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px }
.vantage-bbox label { display:flex;flex-direction:column;gap:4px;color:#aeb5bf }
.vantage-bbox input,.vantage-bbox textarea,.vantage-bbox select { width:100% }
.vantage-bbox textarea { resize:none;height:48px;min-height:48px }
.vantage-bbox .palette { display:flex;align-items:center;gap:6px;flex-wrap:nowrap }
.vantage-bbox input[type=color] { width:30px;height:28px;padding:2px;cursor:pointer }
.vantage-bbox .swatch { display:flex;gap:1px;align-items:center }
.vantage-bbox .swatch button { padding:3px;border:0;background:transparent;color:#aeb5bf }
.vantage-bbox .layers { flex-shrink:0;height:32px }
.vantage-bbox .layers select { height:32px;border-left:3px solid var(--box-color,#72b7ff) }
.vantage-bbox .source input { flex:1;width:auto }
.vantage-bbox .resize-dialog { color:inherit;background:var(--comfy-menu-bg,#202124);border:1px solid #647084;border-radius:12px;padding:18px;width:360px;max-width:90vw }
.vantage-bbox .resize-dialog::backdrop { background:#0008 }
.vantage-bbox .resize-dialog h3 { margin:0 0 12px }
.vantage-bbox .resize-dialog .fields { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 }
.vantage-bbox .resolution-area { flex-shrink:0;display:flex;flex-direction:column;gap:8px }
.vantage-bbox .resize-dialog p { color:#aeb5bf;font-size:11px;line-height:1.5 }
.vantage-bbox [hidden] { display:none!important }
`;
document.head.appendChild(style);

export function parseBoxData(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.boxes;
    if (!Array.isArray(list) || !list.every(box => box && typeof box === "object"
        && ["x", "y", "width", "height"].every(name => Number.isFinite(box[name]))
        && box.width >= 0 && box.height >= 0
        && (box.metadata === undefined || box.metadata !== null && typeof box.metadata === "object" && !Array.isArray(box.metadata)))) {
        throw new Error("Paste bounding-box JSON with x, y, width and height values.");
    }
    return list;
}

app.registerExtension({
    name: "vantage.bounding_boxes",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "Vantage-Bounding-Boxes") return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            const node = this;
            const minimumWidth = 520, minimumHeight = 1100, headerHeight = 170;
            const widget = name => node.widgets.find(w => w.name === name);
            for (const name of ["editor_state", "last_incoming", "resize_options", "background_state", "background_image", "resize", "aspect_ratio", "megapixels", "multiple"]) {
                const w = widget(name);
                w.type = "hidden";
                w.computeSize = () => [0, -4];
                if (w.inputEl) w.inputEl.style.display = "none";
            }
            const element = (tag, parent, className, text) => {
                const el = document.createElement(tag);
                if (className) el.className = className;
                if (text) el.textContent = text;
                parent?.appendChild(el);
                return el;
            };
            const root = element("div", null, "vantage-bbox");
            root.tabIndex = 0;
            root.setAttribute("aria-label", "Bounding box editor");
            const sourceRow = element("div", root, "bar source");
            element("span", sourceRow, null, "Background");
            const sourcePicker = createImagePicker(sourceRow, "Background image");
            const sourceSelect = sourcePicker.input;
            sourceRow.appendChild(sourceSelect);
            sourcePicker.setOptions(nodeData.input.required.background_image[0]);
            const toolbar = element("div", root, "bar");
            const button = (parent, label, title, action) => {
                const b = element("button", parent, null, label);
                b.type = "button";
                b.title = title;
                b.onclick = action;
                return b;
            };
            let selected = -1, hovered = -1, background = null, loadingBackground = null;
            let drag = null, mode = "select", grid = false, frame = null;
            let undo = [], redo = [];
            let backgroundTransform = [1, 1, 0, 0];
            const boxes = () => JSON.parse(widget("editor_state").value || "[]");
            let imageDimensions = [1024, 1024];
            const dimensions = () => imageDimensions;
            const changed = () => { app.graph?.change(); node.setDirtyCanvas(true); };
            function targetDimensions() {
                const [w, h] = widget("aspect_ratio").value.split(" ")[0].split(":").map(Number);
                const multiple = Number(widget("multiple").value);
                const scale = Math.sqrt(Number(widget("megapixels").value) * 1024 * 1024 / (w * h));
                const round = value => {
                    const n = value / multiple, floor = Math.floor(n);
                    return (n - floor === 0.5 ? floor + floor % 2 : Math.round(n)) * multiple;
                };
                return [round(w * scale), round(h * scale)];
            }
            function effectiveResizeOptions() {
                const [width, height] = targetDimensions();
                return { keep_proportion: "pad", ...JSON.parse(widget("resize_options").value || "{}"), enabled: !!widget("resize").value,
                    width, height, divisible_by: Number(widget("multiple").value) };
            }
            const snapshot = () => JSON.stringify({ boxes: widget("editor_state").value, resize: widget("resize_options").value, resolution: ["resize", "aspect_ratio", "megapixels", "multiple"].map(name => widget(name).value) });
            function remember() {
                undo.push(snapshot());
                if (undo.length > 40) undo.shift();
                redo = [];
            }
            function save(list) {
                widget("editor_state").value = JSON.stringify(list);
                refresh();
            }
            function edit(action) {
                remember();
                const list = boxes();
                action(list);
                save(list);
                changed();
            }
            function history(from, to) {
                if (!from.length || loadingBackground) return;
                to.push(snapshot());
                const state = JSON.parse(from.pop());
                widget("editor_state").value = state.boxes;
                const previous = JSON.stringify(effectiveResizeOptions());
                widget("resize_options").value = state.resize;
                ["resize", "aspect_ratio", "megapixels", "multiple"].forEach((name, i) => { widget(name).value = state.resolution[i]; });
                syncResolutionControls();
                if (previous !== JSON.stringify(effectiveResizeOptions())) loadBackground();
                selected = Math.min(selected, boxes().length - 1);
                refresh();
                changed();
            }
            const selectButton = button(toolbar, "Select", "Select / move (V)", () => { mode = "select"; refresh(); });
            const drawButton = button(toolbar, "+ Box", "Draw a box (B), or Shift-drag anywhere", () => { mode = "draw"; selected = -1; refresh(); });
            const gridButton = button(toolbar, "Grid", "Toggle grid overlay", () => { grid = !grid; refresh(); });
            button(toolbar, "Copy", "Copy all box data (Ctrl/Cmd+C)", () => copyBoxData());
            button(toolbar, "Paste", "Paste box data (Ctrl/Cmd+V)", () => openBoxData());
            element("span", toolbar, "spacer");
            const undoButton = button(toolbar, "↶", "Undo (Ctrl/Cmd+Z)", () => history(undo, redo));
            const redoButton = button(toolbar, "↷", "Redo (Ctrl/Cmd+Shift+Z)", () => history(redo, undo));
            const clearButton = button(toolbar, "Clear", "Clear all boxes (undoable)", () => edit(list => { list.length = 0; selected = -1; }));
            const viewport = element("div", root, "viewport");
            const canvas = element("canvas", viewport);
            canvas.setAttribute("aria-label", "Draw, select, move and resize bounding boxes");
            const ctx = canvas.getContext("2d");
            const status = element("div", root, "status");
            const sizeLabel = element("span", status);
            const positionLabel = element("span", status, null, "Drag empty space to draw");
            const dataDialog = element("dialog", root, "resize-dialog");
            dataDialog.style.width = "520px";
            const dataTitle = element("h3", dataDialog);
            const dataText = element("textarea", dataDialog);
            dataText.style.cssText = "width:100%;height:220px;resize:vertical";
            dataText.setAttribute("aria-label", "Bounding box JSON");
            element("p", dataDialog, null, "Transfers all boxes and metadata. Pixel coordinates are unchanged; background and resize settings are not copied.");
            const dataError = element("p", dataDialog);
            dataError.style.color = "#ffa5a5";
            const dataActions = element("div", dataDialog, "bar");
            button(dataActions, "Close", "Close without changing boxes", () => dataDialog.close());
            const importButton = button(dataActions, "Replace boxes", "Replace current boxes; Undo restores them", () => {
                try {
                    const incoming = parseBoxData(dataText.value);
                    edit(list => { list.splice(0, list.length, ...incoming); selected = -1; drag = null; });
                    dataDialog.close();
                    root.focus();
                } catch (error) { dataError.textContent = error.message; }
            });
            dataDialog.addEventListener("keydown", event => event.stopPropagation());
            dataDialog.addEventListener("pointerdown", event => event.stopPropagation());
            async function copyBoxData() {
                const text = JSON.stringify({width: dimensions()[0], height: dimensions()[1], boxes: boxes()}, null, 2);
                try {
                    await navigator.clipboard.writeText(text);
                    positionLabel.textContent = "Box data copied";
                } catch {
                    dataTitle.textContent = "Copy box data";
                    dataError.textContent = "Select and copy the JSON below.";
                    dataText.value = text;
                    importButton.hidden = true;
                    dataDialog.showModal();
                    dataText.focus(); dataText.select();
                }
            }
            async function openBoxData() {
                if (loadingBackground || drag) return;
                dataTitle.textContent = "Paste box data";
                dataText.value = "";
                dataError.textContent = "";
                importButton.hidden = false;
                dataDialog.showModal();
                dataText.focus();
                try {
                    const text = await navigator.clipboard.readText();
                    if (dataDialog.open && !dataText.value) dataText.value = text;
                } catch { dataError.textContent = "Paste your copied JSON into the field above."; }
            }
            const layers = element("div", root, "layers");
            const regionSelect = element("select", layers);
            regionSelect.setAttribute("aria-label", "Selected region");
            regionSelect.onchange = () => { selected = Number(regionSelect.value); mode = "select"; root.focus(); refresh(); };
            const details = element("div", root, "details");
            const hint = element("p", details, "hint", "Drag to draw a box · Select a box to edit it\nShift-drag to draw over an existing box");
            const inspector = element("div", details, "inspector");
            const actions = element("div", inspector, "bar");
            const selectionLabel = element("strong", actions);
            element("span", actions, "spacer");
            const earlier = button(actions, "←", "Move earlier (background first)", () => reorder(-1));
            const later = button(actions, "→", "Move later (foreground last)", () => reorder(1));
            button(actions, "Duplicate", "Duplicate selected box", () => duplicate());
            button(actions, "Delete", "Delete selected box", () => remove());
            const geometry = element("div", inspector, "geometry");
            const fields = {};
            for (const name of ["x", "y", "width", "height"]) {
                const label = element("label", geometry, null, name);
                const input = element("input", label);
                input.type = "number";
                input.step = "1";
                input.setAttribute("aria-label", `Box ${name}`);
                input.onchange = () => edit(list => { list[selected][name] = Number(input.value); });
                fields[name] = input;
            }
            const typeBar = element("div", inspector, "bar");
            const typeButtons = {};
            for (const [type, label] of [["obj", "Object"], ["text", "Text"]]) {
                typeButtons[type] = button(typeBar, label, `Set region type to ${label.toLowerCase()}`, () => edit(list => {
                    list[selected].metadata ||= {};
                    list[selected].metadata.type = type;
                }));
                typeButtons[type].style.flex = "1";
            }
            const characterLabel = element("label", inspector, "bar");
            characterLabel.style.flexDirection = "row";
            const characterToggle = element("input", characterLabel);
            characterToggle.type = "checkbox";
            characterToggle.style.width = "auto";
            characterToggle.setAttribute("aria-label", "Character");
            element("span", characterLabel, null, "Character");
            characterToggle.onchange = () => edit(list => {
                list[selected].metadata ||= {};
                list[selected].metadata.is_character = characterToggle.checked;
            });
            for (const [name, title] of [["text", "Text content"], ["desc", "Description"]]) {
                const label = element("label", inspector, null, title);
                const input = element("textarea", label);
                input.rows = 2;
                input.placeholder = name === "text" ? "Text to appear in this region…" : "Describe this region…";
                input.setAttribute("aria-label", title);
                input.onfocus = () => { input.dataset.recorded = ""; };
                input.oninput = () => {
                    if (!input.dataset.recorded) { remember(); input.dataset.recorded = "1"; }
                    const list = boxes();
                    list[selected].metadata ||= {};
                    list[selected].metadata[name] = input.value;
                    save(list);
                    changed();
                };
                fields[name] = input;
            }
            const paletteBar = element("div", inspector, "palette");
            const paletteLabel = element("label", inspector, null, "Palette (hex colors, separated by commas)");
            const paletteInput = element("input", paletteLabel);
            paletteInput.placeholder = "#ff8800, #3366ff";
            paletteInput.onchange = () => edit(list => {
                list[selected].metadata ||= {};
                list[selected].metadata.palette = paletteInput.value.split(",").map(s => s.trim()).filter(Boolean);
            });
            fields.palette = paletteInput;
            const colors = ["#75baff", "#e7ad63", "#c599ff", "#7ed7ad", "#ef91ac"];
            const color = (box, i) => /^#[0-9a-f]{6}$/i.test(box.metadata?.palette?.[0]) ? box.metadata.palette[0] : colors[i % colors.length];
            function handles(box) {
                const x = box.x, y = box.y, r = x + box.width, b = y + box.height;
                return [["nw", x, y], ["n", (x + r) / 2, y], ["ne", r, y], ["e", r, (y + b) / 2],
                    ["se", r, b], ["s", (x + r) / 2, b], ["sw", x, b], ["w", x, (y + b) / 2]];
            }
            function metrics() {
                const rect = canvas.getBoundingClientRect();
                const [width, height] = dimensions();
                const w = Math.min(rect.width, rect.height * width / height), h = w * height / width;
                return { left: rect.left + (rect.width - w) / 2, top: rect.top + (rect.height - h) / 2, width: w, height: h };
            }
            function point(event) {
                const rect = metrics(), [width, height] = dimensions();
                return { x: Math.round((event.clientX - rect.left) / rect.width * width), y: Math.round((event.clientY - rect.top) / rect.height * height) };
            }
            function handleAt(p, list) {
                if (!list[selected]) return null;
                const [width, height] = dimensions(), rect = metrics();
                return handles(list[selected]).find(([, x, y]) => Math.abs(p.x - x) <= 8 * width / rect.width && Math.abs(p.y - y) <= 8 * height / rect.height)?.[0];
            }
            const hitAt = (p, list) => list.findLastIndex(b => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height);
            function paint() {
                frame = null;
                const [width, height] = dimensions();
                const scale = Math.min(1, 1400 / Math.max(width, height));
                canvas.width = Math.max(1, Math.round(width * scale));
                canvas.height = Math.max(1, Math.round(height * scale));
                const unit = canvas.width / Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight * width / height));
                ctx.fillStyle = "#24272c";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                if (background) {
                    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = "#00000050";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                if (grid) {
                    ctx.strokeStyle = "#ffffff30";
                    ctx.lineWidth = unit;
                    ctx.beginPath();
                    for (let i = 1; i < 8; i++) {
                        ctx.moveTo(canvas.width * i / 8, 0); ctx.lineTo(canvas.width * i / 8, canvas.height);
                        ctx.moveTo(0, canvas.height * i / 8); ctx.lineTo(canvas.width, canvas.height * i / 8);
                    }
                    ctx.stroke();
                }
                const list = boxes();
                for (let i = 0; i < list.length; i++) {
                    const box = list[i], meta = box.metadata || {}, c = color(box, i);
                    const x = box.x * scale, y = box.y * scale, w = box.width * scale, h = box.height * scale;
                    ctx.fillStyle = c + (i === selected ? "32" : "14");
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = c;
                    ctx.lineWidth = (i === selected || i === hovered ? 2.5 : 1.5) * unit;
                    ctx.strokeRect(x, y, w, h);
                    ctx.font = `600 ${11 * unit}px system-ui`;
                    const tag = `${String(i + 1).padStart(2, "0")} ${meta.type === "text" ? "TEXT" : "OBJ"}`;
                    const tagWidth = ctx.measureText(tag).width + 10 * unit;
                    ctx.fillStyle = c;
                    ctx.fillRect(x, y, tagWidth, 19 * unit);
                    ctx.fillStyle = "#15181d";
                    ctx.fillText(tag, x + 5 * unit, y + 13 * unit);
                    ctx.save();
                    ctx.beginPath(); ctx.rect(x, y + 20 * unit, Math.max(0, w), Math.max(0, h - 20 * unit)); ctx.clip();
                    ctx.font = `${12 * unit}px system-ui`;
                    ctx.fillStyle = "#ffffff";
                    const body = [meta.type === "text" && meta.text ? `“${meta.text}”` : "", meta.desc || ""].filter(Boolean).join(" — ");
                    let line = "", lineY = y + 35 * unit;
                    for (const word of body.split(/\s+/)) {
                        const next = line ? `${line} ${word}` : word;
                        if (line && ctx.measureText(next).width > w - 12 * unit) {
                            ctx.fillText(line, x + 6 * unit, lineY); lineY += 16 * unit; line = word;
                        } else line = next;
                    }
                    ctx.fillText(line, x + 6 * unit, lineY);
                    ctx.restore();
                }
                if (list[selected]) {
                    for (const [, x, y] of handles(list[selected])) {
                        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1b2635"; ctx.lineWidth = unit;
                        ctx.fillRect(x * scale - 3.5 * unit, y * scale - 3.5 * unit, 7 * unit, 7 * unit);
                        ctx.strokeRect(x * scale - 3.5 * unit, y * scale - 3.5 * unit, 7 * unit, 7 * unit);
                    }
                }
                node.setDirtyCanvas(true);
            }
            function refresh() {
                if (frame === null) frame = requestAnimationFrame(paint);
                const list = boxes(), box = list[selected], meta = box?.metadata || {};
                inspector.hidden = !box;
                hint.hidden = !!box;
                selectButton.setAttribute("aria-pressed", mode === "select");
                drawButton.setAttribute("aria-pressed", mode === "draw");
                gridButton.setAttribute("aria-pressed", grid);
                undoButton.disabled = !!loadingBackground || !undo.length; redoButton.disabled = !!loadingBackground || !redo.length;
                clearButton.disabled = !!loadingBackground || !list.length;
                resizeButton.disabled = !!loadingBackground || widget("background_image").value === "(none)";
                sizeLabel.textContent = `${dimensions().join(" × ")} · ${list.length} ${list.length === 1 ? "box" : "boxes"}`;
                selectionLabel.textContent = box ? `Box ${String(selected + 1).padStart(2, "0")}` : "";
                earlier.disabled = selected <= 0; later.disabled = selected >= list.length - 1;
                for (const [type, b] of Object.entries(typeButtons)) b.setAttribute("aria-pressed", (meta.type || "obj") === type);
                for (const [name, input] of Object.entries(fields)) {
                    if (document.activeElement !== input) input.value = ["x", "y", "width", "height"].includes(name) ? box?.[name] ?? 0 : name === "palette" ? (meta.palette || []).join(", ") : meta[name] || "";
                }
                characterLabel.hidden = meta.type === "text";
                characterToggle.checked = !!meta.is_character;
                fields.text.disabled = meta.type !== "text";
                fields.text.parentElement.style.opacity = meta.type === "text" ? "1" : ".45";
                regionSelect.replaceChildren(new Option("Select a region…", "-1"));
                list.forEach((item, i) => regionSelect.add(new Option(`${String(i + 1).padStart(2, "0")} ${item.metadata?.text || item.metadata?.desc || "Region"}`, i)));
                regionSelect.value = String(selected);
                regionSelect.style.setProperty("--box-color", box ? color(box, selected) : "#72b7ff");
                // Keep native color pickers alive while their popup is open.
                if (document.activeElement?.type !== "color" || !paletteBar.contains(document.activeElement)) {
                    paletteBar.replaceChildren();
                    for (const [i, value] of (meta.palette || []).slice(0, 5).entries()) {
                        const swatch = element("span", paletteBar, "swatch");
                        const input = element("input", swatch);
                        input.type = "color";
                        input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
                        input.title = `Palette color ${i + 1}`;
                        input.onchange = () => edit(list => { list[selected].metadata.palette[i] = input.value; });
                        button(swatch, "×", "Remove color", () => edit(list => { list[selected].metadata.palette.splice(i, 1); }));
                    }
                    const addColor = button(paletteBar, "+ Color", "Add palette color (up to five output colors)", () => edit(list => {
                        list[selected].metadata ||= {};
                        list[selected].metadata.palette ||= [];
                        list[selected].metadata.palette.push(color(list[selected], selected));
                    }));
                    addColor.disabled = (meta.palette || []).length >= 5;
                }
            }
            function reorder(offset) {
                const index = selected + offset;
                if (selected < 0 || index < 0 || index >= boxes().length) return;
                edit(list => { [list[selected], list[index]] = [list[index], list[selected]]; selected = index; });
            }
            function remove() {
                if (selected < 0) return;
                edit(list => { list.splice(selected, 1); selected = Math.min(selected, list.length - 1); });
            }
            function duplicate() {
                if (selected < 0) return;
                edit(list => {
                    const copy = JSON.parse(JSON.stringify(list[selected]));
                    copy.x += 12; copy.y += 12;
                    list.splice(selected + 1, 0, copy); selected++;
                });
            }
            canvas.onpointerdown = event => {
                if (event.button !== 0 || loadingBackground) return;
                const p = point(event), [width, height] = dimensions(), list = boxes();
                if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return;
                event.preventDefault(); event.stopPropagation(); root.focus();
                const forceDraw = mode === "draw" || event.shiftKey;
                const handle = !forceDraw && handleAt(p, list);
                const hit = forceDraw ? -1 : handle ? selected : hitAt(p, list);
                const savedRedo = redo;
                remember();
                if (hit >= 0) {
                    selected = hit;
                    drag = { start: p, original: { ...list[hit] }, handle, kind: handle ? "resize" : "move" };
                } else {
                    selected = list.length;
                    list.push({ x: p.x, y: p.y, width: 0, height: 0, metadata: { type: "obj", text: "", desc: "", palette: [] } });
                    drag = { start: p, kind: "draw" };
                }
                drag.savedRedo = savedRedo;
                drag.pointerId = event.pointerId;
                canvas.setPointerCapture(event.pointerId);
                save(list);
            };
            canvas.onpointermove = event => {
                const p = point(event), list = boxes();
                positionLabel.textContent = `${p.x}, ${p.y}${drag && list[selected] ? ` · ${list[selected].width} × ${list[selected].height}` : ""}`;
                if (!drag) {
                    const handle = mode !== "draw" && handleAt(p, list);
                    hovered = hitAt(p, list);
                    const cursors = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
                    canvas.style.cursor = mode === "draw" || event.shiftKey ? "crosshair" : handle ? cursors[handle] : hovered >= 0 ? "move" : "crosshair";
                    if (frame === null) frame = requestAnimationFrame(paint);
                    return;
                }
                const box = list[selected];
                if (drag.kind === "move") {
                    box.x = drag.original.x + p.x - drag.start.x;
                    box.y = drag.original.y + p.y - drag.start.y;
                } else {
                    let x1 = drag.start.x, y1 = drag.start.y, x2 = p.x, y2 = p.y;
                    if (drag.kind === "resize") {
                        const b = drag.original;
                        x1 = drag.handle.includes("w") ? p.x : b.x;
                        y1 = drag.handle.includes("n") ? p.y : b.y;
                        x2 = drag.handle.includes("e") ? p.x : b.x + b.width;
                        y2 = drag.handle.includes("s") ? p.y : b.y + b.height;
                    }
                    Object.assign(box, { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
                }
                save(list);
            };
            function finishDrag(event, cancel = false) {
                if (!drag) return;
                const before = undo[undo.length - 1];
                if (cancel) widget("editor_state").value = JSON.parse(before).boxes;
                else if (drag.kind === "draw") {
                    const list = boxes();
                    if (!list[selected].width || !list[selected].height) { list.splice(selected, 1); selected = -1; save(list); }
                }
                if (before === snapshot()) { undo.pop(); redo = drag.savedRedo; }
                const box = boxes()[selected];
                positionLabel.textContent = box ? `${box.x}, ${box.y} · ${box.width} × ${box.height}` : "Drag empty space to draw";
                drag = null; mode = "select";
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                refresh(); changed();
            }
            canvas.onpointerup = event => finishDrag(event);
            canvas.onpointercancel = event => finishDrag(event, true);
            canvas.onlostpointercapture = event => finishDrag(event);
            canvas.onpointerleave = () => { hovered = -1; if (!drag) { positionLabel.textContent = "Shift-drag to draw over a box"; refresh(); } };
            root.addEventListener("keydown", event => {
                event.stopPropagation();
                if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
                const key = event.key.toLowerCase();
                if (drag) {
                    if (key === "escape") finishDrag({ pointerId: drag.pointerId }, true);
                    event.preventDefault();
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); history(event.shiftKey ? redo : undo, event.shiftKey ? undo : redo); }
                else if ((event.ctrlKey || event.metaKey) && key === "c") { event.preventDefault(); copyBoxData(); }
                else if ((event.ctrlKey || event.metaKey) && key === "v") { event.preventDefault(); openBoxData(); }
                else if ((event.ctrlKey || event.metaKey) && key === "d") { event.preventDefault(); duplicate(); }
                else if (key === "delete" || key === "backspace") { event.preventDefault(); remove(); }
                else if (key === "escape") { selected = -1; mode = "select"; refresh(); }
                else if (key === "b") { mode = "draw"; refresh(); }
                else if (key === "v") { mode = "select"; refresh(); }
                else if (selected >= 0 && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1;
                    edit(list => { list[selected].x += key === "arrowleft" ? -step : key === "arrowright" ? step : 0; list[selected].y += key === "arrowup" ? -step : key === "arrowdown" ? step : 0; });
                } else return;
                event.stopPropagation();
            });
            const resolutionArea = element("div", null, "resolution-area");
            sourceRow.after(resolutionArea);
            const resizeLabel = element("label", resolutionArea, "bar");
            resizeLabel.style.flexDirection = "row";
            const resizeToggle = element("input", resizeLabel);
            resizeToggle.type = "checkbox";
            resizeToggle.setAttribute("aria-label", "Resize");
            resizeToggle.style.width = "auto";
            element("span", resizeLabel, null, "Resize");
            const targetLabel = element("span", resizeLabel, "spacer");
            const resolutionFields = element("div", resolutionArea, "geometry");
            resolutionFields.style.gridTemplateColumns = "2fr 1fr 1fr";
            const resolutionControls = {};
            for (const [name, title] of [["aspect_ratio", "Aspect ratio"], ["megapixels", "Megapixels"], ["multiple", "Multiple"]]) {
                const label = element("label", resolutionFields, null, title);
                const input = element(name === "aspect_ratio" ? "select" : "input", label);
                input.setAttribute("aria-label", title);
                if (name === "aspect_ratio") {
                    for (const value of nodeData.input.required.aspect_ratio[0]) input.add(new Option(value, value));
                } else {
                    input.type = "number";
                    const settings = nodeData.input.required[name][1];
                    input.min = settings.min; input.max = settings.max; input.step = name === "megapixels" ? 0.1 : settings.step;
                }
                resolutionControls[name] = input;
                input.oninput = () => {
                    if (!input.checkValidity()) return;
                    const value = name === "aspect_ratio" ? input.value : Number(input.value);
                    if (widget(name).value === value) return;
                    remember();
                    widget(name).value = value;
                    syncResolutionControls(); loadBackground(true); changed();
                };
            }
            resizeToggle.onchange = () => {
                remember(); widget("resize").value = resizeToggle.checked;
                syncResolutionControls(); loadBackground(true); changed();
            };
            function syncResolutionControls() {
                resizeToggle.checked = !!widget("resize").value;
                for (const [name, input] of Object.entries(resolutionControls)) {
                    input.value = widget(name).value;
                    input.disabled = !resizeToggle.checked;
                }
                targetLabel.textContent = resizeToggle.checked ? `Target: ${targetDimensions().join(" × ")}` : "Original image dimensions";
            }
            const resizeButton = button(sourceRow, "Resize…", "Resize the background image", () => openResize());
            const dialog = element("dialog", root, "resize-dialog");
            element("h3", dialog, null, "Resize background");
            const resizeFields = element("div", dialog, "fields");
            const resizeInputs = {};
            for (const [name, title, values] of [
                ["upscale_method", "Interpolation", ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]],
                ["keep_proportion", "Aspect mode", ["stretch", "resize", "pad", "pad_edge", "pad_edge_pixel", "crop", "pillarbox_blur", "total_pixels"]],
                ["crop_position", "Crop / pad position", ["center", "top", "bottom", "left", "right"]],
                ["pad_color", "Pad color (RGB or hex)"],
            ]) {
                const label = element("label", resizeFields, null, title);
                const input = element(values ? "select" : "input", label);
                input.setAttribute("aria-label", title);
                if (values) for (const value of values) input.add(new Option(value, value));
                else if (name !== "pad_color") { input.type = "number"; input.min = "0"; input.step = "1"; }
                resizeInputs[name] = input;
            }
            element("p", dialog, null, "Resize fits within the target. Crop fills it. Pad adds borders. Total pixels uses width × height as the pixel budget. Existing boxes follow the image transformation.");
            const resizeActions = element("div", dialog, "bar");
            element("span", resizeActions, "spacer");
            button(resizeActions, "Cancel", "Discard resize changes", () => dialog.close());
            button(resizeActions, "Apply", "Apply resize settings to the image and boxes", () => {
                for (const input of Object.values(resizeInputs)) if (!input.reportValidity()) return;
                const options = {};
                for (const [name, input] of Object.entries(resizeInputs)) options[name] = input.type === "number" ? Number(input.value) : input.value;
                if (widget("resize_options").value === JSON.stringify(options)) { dialog.close(); return; }
                remember();
                widget("resize_options").value = JSON.stringify(options);
                dialog.close();
                loadBackground(true);
                changed();
            });
            function openResize() {
                const options = { upscale_method: "lanczos", keep_proportion: "pad", crop_position: "center", pad_color: "0, 0, 0", ...effectiveResizeOptions() };
                for (const [name, input] of Object.entries(resizeInputs)) input.value = options[name];
                dialog.showModal();
            }
            dialog.addEventListener("keydown", event => event.stopPropagation());
            dialog.addEventListener("pointerdown", event => event.stopPropagation());
            async function loadBackground(remap = false) {
                syncResolutionControls();
                const request = {};
                loadingBackground = request;
                const filename = widget("background_image").value;
                sourceSelect.value = filename;
                resizeButton.disabled = !filename || filename === "(none)";
                if (!resizeButton.disabled) {
                    positionLabel.textContent = "Loading background…";
                    refresh();
                    try {
                        const params = new URLSearchParams({ filename, resize_options: JSON.stringify(effectiveResizeOptions()) });
                        const response = await api.fetchApi(`/vantage/bounding-boxes/background?${params}`, { cache: "no-store" });
                        if (!response.ok) throw new Error(await response.text());
                        const transform = JSON.parse(response.headers.get("X-Vantage-Transform"));
                        const blob = await response.blob();
                        if (loadingBackground !== request) return;
                        const url = URL.createObjectURL(blob), img = new Image();
                        img.onload = () => {
                            URL.revokeObjectURL(url);
                            if (loadingBackground !== request) return;
                            loadingBackground = null;
                            if (remap) {
                                const [sx, sy, tx, ty] = transform, [ox, oy, dx, dy] = backgroundTransform;
                                const list = boxes();
                                for (const box of list) {
                                    box.x = Math.round((box.x - dx) / ox * sx + tx);
                                    box.y = Math.round((box.y - dy) / oy * sy + ty);
                                    box.width = Math.round(box.width / ox * sx);
                                    box.height = Math.round(box.height / oy * sy);
                                }
                                save(list);
                            }
                            backgroundTransform = transform;
                            widget("background_state").value = JSON.stringify({ background_image: filename, transform });
                            background = img;
                            imageDimensions = [img.naturalWidth, img.naturalHeight];
                            const enabled = effectiveResizeOptions().enabled;
                            resizeButton.textContent = enabled ? "Resize ✓" : "Resize…";
                            positionLabel.textContent = enabled ? "Resized image · Drag to draw" : "Image size applied · Drag to draw";
                            refresh(); changed();
                        };
                        img.onerror = () => { URL.revokeObjectURL(url); if (loadingBackground === request) { loadingBackground = null; positionLabel.textContent = "Unable to decode background image"; refresh(); } };
                        img.src = url;
                    } catch (error) {
                        if (loadingBackground === request) { loadingBackground = null; positionLabel.textContent = error.message; refresh(); }
                    }
                } else {
                    background = null;
                    loadingBackground = null;
                    backgroundTransform = [1, 1, 0, 0];
                    imageDimensions = widget("resize").value ? targetDimensions() : [1024, 1024];
                    positionLabel.textContent = "Drag empty space to draw";
                    refresh();
                }
            }
            const backgroundWidget = widget("background_image"), backgroundChanged = backgroundWidget.callback;
            backgroundWidget.callback = function () {
                backgroundChanged?.apply(this, arguments);
                undo = []; redo = []; backgroundTransform = [1, 1, 0, 0];
                loadBackground();
            };
            sourceSelect.onchange = () => {
                if (!sourcePicker.hasValue(sourceSelect.value)) return;
                backgroundWidget.value = sourceSelect.value;
                backgroundWidget.callback();
                changed();
            };
            function syncBackgroundOptions() {
                const values = backgroundWidget.options.values;
                const options = typeof values === "function" ? values() : values;
                sourcePicker.setOptions(options);
                sourceSelect.value = backgroundWidget.value;
            }
            sourceSelect.oninput = () => {
                if (sourcePicker.hasValue(sourceSelect.value) && sourceSelect.value !== backgroundWidget.value) sourceSelect.onchange();
            };
            installImageComboRefresh(node, backgroundWidget, syncBackgroundOptions);
            installImageDrop(node, root, {
                widget: backgroundWidget, multiple: false, canAdd: () => true,
                added: path => {
                    backgroundWidget.value = path;
                    syncBackgroundOptions();
                    sourceSelect.onchange();
                },
                error: message => { positionLabel.textContent = message; },
            });
            node.addDOMWidget("bounding_box_editor", "legacy_bbox_editor", root, {
                serialize: false, getMinHeight: () => minimumHeight - headerHeight,
                getMaxHeight: () => Math.max(minimumHeight - headerHeight, node.size[1] - headerHeight),
                getHeight: () => Math.max(minimumHeight - headerHeight, node.size[1] - headerHeight),
            });
            const executed = node.onExecuted;
            node.onExecuted = function (message) {
                executed?.apply(this, arguments);
                if (message.background_state) widget("background_state").value = message.background_state[0];
                if (message.editor_state) { widget("editor_state").value = JSON.stringify(message.editor_state[0]); drag = null; }
                if (message.input_bboxes) {
                    const incoming = JSON.stringify(message.input_bboxes);
                    if (incoming !== widget("last_incoming").value) {
                        widget("editor_state").value = incoming; widget("last_incoming").value = incoming;
                        drag = null; selected = -1; undo = []; redo = [];
                    }
                }
                if (message.dims && !background && !loadingBackground) imageDimensions = message.dims;
                refresh();
            };
            const configured = node.onConfigure;
            node.onConfigure = function () {
                configured?.apply(this, arguments);
                node.setSize([Math.max(minimumWidth, node.size[0]), Math.max(minimumHeight, node.size[1])]);
                selected = -1; undo = []; redo = []; loadBackground();
            };
            const resized = node.onResize;
            node.onResize = function (size) {
                size[0] = Math.max(minimumWidth, size[0]);
                size[1] = Math.max(minimumHeight, size[1]);
                resized?.apply(this, arguments);
                if (frame === null) frame = requestAnimationFrame(paint);
            };
            const observer = new ResizeObserver(() => { if (frame === null) frame = requestAnimationFrame(paint); });
            observer.observe(root);
            const removed = node.onRemoved;
            node.onRemoved = function () { observer.disconnect(); dialog.close(); dataDialog.close(); if (frame !== null) cancelAnimationFrame(frame); loadingBackground = null; removed?.apply(this, arguments); };
            node.setSize([520, 1140]);
            loadBackground();
        };
    },
});
