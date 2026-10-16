import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../web/image_drop.js", import.meta.url), "utf8"))
    .replace(/^import .*;\n/, "").replace("export function", "function");
const uploads = [];
const api = { async fetchApi(url, options) {
    assert.equal(url, "/upload/image");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("type"), "input");
    assert.equal(options.body.get("overwrite"), null);
    const file = options.body.get("image");
    uploads.push([file.name, await file.text()]);
    return { ok: true, json: async () => ({name: file.name, subfolder: "dropped"}) };
} };
const install = new Function("api", `${source}; return installImageDrop;`)(api);
const waitUploads = () => new Promise(resolve => setImmediate(resolve));
function fixture(multiple = true) {
    const listeners = new Map(), paths = [], errors = [];
    const root = { addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: type => listeners.delete(type) };
    const node = {}, widget = {options: { values: ["(none)"] }};
    let capacity = 2;
    install(node, root, {widget, multiple, canAdd: () => paths.length < capacity,
        added: path => { if (!paths.includes(path)) paths.push(path); }, error: message => errors.push(message)});
    return {node, paths, errors, widget, listeners, setCapacity: value => capacity = value};
}
const event = files => ({ dataTransfer: {files}, preventDefault() {}, stopPropagation() {} });
const file = name => new File([`contents of ${name}`], name, {type:"image/png"});
const gallery = fixture();
assert.equal(gallery.node.onDragDrop(event([file("a.png"), file("a.png"), file("b.png"), file("c.png")])), true);
await waitUploads();
assert.deepEqual(gallery.paths, ["dropped/a.png", "dropped/b.png"]);
assert.deepEqual(gallery.widget.options.values, ["(none)", "dropped/a.png", "dropped/b.png"]);
assert.equal(uploads.length, 3);
assert.deepEqual(uploads[0], ["a.png", "contents of a.png"]);
gallery.setCapacity(1);
gallery.node.onDragDrop(event([file("c.png")]));
await waitUploads();
assert.equal(uploads.length, 3);
const bounding = fixture(false);
bounding.listeners.get("drop")(event([file("background.png"), file("unused.png")]));
await waitUploads();
assert.deepEqual(bounding.paths, ["dropped/background.png"]);
assert.equal(bounding.errors.length, 0);
bounding.node.onRemoved();
assert.equal(bounding.listeners.size, 0);
assert.equal(gallery.node.onDragDrop(event([new File(["text"], "notes.txt", {type:"text/plain"})])), undefined);
console.log("Drops preserve names/data, use standard non-overwriting uploads, deduplicate gallery paths, obey capacity, select one background and clean up handlers");
