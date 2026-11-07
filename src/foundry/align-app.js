// Manual alignment window (ApplicationV2, available in v12+): the AlignEditor plus live
// preview on the canvas and Apply / Reset / Re-run auto-detect buttons.
//
// Live preview writes the computed values into the token's PREPARED data (doc.texture) and asks
// the placeable to refresh its mesh, so Foundry itself draws the preview with its normal code
// path. Closing or cancelling calls doc.reset() to go back to the saved source data.

import { AlignEditor } from "../ui/align-editor.js";
import { AppV2, isPrototype, setRenderFlags, canModify } from "./compat.js";
import { computeFitUpdate, applyFit, detectSrc, flagFromDetection, getFitFlag } from "./fit-service.js";
import { sceneFor, shapeHint, measuredBaseScale } from "./geometry.js";

let AlignWindowClass = null;

function naturalSize(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => reject(new Error(`Could not load ${src}`));
    im.src = src;
  });
}

const i18n = (k, fallback) => {
  const key = `TBAF.Align.${k}`;
  const v = game.i18n?.localize?.(key);
  return v && v !== key ? v : fallback;
};

function getClass() {
  if (AlignWindowClass) return AlignWindowClass;
  const Base = AppV2();
  if (!Base) throw new Error("ApplicationV2 is not available (Foundry v12+ required)");
  AlignWindowClass = class AlignWindow extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["tbaf-align-window"],
      window: { resizable: true, icon: "fas fa-draw-polygon" },
      position: { width: 640, height: 760 },
    };

    constructor(params, options = {}) {
      super(foundry.utils.mergeObject({ window: { title: params.title } }, options));
      this.p = params;
    }

    async _renderHTML() {
      const p = this.p;
      const root = document.createElement("div");
      root.className = "tbaf-align";
      const info = document.createElement("p");
      info.className = "tbaf-info";
      root.appendChild(info);
      const host = document.createElement("div");
      host.className = "tbaf-editor-host";
      root.appendChild(host);
      const btns = document.createElement("div");
      btns.className = "tbaf-buttons";
      const mk = (action, icon, label) => {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.action = action;
        b.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
        btns.appendChild(b);
        return b;
      };
      mk("detect", "fa-wand-magic-sparkles", i18n("Redetect", "Re-run auto-detect"));
      mk("reset", "fa-rotate-left", i18n("Reset", "Reset"));
      mk("cancel", "fa-xmark", i18n("Cancel", "Cancel"));
      mk("apply", "fa-check", i18n("Apply", "Apply")).classList.add("tbaf-primary");
      root.appendChild(btns);
      this._info = info;
      this._host = host;
      btns.addEventListener("click", (e) => {
        const a = e.target.closest("button")?.dataset.action;
        if (a) this._onAction(a);
      });
      return root;
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
      if (!this._editor) {
        const p = this.p;
        this._editor = new AlignEditor(this._host, {
          src: p.src, width: p.imgW, height: p.imgH, initial: p.initial,
          onChange: (s) => this._preview(s),
          labels: {
            shape: i18n("Shape", "Shape"), zoom: i18n("Zoom", "Zoom"), fit: i18n("ZoomFit", "Fit"),
            lock: i18n("Lock", "Keep proportions"), regular: i18n("Regular", "Regular shape"),
            regularHint: i18n("RegularHint", ""),
            "hex-pointy": i18n("Shapes.hex-pointy", "Hex (pointy top)"), "hex-flat": i18n("Shapes.hex-flat", "Hex (flat top)"),
            circle: i18n("Shapes.circle", "Circle"), square: i18n("Shapes.square", "Square"),
          },
        });
        this._setInfo(p.detection);
        this._preview(this._editor.get());
      }
    }

    _setInfo(det) {
      if (!this._info) return;
      const help = i18n("Help", "Drag to move, corners to resize (Shift: free proportions, Alt: from centre). Arrows nudge 1 px, Shift+arrows 10 px, Ctrl+arrows resize.");
      const conf = det ? `${i18n("Confidence", "Auto-detect confidence")}: ${Math.round((det.confidence ?? 0) * 100)}%` : "";
      this._info.textContent = [conf, help].filter(Boolean).join(" — ");
    }

    _flag(state) {
      const p = this.p;
      return flagFromDetection({ ...state, thickness: state.thickness ?? p.initial.thickness ?? 0, confidence: 1, imgW: p.imgW, imgH: p.imgH }, p.src, { manual: true });
    }

    _preview(state) {
      const doc = this.p.doc;
      if (isPrototype(doc) || !doc.object) return;
      try {
        const { update } = computeFitUpdate(doc, this._flag(state), this.p.fitOptions);
        Object.assign(doc.texture, update.texture);
        setRenderFlags(doc.object, { refreshMesh: true, refreshSize: true });
        this._dirty = true;
      } catch (e) { console.warn("token-border-autofit | preview failed", e); }
    }

    _revert() {
      const doc = this.p.doc;
      if (!this._dirty || isPrototype(doc)) return;
      this._dirty = false;
      try { doc.reset(); } catch { /* ignore */ }
      if (doc.object) setRenderFlags(doc.object, { refreshMesh: true, refreshSize: true });
    }

    async _onAction(a) {
      const p = this.p;
      if (a === "cancel") return this.close();
      if (a === "reset") { this._editor.set(p.initial); return; }
      if (a === "detect") {
        try {
          const det = await detectSrc(p.src, p.hint, { ...p.detectOptions, useCache: false });
          this.p.detection = det;
          this._setInfo(det);
          this._editor.set({ shape: det.shape, cx: det.cx, cy: det.cy, w: det.w, h: det.h, thickness: det.thickness });
        } catch (e) { ui.notifications.error(e.message); }
        return;
      }
      if (a === "apply") {
        const flag = this._flag(this._editor.get());
        this._revert();
        await applyFit(p.doc, flag, p.fitOptions);
        p.onApply?.(flag);
        this._applied = true;
        return this.close();
      }
    }

    async _onClose(options) {
      this._revert();
      this._editor?.destroy();
      return super._onClose?.(options);
    }
  };
  return AlignWindowClass;
}

