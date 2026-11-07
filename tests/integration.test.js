// Integration tests of the Foundry layer against a v13-like mock (see helpers/foundry-mock.js).
// They check that hooks apply fits from the cache/flag, recompute on size changes, keep a
// non-uniform fit when TokenConfig re-saves a single scale, honour PF2e autoscale and the
// dynamic ring setting — and that the resulting texture values put the border on the shape.
import test from "node:test";
import assert from "node:assert/strict";
import { installFoundryMock, MockTokenDocument, makeScene } from "./helpers/foundry-mock.js";

const env = installFoundryMock();
await import("../src/foundry/main.js");
Hooks.callAll("init");
const { cacheSet, clearCache } = await import("../src/foundry/cache.js");
const { textureToCanvas, bounds } = await import("../src/core/fit-math.js");
const { DETECTOR_VERSION } = await import("../src/detector/index.js");

const SRC = "tokens/knight.webp";
const DET = { src: SRC, shape: "hex-pointy", cx: 512, cy: 500, w: 860, h: 993.04, rotation: 0, thickness: 30, confidence: 0.95, imgW: 1024, imgH: 1024, detectorVersion: DETECTOR_VERSION, hash: "x" };

function borderBoxOnCanvas(doc) {
  const f = doc.flags["token-border-autofit"].fit;
  const s = doc.getSize();
  const corners = [[f.cx - f.w / 2, f.cy - f.h / 2], [f.cx + f.w / 2, f.cy + f.h / 2]];
  return bounds(corners.map(([u, v]) => textureToCanvas(u, v, {
    texture: { width: f.imgW, height: f.imgH }, base: s, fit: doc.texture.fit,
    scaleX: doc.texture.scaleX, scaleY: doc.texture.scaleY, anchorX: doc.texture.anchorX, anchorY: doc.texture.anchorY,
  })));
}

function assertOnShape(doc, msg = "") {
  const bb = borderBoxOnCanvas(doc), s = doc.getSize();
  for (const [a, b, k] of [[bb.x, 0, "x"], [bb.y, 0, "y"], [bb.width, s.width, "w"], [bb.height, s.height, "h"]]) {
    assert.ok(Math.abs(a - b) < 1e-3, `${msg} ${k}: ${a} vs ${b}`);
  }
}

test("preCreateToken applies a cached detection synchronously", async () => {
  clearCache();
  cacheSet(SRC, "hex-pointy", DET);
  const scene = makeScene({ type: "hex-pointy" });
  const doc = await MockTokenDocument.create({ texture: { src: SRC } }, { parent: scene });
  const f = doc.flags["token-border-autofit"]?.fit;
  assert.ok(f, "flag stored");
  assert.equal(f.src, SRC);
  assertOnShape(doc, "size 1");
});

test("token created from a fitted prototype is re-fitted for a different grid", async () => {
  clearCache();
  const hexScene = makeScene({ type: "hex-pointy" });
  game.settings.set("token-border-autofit", "mode", "off"); // no pixel loader in Node
  const proto = await MockTokenDocument.create({ texture: { src: SRC } }, { parent: hexScene });
  game.settings.set("token-border-autofit", "mode", "auto");
  // Simulate an existing fit flag carried over from the prototype, but computed for another grid.
  const flag = { ...DET, w: DET.w, h: DET.h };
  const sq = makeScene({ type: "square" });
  const doc = await MockTokenDocument.create({ texture: { src: SRC, scaleX: 3, scaleY: 3 }, flags: { "token-border-autofit": { fit: flag } } }, { parent: sq });
  assertOnShape(doc, "square grid");
  assert.ok(proto);
});

test("size change recomputes scale from the flag (no detection)", async () => {
  clearCache();
  cacheSet(SRC, "hex-pointy", DET);
  const doc = await MockTokenDocument.create({ texture: { src: SRC } }, { parent: makeScene({ type: "hex-pointy" }) });
  await doc.update({ width: 2, height: 2 });
  assertOnShape(doc, "size 2");
  await doc.update({ width: 3, height: 3 });
  assertOnShape(doc, "size 3");
  assert.ok(!doc.updates.at(-1).options["token-border-autofit"]?.detect, "no detection requested");
});

test("mirroring is preserved when re-fitting", async () => {
  clearCache();
  cacheSet(SRC, "hex-pointy", DET);
  const doc = await MockTokenDocument.create({ texture: { src: SRC, scaleX: -1 } }, { parent: makeScene({ type: "hex-pointy" }) });
  assert.ok(doc.texture.scaleX < 0);
  await doc.update({ width: 2, height: 2 });
  assert.ok(doc.texture.scaleX < 0, "still mirrored");
  assertOnShape(doc, "mirrored");
});

