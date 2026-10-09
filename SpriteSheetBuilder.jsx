/* Sprite Sheet Builder 1.8 | AE 2025 | UTF-8 | ES3 / ExtendScript */
(function (host) {
    // CORE_BEGIN: host-independent planning, exercised by tests/core.test.cjs.
    var Core = (function () {
        function integer(value, label, min, max) {
            var n = Number(value);
            if (!isFinite(n) || n !== Math.floor(n) || n < min || n > max) {
                throw new Error(label + "必须是 " + min + "～" + max + " 的整数。");
            }
            return n;
        }
        function sourceRange(source, options) {
            var fd = Number(source.frameDuration), duration = Number(source.duration);
            if (!isFinite(fd) || fd <= 0 || !isFinite(duration) || duration <= 0) {
                throw new Error("源合成的帧率或时长无效。");
            }
            var total = Math.ceil(duration / fd - 0.000001), first = 0, last = total;
            if (options.rangeMode === "custom") {
                first = integer(options.rangeStartFrame, "起始源帧", 0, total - 1);
                last = integer(options.rangeEndFrame, "结束源帧", first, total - 1) + 1;
            } else if (options.rangeMode === "work" || options.workArea) {
                var start = Number(source.workAreaStart), end = start + Number(source.workAreaDuration);
                if (!isFinite(start) || !isFinite(end) || start < 0 || end > duration + fd / 1000 || end <= start) {
                    throw new Error("工作区范围无效。");
                }
                first = Math.ceil(start / fd - 0.000001);
                last = Math.ceil(Math.min(end, duration) / fd - 0.000001);
            }
            if (last <= first) { throw new Error("抽取范围中没有可用源帧。"); }
            return {firstFrame: first, endFrameExclusive: last, available: last - first};
        }
        function sampling(source, options) {
            var range = sourceRange(source, options), fd = Number(source.frameDuration);
            var first = range.firstFrame, lastExclusive = range.endFrameExclusive, available = range.available;
            var count = integer(options.count, "抽取帧数", 1, 1024);
            if (count > available) {
                throw new Error("所选范围只有 " + available + " 个源帧，不能抽取 " + count + " 个不同帧。");
            }
            var samples = [], i, index;
            for (i = 0; i < count; i++) {
                index = first + (count === 1 ? 0 : Math.floor(i * (available - 1) / (count - 1) + 0.000001));
                if (index >= lastExclusive) { throw new Error("抽帧时间超出范围。"); }
                samples.push({index: i, sourceFrame: index, time: index * fd});
            }
            return {count: count, samplingMode: "uniform",
                requestedFPS: count / (available * fd), sourceFrameInterval: null,
                firstFrame: first, endFrameExclusive: lastExclusive,
                rangeStart: first * fd, rangeEnd: lastExclusive * fd,
                playbackDuration: available * fd, samples: samples};
        }
        function plan(source, options) {
            var p = sampling(source, options);
            p.cols = integer(options.cols, "列数", 1, 64);
            p.rows = integer(options.rows, "行数", 1, 64);
            p.tile = integer(options.tile, "单帧宽度", 16, 4096);
            p.tileHeight = integer(options.tileHeight === undefined ? options.tile : options.tileHeight, "单帧高度", 16, 4096);
            p.padding = integer(options.padding, "每侧留白", 0, 128);
            p.gapX = integer(options.gapX === undefined ? 0 : options.gapX, "水平帧间隙", 0, 4096);
            p.gapY = integer(options.gapY === undefined ? p.gapX : options.gapY, "垂直帧间隙", 0, 4096);
            p.cell = p.tile + p.padding * 2 + p.gapX;
            p.cellHeight = p.tileHeight + p.padding * 2 + p.gapY;
            p.width = p.cols * (p.tile + p.padding * 2) + Math.max(0, p.cols - 1) * p.gapX;
            p.height = p.rows * (p.tileHeight + p.padding * 2) + Math.max(0, p.rows - 1) * p.gapY;
            if (p.count > p.cols * p.rows) { throw new Error("抽取 " + p.count + " 帧，超过格子数量。请增加行数。"); }
            if (p.width > 8192 || p.height > 8192) { throw new Error("图集宽或高超过 8192。请减小单帧尺寸、行列数或留白。"); }
            for (var i = 0; i < p.count; i++) {
                var s = p.samples[i];
                s.col = i % p.cols; s.row = Math.floor(i / p.cols);
                s.x = s.col * (p.tile + p.padding * 2 + p.gapX) + p.padding;
                s.y = s.row * (p.tileHeight + p.padding * 2 + p.gapY) + p.padding;
            }
            return p;
        }
        function nextPowerOfTwo(n) { var result = 16; while (result < n) { result *= 2; } return result; }
        function summarize(frames, width, height, margin, cols, padding) {
            width = integer(width, "检测宽度", 1, 30000);
            height = integer(height, "检测高度", 1, 30000);
            margin = integer(margin, "安全余量", 0, 1024);
            cols = integer(cols, "列数", 1, 64);
            padding = integer(padding, "留白", 0, 128);
            var left = width, top = height, right = 0, bottom = 0;
            var maxWidth = 0, maxHeight = 0, nonempty = 0, touchesEdge = false;
            for (var i = 0; i < frames.length; i++) {
                var f = frames[i];
                if (f.width !== width || f.height !== height) { throw new Error("检测帧尺寸不一致。"); }
                if (f.left === -1 && f.top === -1 && f.right === -1 && f.bottom === -1) { continue; }
                integer(f.left, "左边界", 0, width - 1); integer(f.top, "上边界", 0, height - 1);
                integer(f.right, "右边界", f.left + 1, width); integer(f.bottom, "下边界", f.top + 1, height);
                nonempty++;
                left = Math.min(left, f.left); top = Math.min(top, f.top);
                right = Math.max(right, f.right); bottom = Math.max(bottom, f.bottom);
                maxWidth = Math.max(maxWidth, f.right - f.left); maxHeight = Math.max(maxHeight, f.bottom - f.top);
                if (f.left === 0 || f.top === 0 || f.right === width || f.bottom === height) { touchesEdge = true; }
            }
            if (!nonempty) { throw new Error("未检测到有效内容。请降低阈值，或切换透明 / 黑底检测方式。"); }
            var crop = {left: Math.max(0, left - margin), top: Math.max(0, top - margin),
                right: Math.min(width, right + margin), bottom: Math.min(height, bottom + margin)};
            crop.width = crop.right - crop.left; crop.height = crop.bottom - crop.top;
            // AE compositions require at least four pixels in each dimension.
            if (crop.width < 4) { crop.right = Math.min(width, crop.left + 4); crop.left = Math.max(0, crop.right - 4); }
            if (crop.height < 4) { crop.bottom = Math.min(height, crop.top + 4); crop.top = Math.max(0, crop.bottom - 4); }
            crop.width = crop.right - crop.left; crop.height = crop.bottom - crop.top;
            var tightRows = Math.ceil(frames.length / cols);
            function gridPower(n) { var v = 1; while (v < n) { v *= 2; } return v; }
            var suggestedCols = gridPower(Math.max(cols, Math.ceil(frames.length / 64)));
            var rows = gridPower(Math.ceil(frames.length / suggestedCols));
            // Round the whole cell (including padding), ensuring atlas axes are powers of two when grid axes are.
            var cellWidth = nextPowerOfTwo(Math.max(16, crop.width) + padding * 2);
            var cellHeight = nextPowerOfTwo(Math.max(16, crop.height) + padding * 2);
            return {maxFrameWidth: maxWidth, maxFrameHeight: maxHeight,
                union: {left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top},
                crop: crop, nonemptyFrames: nonempty, emptyFrames: frames.length - nonempty,
                touchesSourceEdge: touchesEdge, columns: suggestedCols, rows: rows,
                tightColumns: cols, tightRows: tightRows, count: frames.length,
                tightSheetWidth: cols * (Math.max(16, crop.width) + padding * 2),
                tightSheetHeight: tightRows * (Math.max(16, crop.height) + padding * 2),
                suggestedTileWidth: cellWidth - padding * 2, suggestedTileHeight: cellHeight - padding * 2,
                suggestedSheetWidth: suggestedCols * cellWidth, suggestedSheetHeight: rows * cellHeight};
        }
        // Detect an exact thresholded bounding box from nonnegative region averages.
        // A region whose SUM is <= threshold cannot contain an above-threshold pixel.
        // Ambiguous regions are subdivided; do not mistake an average for a pixel maximum.
        function scanBounds(sample, width, height, threshold, maxQueries) {
            var queries = 0, cache = {};
            function has(l, t, r, b) {
                var key = l + "," + t + "," + r + "," + b;
                if (cache[key] !== undefined) { return cache[key]; }
                if (++queries > maxQueries) { throw new Error("SSB_SCAN_LIMIT"); }
                var area = (r - l) * (b - t), v = sample(l, t, r, b), found, mid;
                if (!isFinite(v) || v < 0) { throw new Error("SSB_INVALID_SAMPLE"); }
                if (v > threshold) { found = true; }
                else if (v * area <= threshold || area === 1) { found = false; }
                else if (r - l >= b - t) {
                    mid = Math.floor((l + r) / 2);
                    found = has(l, t, mid, b) || has(mid, t, r, b);
                } else {
                    mid = Math.floor((t + b) / 2);
                    found = has(l, t, r, mid) || has(l, mid, r, b);
                }
                cache[key] = found; return found;
            }
            if (!has(0, 0, width, height)) { return [-1, -1, -1, -1]; }
            var lo = 0, hi = width, mid;
            while (hi - lo > 1) { mid = Math.floor((lo + hi) / 2); if (has(lo, 0, mid, height)) { hi = mid; } else { lo = mid; } }
            var left = lo; lo = left; hi = width;
            while (hi - lo > 1) { mid = Math.floor((lo + hi) / 2); if (has(mid, 0, hi, height)) { lo = mid; } else { hi = mid; } }
            var right = hi; lo = 0; hi = height;
            while (hi - lo > 1) { mid = Math.floor((lo + hi) / 2); if (has(left, lo, right, mid)) { hi = mid; } else { lo = mid; } }
            var top = lo; lo = top; hi = height;
            while (hi - lo > 1) { mid = Math.floor((lo + hi) / 2); if (has(left, mid, right, hi)) { lo = mid; } else { hi = mid; } }
            return [left, top, right, hi];
        }
        function nativeExpression(width, height, threshold, black) {
            return "var scan = " + scanBounds.toString() + ";\n" +
                'var L = thisComp.layer("__SSB_Source__");\n' +
                'function read(l,t,r,b) { var c=L.sampleImage([(l+r-1)/2,(t+b-1)/2],[(r-l)/2,(b-t)/2],true,time); ' +
                (black ? 'return Math.max(0,(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])*c[3]);' : 'return Math.max(0,c[3]);') +
                '}\nvar result; try { result=scan(read,' + width + ',' + height + ',' + threshold + ',2048).join(","); } catch(e) { result="ERROR:"+e.toString(); }\nresult;';
        }
        function budget(crop, count, available, width, height, padding, powerGrid, maximize) {
            width = integer(width, "图集宽度上限", 16, 8192);
            height = integer(height, "图集高度上限", 16, 8192);
            padding = integer(padding, "留白", 0, 128);
            count = integer(count, "帧数", 1, 1024);
            var best = null, nativeCapacity = 0;
            function power(n) { return (n & (n - 1)) === 0; }
            for (var c = 1; c <= 64; c++) {
                if (powerGrid && !power(c)) { continue; }
                for (var r = 1; r <= 64; r++) {
                    if (powerGrid && !power(r)) { continue; }
                    var tw = Math.floor(width / c) - padding * 2, th = Math.floor(height / r) - padding * 2;
                    if (tw < 16 || th < 16 || tw > 4096 || th > 4096) { continue; }
                    var capacity = Math.min(1024, available, c * r);
                    var scale = Math.min(1, tw / crop.width, th / crop.height);
                    if (scale >= 1) { nativeCapacity = Math.max(nativeCapacity, capacity); }
                    if (maximize ? scale < 1 : c * r < count) { continue; }
                    var n = maximize ? capacity : count;
                    var candidate = {cols: c, rows: r, count: n, tile: tw, tileHeight: th,
                        width: c * (tw + padding * 2), height: r * (th + padding * 2),
                        scale: scale, unused: c * r - n};
                    if (!best || (maximize && n > best.count) ||
                        ((!maximize || n === best.count) && (scale > best.scale + 0.0000001 ||
                        (Math.abs(scale - best.scale) < 0.0000001 && (candidate.unused < best.unused ||
                        (candidate.unused === best.unused && Math.abs(tw / th - crop.width / crop.height) < Math.abs(best.tile / best.tileHeight - crop.width / crop.height))))))) { best = candidate; }
                }
            }
            if (!best) { throw new Error(maximize ? "目标图集无法以原像素大小容纳一帧。请增大图集上限，或改用指定帧数模式允许缩小。" : "目标图集无法容纳指定帧数和留白。请减少帧数或增大图集上限。"); }
            best.nativeCapacity = nativeCapacity;
            return best;
        }
        function solve(source, request) {
            var tw = integer(request.tile, "单帧宽度", 16, 4096);
            var th = integer(request.tileHeight, "单帧高度", 16, 4096);
            var opt = {rangeMode: request.rangeMode || "all", rangeStartFrame: request.rangeStartFrame,
                rangeEndFrame: request.rangeEndFrame};
            var range = sourceRange(source, opt), available = Math.min(range.available, 1024);
            var c, r, count, layout = null, aw, ah;
            var requestedCols = null, requestedRows = null;
            if (request.layoutMode === "grid") {
                requestedCols = integer(request.cols, "列数", 1, 64);
                requestedRows = integer(request.rows, "行数", 1, 64);
                aw = requestedCols * tw; ah = requestedRows * th;
                if (request.powerOfTwo) { aw = nextPowerOfTwo(aw); ah = nextPowerOfTwo(ah); }
                if (aw > 8192 || ah > 8192) { throw new Error("最终图集超过 8192 像素，请减小单帧尺寸或行列数。"); }
                if (requestedCols * requestedRows <= available) {
                    layout = {cols: requestedCols, rows: requestedRows, count: Math.min(available, requestedCols * requestedRows)};
                }
            } else if (request.layoutMode === "dense") {
                aw = integer(request.atlasWidth, "图集宽度", 16, 8192);
                ah = integer(request.atlasHeight, "图集高度", 16, 8192);
            } else { throw new Error("请选择指定行列数或按指定图集尺寸排布。"); }
            if (!layout) {
                // Filled grids must contain a distinct sampled source frame in every cell.
                var maxC = requestedCols || Math.min(64, Math.floor(aw / tw));
                var maxR = requestedRows || Math.min(64, Math.floor(ah / th));
                for (c = 1; c <= maxC; c++) {
                    for (r = 1; r <= maxR; r++) {
                        var cells = c * r;
                        if (cells > available) { continue; }
                        count = Math.min(available, cells);
                        var empty = cells - count;
                        var shape = Math.abs(Math.log((aw / c / (ah / r)) / (tw / th)));
                        if (!layout || count > layout.count || (count === layout.count &&
                            (empty < layout.empty || (empty === layout.empty && shape < layout.shape - 0.000001)))) {
                            layout = {cols: c, rows: r, count: count, empty: empty, shape: shape};
                        }
                    }
                }
            }
            if (!layout) { throw new Error("指定图集尺寸放不下一帧，请缩小单帧尺寸或增大图集宽高。"); }
            opt.cols = layout.cols; opt.rows = layout.rows; opt.count = layout.count;
            opt.tile = tw; opt.tileHeight = th; opt.padding = 0;
            var p = plan(source, opt);
            p.layoutMode = request.layoutMode; p.selectedConstraint = request.layoutMode;
            p.fillMode = "filled"; p.rangeMode = opt.rangeMode;
            p.availableSourceFrames = range.available;
            p.requestedColumns = requestedCols; p.requestedRows = requestedRows;
            p.gridAdjusted = requestedCols !== null && (requestedCols !== p.cols || requestedRows !== p.rows);
            p.emptyCells = p.cols * p.rows - p.count;
            p.powerOfTwo = request.layoutMode === "grid" && request.powerOfTwo === true;
            // Keep identical UE cells and the exact specified atlas extent, including fractional spacing.
            p.width = request.layoutMode === "dense" ? aw : (p.powerOfTwo ? nextPowerOfTwo(p.cols * tw) : p.cols * tw);
            p.height = request.layoutMode === "dense" ? ah : (p.powerOfTwo ? nextPowerOfTwo(p.rows * th) : p.rows * th);
            p.cellWidth = p.width / p.cols; p.cellHeight = p.height / p.rows; p.cell = p.cellWidth;
            p.gapX = p.cellWidth - tw; p.gapY = p.cellHeight - th;
            p.targetAtlasWidth = aw; p.targetAtlasHeight = ah;
            p.unusedBudgetWidth = aw - p.width; p.unusedBudgetHeight = ah - p.height;
            for (var j = 0; j < p.count; j++) {
                p.samples[j].x = (p.samples[j].col + 0.5) * p.cellWidth - tw / 2;
                p.samples[j].y = (p.samples[j].row + 0.5) * p.cellHeight - th / 2;
            }
            p.samplingMode = "uniform"; p.effectiveFPS = p.count / p.playbackDuration;
            p.minimumGap = 0; p.maximumGap = 0;
            if (p.count > 1) {
                p.minimumGap = 1000000000;
                for (var i = 1; i < p.count; i++) {
                    var gap = p.samples[i].sourceFrame - p.samples[i - 1].sourceFrame;
                    p.minimumGap = Math.min(p.minimumGap, gap); p.maximumGap = Math.max(p.maximumGap, gap);
                }
            }
            return p;
        }
        function json(value) {
            function quote(s) {
                return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
                    .replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t")
                    .replace(/[\x00-\x1f]/g, function (c) {
                        return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
                    }) + '"';
            }
            if (value === null) { return "null"; }
            var kind = typeof value, parts = [], i, key;
            if (kind === "string") { return quote(value); }
            if (kind === "number") { return isFinite(value) ? String(value) : "null"; }
            if (kind === "boolean") { return value ? "true" : "false"; }
            if (value instanceof Array) {
                for (i = 0; i < value.length; i++) { parts.push(json(value[i])); }
                return "[" + parts.join(",") + "]";
            }
            for (key in value) {
                if (value.hasOwnProperty(key)) { parts.push(quote(key) + ":" + json(value[key])); }
            }
            return "{" + parts.join(",") + "}";
        }
        return {plan: plan, sampling: sampling, summarize: summarize, json: json,
            scanBounds: scanBounds, nativeExpression: nativeExpression, budget: budget, solve: solve};
    }());
    // CORE_END

    var VERSION = "1.8.0", source = null, busy = false, analysis = null, detected = false;
    var ui = (host instanceof Panel) ? host : new Window("palette", "Sprite Sheet Builder", undefined, {resizeable: true});
    ui.orientation = "column"; ui.alignChildren = ["fill", "top"]; ui.spacing = 8; ui.margins = 12;
    ui.add("statictext", undefined, "Sprite Sheet Builder 1.8 · AE 2025");
    var read = ui.add("button", undefined, "① 读取当前素材合成");
    var sourceText = ui.add("statictext", undefined, "请先读取当前素材合成。", {multiline: true});
    sourceText.preferredSize = [390, 55];
    var tabs = ui.add("tabbedpanel");
    var detectTab = tabs.add("tab", undefined, "② 内容范围检测");
    var setupTab = tabs.add("tab", undefined, "③ 尺寸与排列");
    var exportTab = tabs.add("tab", undefined, "④ 生成与导出");
    setupTab.orientation = detectTab.orientation = exportTab.orientation = "column";
    setupTab.alignChildren = detectTab.alignChildren = exportTab.alignChildren = ["fill", "top"];
    tabs.alignment = ["fill", "fill"]; tabs.preferredSize = [710, 570]; tabs.minimumSize = [680, 300];
    setupTab.alignChildren = ["fill", "fill"];
    var setupViewport = setupTab.add("group"); setupViewport.alignment = ["fill", "fill"];
    setupViewport.preferredSize = [690, 490]; setupViewport.minimumSize = [650, 180];
    setupViewport.margins = 0;
    // Clip only the content, keeping the scrollbar and footer stationary.
    // A custom layout prevents the full content height from enlarging the window.
    var setupClip = setupViewport.add("group"); setupClip.margins = 0;
    var setupContent = setupClip.add("group"); setupContent.orientation = "column";
    setupContent.alignChildren = ["fill", "top"]; setupContent.spacing = 10; setupContent.margins = 4;
    var setupScrollbar = setupViewport.add("scrollbar", undefined, 0, 0, 1);
    setupScrollbar.stepdelta = 36; setupScrollbar.helpTip = "上下拖动，查看全部尺寸、排列和范围设置";
    var setupHeight = 1;
    function dimension(control, axis, fallback) {
        var n = control.size ? Number(control.size[axis]) : 0;
        return isFinite(n) && n > 0 ? n : fallback;
    }
    function scrollSetup() {
        var offset = Math.max(0, Math.min(Number(setupScrollbar.value) || 0, setupScrollbar.maxvalue));
        setupScrollbar.value = offset;
        setupContent.location = [0, -Math.round(offset)];
    }
    function resizeSetup() {
        var w = dimension(setupViewport, "width", 690), h = dimension(setupViewport, "height", 490);
        setupClip.bounds = [0, 0, w - 24, h];
        setupScrollbar.bounds = [w - 18, 0, w, h];
        setupContent.size = [w - 24, setupHeight];
        setupContent.layout.resize();
        setupScrollbar.maxvalue = Math.max(0, setupHeight - h);
        setupScrollbar.enabled = setupScrollbar.maxvalue > 0;
        setupScrollbar.jumpdelta = Math.max(36, h - 36);
        scrollSetup();
    }
    setupClip.layout = {layout: function () {}, resize: function () {}};
    setupViewport.layout = {
        layout: function () {
            setupContent.layout.layout(true);
            setupHeight = dimension(setupContent, "height", 1300);
            resizeSetup();
        },
        resize: resizeSetup
    };
    setupScrollbar.onChanging = setupScrollbar.onChange = scrollSetup;
    function panel(parent, title) {
        var p = parent.add("panel", undefined, title); p.orientation = "column"; p.alignChildren = ["fill", "top"]; return p;
    }
    function field(parent, label, initial) {
        var row = parent.add("group"), text = row.add("statictext", undefined, label);
        text.preferredSize.width = 130;
        var input = row.add("edittext", undefined, initial); input.characters = 12; return input;
    }
    var currentPreview = null;
    var colors = {blue: [0.35, 0.72, 1, 1], green: [0.4, 0.9, 0.62, 1],
        amber: [1, 0.75, 0.35, 1], red: [1, 0.45, 0.4, 1], muted: [0.74, 0.78, 0.84, 1]};
    function tint(control, rgba) {
        try { control.graphics.foregroundColor = control.graphics.newPen(control.graphics.PenType.SOLID_COLOR, rgba, 1); } catch (ignored) {}
    }
    function emphasize(control, color) {
        tint(control, color);
        try { control.graphics.font = ScriptUI.newFont(control.graphics.font.name, "BOLD", 18); } catch (ignored) {}
    }
    var sizing = panel(setupContent, "选择内容尺寸计算基准");
    var basisRadios = sizing.add("group"); basisRadios.orientation = "column";
    var rawBasis = basisRadios.add("radiobutton", undefined, "素材原始尺寸");
    var contentBasis = basisRadios.add("radiobutton", undefined, "采用内容范围"); contentBasis.value = true;
    var referenceText = sizing.add("statictext", undefined, "基准：尚未读取");
    var tile = field(sizing, "单帧宽度（像素）", "512");
    var tileHeight = field(sizing, "单帧高度（像素）", "512");
    var scaleInput = field(sizing, "缩放（%）", "100");
    var aspect = sizing.add("checkbox", undefined, "修改宽高时保持素材比例"); aspect.value = true;
    var constraints = panel(setupContent, "排列方式");
    var layoutChoices = constraints.add("group"); layoutChoices.orientation = "row"; layoutChoices.alignChildren = ["fill", "top"];
    var gridPanel = layoutChoices.add("panel", undefined, "指定行列数"); gridPanel.orientation = "column"; gridPanel.alignChildren = ["fill", "top"];
    var gridMode = gridPanel.add("radiobutton", undefined, "使用指定行列数"); gridMode.value = true;
    var cols = field(gridPanel, "列数", "8");
    var rows = field(gridPanel, "行数", "8");
    var powerTwo = gridPanel.add("checkbox", undefined, "最终宽高扩大到 2 的 N 次方");
    powerTwo.helpTip = "扩大后的空间均匀分配到每格；单帧内容尺寸保持不变。";
    var densePanel = layoutChoices.add("panel", undefined, "按指定图集尺寸排布"); densePanel.orientation = "column"; densePanel.alignChildren = ["fill", "top"];
    var denseMode = densePanel.add("radiobutton", undefined, "使用指定图集尺寸");
    var atlasWidth = field(densePanel, "图集宽度", "2048");
    var atlasHeight = field(densePanel, "图集高度", "2048");
    constraints.add("statictext", undefined, "统一无空格铺满：每格一个有效帧，格子等大，间隙均匀；单帧内容尺寸不变。", {multiline: true});
    var rangePanel = panel(setupContent, "抽取范围");
    var rangeModes = rangePanel.add("group"); rangeModes.orientation = "row";
    var allRangeMode = rangeModes.add("radiobutton", undefined, "整个合成（默认）"); allRangeMode.value = true;
    var workRangeMode = rangeModes.add("radiobutton", undefined, "工作区范围");
    var customRangeMode = rangeModes.add("radiobutton", undefined, "自定义源帧范围");
    var rangeFields = rangePanel.add("group"); rangeFields.orientation = "row";
    var rangeStart = field(rangeFields, "起始源帧（含）", "0");
    var rangeEnd = field(rangeFields, "结束源帧（含）", "0");
    rangePanel.add("statictext", undefined, "帧编号从 0 开始。由排列确定帧数，均匀抽取；多帧时包含范围首末帧。", {multiline: true});
    var planCard = panel(setupContent, "预计算 · 排列示意");
    var metricRow = planCard.add("group"); metricRow.orientation = "row"; metricRow.alignChildren = ["fill", "top"];
    function metric(title, color) {
        var card = panel(metricRow, title); card.preferredSize.width = 195;
        var value = card.add("statictext", undefined, "—"); value.preferredSize = [180, 28];
        emphasize(value, color); return value;
    }
    var frameMetric = metric("有效帧数", colors.green);
    var gridMetric = metric("列 × 行", colors.blue);
    var atlasMetric = metric("最终图集（px）", colors.blue);
    var graphicRow = planCard.add("group"); graphicRow.orientation = "row"; graphicRow.alignChildren = ["fill", "top"];
    var gridPreview = graphicRow.add("group"); gridPreview.preferredSize = [250, 145];
    gridPreview.helpTip = "排列示意（非素材预览）：蓝色为单帧内容区域，格内深色为透明间隙。";
    var planDetails = graphicRow.add("group"); planDetails.orientation = "column"; planDetails.alignChildren = ["fill", "top"];
    var planAtlas = planDetails.add("statictext", undefined, "单帧：—\n格子：—", {multiline: true}); planAtlas.preferredSize = [360, 44];
    var planSpacing = planDetails.add("statictext", undefined, "间隙：—\n每侧留白：—", {multiline: true}); planSpacing.preferredSize = [360, 44];
    tint(planSpacing, colors.amber);
    var previewLegend = planDetails.add("statictext", undefined, "蓝色：单帧内容区域   深色：透明间隙\n顺序：从左到右、从上到下", {multiline: true}); previewLegend.preferredSize = [360, 42]; tint(previewLegend, colors.muted);
    var planRange = planCard.add("statictext", undefined, "抽取：—", {multiline: true}); planRange.preferredSize = [620, 42];
    var info = planCard.add("statictext", undefined, "先读取合成并完成内容检测。", {multiline: true}); info.preferredSize = [620, 48];
    function repaintPreview() {
        try { gridPreview.notify("onDraw"); } catch (ignored) {}
    }
    gridPreview.onDraw = function () {
        var g = this.graphics, w = dimension(this, "width", 250), h = dimension(this, "height", 145);
        var background = g.newBrush(g.BrushType.SOLID_COLOR, [0.1, 0.12, 0.15, 1]);
        var spacing = g.newBrush(g.BrushType.SOLID_COLOR, [0.16, 0.21, 0.28, 1]);
        var content = g.newBrush(g.BrushType.SOLID_COLOR, colors.blue);
        var border = g.newPen(g.PenType.SOLID_COLOR, [0.07, 0.09, 0.12, 1], 0.5);
        function rectangle(x, y, rw, rh, brush) {
            g.newPath(); g.rectPath(x, y, rw, rh); g.fillPath(brush);
        }
        rectangle(0, 0, w, h, background);
        var p = currentPreview;
        if (!p) { return; }
        var scale = Math.min((w - 12) / p.width, (h - 12) / p.height);
        var ox = (w - p.width * scale) / 2, oy = (h - p.height * scale) / 2;
        for (var i = 0; i < p.count; i++) {
            var col = i % p.cols, row = Math.floor(i / p.cols);
            var x = ox + col * p.cellWidth * scale, y = oy + row * p.cellHeight * scale;
            var cw = p.cellWidth * scale, ch = p.cellHeight * scale;
            rectangle(x, y, cw, ch, spacing);
            rectangle(ox + p.samples[i].x * scale, oy + p.samples[i].y * scale,
                p.tile * scale, p.tileHeight * scale, content);
            g.newPath(); g.rectPath(x, y, cw, ch); g.strokePath(border);
        }
    };
    function clearPlan(message, failed) {
        currentPreview = null;
        frameMetric.text = gridMetric.text = atlasMetric.text = "—";
        planAtlas.text = "单帧：—\n格子：—"; planSpacing.text = "间隙：—\n每侧留白：—"; planRange.text = "抽取：—";
        info.text = message; tint(info, failed ? colors.red : colors.muted); repaintPreview();
    }
    function revealPlan() {
        resizeSetup();
        var y = planCard.location ? Number(planCard.location[1]) : NaN;
        setupScrollbar.value = isFinite(y) ? Math.min(y, setupScrollbar.maxvalue) : setupScrollbar.maxvalue;
        scrollSetup();
        if (ui instanceof Window) { ui.update(); }
    }
    var calculateButton = setupTab.add("button", undefined, "③ 预计算排列");
    calculateButton.alignment = ["fill", "bottom"];
    var detectionSettings = panel(detectTab, "检测范围与抽样设置（独立于尺寸排列）");
    var detection = detectionSettings;
    var sampleModeGroup = detection.add("group"); sampleModeGroup.orientation = "column";
    var fullScanMode = sampleModeGroup.add("radiobutton", undefined, "逐帧检测（检查每一个源帧）"); fullScanMode.value = true;
    var sampledScanMode = sampleModeGroup.add("radiobutton", undefined, "抽帧检测（每隔指定源帧数）");
    var selectedFrameMode = sampleModeGroup.add("radiobutton", undefined, "只检测指定源帧");
    var scanInterval = field(detection, "检测帧间隔", "5");
    var scanFrame = field(detection, "源帧编号（从 0 开始）", "0");
    var scanWork = detection.add("checkbox", undefined, "检测工作区（默认检测完整合成）"); scanWork.value = false;
    detection.add("statictext", undefined, "抽帧 / 单帧检测只代表被检测的帧；需要完整范围时请选择逐帧检测。", {multiline: true});
    var threshold = field(detection, "忽略阈值（%）", "1");
    var margin = field(detection, "安全余量（像素）", "4");
    var blackBackground = detection.add("checkbox", undefined, "黑底亮度检测（只检测范围，不去黑底）");
    var detect = detection.add("button", undefined, "② 检测内容范围");
    var resultText = detection.add("statictext", undefined, "读取合成后先检测；检测不依赖输出抽取范围或图集尺寸。", {multiline: true});
    resultText.preferredSize = [390, 90];
    var exportSettings = panel(exportTab, "导出透明 PNG 图集");
    exportSettings.add("statictext", undefined, "自动查找并验证透明 PNG 输出模板，关闭缩放和裁剪。", {multiline: true});
    var template = field(exportSettings, "备用输出模板（可选）", "SpriteSheet_PNG_RGBA");
    var helpButton = exportSettings.add("button", undefined, "查看透明输出设置");
    var generate = exportSettings.add("button", undefined, "生成图集合成");
    var exportButton = exportSettings.add("button", undefined, "生成并导出透明 PNG");
    var progress = ui.add("progressbar", undefined, 0, 100);
    var cancelDetection = ui.add("button", undefined, "取消检测"); cancelDetection.enabled = false;
    var status = ui.add("statictext", undefined, "就绪", {multiline: true}); status.preferredSize = [390, 45];

    function selectedLayoutMode() { return gridMode.value ? "grid" : "dense"; }
    function selectedRangeMode() { return allRangeMode.value ? "all" : workRangeMode.value ? "work" : "custom"; }
    function selectedDetectionMode() { return fullScanMode.value ? "all" : sampledScanMode.value ? "sampled" : "frame"; }
    function chooseSampleMode(mode) {
        fullScanMode.value = mode === "all"; sampledScanMode.value = mode === "sampled"; selectedFrameMode.value = mode === "frame";
        scanInterval.enabled = sampledScanMode.value; scanFrame.enabled = selectedFrameMode.value;
    }
    function chooseLayoutMode(mode) {
        gridMode.value = mode === "grid"; denseMode.value = mode === "dense";
        cols.enabled = rows.enabled = gridMode.value;
        powerTwo.enabled = gridMode.value;
        atlasWidth.enabled = atlasHeight.enabled = denseMode.value;
        showPlan();
    }
    function chooseRangeMode(mode) {
        allRangeMode.value = mode === "all"; workRangeMode.value = mode === "work"; customRangeMode.value = mode === "custom";
        rangeStart.enabled = rangeEnd.enabled = customRangeMode.value; showPlan();
    }
    function request() {
        return {tile: tile.text, tileHeight: tileHeight.text, rangeMode: selectedRangeMode(),
            rangeStartFrame: rangeStart.text, rangeEndFrame: rangeEnd.text, fillMode: "filled",
            layoutMode: selectedLayoutMode(), cols: cols.text, rows: rows.text,
            atlasWidth: atlasWidth.text, atlasHeight: atlasHeight.text, powerOfTwo: gridMode.value && powerTwo.value};
    }
    function referenceSize() {
        if (!source || !isValid(source)) { throw new Error("请先读取有效的素材合成。"); }
        if (contentBasis.value && analysis) { return {width: analysis.summary.crop.width, height: analysis.summary.crop.height}; }
        return {width: source.width * source.pixelAspect, height: source.height};
    }
    function calculate(checkCrop) {
        if (!source || !isValid(source)) { throw new Error("请先读取有效的素材合成。"); }
        if (!analysis || !detected) { throw new Error("请先完成内容范围检测，再设置尺寸和排列。"); }
        var p = Core.solve(source, request());
        p.sourceCrop = contentBasis.value ? analysis.summary.crop : null;
        p.contentScalePercent = Number(scaleInput.text);
        if (!isFinite(p.contentScalePercent) || p.contentScalePercent <= 0 || p.contentScalePercent > 1000) { throw new Error("内容缩放百分比必须大于 0 且不超过 1000%。"); }
        return p;
    }
    function showPlan() {
        try {
            var p = calculate(true);
            currentPreview = p;
            frameMetric.text = p.count + " 帧";
            gridMetric.text = p.cols + " × " + p.rows;
            atlasMetric.text = p.width + " × " + p.height;
            planAtlas.text = "单帧：" + p.tile + " × " + p.tileHeight + " px\n格子：" + p.cellWidth.toFixed(4) + " × " + p.cellHeight.toFixed(4) + " px";
            planSpacing.text = "间隙：水平 " + p.gapX.toFixed(4) + " / 垂直 " + p.gapY.toFixed(4) + " px\n每侧留白：水平 " + (p.gapX / 2).toFixed(4) + " / 垂直 " + (p.gapY / 2).toFixed(4) + " px";
            planRange.text = "源帧 " + p.firstFrame + "～" + (p.endFrameExclusive - 1) + "（两端包含，共 " + p.availableSourceFrames + " 帧）→ 均匀抽取 " + p.count + " 帧\n播放 " + p.playbackDuration.toFixed(3) + " 秒 · 平均 " + p.effectiveFPS.toFixed(3) + " fps";
            var note = p.gridAdjusted ? "铺满建议调整为 " + p.cols + "×" + p.rows + "；原指定 " + p.requestedColumns + "×" + p.requestedRows + "，源帧不足或已达 1024 帧上限，不重复源帧。" : "排列可用，可生成或导出。";
            if (p.count === 1024) { note += " 已达输出上限 1024 帧。"; }
            if (p.layoutMode === "dense") { note += " 精确铺满指定尺寸，无空格。"; }
            info.text = note; tint(info, p.gridAdjusted || p.count === 1024 ? colors.amber : colors.green);
            repaintPreview(); return p;
        } catch (e) { clearPlan(e.message, !!detected); return null; }
    }
    function updateReference() {
        var ref = referenceSize();
        referenceText.text = "当前基准：" + ref.width + "×" + ref.height + (contentBasis.value ? "（采用内容范围）" : "（素材原始尺寸）");
    }
    function applyContentScale() {
        try {
            var percent = Number(scaleInput.text), ref = referenceSize();
            if (!isFinite(percent) || percent <= 0 || percent > 1000) { throw new Error("内容缩放百分比必须大于 0 且不超过 1000%。"); }
            var w = Math.round(ref.width * percent / 100), h = Math.round(ref.height * percent / 100);
            if (w < 16 || h < 16 || w > 4096 || h > 4096) { throw new Error("此缩放得到 " + w + "×" + h + "；单帧宽高须在 16～4096 像素之间。"); }
            tile.text = String(w); tileHeight.text = String(h);
            showPlan();
        } catch (e) { status.text = e.message; }
    }
    function dimensionChanged(widthChanged) {
        try {
            var ref = referenceSize(), input = Number(widthChanged ? tile.text : tileHeight.text);
            if (!isFinite(input) || input !== Math.floor(input) || input < 16 || input > 4096) { throw new Error("单帧宽高必须是 16～4096 的整数。"); }
            if (aspect.value) {
                if (widthChanged) { tileHeight.text = String(Math.round(input * ref.height / ref.width)); }
                else { tile.text = String(Math.round(input * ref.width / ref.height)); }
            }
            scaleInput.text = (Math.min(Number(tile.text) / ref.width, Number(tileHeight.text) / ref.height) * 100).toFixed(3);
            showPlan();
        } catch (e) { status.text = e.message; }
    }
    function detectionSampling() {
        var range = Core.sampling(source, {workArea: scanWork.value, count: 1});
        var first = range.firstFrame, available = range.endFrameExclusive - first, indices = [], i, n, step;
        if (selectedDetectionMode() === "frame") {
            n = Number(scanFrame.text);
            if (!isFinite(n) || n !== Math.floor(n) || n < first || n >= range.endFrameExclusive) {
                throw new Error("指定源帧编号须在当前检测范围内：" + first + "～" + (range.endFrameExclusive - 1) + "。");
            }
            indices.push(n);
        } else if (selectedDetectionMode() === "sampled") {
            step = Number(scanInterval.text);
            if (!isFinite(step) || step !== Math.floor(step) || step < 1) { throw new Error("检测帧间隔必须是正整数。"); }
            for (i = 0; i < available; i += step) { indices.push(first + i); }
        } else {
            for (i = 0; i < available; i++) { indices.push(first + i); }
        }
        var samples = [];
        for (i = 0; i < indices.length; i++) { samples.push({index: i, sourceFrame: indices[i], time: indices[i] * source.frameDuration}); }
        if (!samples.length) { throw new Error("当前检测范围没有可用源帧。"); }
        return {count: samples.length, samples: samples, firstFrame: first, endFrameExclusive: range.endFrameExclusive,
            playbackDuration: available * source.frameDuration, mode: selectedDetectionMode()};
    }
    function capture() {
        if (busy) { return; }
        var item = app.project.activeItem;
        if (!(item instanceof CompItem)) { alert("请打开素材合成，再点击读取。"); return; }
        source = item; analysis = null; detected = false;
        rawBasis.value = false; contentBasis.value = true;
        rangeStart.text = "0"; rangeEnd.text = String(Math.ceil(source.duration / source.frameDuration - 0.000001) - 1);
        resultText.text = "已读取新的素材合成，请检测内容范围。"; progress.value = 0;
        chooseSampleMode("all"); chooseLayoutMode("grid"); chooseRangeMode("all");
        sourceText.text = source.name + "\n单帧 " + source.width + "×" + source.height + "；源帧率 " + source.frameRate.toFixed(3) + " fps" +
            "\n总时长 " + source.duration.toFixed(3) + " 秒；" + Math.ceil(source.duration / source.frameDuration - 0.000001) + " 个源帧";
        scaleInput.text = "100";
        tile.text = String(Math.round(source.width * source.pixelAspect)); tileHeight.text = String(source.height);
        setupTab.enabled = false; exportTab.enabled = false; detectTab.enabled = true;
        tabs.selection = detectTab;
        updateReference(); clearPlan("下一步：点击“② 检测内容范围”。", false); setupScrollbar.value = 0; scrollSetup();
        status.text = "已读取。请先检测内容范围。";
    }
    read.onClick = capture;
    rawBasis.onClick = function () { rawBasis.value = true; contentBasis.value = false; updateReference(); applyContentScale(); };
    contentBasis.onClick = function () { rawBasis.value = false; contentBasis.value = true; updateReference(); applyContentScale(); };
    gridMode.onClick = function () { chooseLayoutMode("grid"); };
    denseMode.onClick = function () { chooseLayoutMode("dense"); };
    allRangeMode.onClick = function () { chooseRangeMode("all"); };
    workRangeMode.onClick = function () { chooseRangeMode("work"); };
    customRangeMode.onClick = function () { chooseRangeMode("custom"); };
    fullScanMode.onClick = function () { chooseSampleMode("all"); clearAnalysis(); };
    sampledScanMode.onClick = function () { chooseSampleMode("sampled"); clearAnalysis(); };
    selectedFrameMode.onClick = function () { chooseSampleMode("frame"); clearAnalysis(); };
    atlasWidth.onChange = atlasHeight.onChange = cols.onChange = rows.onChange = powerTwo.onClick = rangeStart.onChange = rangeEnd.onChange = showPlan;
    tile.onChange = function () { dimensionChanged(true); }; tileHeight.onChange = function () { dimensionChanged(false); };
    scaleInput.onChange = applyContentScale;
    calculateButton.onClick = function () {
        var p = showPlan();
        if (p) {
            var now = new Date();
            status.text = "预计算已更新（" + now.toTimeString().split(" ")[0] + "）：" +
                p.count + " 帧，" + p.cols + "×" + p.rows + "，图集 " + p.width + "×" + p.height + " px。";
        } else { status.text = "预计算未通过：" + info.text; }
        revealPlan();
    };
    function setBusy(value) {
        busy = value; read.enabled = !value; detection.enabled = !value;
        detectTab.enabled = !value; setupTab.enabled = !value && detected; exportTab.enabled = !value && detected;
        sizing.enabled = constraints.enabled = calculateButton.enabled = !value && detected;
    }
    function clearAnalysis() {
        analysis = null; detected = false;
        resultText.text = "检测参数已改变，请重新检测。";
        setupTab.enabled = false; exportTab.enabled = false;
        if (source && isValid(source)) { updateReference(); clearPlan("请重新完成内容范围检测。", false); }
    }
    threshold.onChange = margin.onChange = blackBackground.onClick = scanWork.onClick = scanInterval.onChange = scanFrame.onChange = clearAnalysis;
    helpButton.onClick = function () {
        alert("插件自动查找当前 AE 已有的透明 PNG 模板，并验证 RGB + Alpha、Straight；缩放和裁剪会自动关闭。\n\n若没有合适模板，需要创建一次 PNG / RGB + Alpha / Straight 模板，并在备用模板中填写其名称。AE 部分输出格式字段为只读，脚本无法直接设置。\n\n导出需启用首选项中的“允许脚本写入文件和访问网络”。黑底素材需先完成去黑底。");
    };
    var scanJob = null;
    function finishScan(error, cancelled) {
        var job = scanJob;
        if (!job) { return; }
        scanJob = null; cancelDetection.enabled = false;
        if (job.task !== null) { try { app.cancelTask(job.task); } catch (ignored0) {} }
        delete $.global.__SSBScanJobs[job.key];
        try { if (isValid(job.scratch)) { job.scratch.remove(); } } catch (ignored1) {}
        try { if (job.original instanceof CompItem && isValid(job.original)) { job.original.openInViewer(); } } catch (ignored2) {}
        if (error || cancelled) {
            analysis = null; detected = false;
            resultText.text = cancelled ? "检测已取消，可调整检测范围后重试。" : "检测未完成：" + error.message;
            status.text = resultText.text; clearPlan(resultText.text, !cancelled);
        }
        setBusy(false);
        if (error) { alert(error.message); }
    }
    cancelDetection.onClick = function () { finishScan(null, true); };
    function scheduleScan() {
        scanJob.task = app.scheduleTask('$.global.__SSBScanJobs["' + scanJob.key + '"] && $.global.__SSBScanJobs["' + scanJob.key + '"]();', 30, false);
    }
    function scanNextFrame() {
        var job = scanJob;
        if (!job) { return; }
        job.task = null;
        try {
            if (!isValid(source) || !isValid(job.scratch)) { throw new Error("合成已关闭或删除，检测停止。"); }
            var sample = job.p.samples[job.index];
            status.text = "正在检测源帧 " + sample.sourceFrame + "（" + (job.index + 1) + " / " + job.p.count + "）。单帧渲染完成后可取消。";
            var result = job.value.valueAtTime(sample.time, false).text;
            if (job.value.expressionError || result.indexOf("ERROR:") === 0) {
                throw new Error("AE 内容检测失败：" + (job.value.expressionError || result) + "。黑底软边达到采样上限时，请先去黑底，再使用透明度检测。");
            }
            var parts = result.split(",");
            if (parts.length !== 4) { throw new Error("AE 未返回有效边界。"); }
            var bounds = {width: source.width, height: source.height, left: Number(parts[0]), top: Number(parts[1]), right: Number(parts[2]), bottom: Number(parts[3])};
            job.frames.push(bounds); job.byFrame[String(sample.sourceFrame)] = bounds;
            job.index++; progress.value = job.index * 100 / job.p.count;
            status.text = "已检测 " + job.index + " / " + job.p.count + " 帧，用时 " + ((new Date().getTime() - job.started) / 1000).toFixed(1) + " 秒。";
            if (job.index < job.p.count) { scheduleScan(); return; }
            var summary = Core.summarize(job.frames, source.width, source.height, job.margin, 1, 0);
            analysis = {summary: summary, sampling: job.p, frames: job.frames, byFrame: job.byFrame,
                thresholdPercent: job.threshold, margin: job.margin, mode: job.black ? "Luminance" : "Alpha"};
            detected = true;
            resultText.text = "已检测 " + job.p.count + " 帧\n每帧最大内容：" + summary.maxFrameWidth + "×" + summary.maxFrameHeight +
                "\n共同内容范围（含余量）：" + summary.crop.width + "×" + summary.crop.height;
            status.text = "检测完成，用时 " + ((new Date().getTime() - job.started) / 1000).toFixed(1) + " 秒。排列预览已自动更新。";
            updateReference(); applyContentScale();
            finishScan(null, false);
            tabs.selection = setupTab;
        } catch (e) { finishScan(e, false); }
    }
    function detectContent() {
        if (busy) { return; }
        var scratch = null, original = app.project.activeItem;
        try {
            if (!source || !isValid(source)) { throw new Error("请先读取有效的素材合成。"); }
            var p = detectionSampling();
            if (app.project.renderQueue.rendering) { throw new Error("请等待当前渲染完成。"); }
            if (source.pixelAspect !== 1) { throw new Error("内容检测目前要求方形像素合成。"); }
            var thresholdValue = Number(threshold.text);
            if (!isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue >= 100) { throw new Error("忽略阈值必须在 0%～小于 100% 之间。"); }
            Core.summarize([{width: source.width, height: source.height, left: 0, top: 0, right: 1, bottom: 1}], source.width, source.height, Number(margin.text), 1, 0);
            analysis = null; detected = false; setBusy(true);
            scratch = app.project.items.addComp("__SpriteSheet_NativeScan__", source.width, source.height, 1, source.duration, source.frameRate);
            var layer = scratch.layers.add(source); layer.name = "__SSB_Source__"; layer.startTime = 0;
            scratch.resolutionFactor = [1, 1];
            var mask = !blackBackground.value && thresholdValue > 0;
            if (mask) {
                var effects = layer.property("ADBE Effect Parade");
                var shift = effects.addProperty("ADBE Shift Channels");
                shift.property(1).setValue(9); // Full On alpha; RGB each receives original Alpha.
                shift.property(2).setValue(1); shift.property(3).setValue(1); shift.property(4).setValue(1);
                var cut = effects.addProperty("ADBE Threshold2");
                cut.property(1).setValue(thresholdValue / 100);
            }
            var probe = scratch.layers.addText("");
            var value = probe.property("ADBE Text Properties").property("ADBE Text Document");
            value.expression = Core.nativeExpression(source.width, source.height, mask ? 0 : thresholdValue / 100, mask || blackBackground.value);
            if (!$.global.__SSBScanJobs) { $.global.__SSBScanJobs = {}; }
            $.global.__SSBScanSerial = ($.global.__SSBScanSerial || 0) + 1;
            var key = "job" + $.global.__SSBScanSerial;
            scanJob = {key: key, scratch: scratch, original: original, task: null, p: p, value: value,
                index: 0, frames: [], byFrame: {}, started: new Date().getTime(),
                margin: Number(margin.text), threshold: thresholdValue, black: blackBackground.value};
            $.global.__SSBScanJobs[key] = scanNextFrame;
            cancelDetection.enabled = true; progress.value = 0;
            status.text = "准备检测 " + p.count + " 帧；完成每帧后更新进度，可取消。";
            scheduleScan();
        } catch (e) {
            if (scanJob) { finishScan(e, false); }
            else {
                if (scratch) { try { scratch.remove(); } catch (ignored) {} }
                setBusy(false); status.text = e.message; alert(e.message);
            }
        }
    }
    detect.onClick = detectContent;
    function safeName(name) {
        return String(name).replace(/[\\\/:*?"<>|\x00-\x1f]/g, "_").replace(/[ .]+$/g, "").slice(0, 80) || "SpriteSheet";
    }
    function makeSheet(p) {
        var folder = null, sheet = null, i;
        app.beginUndoGroup("生成 Sprite Sheet");
        try {
            folder = app.project.items.addFolder(safeName(source.name) + "_SpriteSheet");
            sheet = app.project.items.addComp(safeName(source.name) + "_" + p.cols + "x" + p.rows + "_" + p.count + "f", p.width, p.height, 1, source.frameDuration, source.frameRate);
            sheet.parentFolder = folder;
            sheet.bgColor = [0, 0, 0]; // Preview background does not fill alpha.
            sheet.resolutionFactor = [1, 1];
            sheet.motionBlur = false;
            var sheetSource = source;
            if (p.sourceCrop) {
                sheetSource = app.project.items.addComp(safeName(source.name) + "_ContentCrop", p.sourceCrop.width, p.sourceCrop.height, 1, source.duration, source.frameRate);
                sheetSource.parentFolder = folder;
                var originalLayer = sheetSource.layers.add(source);
                originalLayer.property("ADBE Transform Group").property("ADBE Position").setValue([source.width / 2 - p.sourceCrop.left, source.height / 2 - p.sourceCrop.top]);
            }
            var scale = Math.min(p.tile / (sheetSource.width * sheetSource.pixelAspect), p.tileHeight / sheetSource.height) * 100;
            for (i = 0; i < p.count; i++) {
                var sample = p.samples[i], layer = sheet.layers.add(sheetSource);
                layer.name = "Frame_" + ("0000" + i).slice(-4) + "_Source_" + sample.sourceFrame;
                layer.startTime = 0;
                layer.timeRemapEnabled = true;
                var remap = layer.property("ADBE Time Remapping");
                remap.setValueAtTime(0, sample.time);
                while (remap.numKeys > 1) { remap.removeKey(remap.numKeys); }
                remap.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                layer.inPoint = 0;
                layer.outPoint = sheet.duration;
                layer.audioEnabled = false;
                layer.motionBlur = false;
                layer.frameBlendingType = FrameBlendingType.NO_FRAME_BLEND;
                layer.quality = LayerQuality.BEST;
                var transform = layer.property("ADBE Transform Group");
                transform.property("ADBE Anchor Point").setValue([sheetSource.width / 2, sheetSource.height / 2]);
                transform.property("ADBE Scale").setValue([scale * sheetSource.pixelAspect, scale]);
                transform.property("ADBE Position").setValue([sample.x + p.tile / 2, sample.y + p.tileHeight / 2]);
                progress.value = (i + 1) * 100 / p.count;
                if (ui instanceof Window && i % 8 === 0) { ui.update(); }
            }
            sheet.comment = "SpriteSheetBuilder " + VERSION + " | " + p.cols + "x" + p.rows + " | " + p.count + " frames | row-major | source range end excluded";
            return sheet;
        } catch (e) {
            if (sheet) { try { sheet.remove(); } catch (ignored) {} }
            if (folder) { try { folder.remove(); } catch (ignored2) {} }
            throw e;
        } finally { app.endUndoGroup(); }
    }
    function isOff(value) {
        return value === false || value === 0 || /^(false|off|0|关闭|关)$/i.test(String(value));
    }
    function validateOutputModule(item) {
        var s = item.outputModule(1).getSettings(GetSettingsFormat.STRING);
        if (!/png/i.test(String(s.Format))) { throw new Error("输出模板必须使用 PNG 序列格式。"); }
        if (!/rgb/i.test(String(s.Channels)) || !/alpha/i.test(String(s.Channels))) { throw new Error("输出模板必须选择 RGB + Alpha，以保留透明通道。"); }
        if (!/straight|unmatted|无蒙版|直接/i.test(String(s.Color))) {
            throw new Error("输出模板颜色必须选择直接 / 无蒙版（Straight / Unmatted）。");
        }
        if (!isOff(s.Resize) || !isOff(s.Crop)) {
            throw new Error("输出模板必须关闭调整大小和裁剪，以保留准确的图集尺寸。");
        }
    }
    function configureTransparentOutput(item, fallbackName) {
        var candidates = [null], names = item.outputModule(1).templates || [], i, lastError = null;
        if (fallbackName) { candidates.push(fallbackName); }
        for (i = 0; i < names.length; i++) { if (/png/i.test(names[i])) { candidates.push(names[i]); } }
        for (i = 0; i < candidates.length; i++) {
            try {
                if (candidates[i]) { item.outputModule(1).applyTemplate(candidates[i]); }
                // Format, Channels and Color can be read-only in ExtendScript.
                // Reacquire the output module after mutations (AE invalidates references).
                item.outputModule(1).setSettings({Resize: false, Crop: false});
                validateOutputModule(item);
                return candidates[i] || "current";
            } catch (e) { lastError = e; }
        }
        throw new Error("未找到可用的透明 PNG 模板。请创建一次 PNG / RGB + Alpha / Straight 模板，并在备用模板中填写名称。" + (lastError ? " 原因：" + lastError.message : ""));
    }
    function preflightTemplate(name) {
        var item = app.project.renderQueue.items.add(source);
        try { item.render = false; configureTransparentOutput(item, name); }
        finally { item.remove(); }
    }
    function renderSheet(sheet, p, outputFolder, name) {
        var queue = app.project.renderQueue, saved = [], item = null, i;
        var targetFolder = null, outputFile = null;
        try {
            var stem = safeName(sheet.name), suffix = 1;
            targetFolder = new Folder(outputFolder.fsName + "/" + stem);
            while (targetFolder.exists) { targetFolder = new Folder(outputFolder.fsName + "/" + stem + "_" + suffix++); }
            if (!targetFolder.create()) { throw new Error("无法创建输出文件夹，请检查写入权限。"); }
            for (i = 1; i <= queue.numItems; i++) {
                var existing = queue.item(i);
                if (existing.status === RQItemStatus.QUEUED) { saved.push(existing); existing.render = false; }
            }
            item = queue.items.add(sheet);
            configureTransparentOutput(item, name);
            item.setSettings({"Quality": "Best", "Resolution": "Full"});
            item.timeSpanStart = 0;
            item.timeSpanDuration = sheet.frameDuration;
            item.skipFrames = 0;
            item.outputModule(1).file = new File(targetFolder.fsName + "/" + stem + "_[#####].png");
            item.render = true;
            queue.render();
            if (item.status !== RQItemStatus.DONE) { throw new Error("导出被停止或渲染失败。图集合成已保留，可重新导出。"); }
            var files = targetFolder.getFiles(function (f) { return f instanceof File && /\.png$/i.test(f.name); });
            if (files.length !== 1 || files[0].length <= 0) {
                throw new Error("未找到唯一的 PNG 输出。请检查输出模块是否启用了子文件夹或其他文件名规则。");
            }
            var png = files[0];
            if (!png.rename(stem + ".png")) { throw new Error("PNG 已渲染，但重命名失败：" + png.fsName); }
            outputFile = new File(targetFolder.fsName + "/" + stem + ".png");
            var metadata = {version: VERSION, sourceComp: source.name, image: outputFile.name,
                imageWidth: p.width, imageHeight: p.height, columns: p.cols, rows: p.rows,
                frameCount: p.count, tileWidth: p.tile, tileHeight: p.tileHeight,
                cellSize: p.cell, cellWidth: p.cellWidth, cellHeight: p.cellHeight, paddingPerSide: p.padding,
                gapX: p.gapX, gapY: p.gapY, targetAtlasWidth: p.targetAtlasWidth, targetAtlasHeight: p.targetAtlasHeight,
                contentScalePercent: p.contentScalePercent, contentSizeBasis: contentBasis.value ? "contentRange" : "source",
                samplingMode: p.samplingMode, rangeMode: p.rangeMode, fillMode: p.fillMode,
                sourceFirstFrame: p.firstFrame, sourceLastFrameInclusive: p.endFrameExclusive - 1, availableSourceFrames: p.availableSourceFrames,
                requestedColumns: p.requestedColumns, requestedRows: p.requestedRows, gridAdjusted: p.gridAdjusted,
                selectedConstraint: p.selectedConstraint, emptyCells: p.emptyCells,
                minimumSourceFrameGap: p.minimumGap, maximumSourceFrameGap: p.maximumGap,
                sourceCrop: p.sourceCrop, contentDetection: analysis ? {summary: analysis.summary, frames: analysis.frames,
                    thresholdPercent: analysis.thresholdPercent, margin: analysis.margin, mode: analysis.mode, sampling: analysis.sampling} : null,
                order: "left-to-right, top-to-bottom", alpha: "straight",
                sourceFrameRate: source.frameRate, sourceDisplayStartFrame: source.displayStartFrame,
                playbackDurationSeconds: p.playbackDuration,
                suggestedPlaybackFramesPerSecond: p.count / p.playbackDuration,
                rangeStartSeconds: p.rangeStart, rangeEndSecondsExclusive: p.rangeEnd,
                ueSubImageSize: [p.cols, p.rows], ueSubImageIndexRange: [0, p.count - 1], samples: p.samples};
            var jsonFile = new File(targetFolder.fsName + "/" + stem + ".json");
            jsonFile.encoding = "UTF-8";
            if (!jsonFile.open("w")) { throw new Error("PNG 已输出，但无法写入帧信息文件。"); }
            try { if (!jsonFile.write(Core.json(metadata))) { throw new Error("帧信息写入失败。"); } }
            finally { jsonFile.close(); }
            return outputFile;
        } finally {
            if (item) { try { item.remove(); } catch (ignored) {} }
            for (i = 0; i < saved.length; i++) { try { saved[i].render = true; } catch (ignored2) {} }
        }
    }

    function run(exportPNG) {
        if (busy) { return; }
        var sheet = null;
        try {
            var p = calculate(true), folder = null;
            if (app.project.renderQueue.rendering) { throw new Error("请等待当前渲染完成。"); }
            var name = template.text.replace(/^\s+|\s+$/g, "");
            if (exportPNG) {
                if (app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") !== 1) { throw new Error("请在首选项→脚本和表达式中启用“允许脚本写入文件和访问网络”。"); }
                preflightTemplate(name);
                folder = Folder.selectDialog("选择透明 Sprite Sheet 输出文件夹");
                if (!folder) { status.text = "已取消，未生成图集。"; return; }
            }
            setBusy(true); progress.value = 0; status.text = "正在按建议生成图集…";
            sheet = makeSheet(p);
            var file = null;
            if (exportPNG) { status.text = "正在导出 RGB + Alpha 透明 PNG…"; if (ui instanceof Window) { ui.update(); } file = renderSheet(sheet, p, folder, name); }
            sheet.openInViewer(); progress.value = 100;
            status.text = file ? "完成：" + file.fsName : "已生成：" + sheet.name;
            if (file) { alert("透明 PNG 已导出：\n" + file.fsName + "\n" + p.width + "×" + p.height + " / " + p.count + " 帧\nUE Sub Image Size：" + p.cols + " × " + p.rows); }
        } catch (e) {
            status.text = e.message; if (sheet) { try { sheet.openInViewer(); } catch (ignored) {} } alert(e.message);
        } finally { setBusy(false); }
    }
    generate.onClick = function () { run(false); }; exportButton.onClick = function () { run(true); };
    ui.onResizing = ui.onResize = function () { this.layout.resize(); resizeSetup(); repaintPreview(); };
    tabs.onChange = function () { if (tabs.selection === setupTab) { resizeSetup(); repaintPreview(); } };
    ui.onShow = function () { resizeSetup(); };
    ui.onClose = function () { if (scanJob) { finishScan(null, true); } return true; };
    ui.layout.layout(true); setupViewport.layout.layout();
    if (ui instanceof Window) { ui.center(); ui.show(); }
    if (app.project && app.project.activeItem instanceof CompItem) { capture(); }
    else { setBusy(false); chooseLayoutMode("grid"); chooseRangeMode("all"); chooseSampleMode("all"); }
}(this));
