#!/usr/bin/env node
// Dev tool: zoomed crops along a border outline, to judge a fit (or ground truth) by eye.
//
//   node tools/inspect-fit.mjs <file> [out.png]                 # outline = detector result
//   node tools/inspect-fit.mjs <file> [out.png] --gt            # outline = expected.json entry
//   node tools/inspect-fit.mjs <file> [out.png] --box=cx,cy,w,h[,shape]
//
// Crops: the top and bottom vertex plus the midpoint of every side (8 for a hex), each
// ~7 % of the border width, upscaled. Outline: 1 px magenta; detected inner edge: cyan.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBorder, borderBox } from "../src/detector/index.js";
import { shapePoints } from "./lib/geometry.mjs";
import { montage } from "./lib/montage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const file = pos[0];
const out = pos[1] ?? path.join(ROOT, "test-output", `_inspect-${file.replace(/\.\w+$/, "")}.png`);
const src = path.join(ROOT, "test-images", file);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const expected = JSON.parse(fs.readFileSync(path.join(ROOT, "test-images", "expected.json"), "utf8"));

let b;
if (flags.box) {
  const [cx, cy, w, h, shape] = flags.box.split(",");
  b = { cx: +cx, cy: +cy, width: +w, height: +h, rotation: 0, shape: shape ?? expected[file]?.shape ?? "hex-pointy" };
} else if (flags.gt) {
  b = expected[file];
} else {
  b = detectBorder({ width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) },
    { shape: flags.shape ?? expected[file]?.shape ?? "hex-pointy" });
  console.log(JSON.stringify({ shape: b.shape, cx: +b.cx.toFixed(1), cy: +b.cy.toFixed(1), width: +b.width.toFixed(1), height: +b.height.toFixed(1), rotation: +b.rotation.toFixed(2), thickness: b.thickness, confidence: +b.confidence.toFixed(3) }));
}

const outer = shapePoints(b.shape, b.cx, b.cy, b.width, b.height, b.rotation || 0, 64);
const inner = b.thickness > 0 && !flags.gt && !flags.box ? (() => { const i = borderBox(b, "inner"); return shapePoints(b.shape, i.cx, i.cy, i.width, i.height, b.rotation || 0, 64); })() : null;
// Points of interest: side midpoints (+ top/bottom vertices for a pointy hex / left-right for flat).
const pois = [];
if (b.shape === "circle") for (let k = 0; k < 8; k++) pois.push(outer[k * 8]);
else {
  for (let i = 0; i < outer.length; i++) { const a = outer[i], c = outer[(i + 1) % outer.length]; pois.push([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]); }
  if (b.shape === "hex-pointy") pois.unshift(outer[0], outer[3]);
  if (b.shape === "hex-flat") pois.unshift(outer[3], outer[0]);
}
const half = Math.max(12, Math.round(b.width * 0.035));
const pad = half + 4;
const padded = await sharp(src).ensureAlpha().extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const tiles = [];
for (const [x, y] of pois) {
  const left = Math.round(x - half) + pad, top = Math.round(y - half) + pad, size = half * 2;
  const ox = Math.round(x - half), oy = Math.round(y - half);
  const pl = (pts, col) => `<polygon points="${pts.map(([px, py]) => `${(px - ox).toFixed(2)},${(py - oy).toFixed(2)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${size / 240}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${pl(outer, "#ff00ff")}${inner ? pl(inner, "#00e0ff") : ""}</svg>`;
  const crop = await sharp(padded).extract({ left, top, width: size, height: size }).flatten({ background: "#7f7f7f" }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  tiles.push({ input: await sharp(crop).resize(300, 300, { kernel: "nearest" }).png().toBuffer(), name: `${x.toFixed(0)},${y.toFixed(0)}` });
}
fs.writeFileSync(out, await montage(tiles, { tile: 300, cols: 5 }));
console.log("wrote", out);
