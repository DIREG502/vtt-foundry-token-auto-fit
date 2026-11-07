// Small helpers that hide differences between Foundry v12, v13 and v14.

export const generation = () => game.release?.generation ?? 12;

export const utils = () => foundry.utils;

/** Hook "html" argument: jQuery in Application V1 (v12 TokenConfig), HTMLElement in V2. */
export function htmlRoot(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  return null;
}

export const GRID = () => CONST.GRID_TYPES;

/** Set render flags on a placeable, skipping any flag this Foundry version doesn't know. */
export function setRenderFlags(placeable, flags) {
  if (!placeable?.renderFlags) return;
  const known = placeable.constructor?.RENDER_FLAGS ?? {};
  const ok = {};
  for (const [k, v] of Object.entries(flags)) if (k in known) ok[k] = v;
  if (Object.keys(ok).length) placeable.renderFlags.set(ok);
}

export function tokenDocumentClass() {
  return CONFIG.Token?.documentClass ?? getDocumentClass("Token");
}

/** Is this a PrototypeToken data model (lives on an Actor) rather than a TokenDocument? */
export function isPrototype(doc) {
  const PT = foundry.data?.PrototypeToken;
  return (PT && doc instanceof PT) || (doc && doc.documentName !== "Token" && doc.parent?.documentName === "Actor");
}

/** The document a token-like object is saved through: the TokenDocument itself or the Actor. */
export function ownerDocument(doc) {
  return isPrototype(doc) ? doc.parent ?? doc.actor : doc;
}

export function canModify(doc) {
  const owner = ownerDocument(doc);
  if (!owner) return false;
  try { return owner.canUserModify(game.user, "update"); } catch { return !!owner.isOwner; }
}

/** Update a TokenDocument or a PrototypeToken with token-shaped data. */
export async function updateTokenLike(doc, data, options = {}) {
  if (isPrototype(doc)) return ownerDocument(doc).update({ prototypeToken: data }, options);
  return doc.update(data, options);
}

export function loadTextureFn() {
  return foundry.canvas?.loadTexture ?? globalThis.loadTexture;
}

export function hasVideoExtension(src) {
  const VH = foundry.helpers?.media?.VideoHelper ?? globalThis.VideoHelper;
  try { if (VH?.hasVideoExtension) return VH.hasVideoExtension(src); } catch { /* fall through */ }
  return /\.(webm|mp4|m4v|ogv|ogg|mov)(\?|$)/i.test(src);
}

/** ApplicationV2 base class (v12+). */
export function AppV2() {
  return foundry.applications?.api?.ApplicationV2;
}
