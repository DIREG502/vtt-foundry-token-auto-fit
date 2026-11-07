// Robust perimeter scoring of a candidate shape on a pyramid level.
//
// N points are sampled along the outline. At each point the edge energy ALONG THE NORMAL is
// read from the structure tensor (with a little slack across the line), and weighted by
// how well the local edge orientation matches the outline. The score is the FRACTION of
// points that look like a border edge, not the mean energy, so art covering 30-40 % of the
// outline costs 30-40 % of the score instead of being able to swamp it, and a few very
// strong art edges cannot buy a wrong candidate a high score.
//
// Two extra cues separate a painted border from an art silhouette:
//  - colour consistency: along a border, the colour just inside (or just outside, on the
//    opaque side) changes slowly (gradients allowed); along a silhouette it jumps around;
//  - side balance: a border shows up on most sides, a silhouette usually on one or two.

import { directional, sampleLevel } from "./image.js";
import { perimeterPoints, perimeterLength, sideCount } from "./shapes.js";

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const OFFSETS = [-1.5, -0.75, 0, 0.75, 1.5];

/**
 * @param level pyramid level with edges computed
 * @param s candidate in level coordinates
 * @returns {{score, coverage, consistency, sideBalance, hits: Float32Array}}
 */
export function scorePerimeter(level, s, opts = {}) {
  const N = Math.round(Math.min(opts.maxPoints ?? 360, Math.max(96, perimeterLength(s) / 2.5)));
  const pts = perimeterPoints(s, N);
  const g = Math.max(1e-4, level.g90);
  const hits = new Float32Array(pts.length);
  const nSides = sideCount(s.shape);
  const sideHit = new Float32Array(nSides), sideCnt = new Float32Array(nSides);
  let cov = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let best = 0;
    for (const o of OFFSETS) {
      const d = directional(level, p.x + p.nx * o, p.y + p.ny * o, p.nx, p.ny);
      if (!d) continue;
      const v = (d.e / g) * d.align * d.align;
      if (v > best) best = v;
    }
    const h = smoothstep(0.12, 0.45, best);
    hits[i] = h;
    cov += h;
    sideHit[p.side] += h; sideCnt[p.side]++;
  }
  const coverage = cov / pts.length;
  let sidesSeen = 0;
  for (let k = 0; k < nSides; k++) if (sideCnt[k] && sideHit[k] / sideCnt[k] > 0.3) sidesSeen++;
  const sideBalance = sidesSeen / nSides;
  const consistency = colourConsistency(level, pts, hits, 2);
  const score = coverage * (0.6 + 0.4 * consistency) * (0.75 + 0.25 * sideBalance);
  return { score, coverage, consistency, sideBalance, hits, n: pts.length };
}

/**
 * Fraction of consecutive "hit" point pairs whose colour on the opaque side barely changes.
 * Checks both sides of the edge and keeps the better opaque one.
 */
export function colourConsistency(level, pts, hits, off, sampler = sampleLevel) {
  const a = new Float32Array(4);
  let best = 0;
  for (const sgn of [-1, 1]) {
    let ok = 0, total = 0, alphaSum = 0, alphaN = 0;
    let prevValid = false;
    const prev = new Float32Array(4);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const valid = hits[i] > 0.5 && sampler(level, p.x + p.nx * off * sgn, p.y + p.ny * off * sgn, a);
      if (valid) {
        alphaSum += a[3]; alphaN++;
        if (prevValid) {
          const d = Math.hypot(a[0] - prev[0], a[1] - prev[1], a[2] - prev[2], a[3] - prev[3]);
          total++;
          if (d < 0.06) ok++;
        }
        prev.set(a);
      }
      prevValid = valid;
    }
    // Ignore the transparent side: "consistently transparent" says nothing about a border.
    const meanAlpha = alphaN ? alphaSum / alphaN / 0.8 : 0;
    if (total >= 4 && meanAlpha > 0.5) best = Math.max(best, ok / total);
  }
  return best;
}
