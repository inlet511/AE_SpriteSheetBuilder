const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const text = fs.readFileSync(path.join(__dirname, '../SpriteSheetBuilder.jsx'), 'utf8');
const block = text.split('// CORE_BEGIN:')[1].split('// CORE_END')[0];
const context = vm.createContext({});
vm.runInContext(block.slice(block.indexOf('var Core')), context);
const core = context.Core;
function oracle(pixels, w, h, threshold) {
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (pixels[y * w + x] > threshold) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x); b = Math.max(b, y); }
  }
  return r < 0 ? [-1, -1, -1, -1] : [l, t, r + 1, b + 1];
}
function average(pixels, w) {
  return (l, t, r, b) => {
    let sum = 0;
    for (let y = t; y < b; y++) for (let x = l; x < r; x++) sum += pixels[y * w + x];
    return sum / ((r - l) * (b - t));
  };
}
let seed = 456;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
for (let test = 0; test < 200; test++) {
  const w = 3 + Math.floor(random() * 29), h = 3 + Math.floor(random() * 29);
  const threshold = [0, 0.01, 0.1, 0.5][test % 4];
  const pixels = Array.from({length: w * h}, () => random() < 0.9 ? 0 : random());
  assert.deepEqual(Array.from(core.scanBounds(average(pixels, w), w, h, threshold, 100000)), oracle(pixels, w, h, threshold));
}
const w = 64, h = 64;
let pixels = Array(w * h).fill(0);
pixels[63 * w + 63] = 0.02; // Easily lost by a coarse average test.
assert.deepEqual(Array.from(core.scanBounds(average(pixels, w), w, h, 0.01, 100000)), [63, 63, 64, 64]);
pixels = Array(w * h).fill(0.005);
assert.deepEqual(Array.from(core.scanBounds(average(pixels, w), w, h, 0.01, 100000)), [-1, -1, -1, -1]);
assert.throws(() => core.scanBounds(average(pixels, w), w, h, 0.01, 10), /SSB_SCAN_LIMIT/);
// Thresholded masks eliminate the pathological subdivision of below-threshold soft smoke.
const maskSize=512, maskPixels=Array(maskSize*maskSize).fill(0);
maskPixels[230*maskSize+117]=1; maskPixels[310*maskSize+401]=1;
let maskQueries=0;const maskAverage=average(maskPixels,maskSize);
assert.deepEqual(Array.from(core.scanBounds((...region)=>{maskQueries++;return maskAverage(...region);},maskSize,maskSize,0,2048)),[117,230,402,311]);
assert.ok(maskQueries<=37,'binary mask boundary search should stay logarithmic');
// Run the exact generated AE expression with a pixel-center-correct sampleImage simulator.
pixels = Array(w * h).fill(0); pixels[2 * w + 3] = 1; pixels[8 * w + 17] = 0.02;
const sampleImage = (point, radius, postEffect, time) => {
  assert.equal(postEffect, true); assert.equal(time, 2);
  const l = point[0] - radius[0] + 0.5, t = point[1] - radius[1] + 0.5;
  const r = point[0] + radius[0] + 0.5, b = point[1] + radius[1] + 0.5;
  assert.ok([l, t, r, b].every(Number.isInteger));
  const alpha = average(pixels, w)(l, t, r, b);
  return [1, 1, 1, alpha];
};
const expressionContext = vm.createContext({time: 2, thisComp: {layer: () => ({sampleImage})}});
assert.equal(vm.runInContext(core.nativeExpression(w, h, 0.01, false), expressionContext), '3,2,18,9');
assert.equal(vm.runInContext(core.nativeExpression(w, h, 0.01, true), expressionContext), '3,2,18,9');
const source = {duration: 8, frameDuration: 1 / 30, workAreaStart: 0, workAreaDuration: 8};
const interval = core.sampling(source, {count:40, workArea:true});
assert.equal(interval.count, 40);
assert.equal(interval.samples[39].sourceFrame, 239);
assert.equal(interval.requestedFPS, 5);
assert.throws(() => core.sampling(source, {useInterval: true, interval: 0, workArea: true}));
let b = core.budget({width: 188, height: 308}, 64, 240, 2048, 2048, 0, true, false);
assert.equal(b.cols, 8); assert.equal(b.rows, 8);
assert.equal(b.tile, 256); assert.equal(b.tileHeight, 256);
assert.equal(b.scale, 256 / 308); assert.equal(b.nativeCapacity, 32);
b = core.budget({width: 188, height: 308}, 240, 240, 2048, 2048, 0, true, true);
assert.equal(b.count, 32); assert.equal(b.scale, 1);
b = core.budget({width: 188, height: 308}, 64, 240, 2048, 2048, 0, false, false);
assert.ok(b.scale > 0.98); assert.ok(b.width <= 2048 && b.height <= 2048);
assert.throws(() => core.budget({width: 4096, height: 4096}, 64, 240, 2048, 2048, 0, true, true));
console.log('PASS: 200 raster-oracle comparisons, faint edge pixels, soft-edge limit, exact AE expression coordinates, uniform sampling and budget solver.');
