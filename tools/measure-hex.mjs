#!/usr/bin/env node
// Dev tool for hand-checked ground truth of a pointy-hex border (independent of the detector).
//
//   node tools/measure-hex.mjs <file> --box=cx,cy,w,h [--alpha=40] [--cols=0.02,0.06,0.10] [--rows=-0.1,0,0.1]
//
// Scans inward from outside the image along columns near the left/right ends (hitting the
// four slanted sides from above and below) and along rows (hitting the vertical sides), and
// reports the first pixel with alpha >= --alpha (sub-pixel, coverage based) plus a run-length
// summary so occluding art can be told apart from the border. Then fits the pointy-hex
// model y = cy ∓ h·(1/2 − |x−cx|/(2w)) to the slanted samples (pairs from the same column)
// and takes x-extent from the rows. Inspect the runs; drop columns with --skip=<x,...>.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
const o = Object.fromEntries(process.argv.slice(3).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v]; }));
const [bcx, bcy, bw, bh] = o.box.split(",").map(Number);
const athr = (+(o.alpha ?? 40)) / 255;
const colsF = (o.cols ?? "0.02,0.05,0.08,0.11").split(",").map(Number);
const rowsF = (o.rows ?? "-0.12,-0.06,0,0.06,0.12").split(",").map(Number);
const skip = new Set((o.skip ?? "").split(",").filter(Boolean).map((s) => Math.round(+s)));
const { data, info } = await sharp(path.join(ROOT, "test-images", file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : data[(y * W + x) * 4 + 3] / 255;
const desc = (x, y) => {
  const i = (y * W + x) * 4, a = data[i + 3];
  if (a < 20) return ".";
  return `${a < 235 ? "a" + Math.round(a / 25.5) : ""}${data[i] >> 5}${data[i + 1] >> 5}${data[i + 2] >> 5}`;
};
// March from outside along (x,y)+k*(dx,dy); return continuous edge coordinate along the march axis.
function march(x0, y0, dx, dy, n) {
  let k = 0;
  while (k < n && A(x0 + k * dx, y0 + k * dy) < athr) k++;
  if (k >= n) return null;
  const x = x0 + k * dx, y = y0 + k * dy;
  const a0 = A(x - dx, y - dy), a1 = A(x, y);
  const t = dx ? x : y, fwd = (dx || dy) > 0;
  // coverage-based sub-pixel estimate (assumes the edge lies within the two pixels)
  const edge = fwd ? t + 1 - Math.min(1, a0 + a1) : t + Math.min(1, a0 + a1);
  const runs = [];
  for (let j = 0; j < 50; j++) {
    const xx = x + j * dx, yy = y + j * dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
    const d = desc(xx, yy);
    if (runs.length && runs.at(-1)[0] === d) runs.at(-1)[1]++; else runs.push([d, 1]);
  }
  return { edge, runs: runs.map(([d, c]) => `${d}x${c}`).join(" ") };
}

const pairs = [];
console.log("columns (top edge / bottom edge):");
for (const f of colsF) for (const side of [-1, 1]) {
  const x = Math.round(bcx + side * (bw / 2 - f * bw));
  if (skip.has(x)) continue;
  const t = march(x, 0, 0, 1, H), b = march(x, H - 1, 0, -1, H);
  console.log(`  x=${x}  top ${t?.edge.toFixed(2)}  [${t?.runs}]\n          bot ${b?.edge.toFixed(2)}  [${b?.runs}]`);
  if (t && b) pairs.push({ x: x + 0.5, top: t.edge, bot: b.edge });
}
console.log("rows (left edge / right edge):");
const lefts = [], rights = [];
for (const f of rowsF) {
  const y = Math.round(bcy + f * bh);
  const l = march(0, y, 1, 0, W), r = march(W - 1, y, -1, 0, W);
  console.log(`  y=${y}  left ${l?.edge.toFixed(2)} [${l?.runs}]\n          right ${r?.edge.toFixed(2)} [${r?.runs}]`);
  if (l) lefts.push(l.edge); if (r) rights.push(r.edge);
}
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN; };
const L = med(lefts), R = med(rights), cx = (L + R) / 2, w = R - L;
const cys = pairs.map((p) => (p.top + p.bot) / 2);
const hs = pairs.map((p) => (p.bot - p.top) / (2 * (0.5 - Math.abs(p.x - cx) / (2 * w))));
console.log("per-column cy:", cys.map((v) => v.toFixed(1)).join(" "));
console.log("per-column h: ", hs.map((v) => v.toFixed(1)).join(" "));
const cy = med(cys), h = med(hs);
console.log(`\nfit: cx=${cx.toFixed(1)} cy=${cy.toFixed(1)} w=${w.toFixed(1)} h=${h.toFixed(1)} aspect=${(w / h).toFixed(4)}`);
console.log(`--box=${cx.toFixed(1)},${cy.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}`);
