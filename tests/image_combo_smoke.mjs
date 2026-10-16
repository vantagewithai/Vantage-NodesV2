import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = (await readFile(new URL("../web/image_combo.js", import.meta.url), "utf8")).replaceAll("export function", "function");
const install = new Function(`${source}; return installImageComboRefresh;`)();
for (const [type, name] of [["Vantage-Bounding-Boxes", "background_image"], ["VantageMultiImageLoaderV2", "image"]]) {
    let previousCalls = 0, syncCalls = 0, changed = 0, displayed;
    const node = {comfyClass: type, refreshComboInNode() { previousCalls++; }};
    const widget = {name, type:"hidden", value:"kept.png", options:{values:["(none)", "old.png", "kept.png"]}, callback() {changed++;}};
    install(node, widget, () => {syncCalls++; displayed = [...widget.options.values]; });
    const refresh = options => node.refreshComboInNode({[type]:{input:{required:{[name]:[options]}}}});
    refresh(["(none)", "kept.png", "new.png"]);
    assert.deepEqual(displayed, ["(none)", "kept.png", "new.png"]);
    assert.equal(widget.value, "kept.png");
    assert.equal(changed, 0);
    refresh(["(none)", "new.png"]);
    assert.equal(widget.value, "(none)");
    assert.equal(changed, 1);
    assert.equal(syncCalls, 2);
    assert.equal(previousCalls, 2);
    assert.equal(widget.type, "hidden");
}
console.log("Both hidden image combos refresh additions/removals, retain valid selection, handle deleted selections and preserve existing hooks");
