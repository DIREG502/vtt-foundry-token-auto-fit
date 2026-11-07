// Unit tests for the apply maths: for a given border, token size and fit, the border's
// bounding box on the canvas must equal the token shape's bounding box.
import test from "node:test";
import assert from "node:assert/strict";
import { computeTextureFit, textureToCanvas, fitBaseScale, bounds, referenceBox, borderInTexture, FITS } from "../src/core/fit-math.js";

const SQ3 = Math.sqrt(3);
const close = (a, b, eps = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

// Test fixtures only: Foundry's token size on hex grids (Token#getSize) for a 100 px grid.
// The module itself reads these from the API; the tests need concrete numbers.
function hexToken(columns, n, gridSize = 100) {
  const sizeX = columns ? gridSize * 2 / SQ3 : gridSize, sizeY = columns ? gridSize : gridSize * 2 / SQ3;
  let w = n, h = n;
  if (columns) w = 0.75 * Math.floor(n) + 0.25; else h = 0.75 * Math.floor(n) + 0.25;
  const base = { width: w * sizeX, height: h * sizeY };
  return { base, target: { x: 0, y: 0, ...base } };
}

function borderPolygon(b, shape) {
  const { cx, cy, width: w, height: h } = b;
  const unit = shape === "hex-flat"
    ? [[0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0], [-0.25, -0.5], [0.25, -0.5]]
    : [[0, -0.5], [0.5, -0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.25], [-0.5, -0.25]];
  return unit.map(([u, v]) => [cx + u * w, cy + v * h]);
}

function projectedBounds(border, shape, params) {
  return bounds(borderPolygon(border, shape).map(([u, v]) => textureToCanvas(u, v, params)));
}

const IMAGES = [
  { texture: { width: 1000, height: 1000 }, border: { cx: 512, cy: 498, width: 860, height: 993.04 } },
  { texture: { width: 1400, height: 1100 }, border: { cx: 640, cy: 590, width: 820, height: 946.85 } },
  { texture: { width: 600, height: 900 }, border: { cx: 300, cy: 410, width: 520, height: 600.4 } },
];

test("fitBaseScale mirrors PrimarySpriteMesh#resize", () => {
  assert.deepEqual(fitBaseScale("fill", 200, 100, 400, 400), { sx: 0.5, sy: 0.25 });
  assert.deepEqual(fitBaseScale("contain", 200, 100, 400, 400), { sx: 0.25, sy: 0.25 });
  assert.deepEqual(fitBaseScale("cover", 200, 100, 400, 400), { sx: 0.5, sy: 0.5 });
  assert.deepEqual(fitBaseScale("width", 200, 100, 400, 400), { sx: 0.5, sy: 0.5 });
  assert.deepEqual(fitBaseScale("height", 200, 100, 400, 400), { sx: 0.25, sy: 0.25 });
});

test("border bbox lands on the token bbox for every fit, size, grid orientation and image", () => {
  let cases = 0;
  for (const columns of [false, true]) {
    const shape = columns ? "hex-flat" : "hex-pointy";
    for (const n of [1, 2, 3, 4]) {
      const { base, target } = hexToken(columns, n);
      for (const img of IMAGES) {
        for (const fit of FITS) {
          for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            const params = { border: img.border, texture: img.texture, base, target, fit, scaleX: 0.7 * mx, scaleY: 1.3 * my };
            const r = computeTextureFit(params);
            assert.equal(Math.sign(r.scaleX), mx, "mirrorX preserved");
            assert.equal(Math.sign(r.scaleY), my, "mirrorY preserved");
            const bb = projectedBounds(img.border, shape, { ...params, ...r });
            close(bb.x, target.x, 1e-6, `x ${fit} n=${n}`);
            close(bb.y, target.y, 1e-6, `y ${fit} n=${n}`);
            close(bb.width, target.width, 1e-6, `w ${fit} n=${n}`);
            close(bb.height, target.height, 1e-6, `h ${fit} n=${n}`);
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 2 * 4 * 3 * 5 * 4);
});

test("square grid and gridless sizes, non-square tokens", () => {
  for (const base of [{ width: 100, height: 100 }, { width: 200, height: 100 }, { width: 150, height: 300 }]) {
    const target = { x: 0, y: 0, ...base };
    const border = { cx: 450, cy: 450, width: 780, height: 780 };
    for (const fit of FITS) {
      const params = { border, texture: { width: 900, height: 900 }, base, target, fit };
      const r = computeTextureFit(params);
      const corners = [[border.cx - 390, border.cy - 390], [border.cx + 390, border.cy + 390]];
      const bb = bounds(corners.map(([u, v]) => textureToCanvas(u, v, { ...params, ...r })));
      close(bb.width, base.width); close(bb.height, base.height); close(bb.x, 0); close(bb.y, 0);
    }
  }
});

test("target box not centred on the pivot (even-size hex shapes) and rotated mesh", () => {
  const base = { width: 200, height: 175 };
  const target = { x: 0, y: 0, width: 200, height: 175 };
  const pivot = { x: 100, y: 115.47 }; // centre point offset from the bbox centre
  const border = { cx: 500, cy: 520, width: 860, height: 993 };
  for (const rotation of [0, 30, 90, 211]) {
    const params = { border, texture: { width: 1000, height: 1000 }, base, target, pivot, rotation, fit: "contain" };
    const r = computeTextureFit(params);
    const c = textureToCanvas(border.cx, border.cy, { ...params, ...r });
    close(c.x, 100, 1e-6, `cx rot ${rotation}`);
    close(c.y, 87.5, 1e-6, `cy rot ${rotation}`);
  }
});

test("aspect 'contain' keeps the border's proportions and fits inside the target", () => {
  const { base, target } = hexToken(false, 3); // 300 x 288.7 box: a regular hex would be stretched
  const border = { cx: 500, cy: 500, width: 860, height: 993.04 };
  const params = { border, texture: { width: 1000, height: 1000 }, base, target, fit: "contain", aspect: "contain" };
  const r = computeTextureFit(params);
  const bb = projectedBounds(border, "hex-pointy", { ...params, ...r });
  close(bb.width / bb.height, 860 / 993.04, 1e-9, "aspect");
  assert.ok(bb.width <= target.width + 1e-6 && bb.height <= target.height + 1e-6);
  close(bb.x + bb.width / 2, target.width / 2); close(bb.y + bb.height / 2, target.height / 2);
});

test("measured base scale overrides the fit formula (v14 or modules changing mesh sizing)", () => {
  const params = { border: { cx: 500, cy: 500, width: 800, height: 800 }, texture: { width: 1000, height: 1000 },
    base: { width: 100, height: 100 }, target: { x: 0, y: 0, width: 100, height: 100 }, fit: "contain", baseScale: { sx: 0.2, sy: 0.2 } };
  const r = computeTextureFit(params);
  close(r.scaleX, 100 / 800 / 0.2); close(r.scaleY, 100 / 800 / 0.2);
});

test("referenceBox insets a regular hex by the band thickness along the normals", () => {
  const flag = { shape: "hex-pointy", cx: 0, cy: 0, w: 860, h: 860 * 2 / SQ3, thickness: 30 };
  const center = referenceBox(flag, "center"), inner = referenceBox(flag, "inner");
  close(center.w, 860 - 30, 1e-6); close(inner.w, 860 - 60, 1e-6);
  close(inner.h, (860 - 60) * 2 / SQ3, 1e-6);
  assert.equal(referenceBox(flag, "outer").w, 860);
});

test("borderInTexture rescales when the rendered texture differs from the analysed image", () => {
  const b = borderInTexture({ cx: 1000, cy: 800, w: 1600, h: 1400, imgW: 2000, imgH: 2000 }, 1000, 1000);
  assert.deepEqual(b, { cx: 500, cy: 400, width: 800, height: 700 });
});
