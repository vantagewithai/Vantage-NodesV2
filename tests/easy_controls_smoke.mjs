import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../web/easy_controls.js", import.meta.url), "utf8");
const start = source.indexOf("export function normalizeSubgroups");
const end = source.indexOf("\napp.registerExtension", start);
const {applyControlGroup:apply, toggleSubgroup:toggle, normalizeSubgroups:normalize, moveControlGroup:move} = new Function("LiteGraph", source.slice(start,end).replaceAll("export function", "function") + "; return {applyControlGroup,toggleSubgroup,normalizeSubgroups,moveControlGroup};")({ALWAYS:0,NEVER:2});
const controller={id:10,mode:0}, a={id:1,mode:4}, b={id:2,mode:0};
const graph={getNodeById:id=>[controller,a,b].find(node=>node.id===id)};
const group={name:"Render",nodes:[1,2,10,999],enabled:true};
apply(graph,controller,group,false);
assert.equal(a.mode,4);assert.equal(b.mode,4);assert.equal(controller.mode,0);assert.equal(group.enabled,false);
apply(graph,controller,group,true);
assert.equal(a.mode,0);assert.equal(b.mode,0);assert.equal(group.enabled,true);
console.log("Group modes: Always/Bypass, missing IDs, controller exclusion and toggle state passed");

const parent={name:"Main",nodes:[],enabled:true,childMode:"default",children:[{name:"A",nodes:[1],enabled:true},{name:"B",nodes:[2],enabled:false}]};
const [first,second]=parent.children;
apply(graph,controller,parent,false);
assert.deepEqual([a.mode,b.mode,first.enabled,second.enabled],[4,4,true,false]);
toggle(parent,second,true);
assert.equal(second.enabled,false);
apply(graph,controller,parent,true);
assert.deepEqual([a.mode,b.mode],[0,4]);
parent.childMode="max one";
toggle(parent,second,true);apply(graph,controller,parent,true);
assert.deepEqual([first.enabled,second.enabled,a.mode,b.mode],[false,true,4,0]);
toggle(parent,second,false);assert.equal(second.enabled,false);
parent.childMode="always one";normalize(parent);
assert.deepEqual([first.enabled,second.enabled],[true,false]);
toggle(parent,first,false);assert.equal(first.enabled,true);
toggle(parent,second,true);assert.deepEqual([first.enabled,second.enabled],[false,true]);
apply(graph,controller,parent,false);apply(graph,controller,parent,true);
assert.deepEqual([first.enabled,second.enabled,a.mode,b.mode],[false,true,4,0]);
const restored=JSON.parse(JSON.stringify(parent));normalize(restored);
assert.deepEqual(restored,parent);
console.log("Subgroup parent gating, retained states, max-one, always-one and workflow serialization passed");

const draftExpression = source.match(/const drafts = (.+);/)[1];
const makeDraft = new Function(`return ${draftExpression};`);
const proxy = value => value && typeof value === "object" ? new Proxy(value, {
    get(target, key, receiver) { return proxy(Reflect.get(target, key, receiver)); },
}) : value;
const stored = [{name:"Main", nodes:[1], enabled:false, childMode:"always one", children:[{name:"Child",nodes:[2],enabled:true}]}];
const draft = makeDraft.call({properties:proxy({groups:stored})});
assert.deepEqual(draft, stored);
draft[0].children[0].nodes.push(3);
draft[0].enabled = true;
assert.deepEqual(stored[0].children[0].nodes,[2]);
assert.equal(stored[0].enabled,false);
assert.deepEqual(makeDraft.call({properties:proxy({groups:[]})}),[]);
console.log("Configuration drafts accept nested reactive proxies and keep cancelled edits isolated");

