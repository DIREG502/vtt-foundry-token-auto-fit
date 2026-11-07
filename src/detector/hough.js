// Candidate generation.
//
// Polygons (hexes, squares): a hexagon of known orientation is three pairs of parallel lines.
// Projecting every edge pixel whose normal matches a side direction onto that normal gives a
// 1-D histogram in which each side is a sharp peak, wherever along the side the visible
// pixels are. That is why it copes with the art hiding a large part of the border: a side
// that is 40 % covered still forms a peak at the right place, only lower. One pair of peaks
// (an "anchor") fixes the scale and one coordinate of the centre; a 1-D search along the
// remaining free direction then finds the position where the other side pairs line up.
// Everything is O(edge pixels + table size); the expensive part, the perimeter score,
// only runs on the few dozen candidates this returns.
//
// Circles: classic gradient-direction Hough voting for the centre, then a radial histogram.

import { baseAspect, localSides } from "./shapes.js";

const DEG = Math.PI / 180;


function smooth5(h) {
  const out = new Float32Array(h.length);
  for (let i = 2; i < h.length - 2; i++) out[i] = (h[i - 2] + 4 * h[i - 1] + 6 * h[i] + 4 * h[i + 1] + h[i + 2]) / 16;
  return out;
}

function lin(h, t) {
  const i = Math.floor(t), f = t - i;
  if (i < 0 || i + 1 >= h.length) return 0;
  return h[i] * (1 - f) + h[i + 1] * f;
}

export function searchRegion(level, opts) {
  const W = level.width, H = level.height;
  const r = opts.centerRegion;
  const S = Math.min(W, H), L = Math.max(W, H);
  return {
    x0: W * (0.5 - r), x1: W * (0.5 + r), y0: H * (0.5 - r), y1: H * (0.5 + r),
    minSize: opts.minSize * S, maxSize: opts.maxSize * L,
  };
}

function orientationCombos(opts) {
  const rots = [];
  // Coarse steps only: the histogram's angular tolerance covers +-angleTolerance and the
  // full-resolution refinement finds the exact rotation/aspect.
  const tol = Math.max(0, opts.rotationTolerance);
  rots.push(0);
  if (tol >= 1.5 && opts.coarseRotations !== false) { const r = Math.min(tol, 2.5); rots.push(-r, r); }
  const aspects = [1];
  const at = Math.max(0, opts.aspectTolerance);
  // 2 % steps near regular, where real frames cluster (e.g. 0.845 vs 0.866 for a pointy hex:
  // -2.4 %), so the refinement starts within its capture range; 4 % steps further out.
  for (let a = 0.02; a <= at + 1e-9; a += a < 0.06 - 1e-9 ? 0.02 : 0.04) aspects.push(1 - a, 1 + a);
  const out = [];
  for (const r of rots) for (const a of aspects) out.push({ rot: r * DEG, aspect: a });
  return out;
}

/**
 * Polygon candidates in LEVEL coordinates.
 * @returns {Array<{shape, cx, cy, w, h, rot, votes}>}
 */
