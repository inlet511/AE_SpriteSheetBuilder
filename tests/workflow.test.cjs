/* Host simulation; actual rendering and pixel output still require AE. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../SpriteSheetBuilder.jsx'), 'utf8');
function environment({failRender = false, cancel = false, badAlpha = false, failAnalysis = false, emptyAnalysis = false, writePermission = true, templateOnly = false, autoDrain = true} = {}) {
  const controls = [], alerts = [], items = [], output = new Map();
  function Control(kind, label = '') {
    this.text = label; this.value = 0; this.kind = kind;
    this.preferredSize = {width: 0, height: 0};
    this.layout = {layout() {}, resize() {}};
    this.add = (type, unused, text) => { const c = new Control(type, text); c.parent=this; controls.push(c); return c; };
    this.update = this.show = this.center = () => {};
  }
  function Window() { return new Control('window'); }
  function Panel() {}
  function CompItem(name, width, height, pixelAspect, duration, frameRate) {
    Object.assign(this, {name, width, height, pixelAspect, duration, frameRate,
      frameDuration: 1 / frameRate, workAreaStart: 0, workAreaDuration: duration, displayStartFrame: 0});
    this.madeLayers = [];
    this.remove = () => { this.removed = true; };
    this.openInViewer = () => { app.project.activeItem = this; };
    this.layers = {add: src => {
      const values = {}, keys = [{t: 0, v: 0}, {t: src.duration, v: src.duration}];
      const remap = {
        get numKeys() { return keys.length; }, keys,
        setValueAtTime(t, v) { const k = keys.find(k => k.t === t); if (k) k.v = v; else keys.push({t, v}); },
        removeKey(k) { keys.splice(k - 1, 1); }, setInterpolationTypeAtKey() {}
      };
      const layer = {values, remap, property(name) {
        if (name === 'ADBE Effect Parade') return {addProperty: match => ({property: index => ({setValue: v => { values[match+':'+index]=v; }})})};
        return name === 'ADBE Time Remapping' ? remap : {property: n => ({setValue: v => { values[n] = v; }})};
      }};
      Object.defineProperty(layer, 'frameBlending', {set() { throw new Error('frameBlending is read-only'); }});
      this.madeLayers.push(layer); return layer;
    }};
    this.layers.addText = () => {
      const property = {expression: '', expressionError: '', valueAtTime(t) {
        return {text: failAnalysis ? 'ERROR:Synthetic analysis failure' : emptyAnalysis ? '-1,-1,-1,-1' :
          Math.round(t * 25) % 2 ? '180,190,300,390' : '120,90,240,290'};
      }};
      return {property: () => ({property: () => property})};
    };
    items.push(this);
  }
  function File(filename) {
    this.fsName = filename; this.name = filename.split('/').pop();
    this.length = output.get(filename)?.length || 0;
    Object.defineProperty(this, 'parent', {get: () => new Folder(this.fsName.slice(0, this.fsName.lastIndexOf('/')))});
    Object.defineProperty(this, 'exists', {get: () => output.has(this.fsName)});
    this.open = () => true;
    this.close = () => {};
    this.read = () => output.get(this.fsName) || '';
    this.remove = () => { output.delete(this.fsName); return true; };
    this.write = text => { output.set(this.fsName, text); return true; };
    this.rename = name => {
      const target = this.fsName.slice(0, this.fsName.lastIndexOf('/') + 1) + name;
      output.set(target, output.get(this.fsName)); output.delete(this.fsName);
      this.fsName = target; this.name = name; return true;
    };
  }
  const folders = new Set(['/output']);
  function Folder(filename) {
    this.fsName = filename;
    Object.defineProperty(this, 'exists', {get: () => folders.has(filename)});
    this.create = () => { folders.add(filename); return true; };
    this.remove = () => { folders.delete(filename); return true; };
    this.getFiles = filter => [...output.keys()].filter(k => k.startsWith(filename + '/')).map(k => new File(k)).filter(filter || (() => true));
  }
  Folder.temp = new Folder('/temp');
  Folder.selectDialog = () => cancel ? null : new Folder('/output');
  const tasks = [], renderHistory = [];
  const queue = {
    rendering: false, get numItems() { return tasks.length; }, item: i => tasks[i - 1],
    items: {add(comp) {
      let configured = {Format: templateOnly ? 'AVI' : 'PNG Sequence', Channels: templateOnly ? 'RGB' : 'RGB + Alpha', Color: 'Straight (Unmatted)', Resize: false, Crop: false};
      const om = {file: null, templates: ['Lossless', 'PNG Alpha'], applyTemplate(name) { if (name !== 'PNG Alpha') throw new Error('missing template'); configured = {Format: 'PNG Sequence', Channels: 'RGB + Alpha', Color: 'Straight (Unmatted)', Resize: true, Crop: true}; }, setSettings(v) { assert.ok(!('Format' in v) && !('Channels' in v) && !('Color' in v), 'AE read-only format keys must not be written'); configured = {...configured, ...v}; }, getSettings() {
        return badAlpha ? {Format: 'PNG Sequence', Channels: typeof badAlpha === 'string' ? badAlpha : 'RGB', Color: 'Straight (Unmatted)', Resize: false, Crop: false} : configured || {Format: 'PNG Sequence', Channels: 'RGB + Alpha', Color: 'Straight (Unmatted)', Resize: false, Crop: false};
      }};
      let render = true;
      const task = {comp, status: 'queued', outputModule: () => om, setSettings() {},
        remove() { tasks.splice(tasks.indexOf(this), 1); }};
      Object.defineProperty(task, 'render', {get: () => render, set(v) { render = v; task.status = v ? 'queued' : 'unqueued'; }});
      tasks.push(task); return task;
    }},
    render() {
      const active = tasks.filter(t => t.render);
      renderHistory.push(active.map(t => t.comp.name));
      if (failRender) { for (const t of active) t.status = 'stopped'; return; }
      for (const task of active) {
        for (let frame = 0; frame < Math.round(task.comp.duration * task.comp.frameRate); frame++) {
          output.set(task.outputModule(1).file.fsName.replace('[#####]', String(frame).padStart(5, '0')), 'PNG bytes');
        }
        task.status = 'done';
      }
    }
  };
  const scheduled = new Map(); let taskID=0;
  const app = {scheduleTask: code => { const id=++taskID; scheduled.set(id,code); return id; }, cancelTask: id => scheduled.delete(id), project: {activeItem: null, renderQueue: queue, items: {
    addComp: (...args) => new CompItem(...args), addFolder: name => ({name, remove() {}})
  }}, preferences: {getPrefAsLong: () => writePermission ? 1 : 0}, beginUndoGroup() {}, endUndoGroup() {}};
  const source = new CompItem('Smoke_Sprite', 512, 512, 1, 10, 25);
  app.project.activeItem = source;
  const existing = queue.items.add(new CompItem('UserQueued', 512, 512, 1, 1, 30));
  const context = vm.createContext({app, CompItem, Window, Panel, File, Folder,
    $: {fileName: '/plugin/SpriteSheetBuilder.jsx', global: {}},
    isValid: v => !v.removed, alert: msg => alerts.push(msg),
    KeyframeInterpolationType: {HOLD: 1}, FrameBlendingType: {NO_FRAME_BLEND: 0},
    LayerQuality: {BEST: 1}, GetSettingsFormat: {STRING: 1},
    RQItemStatus: {QUEUED: 'queued', DONE: 'done'}});
  vm.runInContext(script, context);
  function drain(limit=10000) { let n=0; while(scheduled.size && n++<limit) { const [id,code]=scheduled.entries().next().value; scheduled.delete(id); vm.runInContext(code,context); } }
  return {controls, alerts, items, output, tasks, existing, renderHistory, source, drain, scheduled,
    field(label) { return controls[controls.findIndex(c => c.text === label) + 1]; },
    edit(label, value) { const c = this.field(label); c.text = String(value); if (c.onChange) c.onChange(); },
    toggle(label, value = true) { const c = controls.find(c => c.text === label); c.value = value; if (c.onClick) c.onClick(); },
    click(label) { controls.find(c => c.text === label).onClick(); if(autoDrain) drain(); }};
}


const EXPORT='生成并导出透明 PNG', DETECT='② 检测内容范围';
const RAW='素材原始尺寸', CONTENT='采用内容范围';
const POT='最终宽高扩大到 2 的 N 次方';
const metadata=e=>JSON.parse([...e.output.entries()].find(([k])=>k.endsWith('.json'))[1]);
const control=(e,label)=>e.controls.find(c=>c.text===label);
let e=environment();
assert.deepEqual(e.controls.filter(c=>c.kind==='tab').map(c=>c.text),['② 内容范围检测','③ 尺寸与排列','④ 生成与导出']);
assert.ok(!e.controls.some(c=>/按抽帧帧率|按源帧间隔|输出抽帧/.test(c.text)));
const gridParent=control(e,'使用指定行列数').parent;
const denseParent=control(e,'使用指定图集尺寸').parent;
assert.notEqual(gridParent,denseParent); assert.equal(gridParent.parent,denseParent.parent);
assert.equal(gridParent.parent.orientation,'row'); assert.equal(control(e,POT).parent,gridParent);
assert.equal(e.field('图集宽度').enabled,false); assert.equal(e.field('结束源帧（含）').text,'249');
assert.ok(!e.controls.some(c=>/紧密排列|图集最大尺寸/.test(c.text)));
assert.ok(e.controls.indexOf(control(e,'预计算 · 排列示意'))>e.controls.indexOf(control(e,'抽取范围')));
e.click(DETECT);
assert.equal(e.alerts.length,0); assert.equal(e.output.size,0); assert.equal(e.renderHistory.length,0);
assert.ok(e.items.find(i=>i.name==='__SpriteSheet_NativeScan__').removed);
assert.equal(e.field('单帧宽度（像素）').text,'188'); assert.equal(e.field('单帧高度（像素）').text,'308');
e.click('③ 预计算排列');
assert.ok(e.controls.some(c=>String(c.text).startsWith('预计算已更新（')));
assert.ok(e.controls.find(c=>c.kind==='scrollbar').value>0);
e.click(EXPORT);
let m=metadata(e); assert.equal(m.frameCount,64); assert.equal(m.emptyCells,0);
assert.equal(m.samples[0].sourceFrame,0); assert.equal(m.samples[63].sourceFrame,249);
assert.equal(m.samplingMode,'uniform'); assert.equal(m.fillMode,'filled'); assert.equal(m.rangeMode,'all');
const sheet=e.items.find(i=>i.name==='Smoke_Sprite_8x8_64f');
assert.equal(sheet.madeLayers.length,64); assert.equal(sheet.madeLayers[63].remap.keys[0].v,249/25);
assert.equal(e.existing.render,true); assert.equal(m.alpha,'straight');
e=environment();e.click(DETECT);e.edit('缩放（%）',50);
assert.equal(e.field('单帧宽度（像素）').text,'94');assert.equal(e.field('单帧高度（像素）').text,'154');
e.click('使用指定图集尺寸');assert.equal(control(e,'使用指定行列数').value,false);
assert.equal(e.field('列数').enabled,false);assert.equal(e.field('图集宽度').enabled,true);assert.equal(control(e,POT).enabled,false);
e.click(EXPORT);m=metadata(e);
assert.equal(m.frameCount,247);assert.equal(m.columns,19);assert.equal(m.rows,13);assert.equal(m.emptyCells,0);
assert.equal(m.imageWidth,2048);assert.equal(m.imageHeight,2048);assert.ok(m.gapX>0 && m.gapY>0);
// Source-frame selection and layout edits retain the independently detected bounds.
e=environment();e.click('抽帧检测（每隔指定源帧数）');e.edit('检测帧间隔',10);e.click(DETECT);
e.click('自定义源帧范围');e.edit('起始源帧（含）',50);e.edit('结束源帧（含）',149);e.edit('列数',4);e.edit('行数',4);e.click(EXPORT);m=metadata(e);
assert.equal(m.frameCount,16);assert.equal(m.samples[0].sourceFrame,50);assert.equal(m.samples[15].sourceFrame,149);
assert.equal(m.contentDetection.frames.length,25);assert.equal(m.playbackDurationSeconds,4);assert.equal(m.rangeMode,'custom');
assert.ok(e.controls.some(c=>String(c.text).includes('源帧 50～149')));
e=environment();e.click(DETECT);e.source.workAreaStart=2;e.source.workAreaDuration=4;e.click('工作区范围');e.click(EXPORT);m=metadata(e);
assert.equal(m.samples[0].sourceFrame,50);assert.equal(m.samples[63].sourceFrame,149);assert.equal(m.contentDetection.frames.length,250);
e=environment();e.click(DETECT);e.click('自定义源帧范围');e.edit('起始源帧（含）',10);e.edit('结束源帧（含）',14);e.click(EXPORT);m=metadata(e);
assert.equal(m.frameCount,5);assert.equal(m.emptyCells,0);assert.equal(m.gridAdjusted,true);
assert.ok(e.controls.some(c=>String(c.text).includes('铺满建议调整为')));
e=environment();e.click(DETECT);e.toggle(POT);e.click('使用指定图集尺寸');
assert.equal(control(e,POT).enabled,false);
e.click('使用指定行列数');assert.equal(control(e,POT).enabled,true);e.click(EXPORT);m=metadata(e);
assert.equal(m.imageWidth,2048);assert.equal(m.imageHeight,4096);
for(const badAlpha of [true,'Alpha']){e=environment({badAlpha});e.click(DETECT);e.click(EXPORT);assert.equal(e.items.length,3);assert.ok(e.alerts.some(a=>a.includes('RGB + Alpha')));}
e=environment({failRender:true});e.click(DETECT);e.click(EXPORT);assert.equal(e.existing.render,true);assert.ok(e.alerts.some(a=>a.includes('渲染失败')));
e=environment({cancel:true});e.click(DETECT);e.click(EXPORT);assert.equal(e.items.length,3);assert.equal(e.renderHistory.length,0);
e=environment({failAnalysis:true});e.click(DETECT);assert.ok(e.alerts.some(a=>a.includes('AE 内容检测失败')));
e=environment({emptyAnalysis:true});e.click(DETECT);assert.ok(e.alerts.some(a=>a.includes('未检测到有效内容')));
e=environment();e.click('只检测指定源帧');e.edit('源帧编号（从 0 开始）',101);e.click(DETECT);
assert.equal(e.field('单帧宽度（像素）').text,'128');
e.click(RAW);e.edit('缩放（%）',50);assert.equal(e.field('单帧宽度（像素）').text,'256');
e.click(CONTENT);assert.equal(e.field('单帧宽度（像素）').text,'64');e.click(EXPORT);assert.equal(metadata(e).contentDetection.frames.length,1);
e=environment();e.source.duration=48;e.source.workAreaDuration=48;e.click('① 读取当前素材合成');e.click(DETECT);
assert.ok(e.controls.some(c=>String(c.text).includes('已检测 1200 帧')));
assert.equal(e.field('结束源帧（含）').text,'1199');
e=environment({templateOnly:true});e.click(DETECT);e.click(EXPORT);
assert.equal(e.renderHistory.length,1);assert.equal(metadata(e).alpha,'straight');
e=environment({autoDrain:false});e.click(DETECT);
assert.equal(e.scheduled.size,1);assert.equal(control(e,'取消检测').enabled,true);
const maskValues=e.items.find(i=>i.name==='__SpriteSheet_NativeScan__').madeLayers[0].values;
assert.equal(maskValues['ADBE Shift Channels:1'],9);
assert.equal(maskValues['ADBE Shift Channels:2'],1);
assert.equal(maskValues['ADBE Shift Channels:3'],1);
assert.equal(maskValues['ADBE Shift Channels:4'],1);
assert.equal(maskValues['ADBE Threshold2:1'],0.01);
e.drain(1);assert.ok(e.controls.some(c=>String(c.text).startsWith('已检测 1 / 250')));
e.click('取消检测');assert.equal(e.scheduled.size,0);
assert.ok(e.items.find(i=>i.name==='__SpriteSheet_NativeScan__').removed);
assert.equal(control(e,DETECT).parent.enabled,true);
e.click(DETECT);e.drain();assert.equal(e.scheduled.size,0);assert.equal(control(e,'取消检测').enabled,false);
e=environment();e.source.workAreaStart=2;e.source.workAreaDuration=4;
e.click('抽帧检测（每隔指定源帧数）');e.edit('检测帧间隔',10);e.toggle('检测工作区（默认检测完整合成）');e.click(DETECT);e.click(EXPORT);m=metadata(e);
assert.equal(m.contentDetection.sampling.count,10);
assert.equal(m.contentDetection.sampling.samples[0].sourceFrame,50);
assert.equal(m.contentDetection.sampling.samples[9].sourceFrame,140);
assert.equal(m.frameCount,64);assert.equal(m.samples[0].sourceFrame,0);
e.edit('列数','bad');e.click('③ 预计算排列');
assert.ok(e.controls.some(c=>String(c.text).startsWith('预计算未通过：')));
console.log('PASS: exact atlas, preview order and click feedback, POT grouping, no empty cells, independent detection, PNG metadata/render simulation and queue recovery.');
