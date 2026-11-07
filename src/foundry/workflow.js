// User-facing workflows: automatic fit after create/update, "ask" prompts, batch fitting,
// manual alignment. Reads module settings and calls the fit service.

import { MODULE_ID, t, warn } from "./constants.js";
import { get, S } from "./settings.js";
import { canModify, isPrototype } from "./compat.js";
import { sceneFor, shapeHint } from "./geometry.js";
import { detectSrc, flagFromDetection, applyFit, usesDynamicRing, getFitFlag } from "./fit-service.js";
import { openAligner as openAlignerRaw } from "./align-app.js";
import { showPrompt } from "../ui/prompt.js";

export const fitOptions = () => ({ edge: get(S.edge), aspect: get(S.aspect), pf2eAutoscale: get(S.pf2e) });
export const detectOptions = () => ({ useCache: get(S.cache), fallback: get(S.fallback), rotationTolerance: get(S.rotation), maxSize: get(S.maxSize) });
export const hintOptions = () => ({ gridless: get(S.gridless), square: get(S.squareShape) });

export function hintFor(doc) {
  return shapeHint(doc, sceneFor(doc), hintOptions());
}

const nameOf = (doc) => doc.name ?? doc.parent?.name ?? doc.actor?.name ?? "";

function notify(level, key, data) {
  if (level === "info" && !get(S.notify)) return;
  ui.notifications?.[level]?.(t(key, data));
}

/** Detections run one at a time so a scene import of 30 tokens doesn't stall the UI. */
let chain = Promise.resolve();
export function enqueue(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

export function ringBlocks(doc, { quiet = false } = {}) {
  if (!usesDynamicRing(doc) || get(S.ring) === "apply") return false;
  if (!quiet) notify("warn", "Notify.ringSkipped", { name: nameOf(doc) });
  return true;
}

export function openAligner(doc, extra = {}) {
  return openAlignerRaw(doc, { fitOptions: fitOptions(), detectOptions: detectOptions(), hintOptions: hintOptions(), ...extra });
}

/**
 * Detect and, depending on mode/confidence, apply or ask.
 * @param doc TokenDocument or PrototypeToken
 * @param o.mode "auto" | "ask" | "force" (force = apply whatever the confidence)
 * @param o.interactive show prompts/windows for low confidence (default true)
 * @returns {Promise<{status:string, detection?:object}>}
 */
export async function runFit(doc, { mode = get(S.mode), interactive = true, quietRing = false } = {}) {
  if (!doc || mode === "off") return { status: "off" };
  if (!canModify(doc)) { if (interactive) notify("warn", "Notify.noPermission"); return { status: "permission" }; }
  if (ringBlocks(doc, { quiet: quietRing })) return { status: "ring" };
  const src = doc.texture?.src;
  if (!src) return { status: "nosrc" };
  let det;
  try {
    det = await detectSrc(src, hintFor(doc), { ...detectOptions(), verify: true });
  } catch (e) {
    warn(e);
    if (interactive) {
      showPrompt(t(e.cors ? "Notify.corsFailed" : "Notify.loadFailed", { name: nameOf(doc) }), [
        { label: t("Prompt.adjust"), icon: "fa-draw-polygon", action: () => openAligner(doc), primary: true },
        { label: t("Prompt.dismiss") },
      ]);
    }
    return { status: "error", error: e };
  }
  if (doc.texture?.src !== src) return { status: "stale" };
  const flag = flagFromDetection(det, src);
  const thr = get(S.threshold);
  const pct = Math.round(det.confidence * 100);
  if (mode === "force" || (mode === "auto" && det.confidence >= thr)) {
    await applyFit(doc, flag, fitOptions());
    notify("info", "Notify.applied", { name: nameOf(doc), conf: pct });
    return { status: "applied", detection: det };
  }
  if (!interactive) return { status: det.confidence >= thr ? "ready" : "low", detection: det };
  const low = det.confidence < thr;
  const buttons = [];
  if (!low) buttons.push({ label: t("Prompt.apply"), icon: "fa-check", primary: true, action: () => applyFit(doc, flag, fitOptions()) });
  buttons.push({ label: t("Prompt.adjust"), icon: "fa-draw-polygon", primary: low, action: () => openAligner(doc, { detection: det }) });
  if (low) buttons.push({ label: t("Prompt.applyAnyway"), action: () => applyFit(doc, flag, fitOptions()) });
  buttons.push({ label: t("Prompt.dismiss") });
  showPrompt(t(low ? "Prompt.lowConfidence" : "Prompt.ask", { name: nameOf(doc), conf: pct }), buttons);
  return { status: low ? "low" : "asked", detection: det };
}

/** Batch: every controlled token the user may update. Low-confidence ones open the aligner. */
export async function fitSelected({ force = false } = {}) {
  const tokens = (canvas?.tokens?.controlled ?? []).filter((tk) => canModify(tk.document));
  if (!tokens.length) return notify("warn", "Notify.noneSelected");
  const results = [];
  for (const tk of tokens) {
    const r = await enqueue(() => runFit(tk.document, { mode: force ? "force" : "auto", interactive: false, quietRing: tokens.length > 1 }));
    results.push([tk.document, r]);
  }
  const applied = results.filter(([, r]) => r.status === "applied").length;
  const low = results.filter(([, r]) => r.status === "low" || r.status === "error");
  const ring = results.filter(([, r]) => r.status === "ring").length;
  ui.notifications.info(t("Notify.batch", { applied, total: tokens.length, low: low.length, ring }));
  for (const [doc, r] of low.slice(0, 3)) openAligner(doc, { detection: r.detection });
  return results;
}

export { getFitFlag, isPrototype, MODULE_ID };
