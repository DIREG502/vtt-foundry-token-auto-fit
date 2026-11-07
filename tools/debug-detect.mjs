// Dev tool: run detectBorder with debug logging on one image.  node tools/debug-detect.mjs <file> [shape]
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBorder } from "../src/detector/index.js";
const [f, shape] = process.argv.slice(2);
const { data, info } = await sharp(fileURLToPath(new URL("../test-images/" + f, import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const r = detectBorder({ width: info.width, height: info.height, data }, { shape: shape ?? "hex-pointy", debug: true, fallback: false });
const fx = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
for (const d of r.debug ?? []) console.log(d.canonical ? "CAN " : "FREE", fx(d.cx), fx(d.cy), fx(d.w), fx(d.h), "rot", fx(d.rot * 57.3, 2), "t", fx(d.thickness), "cov", fx(d.cov, 2), "inl", fx(d.inlier, 2), "band", fx(d.band, 2), "cons", fx(d.cons, 2), "bal", fx(d.bal, 2), "score", fx(d.score, 3), "| from", fx(d.from.cx), fx(d.from.w), fx(d.from.coarse, 3));
console.log("RESULT", fx(r.cx), fx(r.cy), fx(r.width), fx(r.height), "t", fx(r.thickness), "conf", fx(r.confidence, 3));
