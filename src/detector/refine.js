// Full-resolution refinement.
//
// The coarse level only gets within a pixel or two of the border (i.e. 4-8 source px on a
// 2048 image). Refinement works directly on the source RGBA, sampling only short profiles
// across the outline, so it costs a few thousand bilinear samples per iteration no matter
// how big the image is:
//   1. for each outline point, find the strongest edge along the normal within +-R px;
//   2. drop points without a clear edge (occluded by art) and fit the shape parameters to
//      the remaining edge points by robust (Tukey-weighted) Gauss-Newton on the signed
//      distance; 3. shrink R and repeat.
// edgeScan() then looks for parallel edges inside/outside the fitted contour to find the
// border's outer edge and its thickness.

import { sampleRaw } from "./image.js";
import { perimeterPoints, perimeterLength, signedDistance, offsetShape, meanApothem } from "./shapes.js";

const F_A = new Float32Array(4);

/** Edge-strength profile along the normal at p: returns { ts, D } with D(t) = |F(t+.5)-F(t-.5)|. */
export function profile(img, p, tMin, tMax, step) {
  const n = Math.max(3, Math.floor((tMax - tMin) / step) + 1);
  const F = new Float32Array((n + 2) * 4);
  const valid = new Uint8Array(n + 2);
  for (let i = 0; i < n + 2; i++) {
    const t = tMin + (i - 1) * step;
    if (sampleRaw(img, p.x + p.nx * t, p.y + p.ny * t, F_A)) {
      F.set(F_A, i * 4); valid[i] = 1;
    }
  }
  const ts = new Float32Array(n), D = new Float32Array(n);
  const span = Math.max(1, Math.round(0.5 / step)); // half-width of the difference in samples
  for (let i = 0; i < n; i++) {
    ts[i] = tMin + i * step;
    const a = i + 1 - span, b = i + 1 + span;
    if (a < 0 || b >= n + 2 || !valid[a] || !valid[b]) { D[i] = 0; continue; }
    const o = a * 4, q = b * 4;
    D[i] = Math.hypot(F[q] - F[o], F[q + 1] - F[o + 1], F[q + 2] - F[o + 2], F[q + 3] - F[o + 3]);
  }
  return { ts, D };
}

function quantile(arr, q) {
  if (!arr.length) return 0;
  const a = Float32Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
}

function paramVec(s) { return [s.cx, s.cy, s.w, s.h, s.rot || 0]; }
function fromVec(s, v) { return { ...s, cx: v[0], cy: v[1], w: v[2], h: v[3], rot: v[4] }; }

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Robust fit of shape parameters to edge observations.
 * obs: [{ x, y, w }] (w = prior weight). free: boolean[5] for [cx, cy, w, h, rot].
 */
export function fitShape(s, obs, { tukey = 2, iterations = 4, free = [true, true, true, true, true], rotLimit = Infinity, tieAspect = 0 } = {}) {
  let v = paramVec(s);
  // tieAspect = w/h ratio to hold fixed: w follows h and is not a free parameter.
  if (tieAspect) { free = free.slice(); free[2] = false; v[2] = tieAspect * v[3]; }
  const eps = [0.05, 0.05, 0.1, 0.1, 2e-4];
  const idx = free.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  let last = { rms: Infinity, inliers: 0 };
  for (let it = 0; it < iterations; it++) {
    const cur = fromVec(s, v);
    const n = idx.length;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    let wsum = 0, r2 = 0, inl = 0;
    for (const o of obs) {
      const r = signedDistance(cur, o.x, o.y);
      const u = r / tukey;
      if (Math.abs(u) >= 1) continue;
      const tw = (1 - u * u) ** 2 * o.w;
      const J = new Array(n);
      for (let a = 0; a < n; a++) {
        const k = idx[a];
        const vp = v.slice(); vp[k] += eps[k];
        if (tieAspect && k === 3) vp[2] = tieAspect * vp[3];
        J[a] = (signedDistance(fromVec(s, vp), o.x, o.y) - r) / eps[k];
      }
      for (let a = 0; a < n; a++) {
        g[a] += tw * J[a] * r;
        for (let b = 0; b < n; b++) A[a][b] += tw * J[a] * J[b];
      }
      wsum += tw; r2 += tw * r * r; inl++;
    }
    if (wsum <= 0 || inl < idx.length + 3) break;
    for (let a = 0; a < n; a++) A[a][a] *= 1.001;
    const d = solve(A, g.map((x) => -x));
    if (!d || d.some((x) => !Number.isFinite(x))) break;
    const prev = v.slice();
    for (let a = 0; a < n; a++) v[idx[a]] += d[a];
    // Reject wild steps (degenerate geometry): keep the previous estimate.
    if (Math.abs(v[2] - prev[2]) > 0.5 * prev[2] || Math.abs(v[3] - prev[3]) > 0.5 * prev[3]) { v = prev; break; }
    if (tieAspect) v[2] = tieAspect * v[3];
    v[4] = Math.max(-rotLimit, Math.min(rotLimit, v[4]));
    v[2] = Math.max(4, v[2]); v[3] = Math.max(4, v[3]);
    last = { rms: Math.sqrt(r2 / wsum), inliers: inl };
    if (d.every((x, a) => Math.abs(x) < (idx[a] === 4 ? 1e-5 : 0.01))) break;
  }
  return { shape: fromVec(s, v), ...last };
}

