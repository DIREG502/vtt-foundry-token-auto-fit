// Dev tool: trace the refinement stages of one hypothesis from a given start box.
//   node tools/debug-refine.mjs <file> cx,cy,w,h [--regular] [--shape=hex-pointy]
// The start box is in unpadded image coordinates; the image is padded like detectBorder does.
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const ROOT = new URL("../", import.meta.url).href;
const { DEFAULTS, clippedMargin, padImage } = await import(ROOT + "src/detector/index.js");
const { refine, snapOuterPerSide, fitShape, edgeScan, analyseScan } = await import(ROOT + "src/detector/refine.js");
const { meanApothem, baseAspect } = await import(ROOT + "src/detector/shapes.js");
const f = process.argv[2];
const [cx, cy, w, h] = process.argv[3].split(",").map(Number);
const shape = (process.argv.find((a) => a.startsWith("--shape=")) ?? "--shape=hex-pointy").slice(8);
const regular = process.argv.includes("--regular");
const { data, info } = await sharp(fileURLToPath(new URL("test-images/" + f, ROOT))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let img = { width: info.width, height: info.height, data };
const m = clippedMargin(img, DEFAULTS);
if (m) img = padImage(img, m);
const px = Math.max(img.width, img.height) / DEFAULTS.coarseSize;
const fmt = (s) => `cx ${(s.cx - m).toFixed(1)} cy ${(s.cy - m).toFixed(1)} w ${s.w.toFixed(1)} h ${s.h.toFixed(1)} rot ${((s.rot || 0) * 57.3).toFixed(2)}`;
const tie = regular ? baseAspect(shape) : 0;
let s = { shape, cx: cx + m, cy: cy + m, w, h, rot: 0 };
console.log("pad", m, "px", px.toFixed(2));
console.log("start   ", fmt(s));
const r1 = refine(img, s, { px, rotLimit: 0, tieAspect: tie, lockRotation: true, minRadius: 2.5 });
console.log("refine1 ", fmt(r1.shape), "obs", r1.observation?.obs.length);
const sn = snapOuterPerSide(img, r1.shape, { outward: Math.max(6, 0.05 * meanApothem(r1.shape)), inward: Math.max(2, 0.5 * px) });
console.log("snap offsets", sn.offsets.map((o) => `${o.side}:${o.t === null ? "-" : o.t.toFixed(1)}(${o.c.toFixed(2)})`).join(" "));
let fs = fitShape(r1.shape, sn.obs, { tukey: Math.max(6, 0.05 * meanApothem(r1.shape)) + 4, iterations: 6, free: [true, true, true, true, false], tieAspect: tie });
fs = fitShape(fs.shape, sn.obs, { tukey: 3, iterations: 4, free: [true, true, true, true, false], tieAspect: tie });
console.log("snapfit ", fmt(fs.shape));
const sc = edgeScan(img, fs.shape, {});
const an = analyseScan(sc);
console.log("scan outer", an.outer.toFixed(2), "peaks", an.peaks.filter((p) => p.c > 0.1).map((p) => `${p.t.toFixed(1)}:${p.c.toFixed(2)}`).join(" "));
