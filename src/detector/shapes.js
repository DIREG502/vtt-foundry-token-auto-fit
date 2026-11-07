// Shape models. A shape is { shape, cx, cy, w, h, rot } where (w, h) is the bounding box
// in the shape's own (unrotated) frame and rot is in radians, clockwise on screen.
//
//   hex-pointy : vertices at top and bottom, vertical left/right sides (Foundry "row" hex grids)
//   hex-flat   : vertices at left and right, horizontal top/bottom sides (Foundry "column" grids)
//   square     : axis-aligned rectangle
//   circle     : ellipse with radii w/2, h/2

export const SHAPES = ["hex-pointy", "hex-flat", "circle", "square"];
const SQ3 = Math.sqrt(3);

/** Natural w/h ratio of the regular shape. */
export function baseAspect(shape) {
  if (shape === "hex-pointy") return SQ3 / 2;
  if (shape === "hex-flat") return 2 / SQ3;
  return 1;
}

const UNIT = {
  "hex-pointy": [[0, -0.5], [0.5, -0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.25], [-0.5, -0.25]],
  "hex-flat": [[0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0], [-0.25, -0.5], [0.25, -0.5]],
  square: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
};

export function isPolygon(shape) { return shape !== "circle"; }

/** Polygon vertices in image coordinates. */
export function vertices(s) {
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  return UNIT[s.shape].map(([u, v]) => {
    const x = u * s.w, y = v * s.h;
    return [s.cx + x * c - y * sn, s.cy + x * sn + y * c];
  });
}

/**
 * Side half-planes of a polygon in its LOCAL frame (no rotation/translation):
 * returns [{ nx, ny, a }] with outward unit normal and apothem, so that the side is n.p = a.
 */
export function localSides(shape, w, h) {
  const V = UNIT[shape];
  const out = [];
  for (let i = 0; i < V.length; i++) {
    const [u1, v1] = V[i], [u2, v2] = V[(i + 1) % V.length];
    const x1 = u1 * w, y1 = v1 * h, x2 = u2 * w, y2 = v2 * h;
    const len = Math.hypot(x2 - x1, y2 - y1);
    // Vertices are clockwise on screen (y down) -> outward normal is (dy, -dx)/len.
    const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
    out.push({ nx, ny, a: x1 * nx + y1 * ny, len });
  }
  return out;
}

/**
 * Signed distance (positive outside) from image point (x, y) to the shape outline.
 * Polygon: max over side half-planes (exact near sides, slightly under-estimates beyond corners).
 * Ellipse: first-order approximation f/|grad f|.
 */
export function signedDistance(s, x, y) {
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  const dx = x - s.cx, dy = y - s.cy;
  const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
  if (s.shape === "circle") {
    const a = s.w / 2, b = s.h / 2;
    const f = (lx * lx) / (a * a) + (ly * ly) / (b * b) - 1;
    const gx = (2 * lx) / (a * a), gy = (2 * ly) / (b * b);
    const g = Math.hypot(gx, gy);
    if (g < 1e-9) return -Math.min(a, b);
    // Exact for circles at any distance: f/g = (r^2-a^2)/(2r), times 2k/(1+k) with k = r/a gives r-a.
    const k = Math.sqrt(Math.max(0, f + 1));
    return (f / g) * ((2 * k) / (1 + k));
  }
  // Allocation-free max over side half-planes (hot path of the fitter).
  const V = UNIT[s.shape], n = V.length, w = s.w, h = s.h;
  let d = -Infinity;
  for (let i = 0; i < n; i++) {
    const x1 = V[i][0] * w, y1 = V[i][1] * h;
    const j = i + 1 === n ? 0 : i + 1;
    const ex = V[j][0] * w - x1, ey = V[j][1] * h - y1;
    const len = Math.sqrt(ex * ex + ey * ey);
    const v = ((lx - x1) * ey - (ly - y1) * ex) / len;
    if (v > d) d = v;
  }
  return d;
}

/**
 * Sample points along the outline with outward unit normals (image coordinates).
 * Polygon corners are skipped (cornerSkip = fraction of each side trimmed at each end)
 * because normals there are ambiguous and mitred joins distort the edge.
 * Returns [{ x, y, nx, ny, side }].
 */
export function perimeterPoints(s, n, cornerSkip = 0.06) {
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  const pts = [];
  const toImg = (lx, ly) => [s.cx + lx * c - ly * sn, s.cy + lx * sn + ly * c];
  const rotN = (nx, ny) => [nx * c - ny * sn, nx * sn + ny * c];
  if (s.shape === "circle") {
    const a = s.w / 2, b = s.h / 2;
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * Math.PI * 2;
      const lx = Math.cos(t) * a, ly = Math.sin(t) * b;
      let nx = Math.cos(t) / a, ny = Math.sin(t) / b;
      const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      const [x, y] = toImg(lx, ly), [gx, gy] = rotN(nx, ny);
      pts.push({ x, y, nx: gx, ny: gy, side: Math.floor((i / n) * 8) });
    }
    return pts;
  }
  const V = UNIT[s.shape].map(([u, v]) => [u * s.w, v * s.h]);
  const sides = localSides(s.shape, s.w, s.h);
  const total = sides.reduce((acc, sd) => acc + sd.len, 0);
  for (let i = 0; i < V.length; i++) {
    const [x1, y1] = V[i], [x2, y2] = V[(i + 1) % V.length];
    const k = Math.max(2, Math.round((n * sides[i].len) / total));
    const [gx, gy] = rotN(sides[i].nx, sides[i].ny);
    for (let j = 0; j < k; j++) {
      const t = cornerSkip + (1 - 2 * cornerSkip) * ((j + 0.5) / k);
      const [x, y] = toImg(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      pts.push({ x, y, nx: gx, ny: gy, side: i });
    }
  }
  return pts;
}

/** Number of distinct "sides" used for per-side coverage statistics. */
export function sideCount(shape) {
  return shape === "circle" ? 8 : UNIT[shape].length;
}

/** Scale a shape about its centre so that the outline moves outward by ~d pixels. */
export function offsetShape(s, d) {
  const a = meanApothem(s);
  const k = (a + d) / a;
  return { ...s, w: s.w * k, h: s.h * k };
}

export function meanApothem(s) {
  if (s.shape === "circle") return (s.w + s.h) / 4;
  const sides = localSides(s.shape, s.w, s.h);
  return sides.reduce((acc, sd) => acc + sd.a, 0) / sides.length;
}

export function perimeterLength(s) {
  if (s.shape === "circle") {
    const a = s.w / 2, b = s.h / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  return localSides(s.shape, s.w, s.h).reduce((acc, sd) => acc + sd.len, 0);
}
