import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=(await readFile(new URL("../web/int_switch.js",import.meta.url),"utf8")).replace(/^import .*;\n/gm,"");
let extension;
const document={createElement:()=>({}),head:{appendChild(){}}};
const app={registerExtension:value=>extension=value};
new Function("app","document",source)(app,document);
for(const name of ["VantageIntValueSwitchV2","VantageFloatValueSwitchV2","VantageStringValueSwitchV2","VantageBoolValueSwitchV2"]){
 class Node {
  constructor(){this.widgets=[{name:"conditions",value:'[{"name":"Saved value","operator":"=","value":0,"output":12}]'},{name:"output_type",value:"BOOLEAN"}];this.outputs=[{type:"INT",links:[9]}];this.inputs=[];this.size=[300,100];this.disconnected=0;}
  addTitleButton(){return {};}
  addWidget(type,name,value,callback,options){const widget={type,name,value,callback,options};this.widgets.push(widget);return widget;}
  removeWidget(widget){const index=this.widgets.indexOf(widget);if(index>=0)this.widgets.splice(index,1);}
  disconnectOutput(){this.disconnected++;this.outputs[0].links=[];}
  computeSize(){return [300,100];} setSize(value){this.size=value;}setDirtyCanvas(){}
 }
 extension.beforeRegisterNodeDef(Node,{name});
 const node=new Node();node.onNodeCreated();
 assert.equal(node.disconnected,0);
 node.widgets.find(w=>w.name==='output_type').value='INT';
 node.onConfigure();node.onConfigure();
 assert.equal(node.disconnected,0);assert.deepEqual(node.outputs[0].links,[9]);assert.equal(node.outputs[0].type,'INT');
 assert.equal(node.widgets.filter(w=>w.name==='Saved value').length,1);
}
console.log("All four value switches preserve output links across initialization and repeated workflow restore");
