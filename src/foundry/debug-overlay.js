// Debug overlay (client setting): draws, on each fitted token,
//   cyan    : the target box (token shape bounds from the API)
//   magenta : where the maths says the border is (fit-math forward model + document values)
//   green   : where the border actually is, mapped through the live mesh transform
// Magenta and green should coincide; if they don't, Foundry (or another module) sizes the mesh
// differently than assumed and the console gets a one-time warning with the numbers.

import { MODULE_ID } from "./constants.js";
import { get, S } from "./settings.js";
import { getFitFlag } from "./fit-service.js";
import { tokenGeometry, measuredBaseScale } from "./geometry.js";
import { textureToCanvas, referenceBox, borderInTexture } from "../core/fit-math.js";

const NAME = "tbaf-debug";
const warned = new Set();
const UNIT = {
  "hex-pointy": [[0, -0.5], [0.5, -0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.25], [-0.5, -0.25]],
  "hex-flat": [[0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0], [-0.25, -0.5], [0.25, -0.5]],
  square: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
};

function outline(shape, b) {
  if (shape === "circle") {
    const pts = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push([b.cx + Math.cos(a) * b.width / 2, b.cy + Math.sin(a) * b.height / 2]); }
    return pts;
  }
  return (UNIT[shape] ?? UNIT.square).map(([u, v]) => [b.cx + u * b.width, b.cy + v * b.height]);
}

export function refreshDebug(token) {
  let g = token.children?.find?.((c) => c.name === NAME);
  const flag = getFitFlag(token.document);
  if (!get(S.debug) || !flag || flag.src !== token.document.texture?.src || !token.mesh) {
    if (g) { token.removeChild(g); g.destroy(); }
    return;
  }
  if (!g) { g = new PIXI.Graphics(); g.name = NAME; g.eventMode = "none"; token.addChild(g); }
  g.clear();
  const doc = token.document;
  const geo = tokenGeometry(doc);
  const m = token.mesh;
  const texW = m.texture?.width || flag.imgW, texH = m.texture?.height || flag.imgH;
  const border = borderInTexture(referenceBox(flag, flag.applied?.edge ?? "outer"), texW, texH);
  const pts = outline(flag.shape, border);
  const lw = Math.max(1, canvas.dimensions.size / 50);

  g.lineStyle(lw, 0x00e5ff, 0.9).drawRect(geo.target.x, geo.target.y, geo.target.width, geo.target.height);
  g.beginFill(0x00e5ff, 1).drawCircle(geo.pivot.x, geo.pivot.y, lw * 1.5).endFill();

  // Predicted with the documented fit formula and API pivot (NOT the measured mesh scale), so a
  // mismatch with the rendered outline exposes any wrong assumption about how Foundry sizes it.
  const measured = measuredBaseScale(doc);
  const tex = doc.texture;
  const predicted = pts.map(([u, v]) => textureToCanvas(u, v, {
    texture: { width: texW, height: texH }, base: geo.base, pivot: geo.pivot, fit: tex.fit,
    scaleX: tex.scaleX, scaleY: tex.scaleY, anchorX: tex.anchorX, anchorY: tex.anchorY, rotation: geo.rotation,
  }));
  g.lineStyle(lw, 0xff00ff, 0.9).drawPolygon(predicted.flatMap((p) => [p.x, p.y]));

  // Actual: texture px -> mesh local (anchor-relative) -> world -> token local.
  const actual = pts.map(([u, v]) => {
    const local = new PIXI.Point(u - m.anchor.x * texW, v - m.anchor.y * texH);
    return token.toLocal(m.worldTransform.apply(local));
  });
  g.lineStyle(lw * 0.6, 0x40ff40, 1).drawPolygon(actual.flatMap((p) => [p.x, p.y]));

  const err = Math.max(...predicted.map((p, i) => Math.hypot(p.x - actual[i].x, p.y - actual[i].y)));
  if (err > 1 && !warned.has(doc.uuid)) {
    warned.add(doc.uuid);
    console.warn(`${MODULE_ID} | debug: predicted vs rendered border differ by ${err.toFixed(1)} px on ${doc.name}`,
      { geometry: geo, measured, texture: { ...tex }, flag });
  }
}
