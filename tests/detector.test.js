// Detector regressions found on real token art (no image files needed: frames are rasterised here
// with their own geometry, independent of src/detector/shapes.js).
//  - frames cropped exactly to the canvas (outer edge ON the image boundary),
//  - frames a few percent off regular (aspect 0.845 instead of 0.866 for a pointy hex),
//  - thick multi-line frames (outline - fill - outline) where sides can latch onto inner edges.
import test from "node:test";
import assert from "node:assert/strict";
import { detectBorder, clippedMargin } from "../src/detector/index.js";

/** Pointy-hex signed distance (positive outside) for centre (cx, cy), bbox w x h. */
function hexSdf(cx, cy, w, h) {
  const V = [[0, -h / 2], [w / 2, -h / 4], [w / 2, h / 4], [0, h / 2], [-w / 2, h / 4], [-w / 2, -h / 4]];
  const sides = V.map(([x1, y1], i) => {
    const [x2, y2] = V[(i + 1) % 6], len = Math.hypot(x2 - x1, y2 - y1);
    const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
    return { nx, ny, a: x1 * nx + y1 * ny };
  });
  return (x, y) => Math.max(...sides.map((s) => (x - cx) * s.nx + (y - cy) * s.ny - s.a));
}

/**
 * W x H RGBA: transparent outside, black(8) - orange(fill) - black(8) frame, textured interior,
 * and an opaque "art" blob crossing the upper-left side and spilling outside the frame.
 */
function frameImage({ W, H, cx, cy, w, h, line = 8, fill = 23, opaque = false }) {
  const sdf = hexSdf(cx, cy, w, h);
  const data = new Uint8ClampedArray(W * H * 4);
  const t = 2 * line + fill;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const px = x + ox, py = y + oy, d = sdf(px, py);
      let c = opaque ? [40, 90, 40, 255] : [0, 0, 0, 0];
      if (d <= 0 && d > -t) c = d > -line || d <= -(line + fill) ? [0, 0, 0, 255] : [200, 130, 20, 255];
      else if (d <= -t) c = [120 + 60 * Math.sin(px / 9), 110 + 50 * Math.cos(py / 13), 100, 255];
      // Art blob: ellipse across the upper-left side, partly outside the frame.
      if (((px - (cx - w * 0.3)) / (w * 0.16)) ** 2 + ((py - (cy - h * 0.3)) / (h * 0.09)) ** 2 < 1) c = [230, 220, 190, 255];
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const i = (y * W + x) * 4;
    data[i + 3] = a / 4;
    if (a) { data[i] = r / a; data[i + 1] = g / a; data[i + 2] = b / a; }
  }
  return { width: W, height: H, data };
}

function err(r, gt) {
  return Math.max(Math.hypot(r.cx - gt.cx, r.cy - gt.cy), Math.abs(r.width - gt.w), Math.abs(r.height - gt.h)) / gt.w;
}

test("clippedMargin: only cut-out images whose pixels reach the canvas edge are padded", () => {
  const gt = { W: 433, H: 512, cx: 216.5, cy: 256, w: 433, h: 512 };
  assert.ok(clippedMargin(frameImage(gt)) >= 4, "cut-out frame touching the edges");
  assert.equal(clippedMargin(frameImage({ ...gt, opaque: true })), 0, "opaque image: no artificial edge");
  assert.equal(clippedMargin(frameImage({ ...gt, W: 473, H: 552, cx: 236.5, cy: 276 })), 0, "frame with a transparent margin");
});

test("frame cropped to the canvas, 2.4 % off regular, thick three-line border", () => {
  const gt = { W: 433, H: 512, cx: 216.5, cy: 256, w: 433, h: 512 };
  const r = detectBorder(frameImage(gt), { shape: "hex-pointy" });
  assert.equal(r.shape, "hex-pointy");
  assert.ok(err(r, gt) < 0.015, `error ${(err(r, gt) * 100).toFixed(2)}% (${r.cx.toFixed(1)},${r.cy.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)})`);
  assert.ok(r.padded > 0, "image was padded");
  assert.ok(r.thickness > 25 && r.thickness < 50, `thickness ${r.thickness}`);
});

test("same frame with a transparent margin: no padding, same answer", () => {
  const gt = { W: 493, H: 572, cx: 246.5, cy: 286, w: 433, h: 512 };
  const r = detectBorder(frameImage(gt), { shape: "hex-pointy" });
  assert.ok(!r.padded);
  assert.ok(err(r, gt) < 0.015, `error ${(err(r, gt) * 100).toFixed(2)}%`);
});