export function polygonCandidates(level, edges, shape, opts) {
  const W = level.width, H = level.height;
  const D = Math.ceil(Math.hypot(W, H)) + 4;
  const reg = searchRegion(level, opts);
  const cosTol2 = Math.cos(opts.angleTolerance * DEG) ** 2;
  const pairsN = shape === "square" ? 2 : 3;
  const out = [];
  const corners = [[reg.x0, reg.y0], [reg.x1, reg.y0], [reg.x0, reg.y1], [reg.x1, reg.y1]];
  // Edge normals as unit vectors once, so the per-combo loop needs no trigonometry.
  const ec = new Float32Array(edges.count), es = new Float32Array(edges.count);
  for (let e = 0; e < edges.count; e++) { ec[e] = Math.cos(edges.t[e]); es[e] = Math.sin(edges.t[e]); }
  const den = 1 / (1 - cosTol2);

  for (const combo of orientationCombos(opts)) {
    const w1 = baseAspect(shape) * combo.aspect; // width for unit height
    const sides = localSides(shape, w1, 1);
    const c = Math.cos(combo.rot), s = Math.sin(combo.rot);
    const pairs = [];
    for (let k = 0; k < pairsN; k++) {
      const sd = sides[k];
      const nx = sd.nx * c - sd.ny * s, ny = sd.nx * s + sd.ny * c;
      pairs.push({ nx, ny, a1: sd.a, hist: new Float32Array(2 * D + 1) });
    }
    // Projection histograms.
    for (let e = 0; e < edges.count; e++) {
      const x = edges.x[e], y = edges.y[e], m = edges.m[e], cx0 = ec[e], sy0 = es[e];
      for (let k = 0; k < pairsN; k++) {
        const p = pairs[k];
        const cd = cx0 * p.nx + sy0 * p.ny; // cos of the angle between normals (sign irrelevant)
        const c2 = cd * cd;
        if (c2 <= cosTol2) continue;
        const wgt = (c2 - cosTol2) * den;
        const pos = x * p.nx + y * p.ny + D;
        const i = Math.floor(pos), f = pos - i;
        p.hist[i] += m * wgt * (1 - f);
        p.hist[i + 1] += m * wgt * f;
      }
    }
    for (const p of pairs) p.hist = smooth5(p.hist);

    const bigDim = Math.max(w1, 1);
    const hMin = reg.minSize / bigDim, hMax = reg.maxSize / bigDim;

    // Anchor peaks for each pair.
    for (let k = 0; k < pairsN; k++) {
      const p = pairs[k];
      let muMin = Infinity, muMax = -Infinity;
      for (const [x, y] of corners) {
        const mu = x * p.nx + y * p.ny;
        muMin = Math.min(muMin, mu); muMax = Math.max(muMax, mu);
      }
      const aMin = Math.max(2, Math.floor(p.a1 * hMin)), aMax = Math.ceil(p.a1 * hMax);
      const mu0 = Math.floor(muMin);
      const nMu = Math.ceil(muMax) - mu0 + 1, nA = aMax - aMin + 1;
      if (nMu <= 2 || nA <= 2) continue;
      const T = new Float32Array(nMu * nA);
      const hist = p.hist;
      let tMax = 0;
      // Integer mu and a -> direct histogram reads (no interpolation) in the hot loop.
      for (let im = 0; im < nMu; im++) {
        const base = mu0 + im + D, row = im * nA;
        for (let ia = 0; ia < nA; ia++) {
          const a = aMin + ia;
          const ip = base + a, iq = base - a;
          const hp = ip >= 0 && ip < hist.length ? hist[ip] : 0;
          const hm = iq >= 0 && iq < hist.length ? hist[iq] : 0;
          const v = hp + hm + (hp < hm ? hp : hm);
          T[row + ia] = v;
          if (v > tMax) tMax = v;
        }
      }
      if (tMax <= 0) continue;
      const anchors = topPeaks2D(T, nMu, nA, opts.anchorsPerPair, 0.15 * tMax, 3);
      for (const { i: im, j: ia, v } of anchors) {
        const mu = mu0 + im, a = aMin + ia;
        const h = a / p.a1;
        // Free direction: c = mu*n + lambda*nPerp.
        const px = -p.ny, py = p.nx;
        const bx = mu * p.nx, by = mu * p.ny;
        let lMin = -Infinity, lMax = Infinity;
        if (Math.abs(px) > 1e-9) {
          const l1 = (reg.x0 - bx) / px, l2 = (reg.x1 - bx) / px;
          lMin = Math.max(lMin, Math.min(l1, l2)); lMax = Math.min(lMax, Math.max(l1, l2));
        } else if (bx < reg.x0 || bx > reg.x1) continue;
        if (Math.abs(py) > 1e-9) {
          const l1 = (reg.y0 - by) / py, l2 = (reg.y1 - by) / py;
          lMin = Math.max(lMin, Math.min(l1, l2)); lMax = Math.min(lMax, Math.max(l1, l2));
        } else if (by < reg.y0 || by > reg.y1) continue;
        if (!(lMax > lMin)) continue;
        let best = -1, bestL = 0, second = -1, secondL = 0;
        for (let l = lMin; l <= lMax; l += 1) {
          const cx = bx + l * px, cy = by + l * py;
          let sc = 0;
          for (let j = 0; j < pairsN; j++) {
            if (j === k) continue;
            const q = pairs[j];
            const muj = cx * q.nx + cy * q.ny + D, aj = q.a1 * h;
            const hp = lin(q.hist, muj + aj), hm = lin(q.hist, muj - aj);
            sc += hp + hm + Math.min(hp, hm);
          }
          if (sc > best) {
            if (Math.abs(l - bestL) > 6) { second = best; secondL = bestL; }
            best = sc; bestL = l;
          } else if (sc > second && Math.abs(l - bestL) > 6) { second = sc; secondL = l; }
        }
        for (const [sc, l] of [[best, bestL], [second, secondL]]) {
          if (sc < 0) continue;
          out.push({
            shape, cx: bx + l * px, cy: by + l * py, w: w1 * h, h, rot: combo.rot,
            votes: (v + sc) / (pairsN * 3),
          });
        }
      }
    }
  }
  return dedupe(out, opts.maxCandidates);
}

