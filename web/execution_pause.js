import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "vantage.execution_pause",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "VantageExecutionPauseV2") return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            const resume = this.widgets.find(widget => widget.name === "resume");
            resume.type = "hidden";
            resume.computeSize = () => [0, -4];
            resume.value = false;
            this.addWidget("text", "status", "Ready to pause", () => {}, {serialize: false, readOnly: true});
        };
        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            configured?.apply(this, arguments);
            this.widgets.find(widget => widget.name === "resume").value = false;
            this.widgets.find(widget => widget.name === "status").value = "Ready to pause";
        };
        const executed = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            executed?.apply(this, arguments);
            this.widgets.find(widget => widget.name === "resume").value = !!message.paused?.[0];
            this.widgets.find(widget => widget.name === "status").value = message.paused?.[0] ? "Paused — press Run to continue" : "Passed — next Run pauses again";
            this.setDirtyCanvas(true);
        };
    },
});
