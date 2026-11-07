// Document hooks.
//
// preCreate/preUpdate hooks are synchronous, so they can only apply what is already known:
//   - a fit flag that matches the image (copied from the prototype, or the size changed),
//   - a cached detection for this image.
// Anything that needs a detection is marked in `options` and handled after the write, by the
// client of the user who made the change (createToken/updateToken/updateActor), which is
// also the only client allowed to do the follow-up update.

import { MODULE_ID } from "./constants.js";
import { get, S } from "./settings.js";
import { computeFitUpdate, cachedDetection, flagFromDetection, getFitFlag, usesDynamicRing } from "./fit-service.js";
import { fitOptions, hintFor, enqueue, runFit } from "./workflow.js";
import { tokenGeometry } from "./geometry.js";

const U = () => foundry.utils;
const mark = (options, key) => { options[MODULE_ID] = { ...(options[MODULE_ID] ?? {}), [key]: true }; };
const ringSkip = (doc) => usesDynamicRing(doc) && get(S.ring) !== "apply";

/** Fit data for `doc` with pending `overrides`, from its flag or the cache; null if unknown. */
function knownFit(doc, src, overrides = {}) {
  const flag = getFitFlag(doc);
  let use = flag?.src === src ? flag : null;
  if (!use && get(S.mode) === "auto" && get(S.cache)) {
    const c = cachedDetection(src, hintFor(doc));
    if (c && c.confidence >= get(S.threshold)) use = flagFromDetection(c, src);
  }
  if (!use) return null;
  try { return computeFitUpdate(doc, use, { ...fitOptions(), overrides }).update; } catch (e) { console.warn(MODULE_ID, e); return null; }
}

/** Pending size/shape/fit/rotation values from a change set (flattened). */
function geometryOverrides(flat, prefix = "") {
  const ov = {};
  for (const k of ["width", "height", "shape", "rotation", "lockRotation"]) if (flat[prefix + k] !== undefined) ov[k] = flat[prefix + k];
  if (flat[prefix + "texture.fit"] !== undefined) ov.fit = flat[prefix + "texture.fit"];
  return ov;
}

/** Does a rotation change move the border off the shape? Only when the pivot is off-centre. */
function rotationMatters(doc) {
  try {
    const g = tokenGeometry(doc);
    return Math.hypot(g.target.x + g.target.width / 2 - g.pivot.x, g.target.y + g.target.height / 2 - g.pivot.y) > 0.5;
  } catch { return false; }
}

/**
 * TokenConfig has a single "scale" control: re-saving the sheet would flatten a non-uniform
 * fit (scaleX != scaleY). If the incoming change just re-submits one of the applied magnitudes
 * for both axes, keep the applied pair (with the incoming mirror signs).
 */
function protectNonUniformScale(doc, changes, flat, prefix = "") {
  const ap = getFitFlag(doc)?.applied;
  if (!ap) return;
  const ax = Math.abs(ap.scaleX), ay = Math.abs(ap.scaleY);
  if (Math.abs(ax - ay) < 1e-4) return;
  const srcTex = doc._source?.texture ?? doc.texture;
  if (Math.abs(Math.abs(srcTex.scaleX) - ax) > 1e-3 || Math.abs(Math.abs(srcTex.scaleY) - ay) > 1e-3) return; // user already changed it
  const kx = prefix + "texture.scaleX", ky = prefix + "texture.scaleY";
  if (flat[kx] === undefined && flat[ky] === undefined) return;
  const nx = flat[kx] ?? srcTex.scaleX, ny = flat[ky] ?? srcTex.scaleY;
  const mx = Math.abs(nx), my = Math.abs(ny);
  if (Math.abs(mx - my) > 1e-6) return;
  if (Math.abs(mx - ax) > 1e-3 && Math.abs(mx - ay) > 1e-3) return; // a genuinely new scale
  U().setProperty(changes, kx, Math.sign(nx || 1) * ax);
  U().setProperty(changes, ky, Math.sign(ny || 1) * ay);
}

export function registerHooks() {
  // ---------- tokens ----------
  Hooks.on("preCreateToken", (doc, data, options, userId) => {
    if (userId !== game.user.id || get(S.mode) === "off" || ringSkip(doc)) return;
    const src = doc.texture?.src;
    if (!src) return;
    const update = knownFit(doc, src);
    if (update) doc.updateSource(update);
    else mark(options, "detect");
  });

  Hooks.on("createToken", (doc, options, userId) => {
    if (userId !== game.user.id || !options[MODULE_ID]?.detect) return;
    if (getFitFlag(doc)?.src === doc.texture?.src) return;
    enqueue(() => runFit(doc, { quietRing: true }));
  });

  Hooks.on("preUpdateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id || options[MODULE_ID]?.internal) return;
    const flat = U().flattenObject(changes);
    protectNonUniformScale(doc, changes, flat);
    const mode = get(S.mode);
    const newSrc = flat["texture.src"];
    const ov = geometryOverrides(flat);
    if (newSrc !== undefined && newSrc !== doc._source.texture.src) {
      if (mode === "off" || ringSkip(doc)) return;
      const update = knownFit(doc, newSrc, ov);
      if (update) U().mergeObject(changes, update);
      else mark(options, "detect");
      return;
    }
    // Size / shape / fit changed on a fitted token: recompute scale from the flag, no detection.
    const flag = getFitFlag(doc);
    if (!flag || flag.src !== doc._source.texture.src || mode === "off") return;
    if (flat["texture.scaleX"] !== undefined && flat["texture.scaleY"] !== undefined && ov.width === undefined && ov.height === undefined) return;
    const relevant = ov.width !== undefined || ov.height !== undefined || ov.shape !== undefined || ov.fit !== undefined ||
      ((ov.rotation !== undefined || ov.lockRotation !== undefined) && rotationMatters(doc));
    if (!relevant) return;
    const update = knownFit(doc, flag.src, ov);
    if (update) U().mergeObject(changes, { texture: update.texture, flags: update.flags });
  });

  Hooks.on("updateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id || !options[MODULE_ID]?.detect) return;
    enqueue(() => runFit(doc));
  });

  // ---------- prototype tokens (actor sheet / prototype token config) ----------
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || options[MODULE_ID]?.internal || !get(S.prototype)) return;
    if (!changes.prototypeToken) return;
    const proto = actor.prototypeToken;
    const flat = U().flattenObject(changes.prototypeToken);
    protectNonUniformScale(proto, changes.prototypeToken, flat);
    const mode = get(S.mode);
    const newSrc = flat["texture.src"];
    const ov = geometryOverrides(flat);
    if (newSrc !== undefined && newSrc !== proto._source?.texture?.src && newSrc !== proto.texture?.src) {
      if (mode === "off" || ringSkip(proto)) return;
      const update = knownFit(proto, newSrc, ov);
      if (update) U().mergeObject(changes.prototypeToken, update);
      else mark(options, "detectPrototype");
      return;
    }
    const flag = getFitFlag(proto);
    if (!flag || flag.src !== proto.texture?.src || mode === "off") return;
    if (ov.width === undefined && ov.height === undefined && ov.shape === undefined && ov.fit === undefined) return;
    const update = knownFit(proto, flag.src, ov);
    if (update) U().mergeObject(changes.prototypeToken, { texture: update.texture, flags: update.flags });
  });

  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || !options[MODULE_ID]?.detectPrototype) return;
    enqueue(() => runFit(actor.prototypeToken));
  });
}