/** Top-k local maxima of a 2-D table with simple non-maximum suppression. */
function topPeaks2D(T, ni, nj, k, thr, rad) {
  const peaks = [];
  for (let i = 1; i < ni - 1; i++) {
    for (let j = 1; j < nj - 1; j++) {
      const v = T[i * nj + j];
      if (v < thr) continue;
      if (v < T[(i - 1) * nj + j] || v < T[(i + 1) * nj + j] || v < T[i * nj + j - 1] || v < T[i * nj + j + 1]) continue;
      if (v < T[(i - 1) * nj + j - 1] || v < T[(i + 1) * nj + j + 1] || v < T[(i - 1) * nj + j + 1] || v < T[(i + 1) * nj + j - 1]) continue;
      peaks.push({ i, j, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const kept = [];
  for (const p of peaks) {
    if (kept.some((q) => Math.abs(q.i - p.i) <= rad && Math.abs(q.j - p.j) <= rad)) continue;
    kept.push(p);
    if (kept.length >= k) break;
  }
  return kept;
}

export function dedupe(cands, max) {
  cands.sort((a, b) => b.votes - a.votes);
  const kept = [];
  for (const c of cands) {
    const dup = kept.some((k) => Math.hypot(k.cx - c.cx, k.cy - c.cy) < 3 &&
      Math.abs(k.h - c.h) < Math.max(3, 0.03 * c.h) && Math.abs(k.w - c.w) < Math.max(3, 0.03 * c.w));
    if (!dup) kept.push(c);
    if (kept.length >= max) break;
  }
  return kept;
}

/** Circle candidates in LEVEL coordinates via gradient-direction voting. */
export function circleCandidates(level, edges, opts) {
  const W = level.width, H = level.height;
  const reg = searchRegion(level, opts);
  const rMin = Math.max(3, reg.minSize / 2), rMax = Math.min(reg.maxSize / 2, Math.hypot(W, H) / 2);
  const acc = new Float32Array(W * H);
  const x0 = Math.floor(reg.x0), x1 = Math.ceil(reg.x1), y0 = Math.floor(reg.y0), y1 = Math.ceil(reg.y1);
  for (let e = 0; e < edges.count; e++) {
    const ex = edges.x[e], ey = edges.y[e], m = edges.m[e];
    const nx = Math.cos(edges.t[e]), ny = Math.sin(edges.t[e]);
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const dx = nx * sgn, dy = ny * sgn;
      for (let r = rMin; r <= rMax; r += 1) {
        const x = (ex + dx * r + 0.5) | 0, y = (ey + dy * r + 0.5) | 0;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        acc[y * W + x] += m;
      }
    }
  }
  const sm = boxBlur(boxBlur(acc, W, H, 2), W, H, 2);
  let maxV = 0;
  for (let i = 0; i < sm.length; i++) if (sm[i] > maxV) maxV = sm[i];
  const centers = [];
  for (let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++) {
      const v = sm[y * W + x];
      if (v < 0.25 * maxV) continue;
      if (v < sm[y * W + x - 1] || v < sm[y * W + x + 1] || v < sm[(y - 1) * W + x] || v < sm[(y + 1) * W + x]) continue;
      centers.push({ x, y, v });
    }
  }
  centers.sort((a, b) => b.v - a.v);
  const kept = [];
  for (const c of centers) {
    if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < 6)) continue;
    kept.push(c);
    if (kept.length >= opts.circleCenters) break;
  }
  const out = [];
  const nb = Math.ceil(rMax) + 3;
  for (const c of kept) {
    const hist = new Float32Array(nb);
    for (let e = 0; e < edges.count; e++) {
      const dx = edges.x[e] - c.x, dy = edges.y[e] - c.y;
      const d = Math.hypot(dx, dy);
      if (d < rMin - 2 || d > rMax + 2) continue;
      const al = Math.abs(Math.cos(edges.t[e] - Math.atan2(dy, dx)));
      if (al < 0.9) continue;
      const wgt = edges.m[e] * al ** 4 / Math.max(1, d); // per unit arc length
      const i = Math.floor(d), f = d - i;
      if (i + 1 < nb) { hist[i] += wgt * (1 - f); hist[i + 1] += wgt * f; }
    }
    const hs = smooth5(hist);
    const peaks = [];
    for (let r = Math.ceil(rMin); r < Math.min(nb - 1, rMax); r++) {
      if (hs[r] > 0 && hs[r] >= hs[r - 1] && hs[r] >= hs[r + 1]) peaks.push({ r, v: hs[r] });
    }
    peaks.sort((a, b) => b.v - a.v);
    const pk = [];
    for (const p of peaks) {
      if (pk.some((q) => Math.abs(q.r - p.r) < 4)) continue;
      pk.push(p);
      if (pk.length >= 3) break;
    }
    for (const p of pk) out.push({ shape: "circle", cx: c.x, cy: c.y, w: 2 * p.r, h: 2 * p.r, rot: 0, votes: p.v * c.v });
  }
  return dedupe(out, opts.maxCandidates);
}

function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc * k;
      acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc * k;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}
