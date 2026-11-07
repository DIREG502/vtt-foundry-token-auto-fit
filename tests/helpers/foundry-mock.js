// Minimal Foundry v13-like environment for exercising the integration code in Node.
// It is NOT Foundry: geometry methods follow the documented v13 behaviour closely enough to
// test that the module wires API values through correctly (the maths itself is tested
// separately in fit-math.test.js).

const SQ3 = Math.sqrt(3);

export const utils = {
  deepClone: (o) => (o === undefined ? o : structuredClone(o)),
  getProperty(obj, key) { return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); },
  setProperty(obj, key, value) {
    const parts = key.split("."); let o = obj;
    for (const k of parts.slice(0, -1)) { if (typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k]; }
    o[parts.at(-1)] = value; return true;
  },
  flattenObject(obj, _d = 0) {
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length) {
        for (const [k2, v2] of Object.entries(utils.flattenObject(v))) out[`${k}.${k2}`] = v2;
      } else out[k] = v;
    }
    return out;
  },
  expandObject(obj) { const out = {}; for (const [k, v] of Object.entries(obj)) utils.setProperty(out, k, v); return out; },
  mergeObject(target, source) {
    if (!source) return target;
    const src = Object.keys(source).some((k) => k.includes(".")) ? utils.expandObject(source) : source;
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") utils.mergeObject(target[k], v);
      else target[k] = utils.deepClone(v);
    }
    return target;
  },
};

export class MockHooks {
  constructor() { this.handlers = new Map(); }
  on(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(fn); return fn; }
  once(name, fn) { return this.on(name, fn); }
  call(name, ...args) { for (const fn of this.handlers.get(name) ?? []) if (fn(...args) === false) return false; return true; }
  callAll(name, ...args) { for (const fn of this.handlers.get(name) ?? []) fn(...args); return true; }
}

export function makeScene({ type = "hex-pointy", size = 100 } = {}) {
  const G = MOCK_CONST.GRID_TYPES;
  const t = { "hex-pointy": G.HEXODDR, "hex-flat": G.HEXODDQ, square: G.SQUARE, gridless: G.GRIDLESS }[type];
  const isHex = type.startsWith("hex");
  const columns = type === "hex-flat";
  const grid = {
    type: t, size, isHexagonal: isHex, columns, isGridless: t === G.GRIDLESS,
    sizeX: isHex && columns ? size * 2 / SQ3 : size,
    sizeY: isHex && !columns ? size * 2 / SQ3 : size,
  };
  return { documentName: "Scene", id: `scene-${type}`, grid };
}

export const MOCK_CONST = {
  GRID_TYPES: { GRIDLESS: 0, SQUARE: 1, HEXODDR: 2, HEXEVENR: 3, HEXODDQ: 4, HEXEVENQ: 5 },
  TOKEN_SHAPES: { ELLIPSE_1: 0, ELLIPSE_2: 1, TRAPEZOID_1: 2, TRAPEZOID_2: 3, RECTANGLE_1: 4, RECTANGLE_2: 5 },
};

const TOKEN_DEFAULTS = () => ({
  name: "Token", x: 0, y: 0, width: 1, height: 1, rotation: 0, lockRotation: false, shape: 2,
  texture: { src: "tokens/a.webp", fit: "contain", scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 },
  ring: { enabled: false }, flags: {},
});

export class MockTokenDocument {
  constructor(data = {}, { parent = null } = {}) {
    this._source = utils.mergeObject(TOKEN_DEFAULTS(), utils.deepClone(data));
    this.parent = parent;
    this.object = null;
    this.updates = [];
    this.prepare();
  }
  get documentName() { return "Token"; }
  prepare() { for (const [k, v] of Object.entries(utils.deepClone(this._source))) this[k] = v; }
  reset() { this.prepare(); }
  canUserModify() { return true; }
  getSize({ width = this.width, height = this.height } = {}) {
    const g = this.parent?.grid ?? makeScene({ type: "square" }).grid;
    let w = width, h = height;
    if (g.isHexagonal) { if (g.columns) w = 0.75 * Math.floor(width) + 0.25; else h = 0.75 * Math.floor(height) + 0.25; }
    return { width: w * g.sizeX, height: h * g.sizeY };
  }
  getCenterPoint(data = {}) {
    const s = this.getSize(data);
    return { x: (data.x ?? this.x) + s.width / 2, y: (data.y ?? this.y) + s.height / 2, elevation: 0 };
  }
  getGridSpacePolygon(data = {}) {
    if (this.parent?.grid?.isGridless) return undefined;
    const s = this.getSize(data), x = data.x ?? this.x, y = data.y ?? this.y;
    return [{ x, y }, { x: x + s.width, y }, { x: x + s.width, y: y + s.height }, { x, y: y + s.height }];
  }
  updateSource(changes) { utils.mergeObject(this._source, changes); this.prepare(); }
  async update(changes, options = {}) {
    const c = utils.deepClone(changes);
    if (globalThis.Hooks.call("preUpdateToken", this, c, options, globalThis.game.user.id) === false) return this;
    utils.mergeObject(this._source, c); this.prepare();
    this.updates.push({ changes: c, options });
    globalThis.Hooks.callAll("updateToken", this, c, options, globalThis.game.user.id);
    return this;
  }
  /** Simulate Document.create: preCreate hook may mutate via updateSource, then createToken. */
  static async create(data, { parent } = {}) {
    const doc = new this(data, { parent });
    const options = {};
    if (globalThis.Hooks.call("preCreateToken", doc, data, options, globalThis.game.user.id) === false) return null;
    globalThis.Hooks.callAll("createToken", doc, options, globalThis.game.user.id);
    return doc;
  }
}

export function installFoundryMock({ system = "lancer", settings = {} } = {}) {
  const store = new Map();
  const notes = [];
  globalThis.Hooks = new MockHooks();
  globalThis.CONST = MOCK_CONST;
  globalThis.CONFIG = { Token: { documentClass: MockTokenDocument } };
  globalThis.foundry = { utils, data: {}, applications: { api: {} }, canvas: {} };
  globalThis.canvas = { scene: makeScene({ type: "hex-pointy" }), tokens: { controlled: [] } };
  globalThis.ui = { notifications: { info: (m) => notes.push(["info", m]), warn: (m) => notes.push(["warn", m]), error: (m) => notes.push(["error", m]) } };
  const modules = new Map([["token-border-autofit", { id: "token-border-autofit" }]]);
  globalThis.game = {
    release: { generation: 13 },
    user: { id: "user1" },
    system: { id: system },
    modules,
    scenes: { viewed: globalThis.canvas.scene },
    i18n: { localize: (k) => k, format: (k, d) => `${k} ${JSON.stringify(d)}` },
    settings: {
      register(ns, key, data) { store.set(key, key in settings ? settings[key] : data.default); },
      registerMenu() {},
      get(ns, key) { return store.get(key); },
      set(ns, key, v) { store.set(key, v); },
    },
    keybindings: { register() {} },
  };
  globalThis.getDocumentClass = () => MockTokenDocument;
  return { store, notes };
}
