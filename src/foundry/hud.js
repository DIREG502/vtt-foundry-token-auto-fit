// Token HUD button: left click = fit, right click = manual alignment. Optional (client setting).

import { t } from "./constants.js";
import { get, S } from "./settings.js";
import { htmlRoot, canModify } from "./compat.js";
import { runFit, openAligner, enqueue } from "./workflow.js";

export function onRenderTokenHUD(hud, html) {
  if (!get(S.hud)) return;
  const root = htmlRoot(html) ?? htmlRoot(hud.element);
  const doc = hud.object?.document;
  if (!root || !doc || !canModify(doc)) return;
  const col = root.querySelector(".col.right") ?? root.querySelector(".right");
  if (!col || col.querySelector(".tbaf-hud")) return;
  // v13 HUD controls are <button>, v12 are <div>; both use the control-icon class.
  const tag = col.querySelector("button.control-icon") ? "button" : "div";
  const btn = document.createElement(tag);
  if (tag === "button") btn.type = "button";
  btn.className = "control-icon tbaf-hud";
  btn.dataset.tooltip = t("Hud.tooltip");
  btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
  btn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); enqueue(() => runFit(doc, { mode: "auto" })); });
  btn.addEventListener("contextmenu", (ev) => { ev.preventDefault(); ev.stopPropagation(); openAligner(doc); });
  col.appendChild(btn);
}
