import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const style = document.createElement("style");
style.textContent = `
.vantage-compositor {height:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;overflow:hidden;background:var(--comfy-menu-bg,#202124);color:var(--input-text,#eee);font:12px system-ui}
.vantage-compositor * {box-sizing:border-box}
.vantage-compositor .bar {display:flex;gap:6px;align-items:center;flex-shrink:0}
.vantage-compositor button,.vantage-compositor input,.vantage-compositor select {font:inherit;color:inherit;background:var(--comfy-input-bg,#303238);border:1px solid #ffffff30;border-radius:5px;padding:5px;min-width:0}
.vantage-compositor button {cursor:pointer}
.vantage-compositor button:disabled {opacity:.35}
.vantage-compositor button[aria-pressed=true] {border-color:#7bd0ff;background:#25679c80}
.vantage-compositor .viewport {position:relative;flex:1;min-height:180px;overflow:hidden;background:#14161a;border:1px solid #ffffff30;border-radius:6px}
.vantage-compositor canvas {width:100%;height:100%;display:block;touch-action:none}
.vantage-compositor .geometry {display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;flex-shrink:0}
.vantage-compositor label {display:flex;flex-direction:column;gap:4px}
.vantage-compositor .layers {height:105px;overflow:auto;flex-shrink:0;border:1px solid #ffffff25;padding:4px;border-radius:5px}
.vantage-compositor .layer {display:flex;gap:6px;align-items:center;padding:4px;border-radius:4px;cursor:pointer}
.vantage-compositor .layer.selected {background:#2c668a}
.vantage-compositor .layer span {flex:1}
.vantage-compositor input[type=number] {width:100%}
.vantage-compositor input[type=color] {width:30px;height:27px;padding:2px}
.vantage-compositor .status {font-size:11px;color:#bac4ce;flex-shrink:0}
`;
document.head.appendChild(style);

export function initialLayer(index, image, width, height) {
    const scale = Math.min(1, width / image.width, height / image.height);
    return {index, x:width/2, y:height/2, width:image.width*scale, height:image.height*scale,
        angle:0, opacity:1, visible:true, flip_x:false, flip_y:false};
}

export function localPoint(point, layer) {
    const angle = -layer.angle * Math.PI / 180, dx = point.x-layer.x, dy = point.y-layer.y;
    return {x:dx*Math.cos(angle)-dy*Math.sin(angle), y:dx*Math.sin(angle)+dy*Math.cos(angle)};
}

