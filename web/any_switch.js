import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "vantage.any_switch",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (!["VantageanySwitchV2", "VantageSwitchIndex"].includes(nodeData.name)) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            let pending = null;
            const sync = () => {
                pending = null;
                const candidates = () => this.inputs.filter(input => /^any_\d+$/.test(input.name));
                let inputs = candidates();
                let last = -1;
                for (let index = 0; index < inputs.length; index++) if (inputs[index].link != null) last = index;
                const count = Math.max(5, last + 2);
                while (inputs.length > count) {
                    this.removeInput(this.inputs.indexOf(inputs.pop()));
                }
                while (inputs.length < count) {
                    this.addInput(`any_${String(inputs.length + 1).padStart(2, "0")}`, "*");
                    inputs = candidates();
                }
                if (nodeData.name === "VantageSwitchIndex") {
                    inputs.forEach((input, index) => { input.label = `input_${index}`; });
                }
                const graph = this.graph;
                let type = "*";
                for (const input of inputs) {
                    const link = graph?.links[input.link];
                    const source = link && graph.getNodeById(link.origin_id)?.outputs[link.origin_slot];
                    if (source?.type && source.type !== "*") { type = source.type; break; }
                }
                if (type === "*") {
                    for (const id of this.outputs[0].links || []) {
                        const link = graph?.links[id];
                        const target = link && graph.getNodeById(link.target_id)?.inputs[link.target_slot];
                        if (target?.type && target.type !== "*") { type = target.type; break; }
                    }
                }
                for (const input of inputs) input.type = type;
                this.outputs[0].type = type;
                this.outputs[0].label = String(type);
                this.setDirtyCanvas(true, true);
            };
            const schedule = () => { if (pending === null) pending = requestAnimationFrame(sync); };
            const connections = this.onConnectionsChange;
            this.onConnectionsChange = function () { connections?.apply(this, arguments); schedule(); };
            const configured = this.onConfigure;
            this.onConfigure = function () { configured?.apply(this, arguments); schedule(); };
            const removed = this.onRemoved;
            this.onRemoved = function () { if (pending !== null) cancelAnimationFrame(pending); removed?.apply(this, arguments); };
            schedule();
        };
    },
});
