// "Fit border to grid" / "Adjust manually" buttons on the Appearance tab of TokenConfig and
// PrototypeTokenConfig. v12 renders these sheets with Application V1 (jQuery html argument),
// v13+ with ApplicationV2 (HTMLElement); htmlRoot() normalises both.

import { t } from "./constants.js";
import { htmlRoot, isPrototype, canModify } from "./compat.js";
import { runFit, openAligner, enqueue } from "./workflow.js";
import { getFitFlag } from "./fit-service.js";

function sheetToken(app) {
  return app.token ?? app.object ?? app.document ?? null;
}

function formValue(root, name) {
  const el = root.querySelector(`[name="${name}"]`);
  if (!el) return undefined;
  return el.value ?? el.getAttribute("value");
}

/** Save pending form edits without closing the sheet, so the fit sees the user's current values. */
async function savePending(app, root, doc) {
  const src = formValue(root, "texture.src");
  const width = Number(formValue(root, "width"));
  const height = Number(formValue(root, "height"));
  const changed = (src && src !== doc.texture?.src) ||
    (Number.isFinite(width) && width > 0 && width !== doc.width) ||
    (Number.isFinite(height) && height > 0 && height !== doc.height);
  if (!changed) return;
  const V2 = foundry.applications?.api?.ApplicationV2;
  if (V2 && app instanceof V2) {
    // TokenConfig (v13) closes on submit; keep it open for the fit result.
    const formOpts = app.options?.form;
    const close = formOpts?.closeOnSubmit;
    try {
      if (formOpts) formOpts.closeOnSubmit = false;
      await app.submit();
    } finally {
      if (formOpts) formOpts.closeOnSubmit = close;
    }
  } else {
    await app.submit({ preventClose: true, preventRender: true }); // Application V1 (v12)
  }
}

export function onRenderTokenConfig(app, html) {
  const root = htmlRoot(html) ?? htmlRoot(app.element);
  if (!root) return;
  const doc = sheetToken(app);
  if (!doc || !canModify(doc)) return;
  const tab = root.querySelector('.tab[data-tab="appearance"]') ?? root.querySelector('[data-tab="appearance"].tab');
  if (!tab || tab.querySelector(".tbaf-config")) return;

  const group = document.createElement("div");
  group.className = "form-group tbaf-config";
  const flag = getFitFlag(doc);
  const status = flag && flag.src === doc.texture?.src
    ? t(flag.manual ? "Config.statusManual" : "Config.status", { conf: Math.round((flag.confidence ?? 0) * 100) })
    : t("Config.statusNone");
  group.innerHTML = `
    <label>${t("Config.label")}</label>
    <div class="form-fields">
      <button type="button" data-tbaf="fit"><i class="fas fa-crosshairs"></i> ${t("Config.fit")}</button>
      <button type="button" data-tbaf="align"><i class="fas fa-draw-polygon"></i> ${t("Config.align")}</button>
    </div>
    <p class="hint">${status}</p>`;

  const srcGroup = tab.querySelector('[name="texture.src"]')?.closest(".form-group");
  if (srcGroup) srcGroup.after(group); else tab.prepend(group);

  group.addEventListener("click", async (ev) => {
    const action = ev.target.closest("button")?.dataset.tbaf;
    if (!action) return;
    ev.preventDefault();
    const buttons = group.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    try {
      await savePending(app, root, doc);
      const fresh = isPrototype(doc) ? (doc.parent?.prototypeToken ?? doc) : doc;
      if (action === "fit") {
        const r = await enqueue(() => runFit(fresh, { mode: "auto" }));
        if (r.status === "applied") app.render?.();
      } else {
        await openAligner(fresh, { onApply: () => app.render?.() });
      }
    } catch (e) {
      console.error(e);
      ui.notifications.error(e.message);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  });
  // Keep the window tall enough for the extra row (v12 AppV1 auto height).
  app.setPosition?.({ height: "auto" });
}