const leaf = {id:1, mode:0};
const nested = {id:2, mode:0, isSubgraphNode:()=>true, subgraph:{nodes:[leaf]}};
const container = {id:3, mode:0, isSubgraphNode:()=>true, subgraph:{nodes:[nested, controller]}};
const subgraphGraph = {getNodeById:id=>id===3 ? container : undefined};
const subgraphGroup = {name:"Subgraph",nodes:[],enabled:true,children:[{name:"Pipeline",enabled:true,nodes:[3]}]};
apply(subgraphGraph,controller,subgraphGroup,false);
assert.deepEqual([container.mode,nested.mode,leaf.mode,controller.mode],[4,4,4,0]);
assert.equal(subgraphGroup.children[0].enabled,true);
apply(subgraphGraph,controller,subgraphGroup,true);
assert.deepEqual([container.mode,nested.mode,leaf.mode],[0,0,0]);
toggle(subgraphGroup,subgraphGroup.children[0],false);
apply(subgraphGraph,controller,subgraphGroup,true);
assert.deepEqual([container.mode,nested.mode,leaf.mode],[4,4,4]);
console.log("Subgraph containers and nested children follow parent and subgroup toggles in both directions");
for (const offMode of ["bypass", "mute", "never"]) {
    const expected = offMode === "bypass" ? 4 : 2;
    subgraphGroup.offMode = offMode;
    apply(subgraphGraph,controller,subgraphGroup,false);
    assert.deepEqual([container.mode,nested.mode,leaf.mode],[expected,expected,expected]);
    subgraphGroup.children[0].offMode = offMode;
    apply(subgraphGraph,controller,subgraphGroup,true);
    assert.deepEqual([container.mode,nested.mode,leaf.mode],[expected,expected,expected]);
}
subgraphGroup.offMode="mute";
subgraphGroup.children[0].offMode="bypass";
apply(subgraphGraph,controller,subgraphGroup,false);
assert.equal(leaf.mode,2);
apply(subgraphGraph,controller,subgraphGroup,true);
assert.equal(leaf.mode,4);
console.log("Per-group/subgroup Bypass, Mute and Never modes and parent override passed");

let RegisteredNode;
const litegraph = {ALWAYS:0, LGraphNode:class {
    constructor() { this.properties = {}; this.size = [300,100]; this.outputs=[]; this.widgets=[{name:"states",value:"[]",options:{}}]; }
    addTitleButton(options) { return options; }
    addWidget(type,name,value,callback,options) {
        (this.widgets ||= []).push({type,name,value,callback,options});
    }
    removeWidget(widget) {const index=this.widgets.indexOf(widget);if(index>=0)this.widgets.splice(index,1);}
    addOutput(name,type) {this.outputs.push({name,type,links:[]});}
    removeOutput(index) {this.outputs.splice(index,1);}
    setOutputData(index,value) {this.outputs[index].value=value;}
    computeSize() { return [300,Math.max(100,this.widgets.length*25)]; }
    setSize(size) { this.size = size; }
    setDirtyCanvas() {}
}, registerNodeType(name, Node) { RegisteredNode = Node; }};
const documentStub = {createElement:()=>({}),head:{appendChild(){}}};
const appStub = {registerExtension(extension) {RegisteredNode=class extends litegraph.LGraphNode {};extension.beforeRegisterNodeDef(RegisteredNode,{name:"Vantage-Easy-Controls"});}};
new Function("app","LiteGraph","document",source.replace(/^import .*;\n/gm, "").replaceAll("export function", "function"))(appStub,litegraph,documentStub);
const reloaded = new RegisteredNode();
reloaded.onNodeCreated();
reloaded.onConfigure();
assert.equal(reloaded.widgets.length,1);
reloaded.properties.groups=[{name:"Main",nodes:[1],enabled:true,children:[{name:"Child",nodes:[2],enabled:false}]}];
reloaded.onConfigure();
assert.equal(reloaded.widgets.length,3);
assert.deepEqual(reloaded.widgets.slice(1).map(widget=>widget.value),[true,false]);
reloaded.onConfigure();
assert.equal(reloaded.widgets.length,3);
console.log("Workflow restore with initially absent widgets, empty groups and saved subgroups passed");

reloaded.properties.groups=[{name:"Main Group!",nodes:[],enabled:true,emitState:true,children:[
 {name:"Child One",nodes:[],enabled:true,emitState:true},
 {name:"Hidden",nodes:[],enabled:true,emitState:false},
 {name:"Child-One",nodes:[],enabled:false,emitState:true}]}];
