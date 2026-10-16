import { api } from "../../../scripts/api.js";

export function installImageDrop(node, root, { widget, canAdd, added, error, multiple = true }) {
    const imageFile = file => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i.test(file.name);
    let pending = Promise.resolve();
    let removed = false;
    async function upload(files) {
        for (const file of files) {
            if (removed || !canAdd()) break;
            const body = new FormData();
            body.append("image", file);
            body.append("type", "input");
            const response = await api.fetchApi("/upload/image", { method: "POST", body });
            if (!response.ok) throw new Error(`Image upload failed: ${response.status} ${await response.text()}`);
            const result = await response.json();
            if (removed) return;
            const path = result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
            const values = widget.options.values;
            const options = typeof values === "function" ? values() : values;
            if (!options.includes(path)) widget.options.values = [...options, path].sort((a, b) => a.localeCompare(b));
            added(path);
        }
    }
    function drop(event) {
        const files = Array.from(event.dataTransfer?.files || []).filter(imageFile);
        if (!files.length) return false;
        event.preventDefault();
        event.stopPropagation();
        pending = pending.then(() => upload(multiple ? files : files.slice(0, 1))).catch(cause => error(cause.message));
        return true;
    }
    function dragOver(event) {
        if (!Array.from(event.dataTransfer?.items || []).some(item => item.kind === "file")) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
    }
    root.addEventListener("dragover", dragOver);
    root.addEventListener("drop", drop);
    const previousDrop = node.onDragDrop, previousOver = node.onDragOver;
    node.onDragDrop = function (event) { return drop(event) || previousDrop?.apply(this, arguments); };
    node.onDragOver = function (event) { return dragOver(event) || previousOver?.apply(this, arguments); };
    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        removed = true;
        root.removeEventListener("dragover", dragOver);
        root.removeEventListener("drop", drop);
        previousRemoved?.apply(this, arguments);
    };
}