/**
 * Observe edges around the current outline.
 * mode "nearest": strongest edge, mildly preferring t = 0;
 * mode "outer": outermost local maximum that reaches half of the window maximum.
 */
export function observeEdges(img, s, R, { mode = "nearest", nPts } = {}) {
  const N = nPts ?? Math.round(Math.min(300, Math.max(120, perimeterLength(s) / 8)));
  const pts = perimeterPoints(s, N, 0.08);
  const step = Math.max(0.25, Math.min(1, R / 16));
  const raw = [];
  for (const p of pts) {
    const { ts, D } = profile(img, p, -R, R, step);
    let bi = -1, bv = 0, wmax = 0;
    for (let i = 0; i < D.length; i++) wmax = Math.max(wmax, D[i]);
    if (mode === "outer") {
      for (let i = D.length - 2; i >= 1; i--) {
        if (D[i] >= D[i - 1] && D[i] >= D[i + 1] && D[i] >= 0.5 * wmax) { bi = i; bv = D[i]; break; }
      }
    } else {
      const sig = 0.8 * R;
      let bs = 0;
      for (let i = 1; i < D.length - 1; i++) {
        if (D[i] < D[i - 1] || D[i] < D[i + 1]) continue;
        const sc = D[i] * Math.exp(-0.5 * (ts[i] / sig) ** 2);
        if (sc > bs) { bs = sc; bi = i; bv = D[i]; }
      }
    }
    if (bi < 1) { raw.push(null); continue; }
    // Parabolic sub-sample peak.
    const y0 = D[bi - 1], y1 = D[bi], y2 = D[bi + 1];
    const den = y0 - 2 * y1 + y2;
    const off = Math.abs(den) > 1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
    const t = ts[bi] + off * step;
    raw.push({ x: p.x + p.nx * t, y: p.y + p.ny * t, t, strength: bv, p });
  }
  const strengths = raw.filter(Boolean).map((r) => r.strength);
  const ref = quantile(strengths, 0.75);
  const thr = 0.3 * ref;
  const obs = [];
  for (const r of raw) {
    if (!r || r.strength < thr) continue;
    obs.push({ x: r.x, y: r.y, t: r.t, w: Math.min(1, r.strength / (2 * thr)), strength: r.strength, p: r.p });
  }
  return { obs, n: pts.length, ref, thr };
}

/**
 * Iterative refinement. `px` = source pixels per coarse-level pixel.
 */
export function refine(img, s, { px = 1, rotLimit = Infinity, startRadius, finalMode = "nearest", tieAspect = 0, lockRotation = false, minRadius = 1.6 } = {}) {
  let cur = { ...s };
  if (tieAspect) cur.w = tieAspect * cur.h;
  if (lockRotation) cur.rot = 0;
  const free = [true, true, true, true, s.shape !== "circle" && !lockRotation];
  const radii = [];
  let R = startRadius ?? Math.max(4, 3 * px);
  while (R > minRadius) { radii.push(R); R /= 2; }
  radii.push(minRadius);
  let fit = null, last = null;
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    const mode = i === radii.length - 1 ? finalMode : "nearest";
    last = observeEdges(img, cur, r, { mode });
    if (last.obs.length < 12) break;
    fit = fitShape(cur, last.obs, { tukey: Math.max(1, r * 0.6), iterations: 5, free, rotLimit, tieAspect });
    cur = fit.shape;
  }
  return { shape: cur, fit, observation: last };
}

