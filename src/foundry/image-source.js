// Load an image (or the first frame of a video) as RGBA pixels for the detector.
//
// Order of attempts:
//   1. <img crossOrigin="anonymous"> drawn into a canvas (same-origin files and CORS-enabled hosts)
//   2. fetch() -> Blob -> createImageBitmap (works where the server sends CORS headers to fetch but
//      the cached <img> response was opaque)
//   3. Foundry's own texture loader + renderer.extract: if the canvas can display the texture,
//      WebGL already accepted it, so reading it back through the renderer works too.
// Large images are scaled down to `maxSize` on the longest side while drawing; the caller
// scales the detection back to natural pixels (`scale` = loaded px / natural px).

import { hasVideoExtension, loadTextureFn } from "./compat.js";

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
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
  const id = ctx.getImageData(0, 0, w, h); // throws SecurityError on a tainted canvas
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
    v.muted = true; v.playsInline = true; v.preload = "auto";
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
  const load = loadTextureFn();
  if (!load || !canvas?.app?.renderer) throw new Error("Canvas renderer not available");
  const tex = await load(src);
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

/**
 * @returns {Promise<{img:{width,height,data}, naturalWidth:number, naturalHeight:number, scale:number, method:string}>}
 */
export async function loadPixels(src, { maxSize = 2048 } = {}) {
  const errors = [];
  const video = hasVideoExtension(src);
  try {
    const el = video ? await loadVideoFrame(src) : await loadImageElement(src);
    const nw = video ? el.videoWidth : el.naturalWidth, nh = video ? el.videoHeight : el.naturalHeight;
    return { ...drawToImageData(el, nw, nh, maxSize), method: "element" };
  } catch (e) { errors.push(e); }
  if (!video) {
    try {
      const bmp = await viaFetch(src);
      const r = { ...drawToImageData(bmp, bmp.width, bmp.height, maxSize), method: "fetch" };
      bmp.close?.();
      return r;
    } catch (e) { errors.push(e); }
  }
  try { return { ...(await viaRenderer(src, maxSize)), method: "renderer" }; } catch (e) { errors.push(e); }
  const err = new Error(`Could not read pixels of ${src}: ${errors.map((e) => e.message).join("; ")}`);
  err.cors = errors.some((e) => e.name === "SecurityError");
  throw err;
}
