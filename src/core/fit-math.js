// Pure maths for turning a detected border into token texture settings.
// No Foundry dependencies: everything Foundry-specific is passed in as numbers, so this file
// is unit-tested in Node and shared by the module and the stand-alone macro.
//
// How Foundry draws a token texture (v12/v13; verified against Token#_refreshMesh and
// PrimarySpriteMesh#resize, see README "How it works"):
//   mesh.resize(baseW, baseH, {fit, scaleX, scaleY})   -> base scale from `fit`, then * scaleX/Y
//   mesh.anchor.set(anchorX, anchorY)                   -> texture point placed at mesh.position
//   mesh.position = token centre point (pivot); mesh.angle = rotation (0 if lockRotation)
// So texture pixel (u, v) lands on the canvas at
//   P + R(theta) * ((u - anchorX*texW) * fx*scaleX, (v - anchorY*texH) * fy*scaleY)
// where P is the pivot and (fx, fy) the base scale produced by `fit`.

export const FITS = ["fill", "contain", "cover", "width", "height"];

/** Base scale chosen by PrimarySpriteMesh#resize for a given fit mode. */
export function fitBaseScale(fit, baseW, baseH, texW, texH) {
  const rx = baseW / texW, ry = baseH / texH;
  switch (fit) {
    case "fill": return { sx: rx, sy: ry };
    case "cover": { const s = Math.max(rx, ry); return { sx: s, sy: s }; }
    case "width": return { sx: rx, sy: rx };
    case "height": return { sx: ry, sy: ry };
    case "contain":
    default: { const s = Math.min(rx, ry); return { sx: s, sy: s }; }
  }
}

const sign = (v) => (v < 0 ? -1 : 1);

/**
 * Compute texture settings that put the border exactly on the target box.
 *
 * @param {object} p
 * @param {{cx:number, cy:number, width:number, height:number}} p.border  border box in TEXTURE pixels
 * @param {{width:number, height:number}} p.texture      texture (image) size in pixels
 * @param {{width:number, height:number}} p.base         token size in px passed to mesh.resize (Token#getSize)
 * @param {{x:number, y:number, width:number, height:number}} p.target  target box, px, relative to the token's top-left
 * @param {{x:number, y:number}} [p.pivot]               mesh position relative to the token's top-left (default: base centre)
 * @param {string} [p.fit="contain"]
 * @param {number} [p.scaleX=1]  current scaleX (only its sign is used: mirroring is preserved)
 * @param {number} [p.scaleY=1]
 * @param {number} [p.rotation=0] effective mesh rotation in degrees (0 when rotation is locked)
 * @param {"stretch"|"contain"|"cover"|"width"|"height"} [p.aspect="stretch"]
 * @param {{sx:number, sy:number}} [p.baseScale]  measured base scale (overrides the fit formula)
 * @returns {{scaleX:number, scaleY:number, anchorX:number, anchorY:number, baseScale:{sx:number,sy:number}}}
 */
export function computeTextureFit(p) {
  const { border, texture, base, target } = p;
  const fit = p.fit ?? "contain";
  const pivot = p.pivot ?? { x: base.width / 2, y: base.height / 2 };
  const b = p.baseScale ?? fitBaseScale(fit, base.width, base.height, texture.width, texture.height);
  const kx = target.width / border.width, ky = target.height / border.height; // wanted canvas px per texture px
  let tx = kx, ty = ky;
  switch (p.aspect ?? "stretch") {
    case "contain": tx = ty = Math.min(kx, ky); break;
    case "cover": tx = ty = Math.max(kx, ky); break;
    case "width": tx = ty = kx; break;
    case "height": tx = ty = ky; break;
    default: break;
  }
  const sx = sign(p.scaleX ?? 1), sy = sign(p.scaleY ?? 1);
  const scaleX = (sx * tx) / b.sx, scaleY = (sy * ty) / b.sy;
  // Signed total scale actually applied to the texture.
  const TX = b.sx * scaleX, TY = b.sy * scaleY;
  // Canvas offset from pivot to target centre, rotated back into the mesh frame.
  const th = ((p.rotation ?? 0) * Math.PI) / 180;
  const dx = target.x + target.width / 2 - pivot.x, dy = target.y + target.height / 2 - pivot.y;
  const c = Math.cos(th), s = Math.sin(th);
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const anchorX = (border.cx - lx / TX) / texture.width;
  const anchorY = (border.cy - ly / TY) / texture.height;
  return { scaleX, scaleY, anchorX, anchorY, baseScale: b };
}

/**
 * Forward model: where a texture-space point lands on the canvas (relative to token top-left)
 * for given texture settings. Used by tests and by the debug overlay.
 */
export function textureToCanvas(u, v, p) {
  const { texture, base } = p;
  const pivot = p.pivot ?? { x: base.width / 2, y: base.height / 2 };
  const b = p.baseScale ?? fitBaseScale(p.fit ?? "contain", base.width, base.height, texture.width, texture.height);
  const TX = b.sx * p.scaleX, TY = b.sy * p.scaleY;
  const lx = (u - p.anchorX * texture.width) * TX, ly = (v - p.anchorY * texture.height) * TY;
  const th = ((p.rotation ?? 0) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  return { x: pivot.x + lx * c - ly * s, y: pivot.y + lx * s + ly * c };
}

/** Axis-aligned bounding box of a list of points. */
export function bounds(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { x, y } of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Convert a stored detection (source-image pixels) to texture pixels, in case the texture
 * Foundry renders has a different size than the image the detector saw.
 */
export function borderInTexture(fitFlag, texW, texH) {
  const kx = texW / (fitFlag.imgW || texW), ky = texH / (fitFlag.imgH || texH);
  return { cx: fitFlag.cx * kx, cy: fitFlag.cy * ky, width: fitFlag.w * kx, height: fitFlag.h * ky };
}

/** Reference-line box: outer edge (default), centre line or inner edge of the border band. */
export function referenceBox(fitFlag, edge = "outer") {
  const t = edge === "inner" ? (fitFlag.thickness || 0) : edge === "center" ? (fitFlag.thickness || 0) / 2 : 0;
  if (!t) return { ...fitFlag };
  // Inset by t along the normals == uniform scale about the centre by (a - t)/a (a = mean apothem).
  const a = meanApothem(fitFlag.shape, fitFlag.w, fitFlag.h);
  const k = Math.max(0.05, (a - t) / a);
  return { ...fitFlag, w: fitFlag.w * k, h: fitFlag.h * k };
}

function meanApothem(shape, w, h) {
  if (shape === "circle") return (w + h) / 4;
  if (shape === "square") return (w + h) / 4;
  // Regular-ish hex: 2 sides at the flat half-width, 4 slanted sides.
  const pointy = shape !== "hex-flat";
  const flatHalf = pointy ? w / 2 : h / 2; // apothem of the two "flat" sides
  const W = pointy ? w : h, H = pointy ? h : w;
  // Slanted side from (0,-H/2) to (W/2,-H/4): distance from origin.
  const ex = W / 2, ey = H / 4;
  const slanted = Math.abs(0 * ey - (-H / 2) * ex) / Math.hypot(ex, ey);
  return (2 * flatHalf + 4 * slanted) / 6;
}
