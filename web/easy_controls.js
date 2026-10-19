import { app } from "../../../scripts/app.js";
import { createImagePicker } from "./image_combo.js";

const style = document.createElement("style");
style.textContent = `
.vantage-controls-dialog {color:var(--input-text,#eee);background:var(--comfy-menu-bg,#25272c);border:1px solid #647084;border-radius:12px;padding:20px;width:720px;max-width:90vw;font:13px system-ui}
.vantage-controls-dialog::backdrop {background:#0008}
.vantage-controls-dialog h3 {margin:0 0 14px}
.vantage-controls-dialog button,.vantage-controls-dialog input,.vantage-controls-dialog select {color:inherit;background:var(--comfy-input-bg,#303238);border:1px solid #ffffff30;border-radius:5px;padding:7px;font:inherit;min-width:0}
.vantage-controls-dialog button {cursor:pointer}
.vantage-controls-dialog .bar {display:flex;gap:8px;align-items:center;margin:10px 0}
.vantage-controls-dialog .groups {max-height:60vh;overflow:auto;display:grid;gap:12px}
.vantage-controls-dialog section {border:1px solid #ffffff30;border-radius:7px;padding:10px}
.vantage-controls-dialog .node-columns {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.vantage-controls-dialog .node-row {display:flex;align-items:center;justify-content:space-between;gap:6px}
.vantage-controls-dialog .node-row span {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vantage-controls-dialog .nodes {max-height:140px;overflow:auto;display:grid;gap:6px;margin-top:10px}
.vantage-controls-dialog label {display:flex;gap:8px;align-items:center}
.vantage-controls-dialog [hidden] {display:none!important}
.vantage-controls-dialog .drop-zone {border:1px dashed #ffffff30;border-radius:5px;padding:5px;margin:6px 0;color:#aeb5bf;font-size:11px;text-align:center}
.vantage-controls-dialog .drop-zone.drag-over {background:#28618a;border-color:#8acaff;color:white}
.vantage-controls-dialog .error {color:#ffa5a5;min-height:18px}
`;
document.head.appendChild(style);

export function normalizeSubgroups(group) {
    const children = group.children || [];
    if (group.childMode === "max one" || group.childMode === "always one") {
        let activeIndex = children.findIndex(child => child.enabled !== false);
        if (activeIndex < 0 && group.childMode === "always one" && children.length) activeIndex = 0;
        children.forEach((child, index) => {child.enabled = index === activeIndex;});
    }
}

export function applyControlGroup(graph, controller, group, enabled) {
    group.enabled = enabled;
    const modes = new Map();
    const offMode = owner => owner.offMode === "mute" || owner.offMode === "never" ? 2 : 4;
    const visit = (owner, active, blocked, blockedMode, assignments = modes) => {
        const assign = (ids, opposite) => {
            for (const id of ids) {
                const previous = assignments.get(id);
                if (previous?.locked && previous.depth < depth) continue;
                const mode = blocked ? blockedMode : (opposite ? !active : active) ? 0 : offMode(owner);
                if (!assignments.has(id) || depth > assignments.get(id).depth || assignments.get(id).depth === depth && mode === 0) assignments.set(id, {mode, depth, locked: !active && !blocked});
            }
        };
        assign(owner.nodes, false);
        assign(owner.oppositeNodes || [], true);
        depth++;
        for (const child of owner.children || []) visit(child, active && child.enabled !== false, blocked || !active, blocked ? blockedMode : offMode(owner), assignments);
        depth--;
    };
    let depth = 0;
    visit(group, enabled, false, offMode(group));
    for (const other of controller.properties?.groups || []) {
        if (enabled || other === group) continue;
        const shared = (group.oppositeNodes || []).filter(id => (other.nodes || []).includes(id));
        if (!shared.length) continue;
        const following = new Map();
        visit(other, other.enabled !== false, false, offMode(other), following);
        for (const id of shared) {
            if (modes.get(id)?.depth === 0) modes.set(id, following.get(id));
        }
    }
    for (const [id, {mode}] of modes) {
        const target = graph?.getNodeById(id);
        if (!target) continue;
        const pending = [target];
        while (pending.length) {
            const node = pending.pop();
            if (node === controller) continue;
            node.mode = mode;
            if (node.isSubgraphNode?.()) pending.push(...node.subgraph.nodes);
        }
    }
}

export function toggleSubgroup(group, child, enabled) {
    if (group.enabled === false) return;
    const children = group.children || [];
    if (!enabled && group.childMode === "always one" && !children.some(other => other !== child && other.enabled !== false)) return;
    if (enabled && (group.childMode === "max one" || group.childMode === "always one")) {
        for (const other of children) other.enabled = false;
    }
    child.enabled = enabled;
}

