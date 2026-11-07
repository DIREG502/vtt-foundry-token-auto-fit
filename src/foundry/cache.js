// Client-side detection cache: in-memory Map backed by localStorage, keyed by
// src + expected shape + detector version, with an image fingerprint to catch files that
// were replaced in place. Entries are a few hundred bytes; the store is capped (LRU).

import { DETECTOR_VERSION } from "../detector/index.js";

const STORE_KEY = `token-border-autofit.cache.v${DETECTOR_VERSION}`;
const LIMIT = 400;
let mem = null;

function load() {
  if (mem) return mem;
  mem = new Map();
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (raw) for (const [k, v] of JSON.parse(raw)) mem.set(k, v);
  } catch { /* private mode / blocked storage: memory only */ }
  return mem;
}

function persist() {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify([...mem.entries()])); } catch { /* quota or blocked */ }
}

const key = (src, hint) => `${hint}|${src}`;

export function cacheGet(src, hint) {
  const m = load();
  const k = key(src, hint);
  const v = m.get(k);
  if (!v) return null;
  m.delete(k); m.set(k, v); // LRU touch
  return v;
}

export function cacheSet(src, hint, entry) {
  const m = load();
  m.set(key(src, hint), { ...entry, t: Date.now() });
  while (m.size > LIMIT) m.delete(m.keys().next().value);
  persist();
}

export function clearCache() {
  mem = new Map();
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}

/** Cheap fingerprint of an RGBA buffer (FNV-1a over a sparse sample plus the size). */
export function fingerprint(img) {
  let h = 0x811c9dc5;
  const d = img.data, step = Math.max(4, ((d.length / 4096) | 0) * 4 + 4);
  for (let i = 0; i < d.length; i += step) {
    h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${img.width}x${img.height}:${h.toString(16)}`;
}
