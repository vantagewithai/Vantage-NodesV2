import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = await readFile(new URL("../web/image_compositor.js", import.meta.url), "utf8");
const start = source.indexOf("export function initialLayer");
const end = source.indexOf("app.registerExtension", start);
const {initialLayer, localPoint} = new Function(source.slice(start,end).replaceAll("export function", "function") + ";return {initialLayer,localPoint};")();
const large = initialLayer(0,{width:2048,height:1024},1024,1024);
assert.equal(large.width,1024);
assert.equal(large.height,512);
assert.equal(large.x,512);
assert.equal(large.y,512);
const small = initialLayer(1,{width:100,height:200},1024,1024);
assert.equal(small.width,100);
assert.equal(small.height,200);
assert.equal(small.index,1);
assert.equal(small.opacity,1);
assert.equal(small.visible,true);
assert.deepEqual(localPoint({x:520,y:530},{x:500,y:500,angle:0}),{x:20,y:30});
const rotated = localPoint({x:500,y:520},{x:500,y:500,angle:90});
assert.ok(Math.abs(rotated.x-20)<1e-10);
assert.ok(Math.abs(rotated.y)<1e-10);
console.log("Initial image fitting, stable layer indices and rotated hit-testing passed");

class Element {
    constructor() {this.style={};this.dataset={};this.children=[];this.value="";this.className="";}
    appendChild(child) {this.children.push(child);}
    setAttribute() {}
    addEventListener() {}
    replaceChildren() {this.children=[];}
    getContext() {return {};}
}
const documentStub={createElement:()=>new Element(),head:new Element()};
class Node {
    constructor() {
        this.properties={};this.size=[680,780];
        this.widgets=Object.entries({width:1024,height:1024,padding:100,composition:"{}",input_signature:""}).map(([name,value])=>({name,value}));
    }
    addDOMWidget(name,type,element,options) {this.editor=element;this.dom={name,last_y:245,options};return this.dom;}
    setSize(size) {this.size=size;this.onResize?.(size);}
    setDirtyCanvas() {}
}
const app={registerExtension(extension){extension.beforeRegisterNodeDef(Node,{name:"VantageImageCompositor"});}};
new Function("app","api","document","requestAnimationFrame","cancelAnimationFrame","ResizeObserver",
    source.replace(/^import .*;\n/gm,"").replaceAll("export function","function"))(
    app,{},documentStub,()=>1,()=>{},class {observe(){}disconnect(){}});
const node=new Node();node.onNodeCreated();
const minimum=node.editor.style.height;
node.setSize([680,1180]);
assert.equal(node.editor.style.height,"925px");
assert.equal(node.dom.options.getHeight(),925);
assert.equal(node.dom.options.getMaxHeight(),925);
assert.deepEqual(node.dom.computeSize(),[660,525]);
node.setSize([680,780]);assert.equal(node.editor.style.height,minimum);
node.setSize([820,1060]);node.onConfigure();
assert.deepEqual(node.size,[820,1060]);assert.equal(node.editor.style.height,"805px");
console.log("Editor height grows and shrinks with node size while minimum size and restored workflow layout stay stable");
