const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../SpriteSheetBuilder.jsx'), 'utf8');
const ctx = vm.createContext({});
const body = script.split('// CORE_BEGIN:')[1].split('// CORE_END')[0];
vm.runInContext(body.slice(body.indexOf('var Core')), ctx);
const core = ctx.Core;
const source = {frameDuration: 1 / 25, duration: 10, workAreaStart: 2, workAreaDuration: 4};

const base={tile:256,tileHeight:256,rangeMode:'all',layoutMode:'grid',fillMode:'filled',cols:8,rows:8,atlasWidth:2048,atlasHeight:1696};
let p=core.solve(source,base);
assert.equal(p.count,64); assert.equal(p.emptyCells,0);
assert.equal(p.samples[0].sourceFrame,0); assert.equal(p.samples[63].sourceFrame,249);
assert.equal(p.minimumGap,3); assert.equal(p.maximumGap,4);
p=core.solve(source,{...base,layoutMode:'dense'});
assert.equal(p.cols,8); assert.equal(p.rows,6); assert.equal(p.count,48);
assert.equal(p.width,2048); assert.equal(p.height,1696); assert.equal(p.gapY,1696/6-256);
p=core.solve(source,{...base,layoutMode:'dense',fillMode:'tight'});
assert.equal(p.count,48); assert.equal(p.height,1696); assert.equal(p.fillMode,'filled'); assert.equal(p.emptyCells,0);
p=core.solve(source,{...base,rangeMode:'custom',rangeStartFrame:50,rangeEndFrame:149});
assert.equal(p.samples[0].sourceFrame,50); assert.equal(p.samples[63].sourceFrame,149); assert.equal(p.playbackDuration,4);
p=core.solve(source,{...base,rangeMode:'work'});
assert.equal(p.samples[0].sourceFrame,50); assert.equal(p.samples[63].sourceFrame,149);
p=core.solve(source,{...base,rangeMode:'custom',rangeStartFrame:10,rangeEndFrame:14});
assert.equal(p.emptyCells,0); assert.ok(p.count<=5); assert.equal(p.gridAdjusted,true);
p=core.solve(source,{...base,rangeMode:'custom',rangeStartFrame:10,rangeEndFrame:14,fillMode:'tight'});
assert.equal(p.count,5); assert.equal(p.emptyCells,0); assert.equal(p.gridAdjusted,true); assert.equal(p.gapX,0);
p=core.solve(source,{...base,cols:3,rows:2,powerOfTwo:true});
assert.equal(p.width,1024); assert.equal(p.height,512); assert.equal(p.count,6);
assert.equal(core.solve(source,{...base,fillMode:'tight',powerOfTwo:true}).fillMode,'filled');
assert.throws(()=>core.solve(source,{...base,layoutMode:'dense',atlasWidth:128,atlasHeight:128}), /放不下/);
// Check both layout invariants and independently enumerate maximal frame capacity.
for(let n=1;n<=110;n++) for(const fillMode of ['filled','tight']) for(const layoutMode of ['grid','dense']) {
 const q=core.solve({...source,duration:n/25},{...base,tile:173,tileHeight:211,atlasWidth:1199,atlasHeight:1031,fillMode,layoutMode});
 assert.equal(q.samples.length,q.count); assert.equal(new Set(q.samples.map(s=>s.sourceFrame)).size,q.count);
 assert.ok(q.count<=n); assert.equal(q.samples[0].sourceFrame,0);
 if(q.count>1) assert.equal(q.samples[q.count-1].sourceFrame,n-1);
 assert.equal(q.emptyCells,0); assert.equal(q.fillMode,'filled');
 if(layoutMode==='dense') {
   let maxCount=0;
   for(let c=1;c<=Math.floor(1199/173);c++) for(let r=1;r<=Math.floor(1031/211);r++) {
     if(c*r>n) continue;
     maxCount=Math.max(maxCount,Math.min(c*r,n));
   }
   assert.equal(q.count,maxCount); assert.equal(q.width,1199); assert.equal(q.height,1031);
 }
 for(const s of q.samples) {
   assert.ok(Math.abs((s.x+q.tile/2)/q.width-(s.col+0.5)/q.cols)<1e-12);
   assert.ok(Math.abs((s.y+q.tileHeight/2)/q.height-(s.row+0.5)/q.rows)<1e-12);
   assert.ok(s.x>=-1e-9 && s.y>=-1e-9 && s.x+q.tile<=q.width+1e-9 && s.y+q.tileHeight<=q.height+1e-9);
 }
}
p=core.solve({...source,duration:80},{...base,layoutMode:'dense',tile:16,tileHeight:16,atlasWidth:8192,atlasHeight:8192});
assert.equal(p.count,1024); assert.equal(p.samples[1023].sourceFrame,1999);
console.log('PASS: exact specified dimensions, equal cells, no empty slots, uniform sampling, legacy mode normalization, maximum capacity oracle, UE alignment and output cap.');
