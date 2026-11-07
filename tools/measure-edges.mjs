#!/usr/bin/env node
// Dev tool for hand-made ground truth: prints pixel runs along a row or column so the outer
// edge of a painted border can be read off directly (independent of the detector).
//
//   node tools/measure-edges.mjs <file> row <y> <x0> <x1>
//   node tools/measure-edges.mjs <file> col <x> <y0> <y1>
//
// Each pixel prints as  <coord>:<alpha 0-9 if translucent><r g b in 0-7>  ('.' = transparent).
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [file, kind, idx, from, to] = process.argv.slice(2);
const { data, info } = await sharp(path.join(ROOT, "test-images", file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const step = +to >= +from ? 1 : -1;
const desc = (i) => {
  const a = data[i * 4 + 3];
  if (a < 20) return ".";
  return `${a < 235 ? "a" + Math.round(a / 25.5) : ""}${data[i * 4] >> 5}${data[i * 4 + 1] >> 5}${data[i * 4 + 2] >> 5}`;
};
if (kind === "first") {
  // first <dir:top|bottom|left|right> <c0,c1,...>: first pixel with alpha >= 128 along each line,
  // followed by a run-length summary of the next 60 px (to tell a border from occluding art).
  const H = info.height;
  for (const c of String(from).split(",").map(Number)) {
    const at = (t) => (idx === "top" || idx === "bottom") ? t * W + c : c * W + t;
    const n = (idx === "top" || idx === "bottom") ? H : W;
    const rev = idx === "bottom" || idx === "right";
    let t = rev ? n - 1 : 0;
    while (t >= 0 && t < n && data[at(t) * 4 + 3] < 128) t += rev ? -1 : 1;
    const runs = [];
    for (let k = 0; k < 60 && t + (rev ? -k : k) >= 0 && t + (rev ? -k : k) < n; k++) {
      const d = desc(at(t + (rev ? -k : k)));
      if (runs.length && runs.at(-1)[0] === d) runs.at(-1)[1]++; else runs.push([d, 1]);
    }
    // Sub-pixel edge in continuous coordinates (pixel i covers [i, i+1)), from the coverage
    // of the first opaque pixel and the one before it.
    const prev = t - (rev ? -1 : 1);
    const a0 = prev >= 0 && prev < n ? data[at(prev) * 4 + 3] / 255 : 0, a1 = data[at(t) * 4 + 3] / 255;
    const edge = rev ? t + a0 + a1 : t + 1 - a0 - a1;
    console.log(`${c}: ${edge.toFixed(2)}  ${runs.map(([d, k]) => `${d}x${k}`).join(" ")}`);
  }
  process.exit(0);
}
const out = [];
for (let t = +from; step > 0 ? t <= +to : t >= +to; t += step) out.push(`${t}:${desc(kind === "row" ? (+idx) * W + t : t * W + (+idx))}`);
console.log(out.join(" "));
