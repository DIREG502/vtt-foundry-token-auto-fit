#!/usr/bin/env node
// Benchmark: candidate generation methods ("hough" vs "grid") and per-stage timings.
//   npm run bench [-- --runs=3 --only=2048]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBorder } from "../src/detector/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const runs = +(args.runs ?? 3);
const extra = Object.fromEntries(Object.entries(args).filter(([k]) => k.startsWith("opt.")).map(([k, v]) => [k.slice(4), v === "true" ? true : v === "false" ? false : Number.isFinite(+v) ? +v : v]));
const methods = (args.methods ?? "hough,grid").split(",");
const expected = JSON.parse(fs.readFileSync(path.join(ROOT, "test-images/expected.json"), "utf8"));
const files = Object.keys(expected).filter((f) => !args.only || f.includes(args.only));
const summary = {};
for (const f of files) {
  const gt = expected[f];
  const { data, info } = await sharp(path.join(ROOT, "test-images", f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { width: info.width, height: info.height, data };
  for (const method of methods) {
    detectBorder(img, { shape: gt.shape, method, ...extra }); // warm-up
    const times = [];
    let r;
    for (let i = 0; i < runs; i++) { const t0 = performance.now(); r = detectBorder(img, { shape: gt.shape, method, ...extra }); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    const err = Math.max(Math.hypot(r.cx - gt.cx, r.cy - gt.cy), Math.abs(r.width - gt.width), Math.abs(r.height - gt.height)) / gt.width;
    (summary[method] ??= []).push({ f, ms: times[Math.floor(times.length / 2)], err, conf: r.confidence, t: r.timings });
    console.log(`${method.padEnd(6)} ${f.padEnd(44)} ${info.width}x${info.height}  median ${times[Math.floor(times.length / 2)].toFixed(0).padStart(5)} ms  maxErr ${(err * 100).toFixed(2)}%  conf ${r.confidence.toFixed(2)}  ` +
      Object.entries(r.timings).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" "));
  }
}
console.log("\nmethod  pass(<1.5%)  mean ms  max ms");
for (const [m, rows] of Object.entries(summary)) {
  const pass = rows.filter((r) => r.err < 0.015).length;
  console.log(`${m.padEnd(7)} ${String(pass).padStart(3)}/${rows.length}      ${(rows.reduce((a, r) => a + r.ms, 0) / rows.length).toFixed(0).padStart(5)}   ${Math.max(...rows.map((r) => r.ms)).toFixed(0).padStart(5)}`);
}
