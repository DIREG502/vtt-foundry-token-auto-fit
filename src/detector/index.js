// Token border detector — pure core, no DOM and no Foundry dependencies.
//
//   import { detectBorder } from "./detector/index.js";
//   const r = detectBorder(imageData, { shape: "hex-pointy" });
//   // r = { shape, cx, cy, width, height, rotation, thickness, confidence, ... } in source px
//
// cx/cy/width/height describe the OUTER edge of the painted border (bounding box in the
// shape's own frame, rotation in degrees). `thickness` is the border's stroke width, so the
// centre line and inner edge can be derived (see borderBox()).

import { buildLevel, computeEdges, edgePixels } from "./image.js";
import { polygonCandidates, circleCandidates, dedupe, searchRegion } from "./hough.js";
import { scorePerimeter, smoothstep } from "./score.js";
import { refine, edgeScan, analyseScan, bandCoverage, snapOuterPerSide, fitShape } from "./refine.js";
import { SHAPES, baseAspect, offsetShape, meanApothem, signedDistance } from "./shapes.js";

export const DETECTOR_VERSION = 2;

export const DEFAULTS = Object.freeze({
  shape: "hex-pointy",
  fallback: true,          // try the other shapes when the expected one is weak
  fallbackBelow: 0.8,      // confidence under which other shapes are also tried
  method: "hough",         // "hough" | "grid" (brute-force baseline, slower)
  coarseSize: 512,
  rotationTolerance: 3,    // degrees
  aspectTolerance: 0.12,   // +-12 % around the regular aspect ratio
  angleTolerance: 5,       // degrees, edge orientation vs side direction
  centerRegion: 0.32,      // centre searched within +-32 % of image size around the middle
  minSize: 0.2,            // border bounding box: 20 % of the shorter side ...
  maxSize: 1.04,           // ... up to 104 % of the longer side
  anchorsPerPair: 10,
  circleCenters: 8,
  maxCandidates: 60,
  refineTop: 4,
  scanThickness: true,
  timeBudget: 800,         // ms; safety cap: remaining fallback shapes are skipped after this
  aspectPrior: 2.5,        // score penalty per unit of aspect deviation beyond aspectFree
  aspectFree: 0.035,       // aspect deviation (fraction) that costs nothing: real frames are often 2-3 % off regular
  hypotheses: "upright,free", // refinement hypotheses per polygon candidate (see detectShape);
                           // add "regular" for a regular-aspect fit when evidence is weak. Circles
                           // always try circle (regular) and ellipse (free).
  coarseRotations: false,  // also search +-2.5 deg rotations at the coarse stage (the histogram's
                           // angular tolerance and the "free" refinement already cover them)
  snapOuter: true,         // per-side snap to the outermost consensus edge (thick multi-line frames)
  padClipped: true,        // add a transparent margin when cut-out art touches the canvas edge
});

const now = () => (globalThis.performance?.now?.() ?? Date.now());

function toFull(level, s) {
  const sx = level.scale, sy = level.scaleY;
  return { ...s, cx: (s.cx + 0.5) / sx - 0.5, cy: (s.cy + 0.5) / sy - 0.5, w: s.w / sx, h: s.h / sy };
}
function toLevel(level, s) {
  const sx = level.scale, sy = level.scaleY;
  return { ...s, cx: (s.cx + 0.5) * sx - 0.5, cy: (s.cy + 0.5) * sy - 0.5, w: s.w * sx, h: s.h * sy };
}

/** Brute-force baseline: perimeter score over a coarse grid of centres and sizes. */
export function gridCandidates(img, shape, opts) {
  const lvl = computeEdges(buildLevel(img, 160));
  const reg = searchRegion(lvl, opts);
  const out = [];
  const aspects = shape === "circle" ? [1] : [1 - opts.aspectTolerance / 2, 1, 1 + opts.aspectTolerance / 2];
  const big = Math.max(baseAspect(shape), 1);
  for (const asp of aspects) {
    const w1 = baseAspect(shape) * asp;
    for (let cy = reg.y0; cy <= reg.y1; cy += 2) {
      for (let cx = reg.x0; cx <= reg.x1; cx += 2) {
        for (let hh = reg.minSize / big; hh <= reg.maxSize / big; hh += 2) {
          const s = { shape, cx, cy, w: w1 * hh, h: hh, rot: 0 };
          const sc = scorePerimeter(lvl, s, { maxPoints: 48 });
          if (sc.score > 0.2) out.push({ ...s, votes: sc.score });
        }
      }
    }
  }
  // Map to source pixels; caller maps to its own level.
  return dedupe(out, opts.maxCandidates).map((c) => ({ ...toFull(lvl, c), votes: c.votes }));
}

