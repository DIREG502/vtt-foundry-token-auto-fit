// Dev tool: print the top coarse candidates for one image.  node tools/debug-candidates.mjs <file> <shape>
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const ROOT = new URL("../", import.meta.url).href;
const { buildLevel, computeEdges, edgePixels } = await import(ROOT+"src/detector/image.js");
const { polygonCandidates } = await import(ROOT+"src/detector/hough.js");
const { scorePerimeter } = await import(ROOT+"src/detector/score.js");
const { DEFAULTS } = await import(ROOT+"src/detector/index.js");
const f = process.argv[2], shape = process.argv[3];
const { data, info } = await sharp(fileURLToPath(new URL("test-images/"+f, ROOT))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const img = { width: info.width, height: info.height, data };
const level = computeEdges(buildLevel(img, 512));
const edges = edgePixels(level, 0.2);
console.log("level", level.width, level.height, "g90", level.g90.toFixed(4), "edges", edges.count);
const c = polygonCandidates(level, edges, shape, DEFAULTS);
const sc = c.map(x => ({...x, ...scorePerimeter(level, x)})).sort((a,b)=>b.score-a.score);
for (const x of sc.slice(0,8)) console.log((x.cx/level.scale).toFixed(1),(x.cy/level.scale).toFixed(1),(x.w/level.scale).toFixed(1),(x.h/level.scale).toFixed(1),(x.rot*57.3).toFixed(1),"asp",(x.w/x.h).toFixed(3),"votes",x.votes.toFixed(3),"score",x.score.toFixed(3),"cov",x.coverage.toFixed(2),"cons",x.consistency.toFixed(2),"bal",x.sideBalance.toFixed(2));
