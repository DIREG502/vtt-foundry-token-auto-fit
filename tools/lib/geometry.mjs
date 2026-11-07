// Shared geometry helpers for the test tools (sample generator and overlays).
// The detector has its own copy in src/detector/shapes.js; these are kept separate on
// purpose so the ground truth is not produced by the code under test.

export function hexPoints(shape, cx, cy, w, h, rotDeg = 0) {
  const pts = shape === "hex-flat"
    ? [[w / 2, 0], [w / 4, h / 2], [-w / 4, h / 2], [-w / 2, 0], [-w / 4, -h / 2], [w / 4, -h / 2]]
    : [[0, -h / 2], [w / 2, -h / 4], [w / 2, h / 4], [0, h / 2], [-w / 2, h / 4], [-w / 2, -h / 4]];
  return transform(pts, cx, cy, rotDeg);
}

export function squarePoints(cx, cy, w, h, rotDeg = 0) {
  return transform([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], cx, cy, rotDeg);
}

export function shapePoints(shape, cx, cy, w, h, rotDeg = 0, n = 128) {
  if (shape === "circle") {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * w / 2, Math.sin(a) * h / 2]);
    }
    return transform(pts, cx, cy, rotDeg);
  }
  if (shape === "square") return squarePoints(cx, cy, w, h, rotDeg);
  return hexPoints(shape, cx, cy, w, h, rotDeg);
}

function transform(pts, cx, cy, rotDeg) {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/** Inset a convex polygon (clockwise in screen coords) by d along its edge normals. */
export function insetPolygon(pts, d) {
  const n = pts.length;
  const lines = [];
  // Orientation: signed area decides which side is "inside".
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sign = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1);
    // Inward normal for positive-area (clockwise on screen) polygons.
    const nx = (-(y2 - y1) / len) * sign, ny = ((x2 - x1) / len) * sign;
    lines.push({ p: [x1 + nx * d, y1 + ny * d], v: [x2 - x1, y2 - y1] });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.v[0] * b.v[1] - a.v[1] * b.v[0];
    const t = ((b.p[0] - a.p[0]) * b.v[1] - (b.p[1] - a.p[1]) * b.v[0]) / den;
    out.push([a.p[0] + a.v[0] * t, a.p[1] + a.v[1] * t]);
  }
  return out;
}

export function pathD(pts) {
  return "M" + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L") + " Z";
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth random closed blob (quadratic curves through edge midpoints). */
export function blobPath(cx, cy, rx, ry, rng, n = 9, jitter = 0.35, rotDeg = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rng() * 2 - 1) * jitter;
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  const p = transform(pts, cx, cy, rotDeg);
  const mid = (i) => {
    const a = p[i % n], b = p[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  let d = `M${mid(0)[0].toFixed(1)} ${mid(0)[1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const c = p[i % n], m = mid(i);
    d += ` Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + " Z";
}