/**
 * Coverage of parallel edges at signed offsets t (outward positive) from the outline.
 * Returns { ts, cov } where cov[i] is the fraction of outline points with an edge peak at ts[i].
 */
export function edgeScan(img, s, { inner = 0.16, outer = 0.08, thrAbs = 0 } = {}) {
  const a = meanApothem(s);
  const tMin = -inner * a, tMax = outer * a;
  const step = Math.max(0.5, a / 500);
  const pts = perimeterPoints(s, 160, 0.1);
  const nb = Math.floor((tMax - tMin) / step) + 1;
  const cov = new Float32Array(nb);
  for (const p of pts) {
    const { D } = profile(img, p, tMin, tMax, step);
    let dmax = 0;
    for (let i = 0; i < D.length; i++) dmax = Math.max(dmax, D[i]);
    const thr = Math.max(thrAbs, 0.25 * dmax);
    for (let i = 1; i < D.length - 1; i++) {
      if (D[i] < thr || D[i] < D[i - 1] || D[i] < D[i + 1]) continue;
      cov[i] += 1;
    }
  }
  const ts = new Float32Array(nb);
  for (let i = 0; i < nb; i++) { ts[i] = tMin + i * step; cov[i] /= pts.length; }
  // Window sum over +-1 bin: a perfectly visible edge scores ~1 even when it straddles bins.
  const sm = new Float32Array(nb);
  for (let i = 0; i < nb; i++) sm[i] = (i > 0 ? cov[i - 1] : 0) + cov[i] + (i + 1 < nb ? cov[i + 1] : 0);
  return { ts, cov: sm, step };
}

/** Find outer edge offset and inner edge offset from an edgeScan. */
export function analyseScan(scan, { minGap = 1.5 } = {}) {
  const { ts, cov } = scan;
  const peaks = [];
  for (let i = 1; i < cov.length - 1; i++) {
    if (cov[i] > 0.04 && cov[i] >= cov[i - 1] && cov[i] >= cov[i + 1]) peaks.push({ t: ts[i], c: cov[i] });
  }
  if (!peaks.length) return { outer: 0, inner: 0, peaks };
  let c0 = 0;
  for (const p of peaks) if (Math.abs(p.t) <= 3 * scan.step + 1) c0 = Math.max(c0, p.c);
  if (!c0) c0 = Math.max(...peaks.map((p) => p.c));
  const strong = peaks.filter((p) => p.c >= Math.max(0.12, 0.5 * c0));
  const outerPk = strong.reduce((b, p) => (p.t > b.t ? p : b), strong[0] ?? { t: 0, c: c0 });
  // Inner edge of the band: the strongest parallel edge inside the outer one (art edges are
  // rarely parallel to the outline over a large part of it, the band's inner edge is).
  const innerCands = peaks.filter((p) => p.t < outerPk.t - minGap && p.c >= Math.max(0.08, 0.35 * outerPk.c));
  const innerPk = innerCands.reduce((b, p) => (!b || p.c > b.c ? p : b), null);
  return { outer: outerPk.t, outerCov: outerPk.c, inner: innerPk ? innerPk.t : outerPk.t, innerCov: innerPk?.c ?? 0, peaks };
}

export { offsetShape };

/**
 * "Thin line" cue: fraction of outline points that show BOTH the outer edge (t ~ 0) and the
 * inner edge of the band (t ~ -thickness). A painted border is a band; an art silhouette
 * that happens to line up with the outline only has the outer edge.
 */
export function bandCoverage(img, s, thickness, { nPts = 120 } = {}) {
  if (!(thickness > 1.5)) return NaN;
  const pts = perimeterPoints(s, nPts, 0.1);
  const tol = Math.max(1.5, thickness * 0.15);
  const step = Math.max(0.5, Math.min(1, thickness / 12));
  let both = 0;
  for (const p of pts) {
    const { ts, D } = profile(img, p, -thickness - tol - 1, tol + 1, step);
    let dmax = 0;
    for (let i = 0; i < D.length; i++) dmax = Math.max(dmax, D[i]);
    if (dmax <= 0) continue;
    let outer = false, inner = false;
    for (let i = 1; i < D.length - 1; i++) {
      if (D[i] < 0.25 * dmax || D[i] < D[i - 1] || D[i] < D[i + 1]) continue;
      if (Math.abs(ts[i]) <= tol) outer = true;
      if (Math.abs(ts[i] + thickness) <= tol) inner = true;
    }
    if (outer && inner) both++;
  }
  return both / pts.length;
}
