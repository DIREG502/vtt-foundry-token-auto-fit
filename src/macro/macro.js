// Stand-alone "align selected tokens" macro (no module needed).
// Build: npm run build:macro  ->  dist/token-border-autofit-macro.js
// Paste the built file into a Script macro. Select tokens, run it:
//   - confident detections are applied directly,
//   - low-confidence ones (or every token, if Shift is held while running) open the
//     manual alignment dialog, pre-filled with the auto-detect result.
// No hooks, no settings and no flags: just detect + apply + manual adjustment.

import css from "../../styles/token-border-autofit.css";
import { detectSrc, flagFromDetection, applyFit, usesDynamicRing } from "../foundry/fit-service.js";
import { shapeHint, sceneFor } from "../foundry/geometry.js";
import { canModify } from "../foundry/compat.js";
import { openAligner } from "../foundry/align-app.js";

const THRESHOLD = 0.6;
const FIT = { flags: false, edge: "outer", aspect: "stretch", pf2eAutoscale: true };
const DETECT = { useCache: true, verify: true, fallback: true, rotationTolerance: 3, maxSize: 2048 };

async function main() {
  if (!document.getElementById("tbaf-macro-style")) {
    const st = document.createElement("style");
    st.id = "tbaf-macro-style";
    st.textContent = css;
    document.head.appendChild(st);
  }
  const all = canvas?.tokens?.controlled ?? [];
  const tokens = all.filter((t) => canModify(t.document));
  if (!tokens.length) return ui.notifications.warn("Token Border Auto-Fit: select one or more tokens you own first.");
  const manualAll = game.keyboard?.isModifierActive?.("Shift") ?? false;
  let applied = 0;
  for (const tk of tokens) {
    const doc = tk.document;
    if (usesDynamicRing(doc)) { ui.notifications.warn(`${doc.name}: dynamic token ring is on, skipped.`); continue; }
    const src = doc.texture?.src;
    if (!src) continue;
    const hint = shapeHint(doc, sceneFor(doc));
    let det = null;
    try { det = await detectSrc(src, hint, DETECT); }
    catch (e) { console.warn(e); ui.notifications.warn(`${doc.name}: could not read the image (${e.cors ? "CORS" : "load error"}), opening manual alignment.`); }
    if (det && !manualAll && det.confidence >= THRESHOLD) {
      await applyFit(doc, flagFromDetection(det, src), FIT);
      applied++;
    } else {
      await openAligner(doc, { detection: det ?? undefined, fitOptions: FIT, detectOptions: DETECT });
    }
  }
  if (applied) ui.notifications.info(`Token Border Auto-Fit: fitted ${applied} of ${tokens.length} token(s).`);
}

main().catch((e) => { console.error(e); ui.notifications.error(`Token Border Auto-Fit: ${e.message}`); });
