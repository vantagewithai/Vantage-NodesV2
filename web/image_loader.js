import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { installImageDrop } from "./image_drop.js";
import { installImageComboRefresh, createImagePicker } from "./image_combo.js";

app.registerExtension({
    name: "VantageMultiImageLoaderV2",
    async nodeCreated(node) {
        if (node.comfyClass !== "VantageMultiImageLoaderV2") return;

        const GRID_GAP = 8;
        const MIN_GALLERY_HEIGHT = 250;
        const MIN_TILE_SIZE = 112;
        const V3_MIN_WIDTH = 220;
        const V1_MIN_WIDTH = 220;
        const V3_PADDING_BOTTOM = 15;
        const V1_PADDING_BOTTOM = 25;
        const SWAP_THROTTLE_MS = 50;
        const SWAP_MOVE_THRESHOLD = 5;

        let v3NodeElement = null;
        let isLayouting = false;
        let draggedNode = null;
        let lastSwapX = 0;
        let lastSwapY = 0;
        let lastSwapTime = 0;
        let lastObservedWidth = 0;
        let lastObservedHeight = 0;

        const container = document.createElement("div");
        container.style.cssText = `
            width: 100%;
            min-height: ${MIN_GALLERY_HEIGHT}px;
            min-width: 100px;
            background: #222222;
            border: 1px solid #353545;
            border-radius: 4px;
            margin-top: 5px;
            padding: 10px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: auto;
            overflow: hidden;
        `;

        const topBar = document.createElement("div");
        topBar.style.cssText = "display:flex; flex-wrap:wrap; justify-content:flex-start; align-items:center; width:100%; gap:8px; flex-shrink:0;";

        const imageWidget = node.widgets.find(w => w.name === "image");
        const imagePicker = createImagePicker(topBar, "Image from input folder");
        const imageSelect = imagePicker.input;
        imageSelect.style.cssText = "flex:1;min-width:0;background:#303238;color:#eee;padding:6px;border:1px solid #555;border-radius:4px";
        const addButton = document.createElement("button");
        addButton.textContent = "Add";
        addButton.type = "button";
        const countLabel = document.createElement("span");
        countLabel.style.cssText = "color:#aaa;font:12px system-ui;flex-shrink:0";
        function syncImageOptions() {
            const values = imageWidget.options.values;
            const options = typeof values === "function" ? values() : values;
            imagePicker.setOptions(options);
            imageSelect.value = imageWidget.value;
        }
        syncImageOptions();
        imageSelect.oninput = imageSelect.onchange = () => {
            if (imagePicker.hasValue(imageSelect.value)) imageWidget.value = imageSelect.value;
            updateCapacity();
        };
        const removeAllBtn = document.createElement("button");
        removeAllBtn.innerText = "Remove All";
        removeAllBtn.title = "Clear every image from the gallery and reset the hidden path list.";
        removeAllBtn.style.cssText = `
            background:#cc2222; color:white; border:1px solid #aa1111;
            padding:3px 8px; border-radius:3px; cursor:pointer; font-size:10px;
            transition:background 0.2s;
        `;
        removeAllBtn.onmouseenter = () => { removeAllBtn.style.background = "#ff3333"; };
        removeAllBtn.onmouseleave = () => { removeAllBtn.style.background = "#cc2222"; };

        const gridWrapper = document.createElement("div");
        gridWrapper.style.cssText = `
            position: relative;
            flex-grow: 1;
            width: 100%;
            min-height: 0;
            overflow: auto;
        `;

        gridWrapper.addEventListener("wheel", event => event.stopPropagation(), { passive: true });

        const grid = document.createElement("div");
        grid.style.cssText = `
            min-height: 100%;
            display: grid;
            gap: ${GRID_GAP}px;
            justify-content: center;
            align-content: center;
        `;

        topBar.append(imageSelect, addButton, removeAllBtn);
        gridWrapper.appendChild(grid);
        container.append(topBar, countLabel, gridWrapper);

        const galleryHeight = () => {
            const { galleryY, paddingBottom } = getNodeMetrics();
            return Math.max(MIN_GALLERY_HEIGHT, node.size[1] - galleryY - paddingBottom);
        };
        const galleryWidget = node.addDOMWidget("Gallery", "html_gallery", container, {
            serialize: false,
            getMinHeight: () => MIN_GALLERY_HEIGHT,
            getMaxHeight: galleryHeight,
            getHeight: galleryHeight,
        });
        const pathsWidget = node.widgets?.find((w) => w.name === "image_paths");
        const oldCallback = pathsWidget?.callback;

        function getPaths() {
            return (pathsWidget?.value || "")
                .split(/\n/) 
                .map((s) => s.trim())
                .filter(Boolean);
        }

        function getNodeMetrics(widthHint = 220) {
            const isV3 = checkIsV3();
            const minW = isV3 ? V3_MIN_WIDTH : V1_MIN_WIDTH;
            const paddingBottom = isV3 ? V3_PADDING_BOTTOM : V1_PADDING_BOTTOM;
            const galleryY = galleryWidget.last_y || 40;
            const minOutputsHeight = (node.outputs ? node.outputs.length : 1) * 20;
            const absoluteMinHeight = Math.max(galleryY + MIN_GALLERY_HEIGHT + paddingBottom, minOutputsHeight + 40);
            const nodeWidth = node.size?.[0] || widthHint || 220;
            return { isV3, minW, paddingBottom, galleryY, absoluteMinHeight, nodeWidth };
        }

        function checkIsV3() {
            if (v3NodeElement) return true;
            let el = container.parentElement;
            while (el) {
                if (
                    (el.tagName && el.tagName.toLowerCase().includes("comfy-node")) ||
                    (el.classList && el.classList.contains("comfy-node"))
                ) {
                    v3NodeElement = el;
                    return true;
                }
                el = el.parentElement || (el.getRootNode ? el.getRootNode().host : null);
            }
            return false;
        }

        function hidePathsWidget() {
            for (const w of [pathsWidget, imageWidget]) {
                w.type = "hidden";
                w.computeSize = () => [0, -4];
                if (w.inputEl) w.inputEl.style.display = "none";
            }
        }
        let backgroundIsConnected = node.inputs?.some(input => input.name === "background" && input.link != null) || false;
        function syncImageOutputs() {
            const maximum = Math.max(1, Number(node.widgets.find(w => w.name === "max_images").value));
            const count = maximum + 2;
            while (node.outputs.length > count) node.removeOutput(node.outputs.length - 1);
            while (node.outputs.length < count) node.addOutput(`image_${node.outputs.length - 2}`, "IMAGE");
            node.setDirtyCanvas(true, true);
        }
        function updateCapacity() {
            const paths = getPaths();
            const maximum = Math.max(1, Number(node.widgets.find(w => w.name === "max_images").value));
            const reserved = backgroundIsConnected ? 1 : 0;
            const available = Math.max(0, maximum - reserved);
            const selected = imageSelect.value;
            addButton.disabled = !imagePicker.hasValue(selected) || selected === "(none)" || paths.includes(selected) || paths.length >= available;
            countLabel.textContent = `${Math.min(paths.length, available) + reserved} / ${maximum} images${reserved ? " · background uses 1 slot" : ""}${paths.length > available ? ` · ${paths.length - available} gallery images excluded by limit` : ""}`;
            node._imageCount = Math.min(paths.length, available) + reserved;
            notifyConnectedNodes(node._imageCount);
            return available;
        }
        function enforceCapacity() {
            const available = updateCapacity();
            const paths = getPaths();
            if (paths.length > available) setWidgetValue(paths.slice(0, available));
        }
        addButton.onclick = () => {
            const paths = getPaths(), path = imageSelect.value;
            if (!imagePicker.hasValue(path) || path === "(none)" || paths.includes(path) || paths.length >= updateCapacity()) return;
            setWidgetValue([...paths, path]);
        };
        function setWidgetValue(newPathsArray, isRearranging = false) {
            if (!pathsWidget) return;
            const val = [...new Set(newPathsArray)].join("\n");

            const tempCallback = pathsWidget.callback;
            pathsWidget.callback = null;
            pathsWidget.value = val;
            if (oldCallback) oldCallback.apply(pathsWidget, [val]);
            pathsWidget.callback = tempCallback;

            refreshGallery(isRearranging);
            app.graph?.change();
            node.setDirtyCanvas(true, true);
        }

        function notifyConnectedNodes(imageCount) {
            if (!node.outputs) return;
            for (const [index, output] of node.outputs.entries()) {
                if (!output.links) continue;
                for (const linkId of output.links) {
                    const link = app.graph.links[linkId];
                    if (!link) continue;
                    const targetNode = app.graph.getNodeById(link.target_id);
                    if (targetNode && typeof targetNode._syncImageCount === "function") {
                        targetNode._syncImageCount(index < 2 ? imageCount : Number(index - 2 < imageCount));
                    }
                }
            }
        }

        function optimizeGrid(gridW, gridH) {
            const paths = getPaths();
            const count = paths.length;

            if (count === 0) {
                grid.style.gridTemplateColumns = `repeat(auto-fit, minmax(${MIN_TILE_SIZE}px, 1fr))`;
                grid.style.gridAutoRows = "max-content";
                return;
            }

            if (gridW <= 0 || gridH <= 0) return;

            let bestSize = 0;
            let bestCols = 1;

            for (let cols = 1; cols <= count; cols++) {
                const rows = Math.ceil(count / cols);
                const maxW = Math.max(5, (gridW - (cols - 1) * GRID_GAP) / cols);
                const maxH = Math.max(5, (gridH - (rows - 1) * GRID_GAP) / rows);
                const size = Math.min(maxW, maxH);

                // Favor more columns when multiple layouts yield nearly the same tile size.
                if (size >= bestSize - 0.1) {
                    bestSize = size;
                    bestCols = cols;
                }
            }

            if (bestSize < MIN_TILE_SIZE) {
                bestCols = Math.min(count, Math.max(1, Math.floor((gridW + GRID_GAP) / (MIN_TILE_SIZE + GRID_GAP))));
                bestSize = (gridW - (bestCols - 1) * GRID_GAP) / bestCols;
                bestSize = Math.min(bestSize, MIN_TILE_SIZE);
            }
            bestSize = Math.max(MIN_TILE_SIZE, Math.floor(bestSize));
            const rows = Math.ceil(count / bestCols);
            grid.style.alignContent = rows * bestSize + (rows - 1) * GRID_GAP <= gridH ? "center" : "start";
            grid.style.gridTemplateColumns = `repeat(${bestCols}, ${bestSize}px)`;
            grid.style.gridAutoRows = `${bestSize}px`;
        }

        function enforceV3CSS() {
            if (!checkIsV3() || !v3NodeElement) return;
            const { absoluteMinHeight } = getNodeMetrics();
            v3NodeElement.style.removeProperty("min-width");
            v3NodeElement.style.setProperty("min-height", `${absoluteMinHeight}px`, "important");

        }

        function syncLayoutToNode() {
            const nodeWidth = node.size?.[0] || 220;
            const targetWidth = Math.max(10, nodeWidth - 30);
            container.style.width = `${targetWidth}px`;
            container.style.maxWidth = `${targetWidth}px`;
            container.style.boxSizing = "border-box";
        }

        function updateLayout() {
            if (isLayouting) return;
            isLayouting = true;

            const { minW, paddingBottom, galleryY, absoluteMinHeight } = getNodeMetrics();
            node.min_size = [minW, absoluteMinHeight];
            enforceV3CSS();

            let targetW = Math.max(node.size?.[0] || minW, minW);
            let targetH = node.size?.[1] || absoluteMinHeight;
            targetH = Math.max(targetH, absoluteMinHeight);

            if ((node.size?.[0] || 0) !== targetW || (node.size?.[1] || 0) !== targetH) {
                node.setSize([targetW, targetH]);
                app.graph.setDirtyCanvas(true, true);
            }

            const availableGalleryHeight = targetH - galleryY - paddingBottom;
            container.style.height = `${availableGalleryHeight}px`;
            isLayouting = false;
        }
        
        function createThumbItem(path, index, paths) {
            const item = document.createElement("div");
            item.dataset.path = path;
            item.draggable = true;
            item.style.cssText = `
                position: relative;
                box-sizing: border-box;
                min-width: ${MIN_TILE_SIZE}px;
                min-height: ${MIN_TILE_SIZE}px;
                width: 100%;
                height: 100%;
                aspect-ratio: 1 / 1;
                background: #000000;
                border-radius: 4px;
                border: 1px solid #444;
                overflow: hidden;
                cursor: grab;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            const imgpath = path;
            const img = document.createElement("img");
            const slash = imgpath.lastIndexOf("/");
            const params = new URLSearchParams({ filename: imgpath.slice(slash + 1), subfolder: slash < 0 ? "" : imgpath.slice(0, slash), type: "input" });
            img.src = api.apiURL(`/view?${params}`);
            img.draggable = false;
            img.style.cssText = "max-width:100%; max-height:100%; object-fit:contain; pointer-events:auto; display:block;";

            const del = document.createElement("div");
            del.innerHTML = "×";
            del.title = "Remove this image from the gallery.";
            del.style.cssText = `
                position: absolute; top: 0; right: 0;
                background: #cc2222; color: white;
                width: 18px; height: 18px;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; cursor: pointer; z-index: 10;
                font-family: Arial, sans-serif; font-weight: bold;
                line-height: 1; border-bottom-left-radius: 4px;
                transition: background 0.2s;
            `;
            del.onmouseenter = () => { del.style.background = "#ff3333"; };
            del.onmouseleave = () => { del.style.background = "#cc2222"; };
            del.onclick = (e) => {
                e.stopPropagation();
                setWidgetValue(paths.filter((_, i) => i !== index), false);
            };
            
            const numBadge = document.createElement("div");
            numBadge.innerText = String(index + 1);
            numBadge.style.cssText = `
                position: absolute; bottom: 0; left: 0;
                background: rgba(0, 0, 0, 0.75); color: #fff;
                padding: 2px 6px; font-size: 11px; font-family: sans-serif;
                font-weight: bold; border-top-right-radius: 4px; pointer-events: none;
                z-index: 5;
            `;

            item.addEventListener("contextmenu", (e) => e.stopPropagation());

            item.ondragstart = (e) => {
                draggedNode = item;
                e.dataTransfer.setData("text/plain", path);
                e.dataTransfer.effectAllowed = "move";

                // Delay styling until drag has officially started, otherwise some browsers
                // snapshot the placeholder styling instead of the original thumbnail.
                setTimeout(() => {
                    if (draggedNode !== item) return;
                    item.style.background = "transparent";
                    item.style.border = "2px dashed #666";
                    Array.from(item.children).forEach((c) => { c.style.opacity = "0"; });
                }, 0);
            };

            item.ondragend = () => {
                if (!draggedNode) return;
                draggedNode.style.background = "#000000";
                draggedNode.style.border = "1px solid #444";
                Array.from(draggedNode.children).forEach((c) => { c.style.opacity = "1"; });
                draggedNode = null;

                const newPaths = Array.from(grid.children).map((n) => n.dataset.path);
                const currentVal = (pathsWidget?.value || "").trim();
                if (newPaths.join("\n") !== currentVal) {
                    setWidgetValue(newPaths, true);
                }
            };

            item.ondragover = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!draggedNode || draggedNode === item) return;

                const distMoved = Math.hypot(e.clientX - lastSwapX, e.clientY - lastSwapY);
                if (Date.now() - lastSwapTime < SWAP_THROTTLE_MS && distMoved < SWAP_MOVE_THRESHOLD) return;

                const itemRect = item.getBoundingClientRect();
                const bufferX = itemRect.width * 0.25;
                const bufferY = itemRect.height * 0.25;
                if (
                    e.clientX < itemRect.left + bufferX ||
                    e.clientX > itemRect.right - bufferX ||
                    e.clientY < itemRect.top + bufferY ||
                    e.clientY > itemRect.bottom - bufferY
                ) {
                    return;
                }

                const items = Array.from(grid.children);
                const draggedIdx = items.indexOf(draggedNode);
                const targetIdx = items.indexOf(item);
                if (draggedIdx < targetIdx) {
                    grid.insertBefore(draggedNode, item.nextSibling);
                } else {
                    grid.insertBefore(draggedNode, item);
                }

                lastSwapX = e.clientX;
                lastSwapY = e.clientY;
                lastSwapTime = Date.now();
            };

            item.ondrop = (e) => {
                e.preventDefault();
                e.stopPropagation();
            };

            item.appendChild(img);
            item.appendChild(del);
            item.appendChild(numBadge);
            return item;
        }

        function refreshGallery(isRearranging = false) {
            grid.innerHTML = "";
            const paths = getPaths();

            updateCapacity();

            paths.forEach((path, index) => {
                grid.appendChild(createThumbItem(path, index, paths));
            });

            if (!isRearranging) {
                requestAnimationFrame(() => {
                    updateLayout();
                    if (gridWrapper.offsetWidth > 0) {
                        optimizeGrid(gridWrapper.clientWidth, gridWrapper.clientHeight);
                    }
                });
            }
        }

        function installNodeHooks() {
            node.syncLayoutToNode = syncLayoutToNode;

            galleryWidget.computeSize = function () {
                const { minW } = getNodeMetrics();
                return [minW - 30, MIN_GALLERY_HEIGHT];
            };

            const origOnResize = node.onResize;
            node.onResize = function(size) {
                const { minW, paddingBottom, galleryY, absoluteMinHeight } = getNodeMetrics();
                size[0] = Math.max(size[0], minW);
                size[1] = Math.max(size[1], absoluteMinHeight);
                if (origOnResize) origOnResize.call(this, size);
                if (this.syncLayoutToNode) this.syncLayoutToNode();
                if (isLayouting) return;
                this.min_size = [minW, absoluteMinHeight];
                enforceV3CSS();
                container.style.height = `${size[1] - galleryY - paddingBottom}px`;
            };

            const origOnConfigure = node.onConfigure;
            node.onConfigure = function(info) {
                const savedSize = info?.size ? [...info.size] : [...this.size];
                const out = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
                this.setSize(savedSize);
                setTimeout(() => {
                    if (this.syncLayoutToNode) this.syncLayoutToNode();
                    backgroundIsConnected = node.inputs?.some(input => input.name === "background" && input.link != null) || false;
                    syncImageOptions(); syncImageOutputs(); enforceCapacity(); refreshGallery();
                }, 0);
                return out;
            };

            const origComputeSize = node.computeSize;
            node.computeSize = function(out) {
                const { minW, absoluteMinHeight } = getNodeMetrics();
                const res = origComputeSize ? origComputeSize.apply(this, arguments) : [minW, MIN_GALLERY_HEIGHT];
                this.min_size = [minW, absoluteMinHeight];
                res[0] = Math.max(res[0], minW);
                res[1] = Math.max(res[1], absoluteMinHeight);
                enforceV3CSS();
                return res;
            };

            const origSetSize = node.setSize;
            node.setSize = function(size) {
                const { minW, absoluteMinHeight } = getNodeMetrics();
                size[0] = Math.max(size[0], minW);
                size[1] = Math.max(size[1], absoluteMinHeight);
                if (origSetSize) {
                    origSetSize.call(this, size);
                } else {
                    this.size = size;
                }
                enforceV3CSS();
            };

            const origOnRemoved = node.onRemoved;
            node.onRemoved = function() {
                resizeObserver.disconnect();
                if (origOnRemoved) origOnRemoved.apply(this, arguments);
            };

        }

        const resizeObserver = new ResizeObserver((entries) => {
            enforceV3CSS();
            for (const entry of entries) {
                const w = Math.round(entry.contentRect.width);
                const h = Math.round(entry.contentRect.height);
                if (Math.abs(w - lastObservedWidth) > 1 || Math.abs(h - lastObservedHeight) > 1) {
                    lastObservedWidth = w;
                    lastObservedHeight = h;
                    if (h > 0) optimizeGrid(w, h);
                }
            }
        });

        removeAllBtn.onclick = () => setWidgetValue([], false);
        const maxWidget = node.widgets.find(w => w.name === "max_images");
        const maxChanged = maxWidget.callback;
        maxWidget.callback = function () { maxChanged?.apply(this, arguments); syncImageOutputs(); enforceCapacity(); updateLayout(); };
        const connectionsChanged = node.onConnectionsChange;
        node.onConnectionsChange = function (type, slot, connected) {
            connectionsChanged?.apply(this, arguments);
            if (type === 1 && node.inputs?.[slot]?.name === "background") {
                backgroundIsConnected = connected;
                enforceCapacity();
            }
        };
        hidePathsWidget();
        syncImageOutputs();
        installNodeHooks();
        resizeObserver.observe(gridWrapper);

        if (pathsWidget) {
            pathsWidget.callback = (v) => {
                if (oldCallback) oldCallback.apply(pathsWidget, [v]);
                refreshGallery();
            };
        }

        installImageComboRefresh(node, imageWidget, () => { syncImageOptions(); updateCapacity(); });
        installImageDrop(node, container, {
            widget: imageWidget,
            canAdd: () => getPaths().length < updateCapacity(),
            added: path => {
                imageWidget.value = path;
                syncImageOptions();
                const paths = getPaths();
                if (!paths.includes(path) && paths.length < updateCapacity()) setWidgetValue([...paths, path]);
                updateCapacity();
            },
            error: message => { countLabel.textContent = message; },
        });
        enforceCapacity();
        refreshGallery();
        setTimeout(() => {
            refreshGallery();
            node.syncLayoutToNode();
        }, 100);
    },
});