app.registerExtension({
    name: "vantage.image_compositor",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "VantageImageCompositor") return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            const node = this, minimumWidth = 680, minimumHeight = 780, headerHeight = 255;
            const widget = name => node.widgets.find(item => item.name === name);
            for (const name of ["composition", "input_signature"]) {
                const field = widget(name);
                field.type = "hidden";
                field.computeSize = () => [0,-4];
                if (field.inputEl) field.inputEl.style.display = "none";
            }
            const el = (tag, parent, text) => {
                const element = document.createElement(tag);
                if (text !== undefined) element.textContent = text;
                parent?.appendChild(element);
                return element;
            };
            const root = el("div"); root.className = "vantage-compositor"; root.tabIndex = 0;
            const row = () => {const r=el("div",root);r.className="bar";return r;};
            const button = (parent, title, action) => {const b=el("button",parent,title);b.type="button";b.onclick=action;return b;};
            let state = {layers:[], strokes:[], background:"#ffffff"};
            let assets = [], selected = -1, frame = null, drag = null, tool = "select", snap = false;
            let undo = [], redo = [], disposed = false, assetRequest = 0;
            const size = () => [Number(widget("width").value), Number(widget("height").value)];
            const padding = () => Number(widget("padding").value);
            const current = () => state.layers.find(layer => layer.index === selected);
            const schedule = () => {if (frame === null && !disposed) frame=requestAnimationFrame(paint);};
            const persist = () => {widget("composition").value=JSON.stringify(state);node.graph?.change();node.setDirtyCanvas(true);schedule();};
            const remember = () => {undo.push(JSON.stringify(state));if(undo.length>80)undo.shift();redo=[];};
            const edit = action => {remember();action();persist();refresh();};
            const toolbar = row();
            const tools = {};
            for (const name of ["select","draw","erase"]) tools[name]=button(toolbar,name[0].toUpperCase()+name.slice(1),()=>{tool=name;refresh();});
            const brushColor=el("input",toolbar);brushColor.type="color";brushColor.value="#ffffff";brushColor.title="Brush color";
            const brushSize=el("input",toolbar);brushSize.type="number";brushSize.value="12";brushSize.min="1";brushSize.style.width="55px";brushSize.title="Brush width in canvas pixels";
            button(toolbar,"Clear drawing",()=>edit(()=>{state.strokes=[];}));
            const undoButton=button(toolbar,"Undo",()=>history(false));
            const redoButton=button(toolbar,"Redo",()=>history(true));
            const viewport=el("div",root);viewport.className="viewport";
            const canvas=el("canvas",viewport);canvas.setAttribute("aria-label","Image compositor canvas");
            const ctx=canvas.getContext("2d");
            const controls=row();
            button(controls,"Flip H",()=>{if(current())edit(()=>{current().flip_x=!current().flip_x;});});
            button(controls,"Flip V",()=>{if(current())edit(()=>{current().flip_y=!current().flip_y;});});
            button(controls,"Fit",()=>{if(current())edit(()=>{Object.assign(current(),initialLayer(selected,assets[selected],...size()));});});
            button(controls,"Earlier",()=>reorder(-1));
            button(controls,"Later",()=>reorder(1));
            const snapButton=button(controls,"Snap",()=>{snap=!snap;refresh();});
            const gridSize=el("input",controls);gridSize.type="number";gridSize.min="1";gridSize.value="16";gridSize.style.width="55px";gridSize.title="Grid size";gridSize.oninput=schedule;
            const background=el("input",controls);background.type="color";background.title="Canvas background";background.value="#ffffff";background.onchange=()=>edit(()=>{state.background=background.value;});
            button(controls,"Reset",()=>edit(()=>{state.layers=assets.map((image,i)=>initialLayer(i,image,...size()));state.strokes=[];}));
            const alignRow=row();el("span",alignRow,"Align");
            for (const [label,x,y] of [["↖",0,0],["↑",.5,0],["↗",1,0],["←",0,.5],["●",.5,.5],["→",1,.5],["↙",0,1],["↓",.5,1],["↘",1,1]]) {
                button(alignRow,label,()=>{if(!current())return;edit(()=>{
                    const layer=current(),[w,h]=size(),a=layer.angle*Math.PI/180;
                    const bw=Math.abs(Math.cos(a)*layer.width)+Math.abs(Math.sin(a)*layer.height);
                    const bh=Math.abs(Math.sin(a)*layer.width)+Math.abs(Math.cos(a)*layer.height);
                    layer.x=bw/2+(w-bw)*x;layer.y=bh/2+(h-bh)*y;
                });});
            }
            const geometry=el("div",root);geometry.className="geometry";
            const fields={};
            for(const name of ["x","y","width","height","angle","opacity"]) {
                const label=el("label",geometry,name), input=el("input",label);input.type="number";
                input.step=name==="opacity"?"0.05":"1";
                if(name==="width"||name==="height")input.min="1";
                if(name==="opacity"){input.min="0";input.max="1";}
                input.onfocus=()=>{input.dataset.recorded="";};
                input.oninput=()=>{
                    if(!current()||!input.checkValidity()||input.value==="")return;
                    if(!input.dataset.recorded){remember();input.dataset.recorded="1";}
                    current()[name]=Number(input.value);persist();refresh();
                };
                fields[name]=input;
            }
            const layerList=el("div",root);layerList.className="layers";
            const status=el("div",root,"Run once to load input images. Arrange layers, then Run again to continue.");status.className="status";
            function history(forward) {
                const from=forward?redo:undo,to=forward?undo:redo;if(!from.length)return;
                to.push(JSON.stringify(state));state=JSON.parse(from.pop());persist();refresh();
            }
            function reorder(offset) {
                const index=state.layers.findIndex(layer=>layer.index===selected),next=index+offset;
                if(index<0||next<0||next>=state.layers.length)return;
                edit(()=>{[state.layers[index],state.layers[next]]=[state.layers[next],state.layers[index]];});
            }
            function refresh() {
                const layer=current();
                for(const [name,input] of Object.entries(fields)) {input.disabled=!layer;if(document.activeElement!==input)input.value=layer?.[name]??0;}
                background.value=state.background||"#ffffff";
                for(const [name,b] of Object.entries(tools))b.setAttribute("aria-pressed",name===tool);
                snapButton.setAttribute("aria-pressed",snap);undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
                layerList.replaceChildren();
                for(const layer of [...state.layers].reverse()) {
                    const entry=el("div",layerList);entry.className="layer"+(selected===layer.index?" selected":"");
                    entry.onclick=()=>{selected=layer.index;refresh();};
                    const visible=el("input",entry);visible.type="checkbox";visible.checked=layer.visible!==false;visible.title="Layer visibility";
                    visible.onclick=event=>event.stopPropagation();visible.onchange=()=>edit(()=>{layer.visible=visible.checked;});
                    el("span",entry,`Image ${layer.index} · ${assets[layer.index]?.width||"?"} × ${assets[layer.index]?.height||"?"}`);
                    button(entry,"Select",()=>{selected=layer.index;refresh();});
                }
                schedule();
            }
            function viewTransform() {
                const [w,h]=size(),p=padding(),rw=viewport.clientWidth||1,rh=viewport.clientHeight||1;
                const scale=Math.min(rw/(w+2*p),rh/(h+2*p));
                return {scale,x:(rw-w*scale)/2,y:(rh-h*scale)/2};
            }
            function layerContext(layer) {
                ctx.translate(layer.x,layer.y);ctx.rotate(layer.angle*Math.PI/180);
                ctx.scale(layer.flip_x?-1:1,layer.flip_y?-1:1);
            }
            function paint() {
                frame=null;
                const rw=viewport.clientWidth,rh=viewport.clientHeight;if(!rw||!rh)return;
                const dpr=window.devicePixelRatio||1;canvas.width=Math.round(rw*dpr);canvas.height=Math.round(rh*dpr);
                ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rw,rh);
                const {scale,x,y}=viewTransform(),[w,h]=size();
                ctx.translate(x,y);ctx.scale(scale,scale);
                ctx.fillStyle=state.background||"#ffffff";ctx.fillRect(0,0,w,h);
                ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
                for(const layer of state.layers) {
                    if(layer.visible===false||!assets[layer.index])continue;
                    ctx.save();layerContext(layer);ctx.globalAlpha=layer.opacity;
                    ctx.drawImage(assets[layer.index],-layer.width/2,-layer.height/2,layer.width,layer.height);ctx.restore();
                }
                if(state.strokes?.length) {
                    const fg=document.createElement("canvas"),previewScale=Math.min(1,scale*dpr);
                    fg.width=Math.max(1,Math.round(w*previewScale));fg.height=Math.max(1,Math.round(h*previewScale));
                    const brush=fg.getContext("2d");brush.scale(previewScale,previewScale);
                    for(const stroke of state.strokes) {
                        brush.globalCompositeOperation=stroke.erase?"destination-out":"source-over";
                        brush.strokeStyle=stroke.color;brush.fillStyle=stroke.color;brush.lineWidth=stroke.size;brush.lineCap="round";brush.lineJoin="round";
                        brush.beginPath();stroke.points.forEach(([px,py],i)=>{if(i)brush.lineTo(px,py);else brush.moveTo(px,py);});brush.stroke();
                        if(stroke.points.length===1){brush.beginPath();brush.arc(...stroke.points[0],stroke.size/2,0,2*Math.PI);brush.fill();}
                    }
                    ctx.drawImage(fg,0,0,w,h);
                }
                if(snap) {
                    const step=Math.max(1,Number(gridSize.value)||16);ctx.strokeStyle="#70a0c050";ctx.lineWidth=1/scale;ctx.beginPath();
                    if(w/step+h/step<3000){for(let i=step;i<w;i+=step){ctx.moveTo(i,0);ctx.lineTo(i,h);}for(let i=step;i<h;i+=step){ctx.moveTo(0,i);ctx.lineTo(w,i);}}ctx.stroke();
                }
                ctx.restore();ctx.strokeStyle="#aab5c5";ctx.lineWidth=1/scale;ctx.strokeRect(0,0,w,h);
                const layer=current();
                if(layer&&layer.visible!==false) {
                    ctx.save();ctx.translate(layer.x,layer.y);ctx.rotate(layer.angle*Math.PI/180);
                    ctx.strokeStyle="#59c5ff";ctx.lineWidth=2/scale;ctx.strokeRect(-layer.width/2,-layer.height/2,layer.width,layer.height);
                    ctx.fillStyle="#ffffff";const handle=8/scale;
                    for(const [hx,hy] of [[-1,-1],[1,-1],[1,1],[-1,1]])ctx.fillRect(hx*layer.width/2-handle/2,hy*layer.height/2-handle/2,handle,handle);
                    ctx.beginPath();ctx.moveTo(0,-layer.height/2);ctx.lineTo(0,-layer.height/2-24/scale);ctx.stroke();
                    ctx.beginPath();ctx.arc(0,-layer.height/2-24/scale,5/scale,0,2*Math.PI);ctx.fill();ctx.restore();
                }
            }
            function point(event) {
                const rect=canvas.getBoundingClientRect(),view=viewTransform();
                return {x:((event.clientX-rect.left)*viewport.clientWidth/rect.width-view.x)/view.scale,
                    y:((event.clientY-rect.top)*viewport.clientHeight/rect.height-view.y)/view.scale};
            }
            const quantize = value => snap?Math.round(value/(Number(gridSize.value)||16))*(Number(gridSize.value)||16):value;
            canvas.onpointerdown=event=>{
                if(event.button!==0)return;event.preventDefault();event.stopPropagation();root.focus();
                const p=point(event),layer=current(),tolerance=10/viewTransform().scale;
                remember();
                if(tool!=="select") {
                    const stroke={color:brushColor.value,size:Math.max(1,Number(brushSize.value)||12),erase:tool==="erase",points:[[p.x,p.y]]};
                    (state.strokes||=[]).push(stroke);drag={kind:"stroke",stroke};
                } else {
                    if(layer&&layer.visible!==false) {
                        const local=localPoint(p,layer);
                        if(Math.hypot(local.x,local.y+layer.height/2+24/viewTransform().scale)<tolerance)drag={kind:"rotate",original:{...layer}};
                        else if(Math.abs(Math.abs(local.x)-layer.width/2)<tolerance&&Math.abs(Math.abs(local.y)-layer.height/2)<tolerance)drag={kind:"resize",original:{...layer},start:local};
                    }
                    if(!drag) {
                        const hit=[...state.layers].reverse().find(item=>{
                            if(item.visible===false)return false;const local=localPoint(p,item);
                            return Math.abs(local.x)<=item.width/2&&Math.abs(local.y)<=item.height/2;
                        });
                        selected=hit?.index??-1;
                        if(hit)drag={kind:"move",original:{...hit},start:p};
                    }
                }
                canvas.setPointerCapture(event.pointerId);refresh();
            };
            canvas.onpointermove=event=>{
                if(!drag)return;event.preventDefault();event.stopPropagation();const p=point(event),layer=current();
                if(drag.kind==="stroke")drag.stroke.points.push([p.x,p.y]);
                else if(layer) {
                    const original=drag.original;
                    if(drag.kind==="move"){layer.x=quantize(original.x+p.x-drag.start.x);layer.y=quantize(original.y+p.y-drag.start.y);}
                    if(drag.kind==="rotate"){const angle=Math.atan2(p.y-layer.y,p.x-layer.x)*180/Math.PI+90;layer.angle=event.shiftKey?Math.round(angle/15)*15:angle;}
                    if(drag.kind==="resize"){
                        const local=localPoint(p,original),sx=Math.abs(local.x*2/original.width),sy=Math.abs(local.y*2/original.height);
                        const scale=Math.max(.001,Math.max(sx,sy));
                        layer.width=Math.max(1,original.width*(event.shiftKey?sx:scale));layer.height=Math.max(1,original.height*(event.shiftKey?sy:scale));
                    }
                }
                persist();
                for(const [name,input] of Object.entries(fields))input.value=layer?.[name]??0;
            };
            const endDrag=event=>{if(!drag)return;event.stopPropagation();drag=null;persist();refresh();};
            canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;
            root.addEventListener("keydown",event=>{
                if(event.target.tagName==="INPUT"||event.target.tagName==="SELECT")return;
                if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();event.stopPropagation();history(event.shiftKey);}
                else if(current()&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){
                    event.preventDefault();event.stopPropagation();edit(()=>{const step=event.shiftKey?10:1;current().x+=event.key==="ArrowLeft"?-step:event.key==="ArrowRight"?step:0;current().y+=event.key==="ArrowUp"?-step:event.key==="ArrowDown"?step:0;});
                }
            });
            async function loadAssets(descriptors) {
                const request=++assetRequest;
                const loaded=await Promise.all(descriptors.map(async descriptor=>{
                    const image=new Image();image.src=api.apiURL(`/view?${new URLSearchParams({filename:descriptor.filename,subfolder:descriptor.subfolder,type:"temp"})}`);
                    await image.decode();return image;
                }));
                if(disposed||request!==assetRequest)return;
                assets=loaded;refresh();
            }
            let dom;
            const editorHeight = (dimensions=node.size) => Math.max(minimumHeight-headerHeight,dimensions[1]-(dom?.last_y||headerHeight)-10);
            const syncLayout = (dimensions=node.size) => {
                root.style.height=`${editorHeight(dimensions)}px`;
                schedule();
            };
            dom=node.addDOMWidget("compositor_editor","custom",root,{
                serialize:false,hideOnZoom:false,getMinHeight:()=>minimumHeight-headerHeight,
                getMaxHeight:editorHeight,getHeight:editorHeight,
            });
            dom.computeSize=()=>[minimumWidth-20,minimumHeight-headerHeight];
            const executed=node.onExecuted;
            node.onExecuted=function(message){
                executed?.apply(this,arguments);
                if(message.signature)widget("input_signature").value=message.signature[0];
                if(message.composition){state=JSON.parse(message.composition[0]);widget("composition").value=message.composition[0];}
                if(message.canvas_size){widget("width").value=message.canvas_size[0];widget("height").value=message.canvas_size[1];}
                if(message.padding)widget("padding").value=message.padding[0];
                if(message.layers){node.properties.compositorAssets=message.layers;loadAssets(message.layers).catch(error=>{status.textContent=`Unable to load layer previews: ${error.message}`;});}
                status.textContent=message.paused?.[0]?"Paused · Arrange layers, then press Run to continue.":"Composite ready · Changes apply on the next Run.";
                selected=state.layers.some(layer=>layer.index===selected)?selected:state.layers[0]?.index??-1;
                refresh();
            };
            const configured=node.onConfigure;
            node.onConfigure=function(){
                configured?.apply(this,arguments);
                state=JSON.parse(widget("composition").value||"{}");state.layers||=[];state.strokes||=[];
                widget("input_signature").value="";
                selected=state.layers[0]?.index??-1;
                node.setSize([Math.max(minimumWidth,node.size[0]),Math.max(minimumHeight,node.size[1])]);
                syncLayout();
                if(node.properties.compositorAssets)loadAssets(node.properties.compositorAssets).catch(()=>{status.textContent="Run to reload input previews.";});
                refresh();
            };
            for(const name of ["width","height","padding"]){
                const field=widget(name),callback=field.callback;
                field.callback=function(){callback?.apply(this,arguments);schedule();};
            }
            const resized=node.onResize;
            node.onResize=function(dimensions){dimensions[0]=Math.max(minimumWidth,dimensions[0]);dimensions[1]=Math.max(minimumHeight,dimensions[1]);resized?.apply(this,arguments);syncLayout(dimensions);};
            const observer=new ResizeObserver(schedule);observer.observe(viewport);
            const removed=node.onRemoved;
            node.onRemoved=function(){disposed=true;observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);removed?.apply(this,arguments);};
            node.setSize([minimumWidth,minimumHeight]);syncLayout();refresh();
        };
    },
});
