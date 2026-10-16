export function installImageComboRefresh(node, widget, syncOptions) {
    const previous = node.refreshComboInNode;
    node.refreshComboInNode = function (definitions) {
        previous?.apply(this, arguments);
        const options = definitions[node.comfyClass || node.type]?.input?.required?.[widget.name]?.[0];
        if (!Array.isArray(options)) return;
        widget.options.values = options;
        const selected = options.includes(widget.value) ? widget.value : options[0];
        const changed = selected !== widget.value;
        widget.value = selected;
        syncOptions();
        if (changed) widget.callback?.(selected);
    };
}

let nextPickerId = 0;

export function createImagePicker(parent, label) {
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", label);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.placeholder = "Type to filter images…";
    input.autocomplete = "off";
    const list = document.createElement("div");
    list.id = `vantage-image-options-${nextPickerId++}`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", `${label} choices`);
    list.style.cssText = "position:absolute;top:100%;left:0;right:0;z-index:100;max-height:200px;overflow-y:auto;background:#25272c;border:1px solid #647084;border-radius:6px;padding:4px;box-shadow:0 6px 16px #0008";
    list.hidden = true;
    input.setAttribute("aria-controls", list.id);
    parent.style.position = "relative";
    parent.appendChild(list);
    let values = [], matches = [], active = -1;
    function close() {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }
    function choose(value) {
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        close();
    }
    function highlight() {
        Array.from(list.children).forEach((option, index) => {
            option.style.background = index === active ? "#315577" : "transparent";
            option.setAttribute("aria-selected", String(index === active));
        });
        const option = list.children[active];
        if (option) { input.setAttribute("aria-activedescendant", option.id); option.scrollIntoView({ block: "nearest" }); }
    }
    function filter(query) {
        matches = values.filter(value => value.toLowerCase().includes(query.toLowerCase()));
        active = -1;
        list.replaceChildren(...matches.map((value, index) => {
            const option = document.createElement("button");
            option.type = "button";
            option.id = `${list.id}-${index}`;
            option.setAttribute("role", "option");
            option.textContent = value;
            option.title = value;
            option.style.cssText = "display:block;width:100%;text-align:left;color:#eee;background:transparent;border:0;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer";
            option.onmousedown = event => event.preventDefault();
            option.onmouseenter = () => { active = index; highlight(); };
            option.onclick = () => choose(value);
            return option;
        }));
        if (!matches.length) {
            const empty = document.createElement("span");
            empty.textContent = "No matching images";
            empty.style.cssText = "display:block;padding:8px;color:#aaa";
            list.appendChild(empty);
        }
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
    }
    input.addEventListener("focus", () => { input.select(); filter(""); });
    input.addEventListener("click", () => { if (list.hidden) filter(""); });
    input.addEventListener("input", () => filter(input.value));
    input.addEventListener("blur", close);
    input.addEventListener("keydown", event => {
        event.stopPropagation();
        if (event.key === "Escape") { close(); event.preventDefault(); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (list.hidden) filter(input.value);
            if (!matches.length) return;
            active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
            highlight();
        } else if (event.key === "Enter" && !list.hidden && matches.length) {
            event.preventDefault(); choose(matches[Math.max(0, active)]);
        }
    });
    return {
        input,
        setOptions(options) { values = options; if (!list.hidden) filter(input.value); },
        hasValue(value) { return values.includes(value); },
    };
}
