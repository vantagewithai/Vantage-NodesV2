import { app } from "../../../scripts/app.js";

const style = document.createElement("style");
style.textContent = `
.vantage-int-rules {background:var(--comfy-menu-bg,#25272c);color:var(--input-text,#eee);border:1px solid #647084;border-radius:10px;padding:20px;width:650px;max-width:90vw;font:13px system-ui}
.vantage-int-rules::backdrop {background:#0008}
.vantage-int-rules input,.vantage-int-rules select,.vantage-int-rules button {background:var(--comfy-input-bg,#303238);color:inherit;border:1px solid #ffffff30;border-radius:5px;padding:6px;min-width:0;font:inherit}
.vantage-int-rules .rows {display:grid;gap:8px;max-height:55vh;overflow:auto}
.vantage-int-rules .row {display:grid;grid-template-columns:auto minmax(60px,110px) 1fr auto 70px auto auto auto;gap:6px;align-items:center}
.vantage-int-rules .actions {display:flex;gap:8px;margin-top:16px}
`;
document.head.appendChild(style);

app.registerExtension({
    name: "vantage.condition_switches",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (!["VantageIntSwitchV2", "VantageStringSwitchV2", "VantageFloatSwitchV2", "VantageIntValueSwitchV2", "VantageFloatValueSwitchV2", "VantageStringValueSwitchV2", "VantageBoolValueSwitchV2"].includes(nodeData.name)) return;
        const isValueSwitch = nodeData.name.includes("ValueSwitch");
        const isString = nodeData.name.includes("String");
        const isBool = nodeData.name === "VantageBoolValueSwitchV2";
        const isFloat = nodeData.name.includes("Float");
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            const node = this;
            const rules = node.widgets.find(widget => widget.name === "conditions");
            rules.type = "hidden";
            rules.computeSize = () => [0, -4];
            if (rules.inputEl) rules.inputEl.style.display = "none";
            const outputType = node.widgets.find(widget => widget.name === "output_type");
            if (outputType) { outputType.type = "hidden"; outputType.computeSize = () => [0, -4]; }
            let valueWidgets = [];
            const defaultValue = type => type === "BOOLEAN" ? false : type === "STRING" ? "" : 0;
            function syncValues(reconfigure = false) {
                for (const widget of valueWidgets) node.removeWidget(widget);
                valueWidgets = [];
                const conditions = JSON.parse(rules.value);
                const type = outputType.value;
                for (const [index, rule] of conditions.entries()) {
                    const widgetType = type === "BOOLEAN" ? "toggle" : type === "STRING" ? "text" : "number";
                    const widget = node.addWidget(widgetType, rule.name, rule.output ?? defaultValue(type), value => {
                        const current = JSON.parse(rules.value);
                        current[index].output = type === "INT" ? Math.trunc(Number(value)) : value;
                        rules.value = JSON.stringify(current);
                        widget.value = current[index].output;
                        node.graph?.change();
                    }, {serialize:false, precision:type === "INT" ? 0 : 4, step:type === "INT" ? 10 : 0.1, on:"True", off:"False"});
                    valueWidgets.push(widget);
                }
                if (reconfigure && node.outputs[0].type !== "*" && node.outputs[0].type !== type) node.disconnectOutput(0);
                node.outputs[0].type = type;
                node.outputs[0].label = type;
                const minimum = node.computeSize();
                node.setSize([Math.max(node.size[0], minimum[0]), Math.max(node.size[1], minimum[1])]);
                node.setDirtyCanvas(true,true);
            }
            const gear = node.addTitleButton({name:"configure_int_rules", text:"\ue94a", fontSize:18, xOffset:-10, yOffset:0});
            gear.title = gear.tooltip = "Configure";
            function syncInputs(reconfigure = false) {
                if (isValueSwitch) { syncValues(reconfigure); return; }
                const conditions = JSON.parse(rules.value);
                const count = conditions.reduce((count, rule) => Math.max(count, rule.input + 1), 0);
                let inputs = node.inputs.filter(input => /^input_\d+$/.test(input.name));
                while (inputs.length > count) node.removeInput(node.inputs.indexOf(inputs.pop()));
                while (inputs.length < count) {
                    node.addInput(`input_${inputs.length}`, "*");
                    inputs = node.inputs.filter(input => /^input_\d+$/.test(input.name));
                }
                node.setDirtyCanvas(true, true);
            }
            let dialog = null;
            function configure() {
                if (dialog?.open) { dialog.focus(); return; }
                const draft = JSON.parse(rules.value);
                let selectedOutputType = outputType?.value;
                dialog = document.createElement("dialog");
                dialog.className = "vantage-int-rules";
                document.body.appendChild(dialog);
                const element = (tag, parent, text) => {
                    const el = document.createElement(tag);
                    if (text) el.textContent = text;
                    parent.appendChild(el); return el;
                };
                const button = (parent, label, action) => {
                    const b = element("button", parent, label); b.type = "button"; b.onclick = action; return b;
                };
                element("h3", dialog, isBool ? "Boolean switch conditions" : isString ? "String switch conditions" : isFloat ? "Float switch conditions" : "Integer switch conditions");
                element("p", dialog, isValueSwitch ? "Name each condition. Enter its output value in the matching field on the node. First match wins; no match returns None. Changing output type resets those values." : "First matching rule wins. No match returns None. Input indices start at 0. String matching is case-sensitive.");
                if (isValueSwitch) {
                    const label = element("label", dialog, "Output type ");
                    const select = element("select", label);
                    select.setAttribute("aria-label", "Output type");
                    for (const type of ["BOOLEAN", "INT", "FLOAT", "STRING"]) select.add(new Option(type, type));
                    select.value = selectedOutputType;
                    select.onchange = () => {
                        selectedOutputType = select.value;
                        for (const rule of draft) rule.output = defaultValue(selectedOutputType);
                    };
                }
                const rows = element("div", dialog); rows.className = "rows";
                function render() {
                    rows.replaceChildren();
                    draft.forEach((rule, index) => {
                        const row = element("div", rows); row.className = "row";
                        if (isValueSwitch) {
                            row.style.gridTemplateColumns = "1fr minmax(60px,110px) 1fr auto auto auto";
                            const name = element("input", row); name.value = rule.name;
                            name.setAttribute("aria-label", `Rule ${index + 1} name`);
                            name.oninput = () => {rule.name = name.value;};
                        } else element("span", row, "value");
                        const operator = element("select", row);
                        operator.setAttribute("aria-label", `Rule ${index + 1} comparison`);
                        for (const value of (isBool ? ["=", "!="] : isString ? ["=", "!=", "contains", "not contains", "starts with", "ends with"] : ["=", "!=", "<", "<=", ">", ">="])) operator.add(new Option(value, value));
                        operator.value = rule.operator;
                        operator.onchange = () => {rule.operator = operator.value;};
                        const value = element(isBool ? "select" : "input", row);
                        value.setAttribute("aria-label", `Rule ${index + 1} value`);
                        if (isBool) {
                            value.add(new Option("False", "false")); value.add(new Option("True", "true"));
                            value.value = String(rule.value);
                            value.onchange = () => {rule.value = value.value === "true";};
                        } else {
                            value.type = isString ? "text" : "number"; value.step = isFloat ? "any" : "1"; value.value = rule.value;
                            value.oninput = () => {rule.value = isString ? value.value : Number(value.value);};
                        }
                        if (!isValueSwitch) {
                        element("span", row, "→ input");
                        const input = element("input", row); input.type = "number"; input.min = "0"; input.step = "1"; input.value = rule.input;
                        input.setAttribute("aria-label", `Rule ${index + 1} input index`);
                        input.oninput = () => {rule.input = Number(input.value);};
                        }
                        button(row, "↑", () => { [draft[index - 1], draft[index]] = [draft[index], draft[index - 1]]; render(); }).disabled = index === 0;
                        button(row, "↓", () => { [draft[index], draft[index + 1]] = [draft[index + 1], draft[index]]; render(); }).disabled = index === draft.length - 1;
                        button(row, "×", () => {draft.splice(index, 1); render();}).title = "Remove condition";
                    });
                }
                const error = element("p", dialog); error.setAttribute("role","status");
                const actions = element("div", dialog); actions.className = "actions";
                button(actions, "+ Condition", () => {draft.push({operator:"=", value:isBool ? false : isString ? "" : draft.length, ...(isValueSwitch ? {name:`Condition ${draft.length + 1}`,output:defaultValue(selectedOutputType)} : {input:draft.length})}); render();});
                element("span", actions).style.flex = "1";
                button(actions, "Cancel", () => dialog.close());
                button(actions, "Save", () => {
                    for (const input of dialog.querySelectorAll("input")) if (!input.reportValidity() || (input.type === "number" && input.value === "")) return;
                    if (isValueSwitch) {
                        const names = draft.map(rule => rule.name.trim());
                        if (names.some(name => !name) || new Set(names.map(name => name.toLowerCase())).size !== names.length) {
                            error.textContent = "Give each condition a unique, non-empty name."; return;
                        }
                        draft.forEach((rule,index) => {rule.name = names[index];});
                    }
                    node.graph?.beforeChange();
                    if (isValueSwitch) outputType.value = selectedOutputType;
                    rules.value = JSON.stringify(draft);
                    syncInputs(true);
                    node.graph?.afterChange();
                    dialog.close();
                });
                dialog.addEventListener("keydown", event => event.stopPropagation());
                dialog.addEventListener("pointerdown", event => event.stopPropagation());
                dialog.addEventListener("close", () => { dialog.remove(); dialog = null; });
                render(); dialog.showModal();
            }
            const titleClick = node.onTitleButtonClick;
            node.onTitleButtonClick = function (button, canvas) {
                if (button.name === "configure_int_rules") configure();
                else titleClick?.apply(this, arguments);
            };
            const configured = node.onConfigure;
            node.onConfigure = function () { configured?.apply(this, arguments); syncInputs(); };
            const removed = node.onRemoved;
            node.onRemoved = function () { dialog?.close(); removed?.apply(this, arguments); };
            syncInputs();
        };
    },
});