export function moveControlGroup(roots, moving, parent, index) {
    const contains = (group, target) => group === target || (group.children || []).some(child => contains(child, target));
    if (parent && contains(moving, parent)) return false;
    const find = (list, owner = null) => {
        if (list.includes(moving)) return {list, owner};
        for (const group of list) {
            const found = find(group.children || [], group);
            if (found) return found;
        }
    };
    const source = find(roots);
    if (!source) return false;
    const destination = parent ? (parent.children ||= []) : roots;
    const oldIndex = source.list.indexOf(moving);
    if (source.list === destination && oldIndex < index) index--;
    source.list.splice(oldIndex, 1);
    destination.splice(index, 0, moving);
    if (source.owner) normalizeSubgroups(source.owner);
    if (parent) normalizeSubgroups(parent);
    return true;
}

app.registerExtension({
    name: "vantage.easy_controls",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "Vantage-Easy-Controls") return;
        class EasyControls extends LiteGraph.LGraphNode {
            initializeControls() {
                this.isVirtualNode = false;
                this.properties.groups ||= [];
                const states = this.widgets.find(widget => widget.name === "states");
                states.type = "hidden";
                states.computeSize = () => [0, -4];
                if (states.inputEl) states.inputEl.style.display = "none";
                const configure = this.addTitleButton({name:"configure", text:"\ue94a", fontSize:18, xOffset:-10, yOffset:0});
                configure.title = "Configure";
                configure.tooltip = "Configure";
                this.size = [300, 100];
            }
            onTitleButtonClick(button, canvas) {
                if (button.name === "configure") this.configureGroups();
                else super.onTitleButtonClick(button, canvas);
            }
            rebuildControls() {
                this.widgets ||= [];
                for (const widget of [...this.widgets]) {
                    if (widget.name !== "states") this.removeWidget(widget);
                }
                const commit = action => {
                    this.graph?.beforeChange();
                    action();
                    this.graph?.afterChange();
                    this.rebuildControls();
                };
                const addGroup = (group, parent = null, path = "") => {
                    normalizeSubgroups(group);
                    const label = path ? `${path} / ${group.name}` : group.name;
                    const active = (!parent || parent.active) && group.enabled !== false;
                    this.addWidget("toggle", parent ? `↳ ${label}` : label, active, enabled => commit(() => {
                        if (parent) {
                            if (parent.active) toggleSubgroup(parent.group, group, enabled);
                        } else group.enabled = enabled;
                        applyControlGroup(this.graph, this, parent ? parent.root : group, parent ? parent.root.enabled !== false : enabled);
                    }), {on:"On", off:"Off", serialize:false});
                    for (const child of group.children || []) addGroup(child, {group, active, root:parent ? parent.root : group}, label);
                };
                for (const group of this.properties.groups) addGroup(group);
                this.syncStateOutputs();
                const minimum = this.computeSize();
                this.setSize([Math.max(this.size[0], minimum[0]), Math.max(this.size[1], minimum[1])]);
                this.setDirtyCanvas(true, true);
            }
            syncStateOutputs() {
                const entries = [];
                const add = (owner, state) => {
                    if (!owner.emitState) return;
                    owner.stateId ||= crypto.randomUUID();
                    entries.push({name:owner.name, state, key:owner.stateId});
                };
                const visit = (group, parentActive = true) => {
                    const active = parentActive && group.enabled !== false;
                    add(group, active);
                    for (const child of group.children || []) visit(child, active);
                };
                for (const group of this.properties.groups) visit(group);
                const names = new Set();
                entries.forEach(entry => {
                    const base = entry.name.normalize("NFKD").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "state";
                    let name = /^\d/.test(base) ? `state_${base}` : base;
                    const stem = name;
                    let suffix = 2;
                    while (names.has(name)) name = `${stem}_${suffix++}`;
                    names.add(name); entry.name = name;
                });
                // Slot custom fields are not preserved by every frontend serializer.
                const savedIds = this.properties.stateOutputIds || [];
                this.outputs.forEach((output,index) => {
                    if (!output.stateId) output.stateId = savedIds[index] || entries.find(entry => entry.name === output.name)?.key;
                });
                const keys = new Set(entries.map(entry => entry.key));
                for (let index = this.outputs.length - 1; index >= 0; index--) {
                    if (!keys.has(this.outputs[index].stateId)) this.removeOutput(index);
                }
                entries.forEach(entry => {
                    if (!this.outputs.some(output => output.stateId === entry.key)) {
                        this.addOutput(entry.name, "BOOLEAN");
                        this.outputs[this.outputs.length - 1].stateId = entry.key;
                    }
                });
                const order = new Map(entries.map((entry,index) => [entry.key,index]));
                this.outputs.sort((a,b) => order.get(a.stateId) - order.get(b.stateId));
                entries.forEach((entry,index) => {
                    const output = this.outputs[index];
                    output.name = entry.name;
                    output.type = "BOOLEAN";
                    for (const id of output.links || []) {
                        const link = this.graph?.links[id];
                        if (link) link.origin_slot = index;
                    }
                    this.setOutputData(index, entry.state);
                });
                this.properties.stateOutputIds = entries.map(entry => entry.key);
                const states = this.widgets.find(widget => widget.name === "states");
                if (states) states.value = JSON.stringify(entries.map(entry => entry.state));
            }
            onConfigure() {
                this.rebuildControls();
            }
            configureGroups() {
                if (this.dialog?.open) { this.dialog.focus(); return; }
                const dialog = document.createElement("dialog");
                this.dialog = dialog;
                dialog.className = "vantage-controls-dialog";
                document.body.appendChild(dialog);
                const el = (tag, parent, text, className) => {
                    const child = document.createElement(tag);
                    if (text) child.textContent = text;
                    if (className) child.className = className;
                    parent.appendChild(child);
                    return child;
                };
                const button = (parent, text, action) => {
                    const b = el("button", parent, text); b.type = "button"; b.onclick = action; return b;
                };
                el("h3", dialog, "Easy Controls · Configure groups");
                el("p", dialog, "Parent Off uses its selected mode for all children without forgetting subgroup states. Mute and Never both stop execution (mode 2). Choose Default, Max one or Always one for each parent’s subgroups.");
                const drafts = JSON.parse(JSON.stringify(this.properties.groups));
                const groups = el("div", dialog, null, "groups");
                const targets = (this.graph?._nodes || []).filter(node => node !== this);
                function nodeList(section, group, key) {
                    group.oppositeNodes ||= [];
                    const pickerRow = el("div", section, null, "bar");
                    const picker = createImagePicker(pickerRow, `Select node for ${key}`);
                    picker.input.placeholder = "Search nodes by name or ID…";
                    picker.input.style.cssText = "flex:1;min-width:0";
                    pickerRow.appendChild(picker.input);
                    const labels = new Map(targets.map(target => [`${target.title || target.type} (${target.id})`, target.id]));
                    picker.setOptions([...labels.keys()]);
                    const add = field => {
                        const id = labels.get(picker.input.value);
                        if (id === undefined) return;
                        const other = field === "nodes" ? "oppositeNodes" : "nodes";
                        group[other] = group[other].filter(value => value !== id);
                        if (!group[field].includes(id)) group[field].push(id);
                        showSelected();
                    };
                    const followButton = button(pickerRow, "Add to Follow", () => add("nodes"));
                    const oppositeButton = button(pickerRow, "Add to Opposite", () => add("oppositeNodes"));
                    const updateButtons = () => {
                        const valid = labels.has(picker.input.value);
                        followButton.disabled = !valid; oppositeButton.disabled = !valid;
                    };
                    picker.input.oninput = picker.input.onchange = updateButtons;
                    updateButtons();
                    const columns = el("div", section, null, "node-columns");
                    function showSelected() {
                        columns.replaceChildren();
                        for (const [field, title] of [["nodes", "Follow toggle"], ["oppositeNodes", "Opposite toggle"]]) {
                            const column = el("div", columns);
                            el("strong", column, title);
                            const list = el("div", column, null, "nodes");
                            if (!group[field].length) el("span", list, "No nodes selected");
                            for (const id of group[field]) {
                                const target = targets.find(target => target.id === id);
                                const text = target ? `${target.title || target.type} (${id})` : `Missing node (${id})`;
                                const row = el("div", list, null, "node-row");
                                el("span", row, text).title = text;
                                const remove = button(row, "×", () => {group[field] = group[field].filter(value => value !== id); showSelected();});
                                remove.setAttribute("aria-label", `Remove ${text} from ${title} in ${key}`);
                            }
                        }
                    }
                    showSelected();
                }
                function emitStateOption(parent, group, key) {
                    const label = el("label", parent, "Emit State");
                    const input = el("input", label); input.type = "checkbox";
                    input.checked = !!group.emitState;
                    input.setAttribute("aria-label", `${key} emit state`);
                    input.onchange = () => {group.emitState = input.checked;};
                }
                function offModeSelect(parent, group, key) {
                    const label = el("label", parent, "Off mode");
                    const select = el("select", label);
                    select.setAttribute("aria-label", `${key} off mode`);
                    for (const value of ["bypass", "mute"]) select.add(new Option(value, value));
                    select.value = group.offMode === "never" ? "mute" : group.offMode || "bypass";
                    select.onchange = () => {group.offMode = select.value;};
                }
                let dragging = null;
                function dropZone(parentElement, parent, index, label) {
                    const zone = el("div", parentElement, label, "drop-zone");
                    zone.ondragover = event => {
                        if (!dragging) return;
                        event.preventDefault(); event.stopPropagation(); zone.classList.add("drag-over");
                    };
                    zone.ondragleave = () => zone.classList.remove("drag-over");
                    zone.ondrop = event => {
                        if (!dragging) return;
                        event.preventDefault(); event.stopPropagation();
                        moveControlGroup(drafts, dragging, parent, index);
                        dragging = null; render();
                    };
                }
                function render() {
                    groups.replaceChildren();
                    const renderList = (list, container, parent = null, path = "") => {
                        list.forEach((group, index) => {
                            group.children ||= [];
                            const key = path ? `${path} subgroup ${index + 1}` : `Group ${index + 1}`;
                            dropZone(container, parent, index, parent ? "Drop here to reorder subgroups" : "Drop here as root group");
                            const section = el("section", container);
                            const bar = el("div", section, null, "bar");
                            const handle = button(bar, "⠿", () => {});
                            handle.title = "Drag to reorder or change parent";
                            handle.setAttribute("aria-label", `Drag ${group.name}`);
                            handle.draggable = true;
                            handle.style.cursor = "grab";
                            handle.ondragstart = event => {
                                dragging = group;
                                event.dataTransfer.setData("text/plain", group.name);
                                event.dataTransfer.effectAllowed = "move";
                                event.stopPropagation();
                            };
                            handle.ondragend = () => {dragging = null; groups.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));};
                            const label = el("label", bar, parent ? "Subgroup name" : "Group name");
                            const name = el("input", label); name.value = group.name;
                            name.setAttribute("aria-label", `${key} name`);
                            name.oninput = () => {group.name = name.value;};
                            button(bar, parent ? "Delete subgroup" : "Delete group", () => {list.splice(index, 1); if (parent) normalizeSubgroups(parent); render();});
                            emitStateOption(section, group, key);
                            offModeSelect(section, group, key);
                            nodeList(section, group, key.toLowerCase());
                            const modeLabel = el("label", section, "Subgroup behavior");
                            const mode = el("select", modeLabel);
                            mode.setAttribute("aria-label", `${key} subgroup behavior`);
                            for (const value of ["default", "max one", "always one"]) mode.add(new Option(value, value));
                            mode.value = group.childMode || "default";
                            mode.onchange = () => {group.childMode = mode.value; normalizeSubgroups(group);};
                            button(section, "+ Add subgroup", () => {
                                let number = group.children.length + 1;
                                while (group.children.some(child => child.name === `Subgroup ${number}`)) number++;
                                group.children.push({name:`Subgroup ${number}`, nodes:[], enabled:group.childMode !== "max one" && group.childMode !== "always one"});
                                normalizeSubgroups(group); render();
                            });
                            dropZone(section, group, group.children.length, `Drop inside ${group.name} as subgroup`);
                            renderList(group.children, section, group, key);
                        });
                        dropZone(container, parent, list.length, parent ? "Drop here to append subgroup" : "Drop here as root group");
                    };
                    renderList(drafts, groups);
                }
                const actions = el("div", dialog, null, "bar");
                button(actions, "+ Add group", () => {
                    let index = drafts.length + 1;
                    while (drafts.some(group => group.name === `Group ${index}`)) index++;
                    drafts.push({name:`Group ${index}`, nodes:[], enabled:true}); render();
                });
                el("span", actions).style.flex = "1";
                button(actions, "Cancel", () => dialog.close());
                const error = el("div", dialog, null, "error");
                error.setAttribute("role", "status");
                button(actions, "Save", () => {
                    const validate = list => {
                        const names = list.map(group => group.name.trim());
                        if (names.some(name => !name) || new Set(names.map(name => name.toLowerCase())).size !== names.length) return false;
                        return list.every((group,index) => {
                            group.name = names[index];
                            normalizeSubgroups(group);
                            return validate(group.children || []);
                        });
                    };
                    if (!validate(drafts)) {
                        error.textContent = "Give groups with the same parent unique, non-empty names."; return;
                    }
                    this.graph?.beforeChange();
                    this.properties.groups = drafts;
                    for (const group of this.properties.groups) applyControlGroup(this.graph, this, group, group.enabled !== false);
                    this.rebuildControls();
                    this.graph?.afterChange();
                    dialog.close();
                });
                dialog.addEventListener("keydown", event => event.stopPropagation());
                dialog.addEventListener("pointerdown", event => event.stopPropagation());
                dialog.addEventListener("close", () => { dialog.remove(); if (this.dialog === dialog) this.dialog = null; });
                render(); dialog.showModal();
            }
            onRemoved() { this.dialog?.close(); }
        }
        for (const name of Object.getOwnPropertyNames(EasyControls.prototype)) {
            if (name !== "constructor") Object.defineProperty(nodeType.prototype, name, Object.getOwnPropertyDescriptor(EasyControls.prototype, name));
        }
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            this.initializeControls();
            this.rebuildControls();
        };
    },
});
