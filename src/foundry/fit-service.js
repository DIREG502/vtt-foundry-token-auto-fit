// Detection + apply pipeline shared by hooks, the TokenConfig button, the HUD button, the batch
// command and the manual alignment window. Settings are read by the callers in main.js /
// hooks.js and passed in, so this file is also usable from the stand-alone macro.

import { detectBorder, DETECTOR_VERSION } from "../detector/index.js";
import { computeTextureFit, borderInTexture, referenceBox } from "../core/fit-math.js";
import { loadPixels } from "./image-source.js";
import { cacheGet, cacheSet, fingerprint } from "./cache.js";
import { tokenGeometry, measuredBaseScale } from "./geometry.js";
import { updateTokenLike } from "./compat.js";
import { MODULE_ID, FLAG } from "./constants.js";

export const DEFAULT_OPTIONS = Object.freeze({
  edge: "outer", aspect: "stretch", pf2eAutoscale: true,
  useCache: true, fallback: true, rotationTolerance: 3, maxSize: 2048,
});

const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Detect the border of an image. Result is in NATURAL image pixels.
 * verify=false trusts a cache hit without loading the image (synchronous-ish fast path);
 * verify=true reloads the pixels and re-detects if the file changed since it was cached.
 */
export async function detectSrc(src, hint, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const cached = o.useCache ? cacheGet(src, hint) : null;
  if (cached && !o.verify) return { ...cached, cached: true };
  const px = await loadPixels(src, { maxSize: o.maxSize });
  const hash = fingerprint(px.img);
  if (cached && cached.hash === hash) return { ...cached, cached: true };
  const r = detectBorder(px.img, { shape: hint, fallback: o.fallback, rotationTolerance: o.rotationTolerance });
  const k = 1 / px.scale;
  const out = {
    src, shape: r.shape,
    cx: (r.cx + 0.5) * k - 0.5, cy: (r.cy + 0.5) * k - 0.5, w: r.width * k, h: r.height * k,
    rotation: r.rotation, thickness: r.thickness * k, confidence: r.confidence,
    imgW: px.naturalWidth, imgH: px.naturalHeight, detectorVersion: DETECTOR_VERSION,
    hash, ms: Math.round(r.timings.total), loader: px.method,
  };
  if (o.useCache) cacheSet(src, hint, out);
  return out;
}

/** Synchronous cache lookup for preCreate/preUpdate hooks (which cannot await). */
export function cachedDetection(src, hint) {
  return cacheGet(src, hint);
}

/** Shape of the flag stored on the token: flags[MODULE_ID].fit */
export function flagFromDetection(det, src, { manual = false } = {}) {
  return {
    src, shape: det.shape,
    cx: round(det.cx, 3), cy: round(det.cy, 3), w: round(det.w, 3), h: round(det.h, 3),
    rotation: round(det.rotation ?? 0, 3), thickness: round(det.thickness ?? 0, 3),
    confidence: round(det.confidence ?? 1, 3), imgW: det.imgW, imgH: det.imgH,
    detectorVersion: DETECTOR_VERSION, manual,
  };
}

export function getFitFlag(doc) {
  return doc?.flags?.[MODULE_ID]?.[FLAG] ?? null;
}

/**
 * Texture data that puts the border on the token shape.
 * @param doc TokenDocument or PrototypeToken (current state)
 * @param flag fit flag (border in natural image px)
 * @param opts { overrides: {width,height,shape,rotation,fit,scaleX,scaleY}, edge, aspect, pf2eAutoscale }
 * @returns {{update: object, geometry: object, fit: object}}
 */
export function computeFitUpdate(doc, flag, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const ov = o.overrides ?? {};
  const geo = tokenGeometry(doc, ov);
  const sizeChanging = ["width", "height", "shape", "fit"].some((k) => ov[k] !== undefined);
  // A caller (the alignment window) may pass a base scale measured before it started previewing.
  let measured = sizeChanging ? null : (o.baseScale ?? measuredBaseScale(doc));
  // Only trust the live mesh when it shows this very image (same file, same proportions).
  if (measured && (flag.src !== doc.texture?.src ||
      Math.abs(measured.texW / measured.texH - flag.imgW / flag.imgH) > 0.01)) measured = null;
  const texW = measured?.texW ?? flag.imgW, texH = measured?.texH ?? flag.imgH;
  const border = borderInTexture(referenceBox(flag, o.edge), texW, texH);
  const src = doc._source?.texture ?? doc.texture ?? {};
  let aspect = o.aspect;
  if (aspect === "auto") {
    const dev = Math.abs((geo.target.width / geo.target.height) / (border.width / border.height) - 1);
    aspect = dev <= 0.08 ? "stretch" : "contain";
  }
  const fit = computeTextureFit({
    border, texture: { width: texW, height: texH },
    base: geo.base, target: geo.target, pivot: geo.pivot,
    fit: ov.fit ?? src.fit ?? doc.texture?.fit ?? "contain",
    scaleX: ov.scaleX ?? src.scaleX ?? 1, scaleY: ov.scaleY ?? src.scaleY ?? 1,
    rotation: geo.rotation, aspect,
    baseScale: measured ? { sx: measured.sx, sy: measured.sy } : undefined,
  });
  const texture = { scaleX: round(fit.scaleX), scaleY: round(fit.scaleY), anchorX: round(fit.anchorX), anchorY: round(fit.anchorY) };
  const update = { texture };
  // The stand-alone macro passes flags: false (no module installed -> no module flag scope).
  if (o.flags !== false) {
    update.flags = { [MODULE_ID]: { [FLAG]: { ...flag, applied: { scaleX: texture.scaleX, scaleY: texture.scaleY, edge: o.edge, aspect } } } };
  }
  // PF2e rewrites texture.scaleX/Y during data preparation while autoscale is on.
  if (game.system?.id === "pf2e" && o.pf2eAutoscale) (update.flags ??= {}).pf2e = { autoscale: false };
  return { update, geometry: geo, fit, measured: !!measured };
}

export async function applyFit(doc, flag, opts = {}) {
  const { update } = computeFitUpdate(doc, flag, opts);
  await updateTokenLike(doc, update, { [MODULE_ID]: { internal: true } });
  return update;
}

/** True when the document uses a dynamic token ring (the ring replaces the art framing). */
export function usesDynamicRing(doc) {
  return !!doc?.ring?.enabled;
}