/**
 * Open the manual alignment window for a TokenDocument or PrototypeToken.
 * @param doc
 * @param o { detection?, fitOptions, detectOptions, hintOptions, onApply? }
 */
export async function openAligner(doc, o = {}) {
  if (!canModify(doc)) return ui.notifications.warn(game.i18n.localize("TBAF.Notify.noPermission"));
  const src = o.src ?? doc.texture?.src;
  if (!src) return;
  const scene = sceneFor(doc);
  const hint = shapeHint(doc, scene, o.hintOptions);
  const flag = getFitFlag(doc);
  let det = o.detection ?? (flag?.src === src ? flag : null);
  if (!det) {
    try { det = await detectSrc(src, hint, o.detectOptions); } catch (e) { det = null; console.warn(e); }
  }
  let size;
  try { size = det?.imgW ? { width: det.imgW, height: det.imgH } : await naturalSize(src); }
  catch (e) { return ui.notifications.error(e.message); }
  const initial = det
    ? { shape: det.shape, cx: det.cx, cy: det.cy, w: det.w, h: det.h, thickness: det.thickness ?? 0 }
    : { shape: hint, cx: size.width / 2, cy: size.height / 2, w: size.width * 0.9, h: size.height * 0.9, thickness: 0 };
  const name = doc.name ?? doc.parent?.name ?? "";
  // Measure the live mesh once, before any preview touches it.
  const baseScale = isPrototype(doc) ? null : measuredBaseScale(doc);
  const fitOptions = { ...(o.fitOptions ?? {}), ...(baseScale ? { baseScale } : {}) };
  const App = getClass();
  const app = new App({
    doc, src, hint, initial, detection: det, imgW: size.width, imgH: size.height,
    fitOptions, detectOptions: o.detectOptions, onApply: o.onApply,
    title: `${i18n("Title", "Fit border to grid")}${name ? `: ${name}` : ""}`,
  });
  app.render(true);
  return app;
}
