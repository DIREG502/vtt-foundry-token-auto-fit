// Token Border Auto-Fit — stand-alone macro v1.0.0 (generated, do not edit)
// Select tokens and run. Hold Shift while running to always open the manual alignment dialog.
// Source: https://github.com/DIREG502/vtt-foundry-token-border-auto-fit
(() => {
  // styles/token-border-autofit.css
  var token_border_autofit_default = '/* Token Border Auto-Fit */\n\n.tbaf-config .form-fields { gap: 6px; }\n.tbaf-config .form-fields button { flex: 1; white-space: nowrap; }\n\n.tbaf-align-window .window-content { padding: 8px; overflow: hidden; }\n.tbaf-align { display: flex; flex-direction: column; gap: 6px; height: 100%; }\n.tbaf-align .tbaf-info { margin: 0; font-size: 0.85em; opacity: 0.85; }\n.tbaf-editor-host { flex: 1; min-height: 0; display: flex; }\n.tbaf-editor { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }\n.tbaf-editor-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.9em; }\n.tbaf-editor-bar label { display: flex; align-items: center; gap: 4px; }\n.tbaf-editor-bar select { height: 26px; }\n.tbaf-editor-bar .tbaf-mini { flex: 0 0 auto; width: auto; height: 26px; line-height: 1; padding: 0 8px; }\n.tbaf-readout { margin-left: auto; font-family: monospace; font-size: 0.85em; opacity: 0.8; }\n.tbaf-view {\n  flex: 1; min-height: 240px; overflow: auto; position: relative; outline: none;\n  border: 1px solid rgba(128, 128, 128, 0.5); border-radius: 4px;\n  background-color: #808080;\n  background-image: linear-gradient(45deg, #9a9a9a 25%, transparent 25%, transparent 75%, #9a9a9a 75%),\n    linear-gradient(45deg, #9a9a9a 25%, transparent 25%, transparent 75%, #9a9a9a 75%);\n  background-size: 16px 16px; background-position: 0 0, 8px 8px;\n}\n.tbaf-view:focus-visible { box-shadow: 0 0 0 2px var(--color-border-highlight, #ff6400); }\n.tbaf-stage { position: relative; margin: auto; }\n.tbaf-stage img { display: block; max-width: none; border: none; user-select: none; pointer-events: none; }\n.tbaf-overlay { position: absolute; inset: 0; overflow: visible; cursor: move; }\n.tbaf-outline { fill: rgba(0, 255, 100, 0.06); stroke: #00ff64; }\n.tbaf-inner { fill: none; stroke: #00c8ff; stroke-dasharray: 6 4; }\n.tbaf-bbox { fill: none; stroke: rgba(255, 255, 255, 0.55); stroke-dasharray: 4 4; }\n.tbaf-cross { stroke: #00ff64; }\n.tbaf-handle { fill: #fff; stroke: #000; }\n.tbaf-handle.tbaf-corner { cursor: nwse-resize; }\n.tbaf-handle[data-h="ne"], .tbaf-handle[data-h="sw"] { cursor: nesw-resize; }\n.tbaf-handle[data-h="n"], .tbaf-handle[data-h="s"] { cursor: ns-resize; }\n.tbaf-handle[data-h="e"], .tbaf-handle[data-h="w"] { cursor: ew-resize; }\n.tbaf-buttons { display: flex; gap: 6px; }\n.tbaf-buttons button { flex: 1; }\n.tbaf-primary { font-weight: bold; }\n\n.tbaf-prompts {\n  position: fixed; right: 320px; bottom: 16px; z-index: 1000;\n  display: flex; flex-direction: column; gap: 8px; max-width: 380px;\n}\n.tbaf-prompt {\n  background: rgba(20, 20, 24, 0.95); color: #eee; border: 1px solid #555; border-radius: 6px;\n  padding: 8px 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6); font-size: 13px;\n}\n.tbaf-prompt p { margin: 0 0 6px; }\n.tbaf-prompt-buttons { display: flex; flex-wrap: wrap; gap: 6px; }\n.tbaf-prompt-buttons button { flex: 1 1 auto; width: auto; line-height: 24px; padding: 0 8px; }\n';

  // src/detector/image.js
  var CHANNEL_WEIGHTS = [1, 0.9, 0.9, 0.8];
  function buildLevel(img, maxSide) {
    const { width: sw, height: sh, data } = img;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const fx = sw / dw, fy = sh / dh;
    const tmp = new Float32Array(sh * dw * 4);
    const xw = boxWeights(sw, dw, fx);
    for (let y = 0; y < sh; y++) {
      const row = y * sw * 4, orow = y * dw * 4;
      for (let x = 0; x < dw; x++) {
        const { start, weights } = xw[x];
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < weights.length; k++) {
          const i = row + (start + k) * 4, wk = weights[k];
          const al = data[i + 3] * wk;
          r += data[i] * al;
          g += data[i + 1] * al;
          b += data[i + 2] * al;
          a += al;
        }
        const o = orow + x * 4;
        tmp[o] = r;
        tmp[o + 1] = g;
        tmp[o + 2] = b;
        tmp[o + 3] = a;
      }
    }
    const n = dw * dh;
    const L = new Float32Array(n), C1 = new Float32Array(n), C2 = new Float32Array(n), A = new Float32Array(n);
    const yw = boxWeights(sh, dh, fy);
    const norm = 1 / (255 * 255);
    for (let y = 0; y < dh; y++) {
      const { start, weights } = yw[y];
      for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < weights.length; k++) {
          const i = ((start + k) * dw + x) * 4, wk = weights[k];
          r += tmp[i] * wk;
          g += tmp[i + 1] * wk;
          b += tmp[i + 2] * wk;
          a += tmp[i + 3] * wk;
        }
        const o = y * dw + x;
        r *= norm;
        g *= norm;
        b *= norm;
        L[o] = 0.299 * r + 0.587 * g + 0.114 * b;
        C1[o] = r - g;
        C2[o] = 0.5 * (r + g) - b;
        A[o] = a / 255;
      }
    }
    return { width: dw, height: dh, scale: dw / sw, scaleY: dh / sh, ch: [L, C1, C2, A] };
  }
  function boxWeights(srcLen, dstLen, f) {
    const out = new Array(dstLen);
    for (let i = 0; i < dstLen; i++) {
      const s0 = i * f, s1 = Math.min(srcLen, (i + 1) * f);
      const start = Math.floor(s0), end = Math.min(srcLen, Math.ceil(s1));
      const weights = new Float32Array(Math.max(1, end - start));
      let sum = 0;
      for (let k = start; k < end; k++) {
        const w = Math.min(k + 1, s1) - Math.max(k, s0);
        weights[k - start] = w;
        sum += w;
      }
      if (sum <= 0) {
        weights[0] = 1;
        sum = 1;
      }
      for (let k = 0; k < weights.length; k++) weights[k] /= sum;
      out[i] = { start, weights };
    }
    return out;
  }
  function computeEdges(level) {
    const { width: w, height: h, ch } = level;
    const n = w * h;
    const Jxx = new Float32Array(n), Jxy = new Float32Array(n), Jyy = new Float32Array(n);
    for (let c = 0; c < ch.length; c++) {
      const I = ch[c], wt = CHANNEL_WEIGHTS[c] * CHANNEL_WEIGHTS[c];
      for (let y = 1; y < h - 1; y++) {
        const r0 = (y - 1) * w, r1 = y * w, r2 = (y + 1) * w;
        for (let x = 1; x < w - 1; x++) {
          const gx = I[r0 + x + 1] + 2 * I[r1 + x + 1] + I[r2 + x + 1] - (I[r0 + x - 1] + 2 * I[r1 + x - 1] + I[r2 + x - 1]);
          const gy = I[r2 + x - 1] + 2 * I[r2 + x] + I[r2 + x + 1] - (I[r0 + x - 1] + 2 * I[r0 + x] + I[r0 + x + 1]);
          const o = r1 + x;
          Jxx[o] += wt * gx * gx;
          Jxy[o] += wt * gx * gy;
          Jyy[o] += wt * gy * gy;
        }
      }
    }
    const mag = new Float32Array(n), ori = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Jxx[i], b = Jxy[i], d = Jyy[i];
      const tr = (a + d) * 0.5, df = (a - d) * 0.5;
      const l1 = tr + Math.sqrt(df * df + b * b);
      mag[i] = Math.sqrt(Math.max(0, l1)) * 0.25;
      let t = 0.5 * Math.atan2(2 * b, a - d);
      if (t < 0) t += Math.PI;
      ori[i] = t;
    }
    level.Jxx = Jxx;
    level.Jxy = Jxy;
    level.Jyy = Jyy;
    level.mag = mag;
    level.ori = ori;
    level.g90 = percentile(mag, 0.9, 4e-3);
    return level;
  }
  function percentile(arr, q, floor = 0) {
    let max = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    if (max <= floor) return Math.max(floor, 1e-3);
    const bins = 1024, hist = new Uint32Array(bins);
    let count = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v <= floor) continue;
      hist[Math.min(bins - 1, v / max * bins | 0)]++;
      count++;
    }
    const target = count * q;
    let acc = 0;
    for (let b = 0; b < bins; b++) {
      acc += hist[b];
      if (acc >= target) return (b + 0.5) / bins * max;
    }
    return max;
  }
  function edgePixels(level, relThreshold = 0.2) {
    const { width: w, height: h, mag, ori } = level;
    const thr = Math.max(0.01, level.g90 * relThreshold);
    const xs = [], ys = [], ms = [], ts = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x, m = mag[i];
        if (m < thr) continue;
        const t = ori[i];
        const dx = Math.round(Math.cos(t)), dy = Math.round(Math.sin(t));
        if (m < mag[i + dy * w + dx] || m < mag[i - dy * w - dx]) continue;
        xs.push(x);
        ys.push(y);
        ms.push(m);
        ts.push(t);
      }
    }
    return { x: Float32Array.from(xs), y: Float32Array.from(ys), m: Float32Array.from(ms), t: Float32Array.from(ts), count: xs.length };
  }
  function bilinear(I, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
    const x0 = x | 0, y0 = y | 0;
    const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;
    const a = I[y0 * w + x0], b = I[y0 * w + x1], c = I[y1 * w + x0], d = I[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function directional(level, x, y, nx, ny) {
    const { width: w, height: h } = level;
    const jxx = bilinear(level.Jxx, w, h, x, y);
    if (Number.isNaN(jxx)) return null;
    const jxy = bilinear(level.Jxy, w, h, x, y);
    const jyy = bilinear(level.Jyy, w, h, x, y);
    const en = jxx * nx * nx + 2 * jxy * nx * ny + jyy * ny * ny;
    const tr = (jxx + jyy) * 0.5, df = (jxx - jyy) * 0.5;
    const l1 = tr + Math.sqrt(df * df + jxy * jxy);
    return { e: Math.sqrt(Math.max(0, en)) * 0.25, align: l1 > 1e-12 ? Math.max(0, en) / l1 : 0 };
  }
  function sampleRaw(img, x, y, out) {
    const { width: w, height: h, data } = img;
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return false;
    const x0 = x | 0, y0 = y | 0;
    const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    const a00 = data[i00 + 3] * w00, a10 = data[i10 + 3] * w10, a01 = data[i01 + 3] * w01, a11 = data[i11 + 3] * w11;
    const r = (data[i00] * a00 + data[i10] * a10 + data[i01] * a01 + data[i11] * a11) / 65025;
    const g = (data[i00 + 1] * a00 + data[i10 + 1] * a10 + data[i01 + 1] * a01 + data[i11 + 1] * a11) / 65025;
    const b = (data[i00 + 2] * a00 + data[i10 + 2] * a10 + data[i01 + 2] * a01 + data[i11 + 2] * a11) / 65025;
    out[0] = (0.299 * r + 0.587 * g + 0.114 * b) * CHANNEL_WEIGHTS[0];
    out[1] = (r - g) * CHANNEL_WEIGHTS[1];
    out[2] = (0.5 * (r + g) - b) * CHANNEL_WEIGHTS[2];
    out[3] = (a00 + a10 + a01 + a11) / 255 * CHANNEL_WEIGHTS[3];
    return true;
  }
  function sampleLevel(level, x, y, out) {
    const { width: w, height: h, ch } = level;
    for (let c = 0; c < 4; c++) {
      const v = bilinear(ch[c], w, h, x, y);
      if (Number.isNaN(v)) return false;
      out[c] = v * CHANNEL_WEIGHTS[c];
    }
    return true;
  }

  // src/detector/shapes.js
  var SHAPES = ["hex-pointy", "hex-flat", "circle", "square"];
  var SQ3 = Math.sqrt(3);
  function baseAspect(shape) {
    if (shape === "hex-pointy") return SQ3 / 2;
    if (shape === "hex-flat") return 2 / SQ3;
    return 1;
  }
  var UNIT = {
    "hex-pointy": [[0, -0.5], [0.5, -0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.25], [-0.5, -0.25]],
    "hex-flat": [[0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0], [-0.25, -0.5], [0.25, -0.5]],
    square: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
  };
  function localSides(shape, w, h) {
    const V = UNIT[shape];
    const out = [];
    for (let i = 0; i < V.length; i++) {
      const [u1, v1] = V[i], [u2, v2] = V[(i + 1) % V.length];
      const x1 = u1 * w, y1 = v1 * h, x2 = u2 * w, y2 = v2 * h;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
      out.push({ nx, ny, a: x1 * nx + y1 * ny, len });
    }
    return out;
  }
  function signedDistance(s, x, y) {
    const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
    const dx = x - s.cx, dy = y - s.cy;
    const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
    if (s.shape === "circle") {
      const a = s.w / 2, b = s.h / 2;
      const f = lx * lx / (a * a) + ly * ly / (b * b) - 1;
      const gx = 2 * lx / (a * a), gy = 2 * ly / (b * b);
      const g = Math.hypot(gx, gy);
      if (g < 1e-9) return -Math.min(a, b);
      const k = Math.sqrt(Math.max(0, f + 1));
      return f / g * (2 * k / (1 + k));
    }
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
  function perimeterPoints(s, n, cornerSkip = 0.06) {
    const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
    const pts = [];
    const toImg = (lx, ly) => [s.cx + lx * c - ly * sn, s.cy + lx * sn + ly * c];
    const rotN = (nx, ny) => [nx * c - ny * sn, nx * sn + ny * c];
    if (s.shape === "circle") {
      const a = s.w / 2, b = s.h / 2;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n * Math.PI * 2;
        const lx = Math.cos(t) * a, ly = Math.sin(t) * b;
        let nx = Math.cos(t) / a, ny = Math.sin(t) / b;
        const l = Math.hypot(nx, ny);
        nx /= l;
        ny /= l;
        const [x, y] = toImg(lx, ly), [gx, gy] = rotN(nx, ny);
        pts.push({ x, y, nx: gx, ny: gy, side: Math.floor(i / n * 8) });
      }
      return pts;
    }
    const V = UNIT[s.shape].map(([u, v]) => [u * s.w, v * s.h]);
    const sides = localSides(s.shape, s.w, s.h);
    const total = sides.reduce((acc, sd) => acc + sd.len, 0);
    for (let i = 0; i < V.length; i++) {
      const [x1, y1] = V[i], [x2, y2] = V[(i + 1) % V.length];
      const k = Math.max(2, Math.round(n * sides[i].len / total));
      const [gx, gy] = rotN(sides[i].nx, sides[i].ny);
      for (let j = 0; j < k; j++) {
        const t = cornerSkip + (1 - 2 * cornerSkip) * ((j + 0.5) / k);
        const [x, y] = toImg(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
        pts.push({ x, y, nx: gx, ny: gy, side: i });
      }
    }
    return pts;
  }
  function sideCount(shape) {
    return shape === "circle" ? 8 : UNIT[shape].length;
  }
  function offsetShape(s, d) {
    const a = meanApothem(s);
    const k = (a + d) / a;
    return { ...s, w: s.w * k, h: s.h * k };
  }
  function meanApothem(s) {
    if (s.shape === "circle") return (s.w + s.h) / 4;
    const sides = localSides(s.shape, s.w, s.h);
    return sides.reduce((acc, sd) => acc + sd.a, 0) / sides.length;
  }
  function perimeterLength(s) {
    if (s.shape === "circle") {
      const a = s.w / 2, b = s.h / 2;
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    return localSides(s.shape, s.w, s.h).reduce((acc, sd) => acc + sd.len, 0);
  }

  // src/detector/hough.js
  var DEG = Math.PI / 180;
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
  function searchRegion(level, opts) {
    const W = level.width, H = level.height;
    const r = opts.centerRegion;
    const S = Math.min(W, H), L = Math.max(W, H);
    return {
      x0: W * (0.5 - r),
      x1: W * (0.5 + r),
      y0: H * (0.5 - r),
      y1: H * (0.5 + r),
      minSize: opts.minSize * S,
      maxSize: opts.maxSize * L
    };
  }
  function orientationCombos(opts) {
    const rots = [];
    const tol = Math.max(0, opts.rotationTolerance);
    rots.push(0);
    if (tol >= 1.5 && opts.coarseRotations !== false) {
      const r = Math.min(tol, 2.5);
      rots.push(-r, r);
    }
    const aspects = [1];
    const at = Math.max(0, opts.aspectTolerance);
    for (let a = 0.02; a <= at + 1e-9; a += a < 0.06 - 1e-9 ? 0.02 : 0.04) aspects.push(1 - a, 1 + a);
    const out = [];
    for (const r of rots) for (const a of aspects) out.push({ rot: r * DEG, aspect: a });
    return out;
  }
  function polygonCandidates(level, edges, shape, opts) {
    const W = level.width, H = level.height;
    const D = Math.ceil(Math.hypot(W, H)) + 4;
    const reg = searchRegion(level, opts);
    const cosTol2 = Math.cos(opts.angleTolerance * DEG) ** 2;
    const pairsN = shape === "square" ? 2 : 3;
    const out = [];
    const corners = [[reg.x0, reg.y0], [reg.x1, reg.y0], [reg.x0, reg.y1], [reg.x1, reg.y1]];
    const ec = new Float32Array(edges.count), es = new Float32Array(edges.count);
    for (let e = 0; e < edges.count; e++) {
      ec[e] = Math.cos(edges.t[e]);
      es[e] = Math.sin(edges.t[e]);
    }
    const den = 1 / (1 - cosTol2);
    for (const combo of orientationCombos(opts)) {
      const w1 = baseAspect(shape) * combo.aspect;
      const sides = localSides(shape, w1, 1);
      const c = Math.cos(combo.rot), s = Math.sin(combo.rot);
      const pairs = [];
      for (let k = 0; k < pairsN; k++) {
        const sd = sides[k];
        const nx = sd.nx * c - sd.ny * s, ny = sd.nx * s + sd.ny * c;
        pairs.push({ nx, ny, a1: sd.a, hist: new Float32Array(2 * D + 1) });
      }
      for (let e = 0; e < edges.count; e++) {
        const x = edges.x[e], y = edges.y[e], m = edges.m[e], cx0 = ec[e], sy0 = es[e];
        for (let k = 0; k < pairsN; k++) {
          const p = pairs[k];
          const cd = cx0 * p.nx + sy0 * p.ny;
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
      for (let k = 0; k < pairsN; k++) {
        const p = pairs[k];
        let muMin = Infinity, muMax = -Infinity;
        for (const [x, y] of corners) {
          const mu = x * p.nx + y * p.ny;
          muMin = Math.min(muMin, mu);
          muMax = Math.max(muMax, mu);
        }
        const aMin = Math.max(2, Math.floor(p.a1 * hMin)), aMax = Math.ceil(p.a1 * hMax);
        const mu0 = Math.floor(muMin);
        const nMu = Math.ceil(muMax) - mu0 + 1, nA = aMax - aMin + 1;
        if (nMu <= 2 || nA <= 2) continue;
        const T = new Float32Array(nMu * nA);
        const hist = p.hist;
        let tMax = 0;
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
          const px = -p.ny, py = p.nx;
          const bx = mu * p.nx, by = mu * p.ny;
          let lMin = -Infinity, lMax = Infinity;
          if (Math.abs(px) > 1e-9) {
            const l1 = (reg.x0 - bx) / px, l2 = (reg.x1 - bx) / px;
            lMin = Math.max(lMin, Math.min(l1, l2));
            lMax = Math.min(lMax, Math.max(l1, l2));
          } else if (bx < reg.x0 || bx > reg.x1) continue;
          if (Math.abs(py) > 1e-9) {
            const l1 = (reg.y0 - by) / py, l2 = (reg.y1 - by) / py;
            lMin = Math.max(lMin, Math.min(l1, l2));
            lMax = Math.min(lMax, Math.max(l1, l2));
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
              if (Math.abs(l - bestL) > 6) {
                second = best;
                secondL = bestL;
              }
              best = sc;
              bestL = l;
            } else if (sc > second && Math.abs(l - bestL) > 6) {
              second = sc;
              secondL = l;
            }
          }
          for (const [sc, l] of [[best, bestL], [second, secondL]]) {
            if (sc < 0) continue;
            out.push({
              shape,
              cx: bx + l * px,
              cy: by + l * py,
              w: w1 * h,
              h,
              rot: combo.rot,
              votes: (v + sc) / (pairsN * 3)
            });
          }
        }
      }
    }
    return dedupe(out, opts.maxCandidates);
  }
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
  function dedupe(cands, max) {
    cands.sort((a, b) => b.votes - a.votes);
    const kept = [];
    for (const c of cands) {
      const dup = kept.some((k) => Math.hypot(k.cx - c.cx, k.cy - c.cy) < 3 && Math.abs(k.h - c.h) < Math.max(3, 0.03 * c.h) && Math.abs(k.w - c.w) < Math.max(3, 0.03 * c.w));
      if (!dup) kept.push(c);
      if (kept.length >= max) break;
    }
    return kept;
  }
  function circleCandidates(level, edges, opts) {
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
          const x = ex + dx * r + 0.5 | 0, y = ey + dy * r + 0.5 | 0;
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
        const wgt = edges.m[e] * al ** 4 / Math.max(1, d);
        const i = Math.floor(d), f = d - i;
        if (i + 1 < nb) {
          hist[i] += wgt * (1 - f);
          hist[i + 1] += wgt * f;
        }
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

  // src/detector/score.js
  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  var OFFSETS = [-1.5, -0.75, 0, 0.75, 1.5];
  function scorePerimeter(level, s, opts = {}) {
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
        const v = d.e / g * d.align * d.align;
        if (v > best) best = v;
      }
      const h = smoothstep(0.12, 0.45, best);
      hits[i] = h;
      cov += h;
      sideHit[p.side] += h;
      sideCnt[p.side]++;
    }
    const coverage = cov / pts.length;
    let sidesSeen = 0;
    for (let k = 0; k < nSides; k++) if (sideCnt[k] && sideHit[k] / sideCnt[k] > 0.3) sidesSeen++;
    const sideBalance = sidesSeen / nSides;
    const consistency = colourConsistency(level, pts, hits, 2);
    const score = coverage * (0.6 + 0.4 * consistency) * (0.75 + 0.25 * sideBalance);
    return { score, coverage, consistency, sideBalance, hits, n: pts.length };
  }
  function colourConsistency(level, pts, hits, off, sampler = sampleLevel) {
    const a = new Float32Array(4);
    let best = 0;
    for (const sgn of [-1, 1]) {
      let ok = 0, total = 0, alphaSum = 0, alphaN = 0;
      let prevValid = false;
      const prev = new Float32Array(4);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const valid2 = hits[i] > 0.5 && sampler(level, p.x + p.nx * off * sgn, p.y + p.ny * off * sgn, a);
        if (valid2) {
          alphaSum += a[3];
          alphaN++;
          if (prevValid) {
            const d = Math.hypot(a[0] - prev[0], a[1] - prev[1], a[2] - prev[2], a[3] - prev[3]);
            total++;
            if (d < 0.06) ok++;
          }
          prev.set(a);
        }
        prevValid = valid2;
      }
      const meanAlpha = alphaN ? alphaSum / alphaN / 0.8 : 0;
      if (total >= 4 && meanAlpha > 0.5) best = Math.max(best, ok / total);
    }
    return best;
  }

  // src/detector/refine.js
  var F_A = new Float32Array(4);
  function profile(img, p, tMin, tMax, step) {
    const n = Math.max(3, Math.floor((tMax - tMin) / step) + 1);
    const F = new Float32Array((n + 2) * 4);
    const valid2 = new Uint8Array(n + 2);
    for (let i = 0; i < n + 2; i++) {
      const t = tMin + (i - 1) * step;
      if (sampleRaw(img, p.x + p.nx * t, p.y + p.ny * t, F_A)) {
        F.set(F_A, i * 4);
        valid2[i] = 1;
      }
    }
    const ts = new Float32Array(n), D = new Float32Array(n);
    const span = Math.max(1, Math.round(0.5 / step));
    for (let i = 0; i < n; i++) {
      ts[i] = tMin + i * step;
      const a = i + 1 - span, b = i + 1 + span;
      if (a < 0 || b >= n + 2 || !valid2[a] || !valid2[b]) {
        D[i] = 0;
        continue;
      }
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
  function paramVec(s) {
    return [s.cx, s.cy, s.w, s.h, s.rot || 0];
  }
  function fromVec(s, v) {
    return { ...s, cx: v[0], cy: v[1], w: v[2], h: v[3], rot: v[4] };
  }
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
  function fitShape(s, obs, { tukey = 2, iterations = 4, free = [true, true, true, true, true], rotLimit = Infinity, tieAspect = 0 } = {}) {
    let v = paramVec(s);
    if (tieAspect) {
      free = free.slice();
      free[2] = false;
      v[2] = tieAspect * v[3];
    }
    const eps = [0.05, 0.05, 0.1, 0.1, 2e-4];
    const idx = free.map((f, i) => f ? i : -1).filter((i) => i >= 0);
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
          const vp = v.slice();
          vp[k] += eps[k];
          if (tieAspect && k === 3) vp[2] = tieAspect * vp[3];
          J[a] = (signedDistance(fromVec(s, vp), o.x, o.y) - r) / eps[k];
        }
        for (let a = 0; a < n; a++) {
          g[a] += tw * J[a] * r;
          for (let b = 0; b < n; b++) A[a][b] += tw * J[a] * J[b];
        }
        wsum += tw;
        r2 += tw * r * r;
        inl++;
      }
      if (wsum <= 0 || inl < idx.length + 3) break;
      for (let a = 0; a < n; a++) A[a][a] *= 1.001;
      const d = solve(A, g.map((x) => -x));
      if (!d || d.some((x) => !Number.isFinite(x))) break;
      const prev = v.slice();
      for (let a = 0; a < n; a++) v[idx[a]] += d[a];
      if (Math.abs(v[2] - prev[2]) > 0.5 * prev[2] || Math.abs(v[3] - prev[3]) > 0.5 * prev[3]) {
        v = prev;
        break;
      }
      if (tieAspect) v[2] = tieAspect * v[3];
      v[4] = Math.max(-rotLimit, Math.min(rotLimit, v[4]));
      v[2] = Math.max(4, v[2]);
      v[3] = Math.max(4, v[3]);
      last = { rms: Math.sqrt(r2 / wsum), inliers: inl };
      if (d.every((x, a) => Math.abs(x) < (idx[a] === 4 ? 1e-5 : 0.01))) break;
    }
    return { shape: fromVec(s, v), ...last };
  }
  function observeEdges(img, s, R, { mode = "nearest", nPts } = {}) {
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
          if (D[i] >= D[i - 1] && D[i] >= D[i + 1] && D[i] >= 0.5 * wmax) {
            bi = i;
            bv = D[i];
            break;
          }
        }
      } else {
        const sig = 0.8 * R;
        let bs = 0;
        for (let i = 1; i < D.length - 1; i++) {
          if (D[i] < D[i - 1] || D[i] < D[i + 1]) continue;
          const sc = D[i] * Math.exp(-0.5 * (ts[i] / sig) ** 2);
          if (sc > bs) {
            bs = sc;
            bi = i;
            bv = D[i];
          }
        }
      }
      if (bi < 1) {
        raw.push(null);
        continue;
      }
      const y0 = D[bi - 1], y1 = D[bi], y2 = D[bi + 1];
      const den = y0 - 2 * y1 + y2;
      const off = Math.abs(den) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0;
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
  function refine(img, s, { px = 1, rotLimit = Infinity, startRadius, finalMode = "nearest", tieAspect = 0, lockRotation = false, minRadius = 1.6 } = {}) {
    let cur = { ...s };
    if (tieAspect) cur.w = tieAspect * cur.h;
    if (lockRotation) cur.rot = 0;
    const free = [true, true, true, true, s.shape !== "circle" && !lockRotation];
    const radii = [];
    let R = startRadius ?? Math.max(4, 3 * px);
    while (R > minRadius) {
      radii.push(R);
      R /= 2;
    }
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
  function snapOuterPerSide(img, s, { outward = 12, inward = 2, nPts = 192, minCov = 0.3, relCov = 0.6, relPeak = 0.35 } = {}) {
    const pts = perimeterPoints(s, nPts, 0.1);
    const step = Math.max(0.5, Math.min(1, outward / 60));
    const tol = Math.max(1.25, 2 * step);
    const sides = /* @__PURE__ */ new Map();
    for (const p of pts) {
      const { ts, D } = profile(img, p, -inward, outward, step);
      let dmax = 0;
      for (let i = 0; i < D.length; i++) dmax = Math.max(dmax, D[i]);
      const peaks = [];
      if (dmax > 0) {
        for (let i = 1; i < D.length - 1; i++) {
          if (D[i] < relPeak * dmax || D[i] < D[i - 1] || D[i] < D[i + 1]) continue;
          const y0 = D[i - 1], y1 = D[i], y2 = D[i + 1], den = y0 - 2 * y1 + y2;
          const off = Math.abs(den) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0;
          peaks.push(ts[i] + off * step);
        }
      }
      if (!sides.has(p.side)) sides.set(p.side, []);
      sides.get(p.side).push({ p, peaks });
    }
    const obs = [], offsets = [];
    for (const [side, list] of sides) {
      const cand = [...new Set(list.flatMap((q) => q.peaks.map((t) => Math.round(t / step) * step)))];
      const cov = (t) => list.reduce((n2, q) => n2 + (q.peaks.some((u) => Math.abs(u - t) <= tol) ? 1 : 0), 0) / list.length;
      const scored = cand.map((t) => ({ t, c: cov(t) }));
      const best = scored.reduce((b, x) => x.c > b ? x.c : b, 0);
      const ok = scored.filter((x) => x.c >= Math.max(minCov, relCov * best));
      if (!ok.length) {
        offsets.push({ side, t: null, c: best });
        continue;
      }
      const t0 = ok.reduce((b, x) => x.t > b.t ? x : b).t;
      let sum = 0, n = 0;
      for (const q of list) {
        let bt = null;
        for (const u of q.peaks) if (Math.abs(u - t0) <= tol && (bt === null || Math.abs(u - t0) < Math.abs(bt - t0))) bt = u;
        if (bt === null) continue;
        obs.push({ x: q.p.x + q.p.nx * bt, y: q.p.y + q.p.ny * bt, t: bt, w: 1, p: q.p });
        sum += bt;
        n++;
      }
      offsets.push({ side, t: n ? sum / n : t0, c: cov(t0) });
    }
    return { obs, offsets, n: pts.length };
  }
  function edgeScan(img, s, { inner = 0.16, outer = 0.08, thrAbs = 0 } = {}) {
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
    for (let i = 0; i < nb; i++) {
      ts[i] = tMin + i * step;
      cov[i] /= pts.length;
    }
    const sm = new Float32Array(nb);
    for (let i = 0; i < nb; i++) sm[i] = (i > 0 ? cov[i - 1] : 0) + cov[i] + (i + 1 < nb ? cov[i + 1] : 0);
    return { ts, cov: sm, step };
  }
  function analyseScan(scan, { minGap = 1.5 } = {}) {
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
    const outerPk = strong.reduce((b, p) => p.t > b.t ? p : b, strong[0] ?? { t: 0, c: c0 });
    const innerCands = peaks.filter((p) => p.t < outerPk.t - minGap && p.c >= Math.max(0.08, 0.35 * outerPk.c));
    const innerPk = innerCands.reduce((b, p) => !b || p.c > b.c ? p : b, null);
    return { outer: outerPk.t, outerCov: outerPk.c, inner: innerPk ? innerPk.t : outerPk.t, innerCov: innerPk?.c ?? 0, peaks };
  }
  function bandCoverage(img, s, thickness, { nPts = 120 } = {}) {
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

  // src/detector/index.js
  var DETECTOR_VERSION = 2;
  var DEFAULTS = Object.freeze({
    shape: "hex-pointy",
    fallback: true,
    // try the other shapes when the expected one is weak
    fallbackBelow: 0.8,
    // confidence under which other shapes are also tried
    method: "hough",
    // "hough" | "grid" (brute-force baseline, slower)
    coarseSize: 512,
    rotationTolerance: 3,
    // degrees
    aspectTolerance: 0.12,
    // +-12 % around the regular aspect ratio
    angleTolerance: 5,
    // degrees, edge orientation vs side direction
    centerRegion: 0.32,
    // centre searched within +-32 % of image size around the middle
    minSize: 0.2,
    // border bounding box: 20 % of the shorter side ...
    maxSize: 1.04,
    // ... up to 104 % of the longer side
    anchorsPerPair: 10,
    circleCenters: 8,
    maxCandidates: 60,
    refineTop: 4,
    scanThickness: true,
    timeBudget: 800,
    // ms; safety cap: remaining fallback shapes are skipped after this
    aspectPrior: 2.5,
    // score penalty per unit of aspect deviation beyond aspectFree
    aspectFree: 0.035,
    // aspect deviation (fraction) that costs nothing: real frames are often 2-3 % off regular
    hypotheses: "upright,free",
    // refinement hypotheses per polygon candidate (see detectShape);
    // add "regular" for a regular-aspect fit when evidence is weak. Circles
    // always try circle (regular) and ellipse (free).
    coarseRotations: false,
    // also search +-2.5 deg rotations at the coarse stage (the histogram's
    // angular tolerance and the "free" refinement already cover them)
    snapOuter: true,
    // per-side snap to the outermost consensus edge (thick multi-line frames)
    padClipped: true
    // add a transparent margin when cut-out art touches the canvas edge
  });
  var now = () => globalThis.performance?.now?.() ?? Date.now();
  function toFull(level, s) {
    const sx = level.scale, sy = level.scaleY;
    return { ...s, cx: (s.cx + 0.5) / sx - 0.5, cy: (s.cy + 0.5) / sy - 0.5, w: s.w / sx, h: s.h / sy };
  }
  function toLevel(level, s) {
    const sx = level.scale, sy = level.scaleY;
    return { ...s, cx: (s.cx + 0.5) * sx - 0.5, cy: (s.cy + 0.5) * sy - 0.5, w: s.w * sx, h: s.h * sy };
  }
  function gridCandidates(img, shape, opts) {
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
    return dedupe(out, opts.maxCandidates).map((c) => ({ ...toFull(lvl, c), votes: c.votes }));
  }
  function concentric(a, b, tight = false) {
    const size = Math.max(a.w, a.h);
    const sameAspect = Math.abs(a.w / a.h / (b.w / b.h) - 1) < 0.02;
    return Math.hypot(a.cx - b.cx, a.cy - b.cy) < (tight ? 0.012 : 0.03) * size && sameAspect && Math.abs(Math.max(b.w, b.h) / size - 1) < 0.2;
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
      timings.candidates += t1 - t0;
      timings.scoring += t2 - t1;
      return { skipped: true, coarseTop };
    }
    const picked = [];
    for (const s of scored) {
      if (picked.some((p) => concentric(p.c, s.c, true))) continue;
      picked.push(s);
      if (picked.length >= opts.refineTop) break;
    }
    const px = 1 / level.scale;
    const rotLimit = opts.rotationTolerance * Math.PI / 180 + 1e-6;
    const results = [];
    const scoreOf = (r) => evidence(r) * (0.6 + 0.4 * r.level.consistency) * (0.7 + 0.3 * r.level.sideBalance) * aspectPrior(r.shape, opts.aspectPrior, opts.aspectFree);
    const want = new Set(String(opts.hypotheses).split(","));
    const excellent = (r) => r && r.inlier >= 0.88 && r.level.coverage >= 0.88;
    const weak = (r) => !r || r.inlier < 0.75 || r.level.coverage < 0.8;
    const H = {
      regular: { tieAspect: baseAspect(shape), lockRotation: true, canonical: true, gate: shape === "circle" ? () => true : weak },
      upright: { tieAspect: 0, lockRotation: true, canonical: false, gate: () => true },
      free: { tieAspect: 0, lockRotation: shape === "circle", canonical: false, gate: (r) => !excellent(r) }
    };
    const order = shape === "circle" ? ["regular", "free"] : ["upright", "free", "regular"].filter((k) => want.has(k));
    const hyps = order.filter((k) => k !== "free" || opts.rotationTolerance > 0 || shape === "circle").map((k) => ({ ...H[k], name: k }));
    const same = (a, b) => Math.abs(a.cx - b.cx) < 1 && Math.abs(a.cy - b.cy) < 1 && Math.abs(a.w - b.w) < 1.5 && Math.abs(a.h - b.h) < 1.5 && Math.abs((a.rot || 0) - (b.rot || 0)) < 2e-3;
    for (const { c, sc: coarse } of picked) {
      const lead = results.reduce((b, r) => !b || r.score > b.score ? r : b, null);
      if (lead && lead.score > 0.8 && coarse.score < 0.8 * lead.coarse.score) break;
      let chosen = null;
      for (const hyp of hyps) {
        if (chosen && !hyp.gate(chosen)) continue;
        const r = runHypothesis(img, level, toFull(level, c), shape, hyp, { px, rotLimit, scan: opts.scanThickness, snap: opts.snapOuter });
        r.coarse = coarse;
        r.score = scoreOf(r);
        if (!Number.isFinite(r.score) || ![r.shape.cx, r.shape.cy, r.shape.w, r.shape.h].every(Number.isFinite)) continue;
        r.canonical = hyp.canonical;
        r.hypothesis = hyp.name;
        if (opts.debug) (opts.debugLog ??= []).push({
          shape,
          canonical: hyp.canonical,
          hypothesis: hyp.name,
          cx: r.shape.cx,
          cy: r.shape.cy,
          w: r.shape.w,
          h: r.shape.h,
          rot: r.shape.rot,
          thickness: r.thickness,
          cov: r.level.coverage,
          cons: r.level.consistency,
          bal: r.level.sideBalance,
          inlier: r.inlier,
          band: r.band,
          score: r.score,
          from: { cx: c.cx / level.scale, w: c.w / level.scale, coarse: coarse.score }
        });
        const dup = results.some((q) => same(q.shape, r.shape));
        if (!chosen) chosen = r;
        else if (r.score > chosen.score * 1.04 + 5e-3) chosen = r;
        if (dup) break;
      }
      if (chosen) results.push(chosen);
    }
    const t3 = now();
    timings.candidates += t1 - t0;
    timings.scoring += t2 - t1;
    timings.refine += t3 - t2;
    results.sort((a, b) => b.score - a.score);
    const best = results[0];
    if (!best) return null;
    const rival = results.find((r) => r !== best && !concentric(best.shape, r.shape));
    const ratio = rival ? rival.score / Math.max(1e-6, best.score) : 0;
    const base = smoothstep(0.2, 0.62, evidence(best));
    const confidence = base * (0.65 + 0.35 * best.level.consistency) * (0.75 + 0.25 * best.level.sideBalance) * (1 - 0.5 * smoothstep(0.7, 1, ratio));
    return { ...best, confidence, coarseTop, candidates: cands.length, rival: rival ? { ...rival.shape, score: rival.score } : null };
  }
  function evidence(r) {
    const e = Math.min(r.level.coverage, r.inlier + 0.1);
    return Number.isFinite(r.band) ? 0.5 * e + 0.5 * Math.min(e, r.band + 0.1) : e;
  }
  function aspectPrior(s, k, free = 0) {
    const dev = Math.max(0, Math.abs(s.w / s.h / baseAspect(s.shape) - 1) - free);
    return Math.max(0.5, 1 - k * dev);
  }
  function runHypothesis(img, level, start, shape, hyp, { px, rotLimit, scan, snap }) {
    const rl = shape === "circle" || hyp.lockRotation ? 0 : rotLimit;
    const common = { rotLimit: rl, tieAspect: hyp.tieAspect, lockRotation: hyp.lockRotation };
    let r = refine(img, start, { px, ...common, minRadius: scan ? 2.5 : 1.6 });
    let shapeFull = r.shape;
    let thickness = 0, band = NaN;
    if (snap) {
      const outward = Math.max(6, 0.05 * meanApothem(shapeFull));
      const sn = snapOuterPerSide(img, shapeFull, { outward, inward: Math.max(2, 0.5 * px) });
      if (sn.obs.length >= 24) {
        const free = [true, true, true, true, shape !== "circle" && !hyp.lockRotation];
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
      const inner = an.peaks.filter((p) => p.t < an.outer - 1.5 && p.c >= 0.08).sort((a, b) => b.c - a.c).slice(0, 4);
      const tested = [];
      for (const p of inner) {
        const t = an.outer - p.t;
        const b = bandCoverage(img, shapeFull, t);
        if (Number.isFinite(b)) tested.push({ t, b });
      }
      const bestB = Math.max(0, ...tested.map((x) => x.b));
      for (const x of tested) if (x.b >= 0.8 * bestB && x.t > thickness) {
        thickness = x.t;
        band = x.b;
      }
      if (tested.length && !Number.isFinite(band)) band = bestB;
      if (Number.isFinite(band) && band < 0.15) {
        band = NaN;
        thickness = 0;
      }
    }
    const lv = scorePerimeter(level, toLevel(level, shapeFull));
    const obs = r.observation;
    const tol = Math.max(1, 0.6 * Math.max(1, px));
    let inl = 0;
    if (obs) {
      for (const o of obs.obs) if (Math.abs(signedDistance(shapeFull, o.x, o.y)) < tol) inl++;
    }
    return { shape: shapeFull, thickness, level: lv, inlier: obs ? inl / obs.n : 0, band };
  }
  function detectBorder(img, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    if (!SHAPES.includes(opts.shape)) opts.shape = DEFAULTS.shape;
    const m = opts.padClipped ? clippedMargin(img, opts) : 0;
    if (!m) return detectCore(img, opts);
    const t0 = now();
    const padded = padImage(img, m);
    const padMs = now() - t0;
    const r = detectCore(padded, opts);
    r.cx -= m;
    r.cy -= m;
    if (!r.stats) {
      r.width = img.width;
      r.height = img.height;
    }
    if (r.rival) {
      r.rival.cx -= m;
      r.rival.cy -= m;
    }
    r.imageWidth = img.width;
    r.imageHeight = img.height;
    r.timings.prep += padMs;
    r.timings.total += padMs;
    r.padded = m;
    return r;
  }
  function clippedMargin(img, opts = DEFAULTS) {
    const { width: w, height: h, data } = img;
    const a = (x, y) => data[(y * w + x) * 4 + 3];
    const corners = [a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)].filter((v) => v < 16).length;
    if (corners < 3) return 0;
    let opaque = 0;
    const step = Math.max(1, Math.floor(Math.max(w, h) / 1024));
    for (let x = 0; x < w; x += step) {
      if (a(x, 0) > 16) opaque++;
      if (a(x, h - 1) > 16) opaque++;
    }
    for (let y = 0; y < h; y += step) {
      if (a(0, y) > 16) opaque++;
      if (a(w - 1, y) > 16) opaque++;
    }
    if (!opaque) return 0;
    return Math.max(4, Math.ceil(3 * Math.max(w, h) / (opts.coarseSize || 512)));
  }
  function padImage(img, m) {
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
    const order = [opts.shape, ...opts.fallback ? fallbackOrder(opts.shape) : []];
    const tried = [];
    const results = [];
    let best = null;
    for (const shape of order) {
      const fallback = shape !== opts.shape;
      if (fallback && best && best.confidence >= opts.fallbackBelow && best.shape.shape === opts.shape) break;
      if (fallback && now() - t0 > opts.timeBudget) break;
      const hinted = results.find((r2) => r2.shape.shape === opts.shape);
      const minCoarse = fallback && hinted ? 0.85 * hinted.coarseTop : 0;
      const r = detectShape(img, level, edges, shape, opts, timings, { minCoarse });
      if (!r || r.skipped) {
        if (r) tried.push({ shape, skipped: true, coarse: r.coarseTop });
        continue;
      }
      tried.push({ shape, confidence: r.confidence });
      const adj = fallback ? r.confidence - 0.08 : r.confidence;
      results.push({ ...r, adj });
      if (!best || adj > best.adj) best = results.at(-1);
    }
    if (best) {
      const area = (r) => r.shape.w * r.shape.h;
      const inside = (a, b) => Math.abs(a.shape.cx - b.shape.cx) + a.shape.w / 2 <= b.shape.w / 2 * 1.02 && Math.abs(a.shape.cy - b.shape.cy) + a.shape.h / 2 <= b.shape.h / 2 * 1.02;
      const encl = results.filter((r) => r !== best && r.confidence >= 0.6 && area(r) > 2 * area(best) && inside(best, r)).sort((a, b) => b.adj - a.adj)[0];
      if (encl) best = encl;
    }
    timings.total = now() - t0;
    if (!best) {
      return {
        shape: opts.shape,
        cx: img.width / 2,
        cy: img.height / 2,
        width: img.width,
        height: img.height,
        rotation: 0,
        thickness: 0,
        confidence: 0,
        detectorVersion: DETECTOR_VERSION,
        tried,
        timings,
        imageWidth: img.width,
        imageHeight: img.height
      };
    }
    const s = best.shape;
    return {
      shape: s.shape,
      cx: s.cx,
      cy: s.cy,
      width: s.w,
      height: s.h,
      rotation: (s.rot || 0) * 180 / Math.PI,
      thickness: best.thickness,
      confidence: Math.max(0, Math.min(1, best.confidence)),
      stats: {
        coverage: best.level.coverage,
        consistency: best.level.consistency,
        sideBalance: best.level.sideBalance,
        inlier: best.inlier,
        candidates: best.candidates
      },
      rival: best.rival ? { cx: best.rival.cx, cy: best.rival.cy, width: best.rival.w, height: best.rival.h, score: best.rival.score } : null,
      tried,
      timings,
      debug: opts.debugLog,
      imageWidth: img.width,
      imageHeight: img.height,
      detectorVersion: DETECTOR_VERSION
    };
  }
  function fallbackOrder(shape) {
    const all = {
      "hex-pointy": ["circle", "hex-flat", "square"],
      "hex-flat": ["circle", "hex-pointy", "square"],
      circle: ["hex-pointy", "hex-flat", "square"],
      square: ["circle", "hex-pointy", "hex-flat"]
    };
    return all[shape] ?? [];
  }

  // src/core/fit-math.js
  function fitBaseScale(fit, baseW, baseH, texW, texH) {
    const rx = baseW / texW, ry = baseH / texH;
    switch (fit) {
      case "fill":
        return { sx: rx, sy: ry };
      case "cover": {
        const s = Math.max(rx, ry);
        return { sx: s, sy: s };
      }
      case "width":
        return { sx: rx, sy: rx };
      case "height":
        return { sx: ry, sy: ry };
      case "contain":
      default: {
        const s = Math.min(rx, ry);
        return { sx: s, sy: s };
      }
    }
  }
  var sign = (v) => v < 0 ? -1 : 1;
  function computeTextureFit(p) {
    const { border, texture, base, target } = p;
    const fit = p.fit ?? "contain";
    const pivot = p.pivot ?? { x: base.width / 2, y: base.height / 2 };
    const b = p.baseScale ?? fitBaseScale(fit, base.width, base.height, texture.width, texture.height);
    const kx = target.width / border.width, ky = target.height / border.height;
    let tx = kx, ty = ky;
    switch (p.aspect ?? "stretch") {
      case "contain":
        tx = ty = Math.min(kx, ky);
        break;
      case "cover":
        tx = ty = Math.max(kx, ky);
        break;
      case "width":
        tx = ty = kx;
        break;
      case "height":
        tx = ty = ky;
        break;
      default:
        break;
    }
    const sx = sign(p.scaleX ?? 1), sy = sign(p.scaleY ?? 1);
    const scaleX = sx * tx / b.sx, scaleY = sy * ty / b.sy;
    const TX = b.sx * scaleX, TY = b.sy * scaleY;
    const th = (p.rotation ?? 0) * Math.PI / 180;
    const dx = target.x + target.width / 2 - pivot.x, dy = target.y + target.height / 2 - pivot.y;
    const c = Math.cos(th), s = Math.sin(th);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const anchorX = (border.cx - lx / TX) / texture.width;
    const anchorY = (border.cy - ly / TY) / texture.height;
    return { scaleX, scaleY, anchorX, anchorY, baseScale: b };
  }
  function bounds(points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { x, y } of points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  function borderInTexture(fitFlag, texW, texH) {
    const kx = texW / (fitFlag.imgW || texW), ky = texH / (fitFlag.imgH || texH);
    return { cx: fitFlag.cx * kx, cy: fitFlag.cy * ky, width: fitFlag.w * kx, height: fitFlag.h * ky };
  }
  function referenceBox(fitFlag, edge = "outer") {
    const t = edge === "inner" ? fitFlag.thickness || 0 : edge === "center" ? (fitFlag.thickness || 0) / 2 : 0;
    if (!t) return { ...fitFlag };
    const a = meanApothem2(fitFlag.shape, fitFlag.w, fitFlag.h);
    const k = Math.max(0.05, (a - t) / a);
    return { ...fitFlag, w: fitFlag.w * k, h: fitFlag.h * k };
  }
  function meanApothem2(shape, w, h) {
    if (shape === "circle") return (w + h) / 4;
    if (shape === "square") return (w + h) / 4;
    const pointy = shape !== "hex-flat";
    const flatHalf = pointy ? w / 2 : h / 2;
    const W = pointy ? w : h, H = pointy ? h : w;
    const ex = W / 2, ey = H / 4;
    const slanted = Math.abs(0 * ey - -H / 2 * ex) / Math.hypot(ex, ey);
    return (2 * flatHalf + 4 * slanted) / 6;
  }

  // src/foundry/compat.js
  function setRenderFlags(placeable, flags) {
    if (!placeable?.renderFlags) return;
    const known = placeable.constructor?.RENDER_FLAGS ?? {};
    const ok = {};
    for (const [k, v] of Object.entries(flags)) if (k in known) ok[k] = v;
    if (Object.keys(ok).length) placeable.renderFlags.set(ok);
  }
  function tokenDocumentClass() {
    return CONFIG.Token?.documentClass ?? getDocumentClass("Token");
  }
  function isPrototype(doc) {
    const PT = foundry.data?.PrototypeToken;
    return PT && doc instanceof PT || doc && doc.documentName !== "Token" && doc.parent?.documentName === "Actor";
  }
  function ownerDocument(doc) {
    return isPrototype(doc) ? doc.parent ?? doc.actor : doc;
  }
  function canModify(doc) {
    const owner = ownerDocument(doc);
    if (!owner) return false;
    try {
      return owner.canUserModify(game.user, "update");
    } catch {
      return !!owner.isOwner;
    }
  }
  async function updateTokenLike(doc, data, options = {}) {
    if (isPrototype(doc)) return ownerDocument(doc).update({ prototypeToken: data }, options);
    return doc.update(data, options);
  }
  function loadTextureFn() {
    return foundry.canvas?.loadTexture ?? globalThis.loadTexture;
  }
  function hasVideoExtension(src) {
    const VH = foundry.helpers?.media?.VideoHelper ?? globalThis.VideoHelper;
    try {
      if (VH?.hasVideoExtension) return VH.hasVideoExtension(src);
    } catch {
    }
    return /\.(webm|mp4|m4v|ogv|ogg|mov)(\?|$)/i.test(src);
  }
  function AppV2() {
    return foundry.applications?.api?.ApplicationV2;
  }

  // src/foundry/image-source.js
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function drawToImageData(source, nw, nh, maxSize) {
    const scale = Math.min(1, maxSize / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale)), h = Math.max(1, Math.round(nh * scale));
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    return { img: { width: w, height: h, data: id.data }, naturalWidth: nw, naturalHeight: nh, scale: w / nw };
  }
  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.decoding = "async";
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(`Could not load image ${src}`));
      im.src = src;
    });
  }
  function loadVideoFrame(src) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      const fail = () => reject(new Error(`Could not load video ${src}`));
      v.onerror = fail;
      v.onloadeddata = () => {
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
      };
      v.onseeked = () => resolve(v);
      v.src = src;
    });
  }
  async function viaFetch(src) {
    const res = await fetch(src, { mode: "cors", credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${src}`);
    const blob = await res.blob();
    return createImageBitmap(blob);
  }
  async function viaRenderer(src, maxSize) {
    const load2 = loadTextureFn();
    if (!load2 || !canvas?.app?.renderer) throw new Error("Canvas renderer not available");
    const tex = await load2(src);
    if (!tex?.valid && !tex?.baseTexture) throw new Error(`Texture ${src} not loaded`);
    const nw = tex.width, nh = tex.height;
    const scale = Math.min(1, maxSize / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale)), h = Math.max(1, Math.round(nh * scale));
    const sprite = new PIXI.Sprite(tex);
    sprite.scale.set(scale);
    const rt = PIXI.RenderTexture.create({ width: w, height: h });
    try {
      canvas.app.renderer.render(sprite, { renderTexture: rt, clear: true });
      const px = canvas.app.renderer.extract.pixels(rt);
      return { img: { width: w, height: h, data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.length) }, naturalWidth: nw, naturalHeight: nh, scale: w / nw };
    } finally {
      sprite.destroy({ texture: false });
      rt.destroy(true);
    }
  }
  async function loadPixels(src, { maxSize = 2048 } = {}) {
    const errors = [];
    const video = hasVideoExtension(src);
    try {
      const el2 = video ? await loadVideoFrame(src) : await loadImageElement(src);
      const nw = video ? el2.videoWidth : el2.naturalWidth, nh = video ? el2.videoHeight : el2.naturalHeight;
      return { ...drawToImageData(el2, nw, nh, maxSize), method: "element" };
    } catch (e) {
      errors.push(e);
    }
    if (!video) {
      try {
        const bmp = await viaFetch(src);
        const r = { ...drawToImageData(bmp, bmp.width, bmp.height, maxSize), method: "fetch" };
        bmp.close?.();
        return r;
      } catch (e) {
        errors.push(e);
      }
    }
    try {
      return { ...await viaRenderer(src, maxSize), method: "renderer" };
    } catch (e) {
      errors.push(e);
    }
    const err = new Error(`Could not read pixels of ${src}: ${errors.map((e) => e.message).join("; ")}`);
    err.cors = errors.some((e) => e.name === "SecurityError");
    throw err;
  }

  // src/foundry/cache.js
  var STORE_KEY = `token-border-autofit.cache.v${DETECTOR_VERSION}`;
  var LIMIT = 400;
  var mem = null;
  function load() {
    if (mem) return mem;
    mem = /* @__PURE__ */ new Map();
    try {
      const raw = globalThis.localStorage?.getItem(STORE_KEY);
      if (raw) for (const [k, v] of JSON.parse(raw)) mem.set(k, v);
    } catch {
    }
    return mem;
  }
  function persist() {
    try {
      globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify([...mem.entries()]));
    } catch {
    }
  }
  var key = (src, hint) => `${hint}|${src}`;
  function cacheGet(src, hint) {
    const m = load();
    const k = key(src, hint);
    const v = m.get(k);
    if (!v) return null;
    m.delete(k);
    m.set(k, v);
    return v;
  }
  function cacheSet(src, hint, entry) {
    const m = load();
    m.set(key(src, hint), { ...entry, t: Date.now() });
    while (m.size > LIMIT) m.delete(m.keys().next().value);
    persist();
  }
  function fingerprint(img) {
    let h = 2166136261;
    const d = img.data, step = Math.max(4, (d.length / 4096 | 0) * 4 + 4);
    for (let i = 0; i < d.length; i += step) {
      h ^= d[i] | d[i + 1] << 8 | d[i + 2] << 16 | d[i + 3] << 24;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return `${img.width}x${img.height}:${h.toString(16)}`;
  }

  // src/foundry/geometry.js
  function sceneFor(doc) {
    if (!isPrototype(doc) && doc?.parent?.documentName === "Scene") return doc.parent;
    return canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.current ?? null;
  }
  function shapeHint(doc, scene, { gridless = "circle", square = "auto" } = {}) {
    const grid = scene?.grid;
    const G = CONST.GRID_TYPES, TS = CONST.TOKEN_SHAPES;
    const type = grid?.type;
    const shape = doc?.shape;
    const isRect = TS && (shape === TS.RECTANGLE_1 || shape === TS.RECTANGLE_2);
    const isEllipse = TS && (shape === TS.ELLIPSE_1 || shape === TS.ELLIPSE_2);
    if (type === void 0 || type === G.GRIDLESS) return isRect ? "square" : gridless;
    if (type === G.SQUARE) {
      if (square !== "auto") return square;
      return isEllipse ? "circle" : "square";
    }
    const columns = grid.columns ?? [G.HEXODDQ, G.HEXEVENQ].includes(type);
    return columns ? "hex-flat" : "hex-pointy";
  }
  var tryCall = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function asTokenDocument(doc, scene) {
    if (!isPrototype(doc) && doc?.parent) return doc;
    const data = doc.toObject?.() ?? foundry.utils.deepClone(doc);
    for (const k of ["randomImg", "appendNumber", "prependAdjective"]) delete data[k];
    return tryCall(() => new (tokenDocumentClass())(data, { parent: scene ?? null })) ?? null;
  }
  function tokenGeometry(doc, overrides = {}) {
    const scene = sceneFor(doc);
    const tdoc = asTokenDocument(doc, scene);
    const width = overrides.width ?? doc.width ?? 1;
    const height = overrides.height ?? doc.height ?? 1;
    const shape = overrides.shape ?? doc.shape;
    const data = { x: 0, y: 0, elevation: 0, width, height };
    if (shape !== void 0) data.shape = shape;
    const sameDims = overrides.width === void 0 && overrides.height === void 0 && overrides.shape === void 0;
    const placeable = sameDims && !isPrototype(doc) ? doc.object : null;
    const sources = {};
    let base = tdoc && tryCall(() => tdoc.getSize?.(data));
    if (valid(base)) sources.base = "TokenDocument#getSize";
    else if (valid(base = placeable && tryCall(() => placeable.getSize?.()))) sources.base = "Token#getSize";
    else {
      base = fallbackSize(scene, width, height);
      sources.base = "fallback";
    }
    base = { width: base.width, height: base.height };
    let pivot = tdoc && tryCall(() => tdoc.getCenterPoint?.(data));
    if (finitePt(pivot)) sources.pivot = "TokenDocument#getCenterPoint";
    else if (finitePt(pivot = placeable && tryCall(() => placeable.getCenterPoint?.({ x: 0, y: 0 })))) sources.pivot = "Token#getCenterPoint";
    else {
      pivot = { x: base.width / 2, y: base.height / 2 };
      sources.pivot = "fallback";
    }
    pivot = { x: pivot.x, y: pivot.y };
    let target = null;
    const poly = tdoc && tryCall(() => tdoc.getGridSpacePolygon?.(data));
    if (Array.isArray(poly) && poly.length >= 3) {
      target = bounds(poly.map((p) => Array.isArray(p) ? { x: p[0], y: p[1] } : p));
      sources.target = "TokenDocument#getGridSpacePolygon";
    } else if (placeable) {
      const shp = tryCall(() => placeable.getShape?.() ?? placeable.shape);
      const b = shp && tryCall(() => shp.getBounds());
      if (b && b.width > 0) {
        target = { x: b.x, y: b.y, width: b.width, height: b.height };
        sources.target = "Token#getShape";
      }
    }
    if (!target) {
      target = { x: 0, y: 0, width: base.width, height: base.height };
      sources.target = "size";
    }
    if (pivot.x < target.x - 1 || pivot.y < target.y - 1 || pivot.x > target.x + target.width + 1 || pivot.y > target.y + target.height + 1) {
      pivot = { x: base.width / 2, y: base.height / 2 };
      sources.pivot = "fallback(out-of-box)";
    }
    const lockRotation = doc.lockRotation ?? false;
    const rotation = lockRotation ? 0 : overrides.rotation ?? doc.rotation ?? 0;
    return { base, pivot, target, rotation, scene, sources };
  }
  var valid = (s) => s && Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;
  var finitePt = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  function fallbackSize(scene, width, height) {
    const g = scene?.grid ?? canvas?.grid;
    const size = g?.size ?? 100;
    let sx = g?.sizeX ?? size, sy = g?.sizeY ?? size;
    let w = width, h = height;
    if (g?.isHexagonal) {
      if (g.columns) w = 0.75 * Math.floor(width) + 0.5 * (width % 1) + 0.25;
      else h = 0.75 * Math.floor(height) + 0.5 * (height % 1) + 0.25;
    }
    return { width: w * sx, height: h * sy };
  }
  function measuredBaseScale(doc) {
    if (isPrototype(doc)) return null;
    const token = doc.object, m = token?.mesh;
    if (!m || m.destroyed || !m.texture?.valid) return null;
    if (token.animationContexts?.size || token._animation) return null;
    const tx = doc.texture?.scaleX, ty = doc.texture?.scaleY;
    if (!tx || !ty) return null;
    const sx = Math.abs(m.scale.x / tx), sy = Math.abs(m.scale.y / ty);
    return Number.isFinite(sx) && Number.isFinite(sy) && sx > 0 && sy > 0 ? { sx, sy, texW: m.texture.width, texH: m.texture.height } : null;
  }

  // src/foundry/constants.js
  var MODULE_ID = "token-border-autofit";
  var FLAG = "fit";

  // src/foundry/fit-service.js
  var DEFAULT_OPTIONS = Object.freeze({
    edge: "outer",
    aspect: "stretch",
    pf2eAutoscale: true,
    useCache: true,
    fallback: true,
    rotationTolerance: 3,
    maxSize: 2048
  });
  var round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;
  async function detectSrc(src, hint, opts = {}) {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const cached = o.useCache ? cacheGet(src, hint) : null;
    if (cached && !o.verify) return { ...cached, cached: true };
    const px = await loadPixels(src, { maxSize: o.maxSize });
    const hash = fingerprint(px.img);
    if (cached && cached.hash === hash) return { ...cached, cached: true };
    const r = detectBorder(px.img, { shape: hint, fallback: o.fallback, rotationTolerance: o.rotationTolerance });
    const k = 1 / px.scale;
    const out = {
      src,
      shape: r.shape,
      cx: (r.cx + 0.5) * k - 0.5,
      cy: (r.cy + 0.5) * k - 0.5,
      w: r.width * k,
      h: r.height * k,
      rotation: r.rotation,
      thickness: r.thickness * k,
      confidence: r.confidence,
      imgW: px.naturalWidth,
      imgH: px.naturalHeight,
      detectorVersion: DETECTOR_VERSION,
      hash,
      ms: Math.round(r.timings.total),
      loader: px.method
    };
    if (o.useCache) cacheSet(src, hint, out);
    return out;
  }
  function flagFromDetection(det, src, { manual = false } = {}) {
    return {
      src,
      shape: det.shape,
      cx: round(det.cx, 3),
      cy: round(det.cy, 3),
      w: round(det.w, 3),
      h: round(det.h, 3),
      rotation: round(det.rotation ?? 0, 3),
      thickness: round(det.thickness ?? 0, 3),
      confidence: round(det.confidence ?? 1, 3),
      imgW: det.imgW,
      imgH: det.imgH,
      detectorVersion: DETECTOR_VERSION,
      manual
    };
  }
  function getFitFlag(doc) {
    return doc?.flags?.[MODULE_ID]?.[FLAG] ?? null;
  }
  function computeFitUpdate(doc, flag, opts = {}) {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const ov = o.overrides ?? {};
    const geo = tokenGeometry(doc, ov);
    const sizeChanging = ["width", "height", "shape", "fit"].some((k) => ov[k] !== void 0);
    let measured = sizeChanging ? null : o.baseScale ?? measuredBaseScale(doc);
    if (measured && (flag.src !== doc.texture?.src || Math.abs(measured.texW / measured.texH - flag.imgW / flag.imgH) > 0.01)) measured = null;
    const texW = measured?.texW ?? flag.imgW, texH = measured?.texH ?? flag.imgH;
    const border = borderInTexture(referenceBox(flag, o.edge), texW, texH);
    const src = doc._source?.texture ?? doc.texture ?? {};
    let aspect = o.aspect;
    if (aspect === "auto") {
      const dev = Math.abs(geo.target.width / geo.target.height / (border.width / border.height) - 1);
      aspect = dev <= 0.08 ? "stretch" : "contain";
    }
    const fit = computeTextureFit({
      border,
      texture: { width: texW, height: texH },
      base: geo.base,
      target: geo.target,
      pivot: geo.pivot,
      fit: ov.fit ?? src.fit ?? doc.texture?.fit ?? "contain",
      scaleX: ov.scaleX ?? src.scaleX ?? 1,
      scaleY: ov.scaleY ?? src.scaleY ?? 1,
      rotation: geo.rotation,
      aspect,
      baseScale: measured ? { sx: measured.sx, sy: measured.sy } : void 0
    });
    const texture = { scaleX: round(fit.scaleX), scaleY: round(fit.scaleY), anchorX: round(fit.anchorX), anchorY: round(fit.anchorY) };
    const update = { texture };
    if (o.flags !== false) {
      update.flags = { [MODULE_ID]: { [FLAG]: { ...flag, applied: { scaleX: texture.scaleX, scaleY: texture.scaleY, edge: o.edge, aspect } } } };
    }
    if (game.system?.id === "pf2e" && o.pf2eAutoscale) (update.flags ??= {}).pf2e = { autoscale: false };
    return { update, geometry: geo, fit, measured: !!measured };
  }
  async function applyFit(doc, flag, opts = {}) {
    const { update } = computeFitUpdate(doc, flag, opts);
    await updateTokenLike(doc, update, { [MODULE_ID]: { internal: true } });
    return update;
  }
  function usesDynamicRing(doc) {
    return !!doc?.ring?.enabled;
  }

  // src/ui/align-editor.js
  var SVGNS = "http://www.w3.org/2000/svg";
  var UNIT2 = {
    "hex-pointy": [[0, -0.5], [0.5, -0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.25], [-0.5, -0.25]],
    "hex-flat": [[0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0], [-0.25, -0.5], [0.25, -0.5]],
    square: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
  };
  var BASE_ASPECT = { "hex-pointy": Math.sqrt(3) / 2, "hex-flat": 2 / Math.sqrt(3), square: 1, circle: 1 };
  function el(tag, attrs = {}, parent = null, ns = null) {
    const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") e.textContent = v;
      else if (k === "class") e.setAttribute("class", v);
      else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  var AlignEditor = class {
    /**
     * @param {HTMLElement} container
     * @param {object} o
     * @param {string} o.src image URL
     * @param {number} o.width natural image width
     * @param {number} o.height natural image height
     * @param {{shape,cx,cy,w,h,thickness?}} o.initial
     * @param {(state)=>void} [o.onChange]
     * @param {object} [o.labels] localized strings
     */
    constructor(container, o) {
      this.c = container;
      this.o = o;
      this.W = o.width;
      this.H = o.height;
      this.state = { shape: "hex-pointy", ...o.initial };
      this.labels = { shape: "Shape", zoom: "Zoom", fit: "Fit", lock: "Keep proportions", regular: "Regular shape", ...o.labels };
      this.zoom = "fit";
      this.lock = true;
      this._raf = 0;
      this.build();
      this.render();
    }
    build() {
      const root = el("div", { class: "tbaf-editor" }, this.c);
      const bar = el("div", { class: "tbaf-editor-bar" }, root);
      const shapeLab = el("label", {}, bar);
      el("span", { text: this.labels.shape }, shapeLab);
      this.shapeSel = el("select", { "data-role": "shape" }, shapeLab);
      for (const s of ["hex-pointy", "hex-flat", "circle", "square"]) {
        const op = el("option", { value: s, text: this.labels[s] ?? s }, this.shapeSel);
        if (s === this.state.shape) op.selected = true;
      }
      this.shapeSel.addEventListener("change", () => this.set({ shape: this.shapeSel.value }));
      const zoomLab = el("label", {}, bar);
      el("span", { text: this.labels.zoom }, zoomLab);
      this.zoomSel = el("select", { "data-role": "zoom" }, zoomLab);
      for (const [v, txt] of [["fit", this.labels.fit], ["1", "100%"], ["2", "200%"], ["4", "400%"]]) el("option", { value: v, text: txt }, this.zoomSel);
      this.zoomSel.addEventListener("change", () => {
        this.zoom = this.zoomSel.value;
        this.layout();
      });
      const lockLab = el("label", { class: "tbaf-check" }, bar);
      this.lockBox = el("input", { type: "checkbox" }, lockLab);
      this.lockBox.checked = this.lock;
      el("span", { text: this.labels.lock }, lockLab);
      this.lockBox.addEventListener("change", () => {
        this.lock = this.lockBox.checked;
      });
      const regBtn = el("button", { type: "button", class: "tbaf-mini", text: this.labels.regular, "data-tooltip": this.labels.regularHint ?? "" }, bar);
      regBtn.addEventListener("click", () => {
        const s = this.state, a = BASE_ASPECT[s.shape];
        const h = Math.sqrt(s.w * s.h / a);
        this.set({ w: a * h, h });
      });
      this.readout = el("div", { class: "tbaf-readout" }, bar);
      this.view = el("div", { class: "tbaf-view", tabindex: "0" }, root);
      this.stage = el("div", { class: "tbaf-stage" }, this.view);
      this.img = el("img", { src: this.o.src, draggable: "false", alt: "" }, this.stage);
      this.svg = el("svg", { class: "tbaf-overlay" }, this.stage, SVGNS);
      this.outline = el("polygon", { class: "tbaf-outline" }, this.svg, SVGNS);
      this.inner = el("polygon", { class: "tbaf-inner" }, this.svg, SVGNS);
      this.bbox = el("rect", { class: "tbaf-bbox" }, this.svg, SVGNS);
      this.cross = el("path", { class: "tbaf-cross" }, this.svg, SVGNS);
      this.handles = {};
      for (const h of ["nw", "ne", "se", "sw", "n", "e", "s", "w"]) {
        this.handles[h] = el("rect", { class: `tbaf-handle tbaf-${h.length === 1 ? "edge" : "corner"}`, "data-h": h }, this.svg, SVGNS);
      }
      this.img.addEventListener("load", () => this.layout());
      this.view.addEventListener("pointerdown", (e) => this.onDown(e));
      this.view.addEventListener("keydown", (e) => this.onKey(e));
      this.view.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const steps = ["fit", "1", "2", "4"];
        const i = Math.max(0, steps.indexOf(this.zoom) + (e.deltaY < 0 ? 1 : -1));
        this.zoom = steps[Math.min(steps.length - 1, i)];
        this.zoomSel.value = this.zoom;
        this.layout();
      }, { passive: false });
      this.ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.layout()) : null;
      this.ro?.observe(this.view);
      this.layout();
    }
    destroy() {
      this.ro?.disconnect();
      cancelAnimationFrame(this._raf);
    }
    layout() {
      const vw = this.view.clientWidth || 480, vh = this.view.clientHeight || 480;
      const fitScale = Math.min(vw / this.W, vh / this.H);
      this.k = this.zoom === "fit" ? fitScale : Number(this.zoom);
      const w = this.W * this.k, h = this.H * this.k;
      for (const n of [this.stage, this.img]) {
        n.style.width = `${w}px`;
        n.style.height = `${h}px`;
      }
      this.svg.setAttribute("width", w);
      this.svg.setAttribute("height", h);
      this.svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
      this.render();
    }
    get() {
      return { ...this.state };
    }
    set(patch, { silent = false } = {}) {
      const s = { ...this.state, ...patch };
      s.w = Math.max(4, s.w);
      s.h = Math.max(4, s.h);
      this.state = s;
      if (this.shapeSel.value !== s.shape) this.shapeSel.value = s.shape;
      this.render();
      if (!silent && this.o.onChange) {
        cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => this.o.onChange(this.get()));
      }
    }
    points(s, inset = 0) {
      const k = inset ? Math.max(0.05, 1 - 2 * inset / Math.min(s.w, s.h)) : 1;
      const w = s.w * k, h = s.h * k;
      if (s.shape === "circle") {
        const pts = [];
        for (let i = 0; i < 72; i++) {
          const a = i / 72 * Math.PI * 2;
          pts.push([s.cx + Math.cos(a) * w / 2, s.cy + Math.sin(a) * h / 2]);
        }
        return pts;
      }
      return UNIT2[s.shape].map(([u, v]) => [s.cx + u * w, s.cy + v * h]);
    }
    render() {
      const s = this.state, k = this.k || 1;
      const fmt = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
      this.outline.setAttribute("points", fmt(this.points(s)));
      this.outline.style.strokeWidth = `${2 / k}px`;
      if (s.thickness > 1) {
        this.inner.setAttribute("points", fmt(this.points(s, s.thickness)));
        this.inner.style.display = "";
        this.inner.style.strokeWidth = `${1 / k}px`;
      } else this.inner.style.display = "none";
      const x0 = s.cx - s.w / 2, y0 = s.cy - s.h / 2;
      Object.entries({ x: x0, y: y0, width: s.w, height: s.h }).forEach(([a, v]) => this.bbox.setAttribute(a, v));
      this.bbox.style.strokeWidth = `${1 / k}px`;
      const c = 8 / k;
      this.cross.setAttribute("d", `M${s.cx - c} ${s.cy} H${s.cx + c} M${s.cx} ${s.cy - c} V${s.cy + c}`);
      this.cross.style.strokeWidth = `${1.5 / k}px`;
      const hs = 9 / k;
      const pos = { nw: [x0, y0], ne: [x0 + s.w, y0], se: [x0 + s.w, y0 + s.h], sw: [x0, y0 + s.h], n: [s.cx, y0], e: [x0 + s.w, s.cy], s: [s.cx, y0 + s.h], w: [x0, s.cy] };
      for (const [h, [x, y]] of Object.entries(pos)) {
        const r = this.handles[h];
        r.setAttribute("x", x - hs / 2);
        r.setAttribute("y", y - hs / 2);
        r.setAttribute("width", hs);
        r.setAttribute("height", hs);
        r.style.strokeWidth = `${1 / k}px`;
      }
      this.readout.textContent = `x ${s.cx.toFixed(1)}  y ${s.cy.toFixed(1)}  w ${s.w.toFixed(1)}  h ${s.h.toFixed(1)}`;
    }
    toImage(e) {
      const r = this.svg.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H };
    }
    onDown(e) {
      if (e.button !== 0) return;
      this.view.focus({ preventScroll: true });
      const p0 = this.toImage(e);
      const s0 = this.get();
      let h = e.target?.dataset?.h ?? null;
      if (!h) {
        const x0 = s0.cx - s0.w / 2, y0 = s0.cy - s0.h / 2;
        const pos = { nw: [x0, y0], ne: [x0 + s0.w, y0], se: [x0 + s0.w, y0 + s0.h], sw: [x0, y0 + s0.h], n: [s0.cx, y0], e: [x0 + s0.w, s0.cy], s: [s0.cx, y0 + s0.h], w: [x0, s0.cy] };
        let best = 12 / (this.k || 1);
        for (const [name, [hx, hy]] of Object.entries(pos)) {
          const d = Math.hypot(p0.x - hx, p0.y - hy);
          if (d < best) {
            best = d;
            h = name;
          }
        }
      }
      let mode = h;
      if (!mode) {
        if (Math.abs(p0.x - s0.cx) <= s0.w / 2 + 6 / this.k && Math.abs(p0.y - s0.cy) <= s0.h / 2 + 6 / this.k) mode = "move";
        else return;
      }
      e.preventDefault();
      const target = e.target;
      target.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        const p = this.toImage(ev);
        const dx = p.x - p0.x, dy = p.y - p0.y;
        if (mode === "move") return this.set({ cx: s0.cx + dx, cy: s0.cy + dy });
        this.set(this.resize(s0, mode, dx, dy, ev.altKey, ev.shiftKey !== this.lock));
      };
      const up = (ev) => {
        target.releasePointerCapture?.(ev.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
    /** New state when dragging handle `h` by (dx, dy). */
    resize(s0, h, dx, dy, aboutCenter, keepAspect) {
      const sx = h.includes("e") ? 1 : h.includes("w") ? -1 : 0;
      const sy = h.includes("s") ? 1 : h.includes("n") ? -1 : 0;
      const f = aboutCenter ? 2 : 1;
      let w = s0.w + sx * dx * f, h2 = s0.h + sy * dy * f;
      if (keepAspect) {
        const a = s0.w / s0.h;
        if (sx && sy) {
          const k = Math.max(w / s0.w, h2 / s0.h);
          w = s0.w * k;
          h2 = s0.h * k;
        } else if (sx) h2 = w / a;
        else w = h2 * a;
      }
      w = Math.max(4, w);
      h2 = Math.max(4, h2);
      let cx = s0.cx, cy = s0.cy;
      if (!aboutCenter) {
        if (sx) cx = s0.cx + sx * (w - s0.w) / 2;
        if (sy) cy = s0.cy + sy * (h2 - s0.h) / 2;
        if (keepAspect && !sx) cx = s0.cx;
        if (keepAspect && !sy) cy = s0.cy;
      }
      return { cx, cy, w, h: h2 };
    }
    onKey(e) {
      const step = e.shiftKey ? 10 : 1;
      const s = this.state;
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (k) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          if (k[0]) {
            const w = s.w + k[0] * step * 2;
            this.set(this.lock ? { w, h: s.h * (w / s.w) } : { w });
          } else {
            const h = s.h - k[1] * step * 2;
            this.set(this.lock ? { h, w: s.w * (h / s.h) } : { h });
          }
        } else this.set({ cx: s.cx + k[0] * step, cy: s.cy + k[1] * step });
        return;
      }
      if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
        e.preventDefault();
        const d = (e.key === "+" || e.key === "=" ? 1 : -1) * step * 2;
        const kk = (s.w + d) / s.w;
        this.set({ w: s.w * kk, h: s.h * kk });
      }
    }
  };

  // src/foundry/align-app.js
  var AlignWindowClass = null;
  function naturalSize(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
      im.onerror = () => reject(new Error(`Could not load ${src}`));
      im.src = src;
    });
  }
  var i18n = (k, fallback) => {
    const key2 = `TBAF.Align.${k}`;
    const v = game.i18n?.localize?.(key2);
    return v && v !== key2 ? v : fallback;
  };
  function getClass() {
    if (AlignWindowClass) return AlignWindowClass;
    const Base = AppV2();
    if (!Base) throw new Error("ApplicationV2 is not available (Foundry v12+ required)");
    AlignWindowClass = class AlignWindow extends Base {
      static DEFAULT_OPTIONS = {
        classes: ["tbaf-align-window"],
        window: { resizable: true, icon: "fas fa-draw-polygon" },
        position: { width: 640, height: 760 }
      };
      constructor(params, options = {}) {
        super(foundry.utils.mergeObject({ window: { title: params.title } }, options));
        this.p = params;
      }
      async _renderHTML() {
        const p = this.p;
        const root = document.createElement("div");
        root.className = "tbaf-align";
        const info = document.createElement("p");
        info.className = "tbaf-info";
        root.appendChild(info);
        const host = document.createElement("div");
        host.className = "tbaf-editor-host";
        root.appendChild(host);
        const btns = document.createElement("div");
        btns.className = "tbaf-buttons";
        const mk = (action, icon, label) => {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.action = action;
          b.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
          btns.appendChild(b);
          return b;
        };
        mk("detect", "fa-wand-magic-sparkles", i18n("Redetect", "Re-run auto-detect"));
        mk("reset", "fa-rotate-left", i18n("Reset", "Reset"));
        mk("cancel", "fa-xmark", i18n("Cancel", "Cancel"));
        mk("apply", "fa-check", i18n("Apply", "Apply")).classList.add("tbaf-primary");
        root.appendChild(btns);
        this._info = info;
        this._host = host;
        btns.addEventListener("click", (e) => {
          const a = e.target.closest("button")?.dataset.action;
          if (a) this._onAction(a);
        });
        return root;
      }
      _replaceHTML(result, content) {
        content.replaceChildren(result);
        if (!this._editor) {
          const p = this.p;
          this._editor = new AlignEditor(this._host, {
            src: p.src,
            width: p.imgW,
            height: p.imgH,
            initial: p.initial,
            onChange: (s) => this._preview(s),
            labels: {
              shape: i18n("Shape", "Shape"),
              zoom: i18n("Zoom", "Zoom"),
              fit: i18n("ZoomFit", "Fit"),
              lock: i18n("Lock", "Keep proportions"),
              regular: i18n("Regular", "Regular shape"),
              regularHint: i18n("RegularHint", ""),
              "hex-pointy": i18n("Shapes.hex-pointy", "Hex (pointy top)"),
              "hex-flat": i18n("Shapes.hex-flat", "Hex (flat top)"),
              circle: i18n("Shapes.circle", "Circle"),
              square: i18n("Shapes.square", "Square")
            }
          });
          this._setInfo(p.detection);
          this._preview(this._editor.get());
        }
      }
      _setInfo(det) {
        if (!this._info) return;
        const help = i18n("Help", "Drag to move, corners to resize (Shift: free proportions, Alt: from centre). Arrows nudge 1 px, Shift+arrows 10 px, Ctrl+arrows resize.");
        const conf = det ? `${i18n("Confidence", "Auto-detect confidence")}: ${Math.round((det.confidence ?? 0) * 100)}%` : "";
        this._info.textContent = [conf, help].filter(Boolean).join(" — ");
      }
      _flag(state) {
        const p = this.p;
        return flagFromDetection({ ...state, thickness: state.thickness ?? p.initial.thickness ?? 0, confidence: 1, imgW: p.imgW, imgH: p.imgH }, p.src, { manual: true });
      }
      _preview(state) {
        const doc = this.p.doc;
        if (isPrototype(doc) || !doc.object) return;
        try {
          const { update } = computeFitUpdate(doc, this._flag(state), this.p.fitOptions);
          Object.assign(doc.texture, update.texture);
          setRenderFlags(doc.object, { refreshMesh: true, refreshSize: true });
          this._dirty = true;
        } catch (e) {
          console.warn("token-border-autofit | preview failed", e);
        }
      }
      _revert() {
        const doc = this.p.doc;
        if (!this._dirty || isPrototype(doc)) return;
        this._dirty = false;
        try {
          doc.reset();
        } catch {
        }
        if (doc.object) setRenderFlags(doc.object, { refreshMesh: true, refreshSize: true });
      }
      async _onAction(a) {
        const p = this.p;
        if (a === "cancel") return this.close();
        if (a === "reset") {
          this._editor.set(p.initial);
          return;
        }
        if (a === "detect") {
          try {
            const det = await detectSrc(p.src, p.hint, { ...p.detectOptions, useCache: false });
            this.p.detection = det;
            this._setInfo(det);
            this._editor.set({ shape: det.shape, cx: det.cx, cy: det.cy, w: det.w, h: det.h, thickness: det.thickness });
          } catch (e) {
            ui.notifications.error(e.message);
          }
          return;
        }
        if (a === "apply") {
          const flag = this._flag(this._editor.get());
          this._revert();
          await applyFit(p.doc, flag, p.fitOptions);
          p.onApply?.(flag);
          this._applied = true;
          return this.close();
        }
      }
      async _onClose(options) {
        this._revert();
        this._editor?.destroy();
        return super._onClose?.(options);
      }
    };
    return AlignWindowClass;
  }
  async function openAligner(doc, o = {}) {
    if (!canModify(doc)) return ui.notifications.warn(game.i18n.localize("TBAF.Notify.noPermission"));
    const src = o.src ?? doc.texture?.src;
    if (!src) return;
    const scene = sceneFor(doc);
    const hint = shapeHint(doc, scene, o.hintOptions);
    const flag = getFitFlag(doc);
    let det = o.detection ?? (flag?.src === src ? flag : null);
    if (!det) {
      try {
        det = await detectSrc(src, hint, o.detectOptions);
      } catch (e) {
        det = null;
        console.warn(e);
      }
    }
    let size;
    try {
      size = det?.imgW ? { width: det.imgW, height: det.imgH } : await naturalSize(src);
    } catch (e) {
      return ui.notifications.error(e.message);
    }
    const initial = det ? { shape: det.shape, cx: det.cx, cy: det.cy, w: det.w, h: det.h, thickness: det.thickness ?? 0 } : { shape: hint, cx: size.width / 2, cy: size.height / 2, w: size.width * 0.9, h: size.height * 0.9, thickness: 0 };
    const name = doc.name ?? doc.parent?.name ?? "";
    const baseScale = isPrototype(doc) ? null : measuredBaseScale(doc);
    const fitOptions = { ...o.fitOptions ?? {}, ...baseScale ? { baseScale } : {} };
    const App = getClass();
    const app = new App({
      doc,
      src,
      hint,
      initial,
      detection: det,
      imgW: size.width,
      imgH: size.height,
      fitOptions,
      detectOptions: o.detectOptions,
      onApply: o.onApply,
      title: `${i18n("Title", "Fit border to grid")}${name ? `: ${name}` : ""}`
    });
    app.render({ force: true });
    return app;
  }

  // src/macro/macro.js
  var THRESHOLD = 0.6;
  var FIT = { flags: false, edge: "outer", aspect: "stretch", pf2eAutoscale: true };
  var DETECT = { useCache: true, verify: true, fallback: true, rotationTolerance: 3, maxSize: 2048 };
  async function main() {
    if (!document.getElementById("tbaf-macro-style")) {
      const st = document.createElement("style");
      st.id = "tbaf-macro-style";
      st.textContent = token_border_autofit_default;
      document.head.appendChild(st);
    }
    const all = canvas?.tokens?.controlled ?? [];
    const tokens = all.filter((t) => canModify(t.document));
    if (!tokens.length) return ui.notifications.warn("Token Border Auto-Fit: select one or more tokens you own first.");
    const manualAll = game.keyboard?.isModifierActive?.("Shift") ?? false;
    let applied = 0;
    for (const tk of tokens) {
      const doc = tk.document;
      if (usesDynamicRing(doc)) {
        ui.notifications.warn(`${doc.name}: dynamic token ring is on, skipped.`);
        continue;
      }
      const src = doc.texture?.src;
      if (!src) continue;
      const hint = shapeHint(doc, sceneFor(doc));
      let det = null;
      try {
        det = await detectSrc(src, hint, DETECT);
      } catch (e) {
        console.warn(e);
        ui.notifications.warn(`${doc.name}: could not read the image (${e.cors ? "CORS" : "load error"}), opening manual alignment.`);
      }
      if (det && !manualAll && det.confidence >= THRESHOLD) {
        await applyFit(doc, flagFromDetection(det, src), FIT);
        applied++;
      } else {
        await openAligner(doc, { detection: det ?? void 0, fitOptions: FIT, detectOptions: DETECT });
      }
    }
    if (applied) ui.notifications.info(`Token Border Auto-Fit: fitted ${applied} of ${tokens.length} token(s).`);
  }
  main().catch((e) => {
    console.error(e);
    ui.notifications.error(`Token Border Auto-Fit: ${e.message}`);
  });
})();
