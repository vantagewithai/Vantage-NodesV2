import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../web/bounding_boxes.js",import.meta.url),"utf8");
const start=source.indexOf("export function parseBoxData");
const end=source.indexOf("app.registerExtension",start);
const parse=new Function(source.slice(start,end).replace("export function","function")+";return parseBoxData;")();
const boxes=[
    {x:-12,y:20,width:180,height:300,metadata:{type:"obj",desc:"Character A",is_character:true,palette:["#ff8800"]}},
    {x:0,y:0,width:100,height:20,metadata:{type:"text",text:"Welcome to Paradise",desc:"Title"}},
];
assert.deepEqual(parse(JSON.stringify({width:1024,height:768,boxes})),boxes);
assert.deepEqual(parse(JSON.stringify(boxes)),boxes);
assert.deepEqual(parse("[]"),[]);
assert.deepEqual(parse('{"boxes":[]}'),[]);
for(const text of ['null','{}','{"boxes":null}','[null]','[{"x":0,"y":0,"width":-1,"height":3}]',
    '[{"x":0,"y":0,"width":"10","height":3}]','[{"x":0,"y":0,"width":10,"height":3,"metadata":null}]','not json']) {
    assert.throws(()=>parse(text));
}
console.log("Box clipboard envelope/raw-array roundtrip, metadata preservation and invalid-data rejection passed");