/** Same border seen at a different edge (outer/inner) — not a competing interpretation. */
function concentric(a, b, tight = false) {
  const size = Math.max(a.w, a.h);
  const sameAspect = Math.abs((a.w / a.h) / (b.w / b.h) - 1) < 0.02;
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < (tight ? 0.012 : 0.03) * size && sameAspect &&
    Math.abs(Math.max(b.w, b.h) / size - 1) < 0.2;
}

function detectShape(img, level, edges, shape, opts, timings, { minCoarse = 0 } = {}) {
  const t0 = now();
  let cands;
  if (opts.method === "grid") cands = gridCandidates(img, shape, opts).map((c) => toLevel(level, c));
  else if (shape === "circle") cands = circleCandidates(level, edges, opts);
  else cands = polygonCandidates(level, edges, shape, opts);
  const t1 = now();
  const scored = cands.map((c) => ({ c, sc: scorePerimeter(level, c) }));
  scored.sort((a, b) => b.sc.score - a.sc.score);
  const t2 = now();
  const coarseTop = scored[0]?.sc.score ?? 0;
  if (coarseTop < minCoarse) {
    timings.candidates += t1 - t0; timings.scoring += t2 - t1;
    return { skipped: true, coarseTop };
  }

  // Refine the best few *distinct* borders.
  const picked = [];
  for (const s of scored) {
    if (picked.some((p) => concentric(p.c, s.c, true))) continue;
    picked.push(s);
    if (picked.length >= opts.refineTop) break;
  }
  const px = 1 / level.scale;
  const rotLimit = (opts.rotationTolerance * Math.PI) / 180 + 1e-6;
  const results = [];
  const scoreOf = (r) => evidence(r) * (0.6 + 0.4 * r.level.consistency) * (0.7 + 0.3 * r.level.sideBalance) *
    aspectPrior(r.shape, opts.aspectPrior, opts.aspectFree);
  // Hypotheses per candidate: "upright" (free aspect, no rotation), "free" (aspect and rotation
  // within tolerance) and "regular" (regular aspect, no rotation). Real frames are often a few
  // percent off regular, so upright goes first; free only runs when upright leaves room for
  // improvement, and regular only when the evidence is weak (heavy occlusion), where the
  // constrained model resists drifting onto art. A later hypothesis must beat the current
  // choice clearly. Circles: regular = circle, free = ellipse.
  const want = new Set(String(opts.hypotheses).split(","));
  const excellent = (r) => r && r.inlier >= 0.88 && r.level.coverage >= 0.88;
  const weak = (r) => !r || r.inlier < 0.75 || r.level.coverage < 0.8;
  const H = {
    regular: { tieAspect: baseAspect(shape), lockRotation: true, canonical: true, gate: shape === "circle" ? () => true : weak },
    upright: { tieAspect: 0, lockRotation: true, canonical: false, gate: () => true },
    free: { tieAspect: 0, lockRotation: shape === "circle", canonical: false, gate: (r) => !excellent(r) },
  };
  const order = shape === "circle" ? ["regular", "free"] : ["upright", "free", "regular"].filter((k) => want.has(k));
  const hyps = order.filter((k) => k !== "free" || opts.rotationTolerance > 0 || shape === "circle").map((k) => ({ ...H[k], name: k }));
  // Several coarse candidates usually converge to the same border; once a fit reproduces an
  // earlier one, the rest of that candidate's hypotheses would too.
  const same = (a, b) => Math.abs(a.cx - b.cx) < 1 && Math.abs(a.cy - b.cy) < 1 && Math.abs(a.w - b.w) < 1.5 &&
    Math.abs(a.h - b.h) < 1.5 && Math.abs((a.rot || 0) - (b.rot || 0)) < 0.002;
  for (const { c, sc: coarse } of picked) {
    // Clear winner already refined and this candidate was much weaker at the coarse stage.
    const lead = results.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
    if (lead && lead.score > 0.8 && coarse.score < 0.8 * lead.coarse.score) break;
    let chosen = null;
    for (const hyp of hyps) {
      if (chosen && !hyp.gate(chosen)) continue;
      const r = runHypothesis(img, level, toFull(level, c), shape, hyp, { px, rotLimit, scan: opts.scanThickness, snap: opts.snapOuter });
      r.coarse = coarse;
      r.score = scoreOf(r);
      if (!Number.isFinite(r.score) || ![r.shape.cx, r.shape.cy, r.shape.w, r.shape.h].every(Number.isFinite)) continue;
      r.canonical = hyp.canonical; r.hypothesis = hyp.name;
      if (opts.debug) (opts.debugLog ??= []).push({ shape, canonical: hyp.canonical, hypothesis: hyp.name, cx: r.shape.cx, cy: r.shape.cy, w: r.shape.w, h: r.shape.h,
        rot: r.shape.rot, thickness: r.thickness, cov: r.level.coverage, cons: r.level.consistency, bal: r.level.sideBalance,
        inlier: r.inlier, band: r.band, score: r.score, from: { cx: c.cx / level.scale, w: c.w / level.scale, coarse: coarse.score } });
      const dup = results.some((q) => same(q.shape, r.shape));
      if (!chosen) chosen = r;
      else if (r.score > chosen.score * 1.04 + 0.005) chosen = r;
      if (dup) break;
    }
    if (chosen) results.push(chosen);
  }
  const t3 = now();
  timings.candidates += t1 - t0; timings.scoring += t2 - t1; timings.refine += t3 - t2;

  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  if (!best) return null;
  const rival = results.find((r) => r !== best && !concentric(best.shape, r.shape));
  const ratio = rival ? rival.score / Math.max(1e-6, best.score) : 0;
  const base = smoothstep(0.2, 0.62, evidence(best));
  const confidence = base * (0.65 + 0.35 * best.level.consistency) * (0.75 + 0.25 * best.level.sideBalance) *
    (1 - 0.5 * smoothstep(0.7, 1.0, ratio));
  return { ...best, confidence, coarseTop, candidates: cands.length, rival: rival ? { ...rival.shape, score: rival.score } : null };
}