reloaded.rebuildControls();
assert.deepEqual(reloaded.outputs.map(output=>output.name),["Main_Group","Child_One","Child_One_2"]);
assert.equal(reloaded.widgets[0].value,"[true,true,false]");
const stateGroup=reloaded.properties.groups[0];
stateGroup.enabled=false;reloaded.rebuildControls();
assert.equal(reloaded.widgets[0].value,"[false,false,false]");
assert.equal(stateGroup.children[0].enabled,true);
stateGroup.enabled=true;
const preserved=reloaded.outputs[1];preserved.links=[77];reloaded.graph={links:{77:{origin_slot:1}}};
stateGroup.emitState=false;reloaded.rebuildControls();
assert.equal(reloaded.outputs[0],preserved);
assert.equal(reloaded.graph.links[77].origin_slot,0);
assert.equal(reloaded.widgets[0].value,"[true,false]");
stateGroup.children.forEach(child=>child.emitState=false);reloaded.rebuildControls();
assert.equal(reloaded.outputs.length,0);assert.equal(reloaded.widgets[0].value,"[]");
console.log("Selective state sockets, sanitized name collisions, effective child states, serialized values and surviving links passed");

const inverseGroup={name:"Inverse",nodes:[1],oppositeNodes:[2],enabled:true,offMode:"mute",children:[]};
apply(graph,controller,inverseGroup,true);
assert.deepEqual([a.mode,b.mode],[0,2]);
apply(graph,controller,inverseGroup,false);
assert.deepEqual([a.mode,b.mode],[2,0]);
inverseGroup.nodes=[];inverseGroup.oppositeNodes=[];
inverseGroup.children=[{name:"Child",nodes:[1],oppositeNodes:[2],enabled:false,offMode:"bypass"}];
apply(graph,controller,inverseGroup,true);
assert.deepEqual([a.mode,b.mode],[4,0]);
inverseGroup.children[0].enabled=true;
apply(graph,controller,inverseGroup,true);
assert.deepEqual([a.mode,b.mode],[0,4]);
apply(graph,controller,inverseGroup,false);
assert.deepEqual([a.mode,b.mode],[2,2]);
assert.equal(inverseGroup.children[0].enabled,true);
console.log("Follow/opposite group and subgroup lists, inverse modes and parent gating passed");

const ga={name:"A",nodes:[],enabled:true,stateId:"a",children:[]};
const gb={name:"B",nodes:[],enabled:true,stateId:"b",children:[]};
const gc={name:"C",nodes:[],enabled:false,stateId:"c",children:[]};
const roots=[ga,gb,gc];
assert.equal(move(roots,gc,null,0),true);assert.deepEqual(roots,[gc,ga,gb]);
assert.equal(move(roots,ga,gb,0),true);assert.deepEqual(roots,[gc,gb]);assert.equal(gb.children[0],ga);
assert.equal(move(roots,gb,ga,0),false);
assert.equal(move(roots,gc,ga,0),true);assert.equal(ga.children[0],gc);
assert.equal(move(roots,ga,null,0),true);assert.deepEqual(roots,[ga,gb]);assert.equal(ga.children[0],gc);
assert.equal(gc.enabled,false);assert.equal(gc.stateId,"c");
const deepGroup={name:"Deep",nodes:[],enabled:true,children:[{name:"Mid",nodes:[],enabled:true,children:[{name:"Leaf",nodes:[1],oppositeNodes:[2],enabled:false}]}]};
apply(graph,controller,deepGroup,true);assert.deepEqual([a.mode,b.mode],[4,0]);
deepGroup.enabled=false;apply(graph,controller,deepGroup,false);assert.deepEqual([a.mode,b.mode],[4,4]);
assert.equal(deepGroup.children[0].children[0].enabled,false);
console.log("Drag movement: ordering, nesting with descendants, promotion, cycle prevention and recursive gating passed");

