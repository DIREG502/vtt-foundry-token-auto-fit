// Token geometry from the Foundry API (v12-v14):
//   base   : the size passed to mesh.resize  -> TokenDocument#getSize (v13+) / Token#getSize (v12)
//   pivot  : where the mesh sits             -> TokenDocument#getCenterPoint (v13+) / Token#getCenterPoint
//   target : bounding box of the token shape -> TokenDocument#getGridSpacePolygon (v13+) / Token#getShape
// All relative to the token's top-left corner (computed with x = y = 0).
// The hand-written hex formulas at the bottom are only a last resort when none of those exist
// (e.g. a prototype token with no scene at all) and are flagged as such in the result.

import { isPrototype, tokenDocumentClass } from "./compat.js";
import { bounds } from "../core/fit-math.js";

export function sceneFor(doc) {
  if (!isPrototype(doc) && doc?.parent?.documentName === "Scene") return doc.parent;
  return canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.current ?? null;
}

/** Expected border shape from the grid (and the token's shape on square/gridless scenes). */
export function shapeHint(doc, scene, { gridless = "circle", square = "auto" } = {}) {
  const grid = scene?.grid;
  const G = CONST.GRID_TYPES, TS = CONST.TOKEN_SHAPES;
  const type = grid?.type;
  const shape = doc?.shape;
  const isRect = TS && (shape === TS.RECTANGLE_1 || shape === TS.RECTANGLE_2);
  const isEllipse = TS && (shape === TS.ELLIPSE_1 || shape === TS.ELLIPSE_2);
  if (type === undefined || type === G.GRIDLESS) return isRect ? "square" : gridless;
  if (type === G.SQUARE) {
    if (square !== "auto") return square;
    return isEllipse ? "circle" : "square";
  }
  const columns = grid.columns ?? [G.HEXODDQ, G.HEXEVENQ].includes(type);
  return columns ? "hex-flat" : "hex-pointy";
}

const tryCall = (fn) => { try { return fn(); } catch { return undefined; } };

function asTokenDocument(doc, scene) {
  if (!isPrototype(doc) && doc?.parent) return doc;
  const data = doc.toObject?.() ?? foundry.utils.deepClone(doc);
  for (const k of ["randomImg", "appendNumber", "prependAdjective"]) delete data[k];
  return tryCall(() => new (tokenDocumentClass())(data, { parent: scene ?? null })) ?? null;
}

/**
 * @param doc TokenDocument or PrototypeToken
 * @param overrides {width?, height?, shape?, rotation?} values about to be saved
 */
export function tokenGeometry(doc, overrides = {}) {
  const scene = sceneFor(doc);
  const tdoc = asTokenDocument(doc, scene);
  const width = overrides.width ?? doc.width ?? 1;
  const height = overrides.height ?? doc.height ?? 1;
  const shape = overrides.shape ?? doc.shape;
  const data = { x: 0, y: 0, elevation: 0, width, height };
  if (shape !== undefined) data.shape = shape;
  const sameDims = overrides.width === undefined && overrides.height === undefined && overrides.shape === undefined;
  const placeable = sameDims && !isPrototype(doc) ? doc.object : null;
  const sources = {};

  let base = tdoc && tryCall(() => tdoc.getSize?.(data));
  if (valid(base)) sources.base = "TokenDocument#getSize";
  else if (valid(base = placeable && tryCall(() => placeable.getSize?.()))) sources.base = "Token#getSize";
  else { base = fallbackSize(scene, width, height); sources.base = "fallback"; }
  base = { width: base.width, height: base.height };

  let pivot = tdoc && tryCall(() => tdoc.getCenterPoint?.(data));
  if (finitePt(pivot)) sources.pivot = "TokenDocument#getCenterPoint";
  else if (finitePt(pivot = placeable && tryCall(() => placeable.getCenterPoint?.({ x: 0, y: 0 })))) sources.pivot = "Token#getCenterPoint";
  else { pivot = { x: base.width / 2, y: base.height / 2 }; sources.pivot = "fallback"; }
  pivot = { x: pivot.x, y: pivot.y };

  let target = null;
  const poly = tdoc && tryCall(() => tdoc.getGridSpacePolygon?.(data));
  if (Array.isArray(poly) && poly.length >= 3) {
    target = bounds(poly.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p)));
    sources.target = "TokenDocument#getGridSpacePolygon";
  } else if (placeable) {
    const shp = tryCall(() => placeable.getShape?.() ?? placeable.shape);
    const b = shp && tryCall(() => shp.getBounds());
    if (b && b.width > 0) { target = { x: b.x, y: b.y, width: b.width, height: b.height }; sources.target = "Token#getShape"; }
  }
  if (!target) { target = { x: 0, y: 0, width: base.width, height: base.height }; sources.target = "size"; }

  // Sanity: if an API answered in absolute coordinates despite x = y = 0, fall back to the box centre.
  if (pivot.x < target.x - 1 || pivot.y < target.y - 1 || pivot.x > target.x + target.width + 1 || pivot.y > target.y + target.height + 1) {
    pivot = { x: base.width / 2, y: base.height / 2 }; sources.pivot = "fallback(out-of-box)";
  }
  const lockRotation = doc.lockRotation ?? false;
  const rotation = lockRotation ? 0 : (overrides.rotation ?? doc.rotation ?? 0);
  return { base, pivot, target, rotation, scene, sources };
}

const valid = (s) => s && Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;
const finitePt = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Last resort only (no scene / very old API): Foundry's documented hex token sizing. */
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

/**
 * Base scale actually used by the live mesh (mesh.scale / texture.scale). This follows whatever
 * Foundry (or another module) does to size the mesh, so it is preferred over the fit formula
 * when the token is on the canvas and nothing about its size is changing.
 */
export function measuredBaseScale(doc) {
  if (isPrototype(doc)) return null;
  const token = doc.object, m = token?.mesh;
  if (!m || m.destroyed || !m.texture?.valid) return null;
  if (token.animationContexts?.size || token._animation) return null; // mid-animation
  const tx = doc.texture?.scaleX, ty = doc.texture?.scaleY;
  if (!tx || !ty) return null;
  const sx = Math.abs(m.scale.x / tx), sy = Math.abs(m.scale.y / ty);
  return Number.isFinite(sx) && Number.isFinite(sy) && sx > 0 && sy > 0 ? { sx, sy, texW: m.texture.width, texH: m.texture.height } : null;
}