/** Edge evidence 0..1: coverage (coarse), inliers (full res) and, when a band exists, the thin-line cue. */
function evidence(r) {
  const e = Math.min(r.level.coverage, r.inlier + 0.1);
  return Number.isFinite(r.band) ? 0.5 * e + 0.5 * Math.min(e, r.band + 0.1) : e;
}

/**
 * Painted borders are close to regular, but real frames are often a few percent off (e.g. a
 * pointy hex drawn into a 433x512 canvas has aspect 0.845, not 0.866). Deviations up to
 * `free` cost nothing; beyond that, stretched fits must earn it.
 */
function aspectPrior(s, k, free = 0) {
  const dev = Math.max(0, Math.abs(s.w / s.h / baseAspect(s.shape) - 1) - free);
  return Math.max(0.5, 1 - k * dev);
}

function runHypothesis(img, level, start, shape, hyp, { px, rotLimit, scan, snap }) {
  const rl = shape === "circle" || hyp.lockRotation ? 0 : rotLimit;
  const common = { rotLimit: rl, tieAspect: hyp.tieAspect, lockRotation: hyp.lockRotation };
  // First pass only needs to get within a few px: the outer-edge pass below refines to 1.6 px.
  let r = refine(img, start, { px, ...common, minRadius: scan ? 2.5 : 1.6 });
  let shapeFull = r.shape;
  let thickness = 0, band = NaN;
  if (snap) {
    // Thick frames: make every side sit on the outermost consensus edge (see snapOuterPerSide).
    const outward = Math.max(6, 0.05 * meanApothem(shapeFull));
    const sn = snapOuterPerSide(img, shapeFull, { outward, inward: Math.max(2, 0.5 * px) });
    if (sn.obs.length >= 24) {
      const free = [true, true, true, true, shape !== "circle" && !hyp.lockRotation];
      // The snapped edges can be far from the current outline (a whole band width), so fit
      // wide first, then tighten to drop the odd outlier.
      let f = fitShape(shapeFull, sn.obs, { tukey: outward + 4, iterations: 6, free, rotLimit: rl, tieAspect: hyp.tieAspect });
      f = fitShape(f.shape, sn.obs, { tukey: 3, iterations: 4, free, rotLimit: rl, tieAspect: hyp.tieAspect });
      if ([f.shape.cx, f.shape.cy, f.shape.w, f.shape.h].every(Number.isFinite)) shapeFull = f.shape;
    }
  }
  if (scan) {
    const sc = edgeScan(img, shapeFull, { thrAbs: 0.25 * (r.observation?.ref ?? 0) });
    const an = analyseScan(sc);
    const from = an.outer > 0.75 ? offsetShape(shapeFull, an.outer) : shapeFull;
    r = refine(img, from, { px: 1, startRadius: an.outer > 0.75 ? 3 : 2.5, finalMode: "outer", ...common });
    shapeFull = r.shape;
    // Thickness = the inner offset that forms a band with the outer edge on the most outline
    // points (tested on the strongest few parallel-edge peaks of the scan).
    const inner = an.peaks
      .filter((p) => p.t < an.outer - 1.5 && p.c >= 0.08)
      .sort((a, b) => b.c - a.c).slice(0, 4);
    const tested = [];
    for (const p of inner) {
      const t = an.outer - p.t;
      const b = bandCoverage(img, shapeFull, t);
      if (Number.isFinite(b)) tested.push({ t, b });
    }
    // Widest band that is nearly as consistent as the best one: a double-line or bevelled
    // border reports its full width rather than just its outer hairline.
    const bestB = Math.max(0, ...tested.map((x) => x.b));
    for (const x of tested) if (x.b >= 0.8 * bestB && x.t > thickness) { thickness = x.t; band = x.b; }
    if (tested.length && !Number.isFinite(band)) band = bestB;
    if (Number.isFinite(band) && band < 0.15) { band = NaN; thickness = 0; }
  }
  const lv = scorePerimeter(level, toLevel(level, shapeFull));
  // Full-resolution inlier fraction: share of outline points with an edge within tolerance.
  const obs = r.observation;
  const tol = Math.max(1, 0.6 * Math.max(1, px));
  let inl = 0;
  if (obs) for (const o of obs.obs) if (Math.abs(signedDistance(shapeFull, o.x, o.y)) < tol) inl++;
  return { shape: shapeFull, thickness, level: lv, inlier: obs ? inl / obs.n : 0, band };
}