const cascade={name:"Parent",nodes:[],oppositeNodes:[1],enabled:true,offMode:"mute",children:[
 {name:"Child",nodes:[1],enabled:true,offMode:"bypass",children:[]}
]};
apply(graph,controller,cascade,true);assert.equal(a.mode,0);
cascade.children[0].enabled=false;apply(graph,controller,cascade,true);assert.equal(a.mode,4);
cascade.children[0].enabled=true;apply(graph,controller,cascade,false);assert.equal(a.mode,0);
assert.equal(cascade.children[0].enabled,true);
cascade.nodes=[1];cascade.oppositeNodes=[];
cascade.children[0].nodes=[];cascade.children[0].oppositeNodes=[1];
apply(graph,controller,cascade,true);assert.equal(a.mode,4);
cascade.children[0].children=[{name:"Grandchild",nodes:[1],enabled:true}];
apply(graph,controller,cascade,true);assert.equal(a.mode,0);
apply(graph,controller,cascade,false);assert.equal(a.mode,2);
cascade.nodes=[];cascade.oppositeNodes=[1];
cascade.children[0].nodes=[2];cascade.children[0].oppositeNodes=[1];
apply(graph,controller,cascade,false);assert.deepEqual([a.mode,b.mode],[0,2]);
apply(graph,controller,cascade,true);assert.deepEqual([a.mode,b.mode],[0,0]);
cascade.children[0].enabled=false;
apply(graph,controller,cascade,true);assert.deepEqual([a.mode,b.mode],[0,4]);
assert.equal(cascade.children[0].enabled,false);
console.log("Enabled parents allow cascading; disabled parents retain their direct assignments and gate other descendants");
reloaded.properties.groups=[{name:"Restored",nodes:[],enabled:true,emitState:true,stateId:"restored-id",children:[]}];
reloaded.rebuildControls();
reloaded.outputs[0].links=[88];reloaded.graph={links:{88:{origin_slot:0}}};
// Simulate a frontend saving only standard output fields.
reloaded.outputs=reloaded.outputs.map(({name,type,links})=>({name,type,links}));
reloaded.properties=JSON.parse(JSON.stringify(reloaded.properties));
reloaded.onConfigure();
assert.deepEqual(reloaded.outputs[0].links,[88]);assert.equal(reloaded.outputs[0].stateId,"restored-id");
reloaded.outputs=reloaded.outputs.map(({name,type,links})=>({name,type,links}));
delete reloaded.properties.stateOutputIds;
reloaded.onConfigure();
assert.deepEqual(reloaded.outputs[0].links,[88]);assert.equal(reloaded.outputs[0].stateId,"restored-id");
console.log("State outputs preserve links after serializer drops socket metadata, including older workflows");

for (const childMode of ["max one","always one"]) {
 reloaded.graph={getNodeById:id=>[a,b].find(node=>node.id===id),beforeChange(){},afterChange(){}};
 reloaded.properties.groups=[{name:"Exclusive",nodes:[],enabled:true,childMode,children:[
  {name:"A",nodes:[1],enabled:true},{name:"B",nodes:[2],enabled:false}]}];
 reloaded.rebuildControls();
 reloaded.widgets.find(widget=>widget.name.endsWith(" / B")).callback(true);
 assert.deepEqual(reloaded.properties.groups[0].children.map(child=>child.enabled),[false,true]);
 assert.deepEqual(reloaded.widgets.slice(2).map(widget=>widget.value),[false,true]);
 assert.deepEqual([a.mode,b.mode],[4,0]);
 reloaded.widgets.find(widget=>widget.name.endsWith(" / A")).callback(true);
 assert.deepEqual(reloaded.properties.groups[0].children.map(child=>child.enabled),[true,false]);
 reloaded.widgets.find(widget=>widget.name.endsWith(" / A")).callback(false);
 assert.equal(reloaded.properties.groups[0].children[0].enabled,childMode==="always one");
}
console.log("Actual widget callbacks enforce Max one and Always one and remove obsolete widgets through the native API");

const oppositeRoot = {nodes:[], oppositeNodes:[1], enabled:true, children:[]};
const followRoot = {nodes:[1], enabled:true, offMode:"mute", children:[]};
controller.properties = {groups:[oppositeRoot, followRoot]};
for (const followEnabled of [true, false]) {
    followRoot.enabled = followEnabled;
    for (const oppositeEnabled of [true, false]) {
        apply(graph, controller, oppositeRoot, oppositeEnabled);
        assert.equal(a.mode, oppositeEnabled ? 4 : followEnabled ? 0 : 2);
        apply(graph, controller, followRoot, followEnabled);
        assert.equal(a.mode, followEnabled ? 0 : 2);
    }
}
followRoot.enabled = true;
followRoot.children = [{nodes:[1], enabled:false}];
apply(graph, controller, oppositeRoot, false);
assert.equal(a.mode,4);
console.log("Disabled main Opposite groups defer to main Follow assignments; enabled Opposite groups enforce their assignment, retaining subgroup overrides");
