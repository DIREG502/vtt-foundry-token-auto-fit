export const MODULE_ID = "token-border-autofit";
export const FLAG = "fit";
export const SHAPES = ["hex-pointy", "hex-flat", "circle", "square"];
export const log = (...args) => console.log(`${MODULE_ID} |`, ...args);
export const warn = (...args) => console.warn(`${MODULE_ID} |`, ...args);
export const t = (key, data) => (data ? game.i18n.format(`TBAF.${key}`, data) : game.i18n.localize(`TBAF.${key}`));
