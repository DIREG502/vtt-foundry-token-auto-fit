import { MODULE_ID } from "./constants.js";
import { clearCache } from "./cache.js";

export const S = {
  mode: "mode",
  threshold: "confidenceThreshold",
  edge: "referenceEdge",
  aspect: "aspectMode",
  ring: "ringBehavior",
  pf2e: "pf2eAutoscale",
  prototype: "prototypeTokens",
  fallback: "tryOtherShapes",
  rotation: "rotationTolerance",
  gridless: "gridlessShape",
  squareShape: "squareGridShape",
  debug: "debugOverlay",
  hud: "hudButton",
  cache: "useCache",
  maxSize: "maxDetectSize",
  notify: "notifications",
};

export const get = (key) => game.settings.get(MODULE_ID, key);

export function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `TBAF.Settings.${key}.Name`, hint: `TBAF.Settings.${key}.Hint`, config: true, ...data,
  });
  const choices = (key, list) => Object.fromEntries(list.map((v) => [v, `TBAF.Settings.${key}.Choices.${v}`]));

  reg(S.mode, { scope: "world", type: String, default: "auto", choices: choices(S.mode, ["auto", "ask", "off"]) });
  reg(S.threshold, { scope: "world", type: Number, default: 0.6, range: { min: 0.2, max: 0.95, step: 0.05 } });
  reg(S.edge, { scope: "world", type: String, default: "outer", choices: choices(S.edge, ["outer", "center", "inner"]) });
  reg(S.aspect, { scope: "world", type: String, default: "stretch", choices: choices(S.aspect, ["stretch", "contain", "auto"]) });
  reg(S.ring, { scope: "world", type: String, default: "skip", choices: choices(S.ring, ["skip", "apply"]) });
  reg(S.pf2e, { scope: "world", type: Boolean, default: true, config: game.system?.id === "pf2e" });
  reg(S.prototype, { scope: "world", type: Boolean, default: true });
  reg(S.fallback, { scope: "world", type: Boolean, default: true });
  reg(S.rotation, { scope: "world", type: Number, default: 3, range: { min: 0, max: 10, step: 1 } });
  reg(S.gridless, { scope: "world", type: String, default: "circle", choices: choices("shape", ["circle", "hex-pointy", "hex-flat", "square"]) });
  reg(S.squareShape, { scope: "world", type: String, default: "auto", choices: choices("shape", ["auto", "square", "circle"]) });
  reg(S.debug, { scope: "client", type: Boolean, default: false, onChange: () => canvas?.tokens?.placeables?.forEach((t) => t.renderFlags?.set?.({ refreshState: true })) });
  reg(S.hud, { scope: "client", type: Boolean, default: true });
  reg(S.cache, { scope: "client", type: Boolean, default: true });
  reg(S.maxSize, { scope: "client", type: Number, default: 2048, range: { min: 512, max: 4096, step: 256 } });
  reg(S.notify, { scope: "client", type: Boolean, default: true });

  game.settings.registerMenu(MODULE_ID, "clearCache", {
    name: "TBAF.Settings.clearCache.Name", label: "TBAF.Settings.clearCache.Label", hint: "TBAF.Settings.clearCache.Hint",
    icon: "fas fa-broom", type: ClearCacheMenu, restricted: false,
  });

  game.keybindings.register(MODULE_ID, "fitSelected", {
    name: "TBAF.Keybindings.fitSelected", editable: [], restricted: false,
    onDown: () => { game.modules.get(MODULE_ID).api.fitSelected(); return true; },
  });
  game.keybindings.register(MODULE_ID, "alignSelected", {
    name: "TBAF.Keybindings.alignSelected", editable: [], restricted: false,
    onDown: () => { const tk = canvas.tokens?.controlled?.[0]; if (tk) game.modules.get(MODULE_ID).api.openAligner(tk.document); return true; },
  });
}

/**
 * A settings "menu" that just clears the cache when opened. SettingsConfig only does
 * `new type().render(...)`, so a plain class avoids the deprecated FormApplication.
 */
class ClearCacheMenu {
  render() {
    clearCache();
    ui.notifications.info(game.i18n.localize("TBAF.Notify.cacheCleared"));
    return this;
  }
}