test("TokenConfig re-saving a single scale does not flatten a non-uniform fit", async () => {
  clearCache();
  cacheSet(SRC, "hex-pointy", { ...DET, w: 900 }); // irregular art hex -> scaleX != scaleY
  const doc = await MockTokenDocument.create({ texture: { src: SRC } }, { parent: makeScene({ type: "hex-pointy" }) });
  const { scaleX, scaleY } = doc.texture;
  assert.ok(Math.abs(Math.abs(scaleX) - Math.abs(scaleY)) > 1e-3);
  // The form shows |scaleX| and submits it for both axes; the diff only contains scaleY.
  await doc.update({ texture: { scaleY: Math.abs(scaleX) } });
  assert.ok(Math.abs(doc.texture.scaleY - scaleY) < 1e-9, "scaleY restored");
  // A genuinely new scale is respected.
  await doc.update({ texture: { scaleX: 2, scaleY: 2 } });
  assert.equal(doc.texture.scaleX, 2); assert.equal(doc.texture.scaleY, 2);
});

test("image change without a cached detection is marked for async detection", async () => {
  clearCache();
  const doc = new MockTokenDocument({ texture: { src: SRC } }, { parent: makeScene({ type: "hex-pointy" }) });
  let marked = null;
  const off = Hooks.on("updateToken", (d, c, o) => { marked = o["token-border-autofit"]; });
  game.settings.set("token-border-autofit", "mode", "off"); // keep runFit from trying to load pixels
  await doc.update({ texture: { src: "tokens/other.webp" } });
  assert.equal(marked, undefined, "mode off: nothing");
  game.settings.set("token-border-autofit", "mode", "auto");
  const opts = {};
  Hooks.call("preUpdateToken", doc, { texture: { src: "tokens/third.webp" } }, opts, game.user.id);
  assert.equal(opts["token-border-autofit"]?.detect, true);
  void off;
});

test("PF2e: autoscale is switched off for fitted tokens", async () => {
  clearCache();
  game.system.id = "pf2e";
  cacheSet(SRC, "hex-pointy", DET);
  const doc = await MockTokenDocument.create({ texture: { src: SRC } }, { parent: makeScene({ type: "hex-pointy" }) });
  assert.equal(doc.flags.pf2e?.autoscale, false);
  game.system.id = "lancer";
});

test("dynamic token ring: skipped by default", async () => {
  clearCache();
  cacheSet(SRC, "hex-pointy", DET);
  const doc = await MockTokenDocument.create({ texture: { src: SRC }, ring: { enabled: true } }, { parent: makeScene({ type: "hex-pointy" }) });
  assert.equal(doc.flags["token-border-autofit"], undefined);
  assert.equal(doc.texture.scaleX, 1);
});

test("shape hint follows the grid and token shape", async () => {
  const { shapeHint } = await import("../src/foundry/geometry.js");
  assert.equal(shapeHint({ shape: 2 }, makeScene({ type: "hex-pointy" })), "hex-pointy");
  assert.equal(shapeHint({ shape: 2 }, makeScene({ type: "hex-flat" })), "hex-flat");
  assert.equal(shapeHint({ shape: 0 }, makeScene({ type: "square" })), "circle");
  assert.equal(shapeHint({ shape: 4 }, makeScene({ type: "square" })), "square");
  assert.equal(shapeHint({ shape: 0 }, makeScene({ type: "gridless" })), "circle");
  assert.equal(shapeHint({ shape: 4 }, makeScene({ type: "gridless" })), "square");
});

test("flat-top hex grid: border lands on the shape", async () => {
  clearCache();
  const det = { ...DET, shape: "hex-flat", w: 993.04, h: 860 };
  cacheSet(SRC, "hex-flat", det);
  const doc = await MockTokenDocument.create({ texture: { src: SRC }, width: 2, height: 2 }, { parent: makeScene({ type: "hex-flat" }) });
  assertOnShape(doc, "flat size 2");
});

test("api is exposed", () => {
  const api = game.modules.get("token-border-autofit").api;
  for (const k of ["fitSelected", "fitToken", "openAligner", "detect", "reapply", "detectBorder", "clearCache"]) assert.equal(typeof api[k], "function", k);
  assert.ok(env.store.has("mode"));
});
