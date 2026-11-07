// Image preprocessing for the border detector. Pure JS, no DOM, no Foundry.
//
// Input everywhere is an ImageData-like object: { width, height, data: Uint8ClampedArray RGBA }.
//
// Features are computed on alpha-PREMULTIPLIED colour so that whatever garbage colour sits
// under fully transparent pixels never produces edges. Four channels are used:
//   L  luminance, C1 = R-G and C2 = (R+G)/2-B (opponent chroma), A alpha.
// The chroma channels catch borders that differ from the art in hue but not in brightness;
// the alpha channel catches dark borders against a transparent background.
// Edge strength and orientation come from the multi-channel structure tensor (Di Zenzo),
// which gives one orientation per pixel that is consistent across channels.

export const CHANNEL_WEIGHTS = [1.0, 0.9, 0.9, 0.8];

/**
 * Area-averaging downscale to fit `maxSide`, premultiplying alpha.
 * Returns { width, height, scale, ch: [L, C1, C2, A] } where scale = level px / source px.
 */
export function buildLevel(img, maxSide) {
  const { width: sw, height: sh, data } = img;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const fx = sw / dw, fy = sh / dh;

  // Horizontal pass: sh rows x dw columns x 4 premultiplied channels.
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
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
      }
      const o = orow + x * 4;
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
    }
  }
  // Vertical pass into feature channels.
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
        r += tmp[i] * wk; g += tmp[i + 1] * wk; b += tmp[i + 2] * wk; a += tmp[i + 3] * wk;
      }
      const o = y * dw + x;
      r *= norm; g *= norm; b *= norm; // premultiplied 0..1
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
      weights[k - start] = w; sum += w;
    }
    if (sum <= 0) { weights[0] = 1; sum = 1; }
    for (let k = 0; k < weights.length; k++) weights[k] /= sum;
    out[i] = { start, weights };
  }
  return out;
}

/**
 * Multi-channel Sobel -> structure tensor per pixel.
 * Adds { Jxx, Jxy, Jyy, mag, ori, g90 } to the level. `ori` is the edge NORMAL angle in [0, PI).
 * `g90` is the 90th percentile of non-trivial edge magnitudes, used to normalise scores.
 */
export function computeEdges(level) {
  const { width: w, height: h, ch } = level;
  const n = w * h;
  const Jxx = new Float32Array(n), Jxy = new Float32Array(n), Jyy = new Float32Array(n);
  for (let c = 0; c < ch.length; c++) {
    const I = ch[c], wt = CHANNEL_WEIGHTS[c] * CHANNEL_WEIGHTS[c];
    for (let y = 1; y < h - 1; y++) {
      const r0 = (y - 1) * w, r1 = y * w, r2 = (y + 1) * w;
      for (let x = 1; x < w - 1; x++) {
        const gx = (I[r0 + x + 1] + 2 * I[r1 + x + 1] + I[r2 + x + 1]) - (I[r0 + x - 1] + 2 * I[r1 + x - 1] + I[r2 + x - 1]);
        const gy = (I[r2 + x - 1] + 2 * I[r2 + x] + I[r2 + x + 1]) - (I[r0 + x - 1] + 2 * I[r0 + x] + I[r0 + x + 1]);
        const o = r1 + x;
        Jxx[o] += wt * gx * gx; Jxy[o] += wt * gx * gy; Jyy[o] += wt * gy * gy;
      }
    }
  }
  const mag = new Float32Array(n), ori = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Jxx[i], b = Jxy[i], d = Jyy[i];
    const tr = (a + d) * 0.5, df = (a - d) * 0.5;
    const l1 = tr + Math.sqrt(df * df + b * b);
    mag[i] = Math.sqrt(Math.max(0, l1)) * 0.25; // Sobel gain 4 -> per-pixel derivative
    let t = 0.5 * Math.atan2(2 * b, a - d);
    if (t < 0) t += Math.PI;
    ori[i] = t;
  }
  level.Jxx = Jxx; level.Jxy = Jxy; level.Jyy = Jyy; level.mag = mag; level.ori = ori;
  level.g90 = percentile(mag, 0.9, 0.004);
  return level;
}

/** Approximate percentile of values above `floor` using a histogram (fast, allocation-light). */
export function percentile(arr, q, floor = 0) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  if (max <= floor) return Math.max(floor, 1e-3);
  const bins = 1024, hist = new Uint32Array(bins);
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v <= floor) continue;
    hist[Math.min(bins - 1, ((v / max) * bins) | 0)]++;
    count++;
  }
  const target = count * q;
  let acc = 0;
  for (let b = 0; b < bins; b++) {
    acc += hist[b];
    if (acc >= target) return ((b + 0.5) / bins) * max;
  }
  return max;
}

/**
 * Edge pixels after non-maximum suppression along the normal.
 * Returns typed arrays { x, y, m, t, count } (t = normal angle).
 */
export function edgePixels(level, relThreshold = 0.2) {
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
      xs.push(x); ys.push(y); ms.push(m); ts.push(t);
    }
  }
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), m: Float32Array.from(ms), t: Float32Array.from(ts), count: xs.length };
}

/** Bilinear sample of a float channel. */
export function bilinear(I, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = I[y0 * w + x0], b = I[y0 * w + x1], c = I[y1 * w + x0], d = I[y1 * w + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Directional edge energy along unit normal (nx, ny) at level position (x, y):
 * returns { e, align } where e = sqrt(n^T J n) (per-pixel units) and align = n^T J n / lambda1.
 */
export function directional(level, x, y, nx, ny) {
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

/** Premultiplied feature vector [L, C1, C2, A] sampled bilinearly from the raw RGBA image. */
export function sampleRaw(img, x, y, out) {
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
  out[3] = ((a00 + a10 + a01 + a11) / 255) * CHANNEL_WEIGHTS[3];
  return true;
}

/** Same feature vector sampled from a level (for colour-consistency checks). */
export function sampleLevel(level, x, y, out) {
  const { width: w, height: h, ch } = level;
  for (let c = 0; c < 4; c++) {
    const v = bilinear(ch[c], w, h, x, y);
    if (Number.isNaN(v)) return false;
    out[c] = v * CHANNEL_WEIGHTS[c];
  }
  return true;
}
