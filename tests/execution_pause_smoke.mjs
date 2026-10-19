import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = await readFile(new URL("../web/execution_pause.js", import.meta.url), "utf8");
class Node {
    constructor() {this.widgets = [{name:"resume", value:true}];}
    addWidget(type, name, value) {this.widgets.push({type,name,value});}
    setDirtyCanvas() {}
}
const app = {registerExtension(extension) {extension.beforeRegisterNodeDef(Node, {name:"VantageExecutionPauseV2"});}};
new Function("app", source.replace(/^import .*;\n/gm, ""))(app);
const node = new Node();
node.onNodeCreated();
assert.equal(node.widgets[0].type,"hidden");
assert.equal(node.widgets[0].value,false);
node.onExecuted({paused:[true]});
assert.equal(node.widgets[0].value,true);
assert.match(node.widgets[1].value,/press Run/);
node.onExecuted({paused:[false]});
assert.equal(node.widgets[0].value,false);
node.onExecuted({paused:[true]});
node.onConfigure();
assert.equal(node.widgets[0].value,false);
console.log("Pause/continue frontend state and workflow reload reset passed");
