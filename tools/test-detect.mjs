#!/usr/bin/env node
// Runs the detector on every image in test-images/, writes annotated PNGs and a contact
// sheet to test-output/, and checks results against test-images/expected.json.
//
//   npm run test:detect                 # shape hint taken from expected.json (as the grid would)
//   npm run test:detect -- --blind      # always hint hex-pointy: exercises the shape fallback
//   npm run test:detect -- --method=grid
//   npm run test:detect -- --only=gold  # substring filter
//
// Pass criterion (per image with ground truth): centre error and width/height error
// < 1.5 % of the ground-truth border width, at the outer edge.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBorder, borderBox } from "../src/detector/index.js";
import { shapePoints } from "./lib/geometry.mjs";
import { montage } from "./lib/montage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN = path.join(ROOT, "test-images");
const OUT = path.join(ROOT, "test-output");
fs.mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const TOL = 0.015;

const expected = fs.existsSync(path.join(IN, "expected.json")) ? JSON.parse(fs.readFileSync(path.join(IN, "expected.json"), "utf8")) : {};
const files = fs.readdirSync(IN).filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f) && (!args.only || f.includes(args.only))).sort();

function guessShape(f) {
  if (/circle|round/i.test(f)) return "circle";
  if (/square|rect/i.test(f)) return "square";
  if (/flat/i.test(f)) return "hex-flat";
  return "hex-pointy";
}

function polyline(pts, attrs) {
  return `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" ${attrs}/>`;
}

const rows = [];
const tiles = [];
let failures = 0;
for (const f of files) {
  const { data, info } = await sharp(path.join(IN, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
  const gt = expected[f];
  const hint = args.blind ? "hex-pointy" : (gt?.shape ?? guessShape(f));
  // Warm-up run so the timing reflects JIT-compiled code (as it would after the first token in a session).
  if (!rows.length) detectBorder(img, { shape: hint, method: args.method });
  const t0 = performance.now();
  const r = detectBorder(img, { shape: hint, method: args.method ?? "hough" });
  const ms = performance.now() - t0;

  let err = null, pass = null;
  if (gt) {
    const W = gt.width;
    err = {
      center: Math.hypot(r.cx - gt.cx, r.cy - gt.cy) / W,
      width: Math.abs(r.width - gt.width) / W,
      height: Math.abs(r.height - gt.height) / W,
      thickness: gt.thickness != null ? r.thickness - gt.thickness : null,
    };
    pass = r.shape === gt.shape && err.center < TOL && err.width < TOL && err.height < TOL;
    if (!pass) failures++;
  }
  rows.push({ file: f, hint, ...pick(r), ms: +ms.toFixed(1), err, pass });

  // Overlay: ground truth (magenta, thin), detected outer edge (green), centre line (dashed), inner (thin green).
  const sw = Math.max(2, info.width / 400);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">`;
  if (gt) svg += polyline(shapePoints(gt.shape, gt.cx, gt.cy, gt.width, gt.height, gt.rotation || 0), `stroke="#ff00ff" stroke-width="${sw}" stroke-opacity="0.9"`);
  const outer = shapePoints(r.shape, r.cx, r.cy, r.width, r.height, r.rotation);
  svg += polyline(outer, `stroke="#00ff40" stroke-width="${sw * 1.4}"`);
  if (r.thickness > 0) {
    const c = borderBox(r, "center"), inn = borderBox(r, "inner");
    svg += polyline(shapePoints(r.shape, c.cx, c.cy, c.width, c.height, r.rotation), `stroke="#00ff40" stroke-width="${sw * 0.7}" stroke-dasharray="${sw * 4} ${sw * 3}"`);
    svg += polyline(shapePoints(r.shape, inn.cx, inn.cy, inn.width, inn.height, r.rotation), `stroke="#00c0ff" stroke-width="${sw * 0.7}"`);
  }
  svg += `<circle cx="${r.cx}" cy="${r.cy}" r="${sw * 3}" fill="#00ff40"/>`;
  const fs1 = Math.round(info.width / 28);
  const label = `${r.shape}  conf ${(r.confidence * 100).toFixed(0)}%  ${ms.toFixed(0)} ms` +
    (err ? `  err c ${(err.center * 100).toFixed(2)}% w ${(err.width * 100).toFixed(2)}% h ${(err.height * 100).toFixed(2)}%  ${pass ? "PASS" : "FAIL"}` : "");
  svg += `<rect x="0" y="0" width="${info.width}" height="${fs1 * 1.6}" fill="#000" fill-opacity="0.7"/>`;
  svg += `<text x="${fs1 * 0.4}" y="${fs1 * 1.15}" font-family="sans-serif" font-size="${fs1 * 0.78}" fill="${pass === false ? "#ff6060" : "#ffffff"}">${label}</text></svg>`;
  const outFile = path.join(OUT, f.replace(/\.\w+$/, ".png"));
  await sharp(path.join(IN, f)).ensureAlpha().composite([{ input: Buffer.from(svg) }]).png().toFile(outFile);
  tiles.push({ input: outFile, name: `${pass === false ? "FAIL " : ""}${f.replace("synthetic-", "")} ${(r.confidence * 100).toFixed(0)}%` });

  const e = err ? ` c=${(err.center * 100).toFixed(2)}% w=${(err.width * 100).toFixed(2)}% h=${(err.height * 100).toFixed(2)}% t=${err.thickness?.toFixed(1)}` : "";
  console.log(`${pass === null ? "  -- " : pass ? "PASS " : "FAIL "} ${f.padEnd(44)} ${r.shape.padEnd(10)} conf=${r.confidence.toFixed(2)} ${ms.toFixed(0).padStart(4)}ms${e}`);
}

function pick(r) {
  const o = {};
  for (const k of ["shape", "cx", "cy", "width", "height", "rotation", "thickness", "confidence"]) o[k] = typeof r[k] === "number" ? +r[k].toFixed(3) : r[k];
  o.stats = r.stats; o.timings = Object.fromEntries(Object.entries(r.timings).map(([k, v]) => [k, +v.toFixed(1)])); o.tried = r.tried;
  return o;
}

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2) + "\n");
if (tiles.length) fs.writeFileSync(path.join(OUT, "_contact-sheet.png"), await montage(tiles, { tile: 340, cols: 4 }));
const withGt = rows.filter((r) => r.pass !== null);
const maxMs = Math.max(...rows.map((r) => r.ms));
console.log(`\n${withGt.length - failures}/${withGt.length} passed (tolerance ${TOL * 100}% of border width); slowest ${maxMs.toFixed(0)} ms`);
console.log(`Annotated images: ${path.relative(ROOT, OUT)}${path.sep}   contact sheet: ${path.relative(ROOT, path.join(OUT, "_contact-sheet.png"))}`);
process.exitCode = failures ? 1 : 0;
