// Token Border Auto-Fit — Foundry entry point.

import { MODULE_ID, log } from "./constants.js";
import { registerSettings } from "./settings.js";
import { registerHooks } from "./hooks.js";
import { onRenderTokenConfig } from "./token-config.js";
import { onRenderTokenHUD } from "./hud.js";
import { refreshDebug } from "./debug-overlay.js";
import { runFit, fitSelected, openAligner, hintFor, detectOptions, fitOptions, enqueue } from "./workflow.js";
import { detectSrc, computeFitUpdate, applyFit, getFitFlag, flagFromDetection } from "./fit-service.js";
import { clearCache } from "./cache.js";
import { detectBorder, DETECTOR_VERSION } from "../detector/index.js";
import { loadPixels } from "./image-source.js";

Hooks.once("init", () => {
  registerSettings();
  registerHooks();

  const api = {
    DETECTOR_VERSION,
    /** Fit every controlled token. { force: true } applies even below the confidence threshold. */
    fitSelected,
    /** Fit one TokenDocument / Token / PrototypeToken. mode: "auto" | "ask" | "force". */
    fitToken: (tokenOrDoc, { mode = "auto" } = {}) => enqueue(() => runFit(tokenOrDoc?.document ?? tokenOrDoc, { mode })),
    /** Open the manual alignment window. */
    openAligner: (tokenOrDoc, opts) => openAligner(tokenOrDoc?.document ?? tokenOrDoc, opts),
    /** Detect the border of an image path; returns natural-pixel results. */
    detect: (src, { shape, ...opts } = {}) => detectSrc(src, shape ?? "hex-pointy", { ...detectOptions(), ...opts }),
    /** Re-apply the stored fit (e.g. after changing the reference-edge setting). */
    reapply: async (tokenOrDoc) => {
      const doc = tokenOrDoc?.document ?? tokenOrDoc;
      const flag = getFitFlag(doc);
      if (flag) return applyFit(doc, flag, fitOptions());
    },
    computeFitUpdate, flagFromDetection, hintFor, clearCache,
    /** Low-level: the pure detector and the pixel loader. */
    detectBorder, loadPixels,
  };
  game.modules.get(MODULE_ID).api = api;
  log("initialised");
});

Hooks.on("renderTokenConfig", onRenderTokenConfig);
Hooks.on("renderPrototypeTokenConfig", onRenderTokenConfig);
Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("refreshToken", (token) => { try { refreshDebug(token); } catch (e) { console.warn(MODULE_ID, e); } });