/**
 * Detect the painted border in an RGBA image.
 * @param {{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} img
 * @param {Partial<typeof DEFAULTS>} options
 */
export function detectBorder(img, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!SHAPES.includes(opts.shape)) opts.shape = DEFAULTS.shape;
  // Token art is often cropped exactly to the frame, so the outer edge lies ON the canvas
  // boundary, where no gradient can be measured. Outside the canvas is transparent in Foundry,
  // so a cut-out image whose opaque pixels reach the edge gets a transparent margin.
  const m = opts.padClipped ? clippedMargin(img, opts) : 0;
  if (!m) return detectCore(img, opts);
  const t0 = now();
  const padded = padImage(img, m);
  const padMs = now() - t0;
  const r = detectCore(padded, opts);
  r.cx -= m; r.cy -= m;
  if (!r.stats) { r.width = img.width; r.height = img.height; } // nothing found: whole image
  if (r.rival) { r.rival.cx -= m; r.rival.cy -= m; }
  r.imageWidth = img.width; r.imageHeight = img.height;
  r.timings.prep += padMs; r.timings.total += padMs;
  r.padded = m;
  return r;
}

/** Margin (px) to add when a cut-out image has opaque pixels on its boundary; 0 otherwise. */
export function clippedMargin(img, opts = DEFAULTS) {
  const { width: w, height: h, data } = img;
  const a = (x, y) => data[(y * w + x) * 4 + 3];
  // Cut-out art: at least three transparent corners (an opaque photo/JPEG must not get an
  // artificial rectangular edge).
  const corners = [a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)].filter((v) => v < 16).length;
  if (corners < 3) return 0;
  let opaque = 0;
  const step = Math.max(1, Math.floor(Math.max(w, h) / 1024));
  for (let x = 0; x < w; x += step) { if (a(x, 0) > 16) opaque++; if (a(x, h - 1) > 16) opaque++; }
  for (let y = 0; y < h; y += step) { if (a(0, y) > 16) opaque++; if (a(w - 1, y) > 16) opaque++; }
  if (!opaque) return 0;
  // >= 3 px at the coarse level so its edge filter sees the transition.
  return Math.max(4, Math.ceil((3 * Math.max(w, h)) / (opts.coarseSize || 512)));
}

export function padImage(img, m) {
  const { width: w, height: h, data } = img;
  const W = w + 2 * m, H = h + 2 * m;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(y * w * 4, (y + 1) * w * 4), ((y + m) * W + m) * 4);
  return { width: W, height: H, data: out };
}

function detectCore(img, opts) {
  const timings = { prep: 0, candidates: 0, scoring: 0, refine: 0, total: 0 };
  const t0 = now();
  const level = computeEdges(buildLevel(img, opts.coarseSize));
  const edges = edgePixels(level, 0.2);
  timings.prep = now() - t0;

  const order = [opts.shape, ...(opts.fallback ? fallbackOrder(opts.shape) : [])];
  const tried = [];
  const results = [];
  let best = null;
  for (const shape of order) {
    const fallback = shape !== opts.shape;
    // Stop once the EXPECTED shape is convincing. If a fallback shape is leading, keep looking:
    // the remaining shapes may hold a larger border that encloses it (see below).
    if (fallback && best && best.confidence >= opts.fallbackBelow && best.shape.shape === opts.shape) break;
    if (fallback && now() - t0 > opts.timeBudget) break; // safety cap
    // A fallback shape is only refined when its coarse evidence rivals the expected shape's.
    const hinted = results.find((r) => r.shape.shape === opts.shape);
    const minCoarse = fallback && hinted ? 0.85 * hinted.coarseTop : 0;
    const r = detectShape(img, level, edges, shape, opts, timings, { minCoarse });
    if (!r || r.skipped) { if (r) tried.push({ shape, skipped: true, coarse: r.coarseTop }); continue; }
    tried.push({ shape, confidence: r.confidence });
    // Another shape must clearly beat the expected one.
    const adj = fallback ? r.confidence - 0.08 : r.confidence;
    results.push({ ...r, adj });
    if (!best || adj > best.adj) best = results.at(-1);
  }
  // A painted border encloses the art: if the winner lies inside a clearly larger result that
  // is still plausible (e.g. a round shield inside a hex frame), the larger one is the border.
  if (best) {
    const area = (r) => r.shape.w * r.shape.h;
    const inside = (a, b) => Math.abs(a.shape.cx - b.shape.cx) + a.shape.w / 2 <= b.shape.w / 2 * 1.02 &&
      Math.abs(a.shape.cy - b.shape.cy) + a.shape.h / 2 <= b.shape.h / 2 * 1.02;
    const encl = results.filter((r) => r !== best && r.confidence >= 0.6 && area(r) > 2 * area(best) && inside(best, r))
      .sort((a, b) => b.adj - a.adj)[0];
    if (encl) best = encl;
  }
  timings.total = now() - t0;
  if (!best) {
    return { shape: opts.shape, cx: img.width / 2, cy: img.height / 2, width: img.width, height: img.height,
      rotation: 0, thickness: 0, confidence: 0, detectorVersion: DETECTOR_VERSION, tried, timings, imageWidth: img.width, imageHeight: img.height };
  }
  const s = best.shape;
  return {
    shape: s.shape,
    cx: s.cx, cy: s.cy, width: s.w, height: s.h,
    rotation: ((s.rot || 0) * 180) / Math.PI,
    thickness: best.thickness,
    confidence: Math.max(0, Math.min(1, best.confidence)),
    stats: {
      coverage: best.level.coverage, consistency: best.level.consistency, sideBalance: best.level.sideBalance,
      inlier: best.inlier, candidates: best.candidates,
    },
    rival: best.rival ? { cx: best.rival.cx, cy: best.rival.cy, width: best.rival.w, height: best.rival.h, score: best.rival.score } : null,
    tried, timings, debug: opts.debugLog,
    imageWidth: img.width, imageHeight: img.height,
    detectorVersion: DETECTOR_VERSION,
  };
}

function fallbackOrder(shape) {
  const all = { "hex-pointy": ["circle", "hex-flat", "square"], "hex-flat": ["circle", "hex-pointy", "square"],
    circle: ["hex-pointy", "hex-flat", "square"], square: ["circle", "hex-pointy", "hex-flat"] };
  return all[shape] ?? [];
}

/**
 * Bounding box of the border at a reference line: "outer" (default), "center" or "inner".
 * Works on a detection result or a stored fit flag ({cx, cy, width, height, thickness, shape}).
 */
export function borderBox(r, edge = "outer") {
  const t = edge === "inner" ? r.thickness || 0 : edge === "center" ? (r.thickness || 0) / 2 : 0;
  if (!t) return { cx: r.cx, cy: r.cy, width: r.width, height: r.height };
  const s = offsetShape({ shape: r.shape, cx: r.cx, cy: r.cy, w: r.width, h: r.height, rot: 0 }, -t);
  return { cx: r.cx, cy: r.cy, width: s.w, height: s.h };
}

export { meanApothem };
