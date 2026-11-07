#!/usr/bin/env node
// Generates synthetic token images with a painted-in border plus exact ground truth.
//
//   node tools/generate-samples.mjs            -> test-images/synthetic-*.png|jpg + expected.json
//
// Every sample stresses something the detector has to cope with: gradient borders, thin
// borders, art covering 30-40 % of the outline, off-centre and non-square images,
// isoluminant (colour-only) borders, decoy shapes in the art, JPEG artefacts, 2048 px input.
// Ground truth is the OUTER edge of the border: centre, bounding-box width/height in the
// shape's own frame, rotation in degrees and stroke thickness.
// Real images placed in test-images/ are left untouched; their entries in expected.json
// are preserved when this script rewrites the synthetic ones.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { shapePoints, insetPolygon, pathD, mulberry32, blobPath } from "./lib/geometry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "test-images");
fs.mkdirSync(OUT, { recursive: true });

const SQ3 = Math.sqrt(3);

/** Regular hex bbox for a given "short" diameter. */
function regularHex(shape, short) {
  return shape === "hex-flat" ? { w: short * 2 / SQ3, h: short } : { w: short, h: short * 2 / SQ3 };
}

const SAMPLES = [
  {
    id: "hex-pointy-gradient", W: 1024, H: 1024, shape: "hex-pointy", cx: 512, cy: 512, short: 860, rot: 0,
    thickness: 30, border: { type: "gradient", from: "#b3121b", to: "#f3e6c8", angle: 70 },
    inside: { color: "#1d2a3a", texture: true }, outside: null,
    art: { kind: "knight", hue: 210, sword: "top-right", legs: true, scale: 1.0 }, seed: 1,
    notes: "Red-to-cream gradient border, sword and legs crossing the border, transparent outside.",
  },
  {
    id: "hex-flat-thin", W: 1200, H: 1200, shape: "hex-flat", cx: 600, cy: 600, short: 1000, rot: 0,
    thickness: 5, border: { type: "solid", color: "#d8b25a" },
    inside: { color: "#3b2f2a", texture: true }, outside: { color: "#cdbb94", texture: true },
    art: { kind: "beast", hue: 20, side: "left", scale: 1.05 }, seed: 2,
    notes: "Thin 5 px gold line, opaque parchment outside, creature covering the left side.",
  },
  {
    id: "hex-pointy-offcenter", W: 1400, H: 1100, shape: "hex-pointy", cx: 640, cy: 590, short: 820, rot: 0,
    thickness: 22, border: { type: "gradient", from: "#2b5d9c", to: "#c9e0f5", angle: 0 },
    inside: { color: "#202020", texture: true }, outside: null,
    art: { kind: "mech", hue: 30, scale: 1.0, cannon: "right" }, seed: 3,
    notes: "Non-square image, border centre is not the image centre, big cannon over the right side.",
  },
  {
    id: "hex-pointy-stretched", W: 1000, H: 1000, shape: "hex-pointy", cx: 505, cy: 492, short: 0, w: 820, h: 880, rot: 1.5,
    thickness: 18, border: { type: "solid", color: "#7a1e7a" },
    inside: { color: "#e8e2d0", texture: true }, outside: null,
    art: { kind: "knight", hue: 120, sword: "bottom-left", legs: false, scale: 0.9 }, seed: 4,
    notes: "Hex stretched ~7 % vs regular, rotated 1.5 degrees, light interior.",
  },
  {
    id: "circle-gold", W: 1000, H: 1000, shape: "circle", cx: 500, cy: 500, short: 0, w: 900, h: 900, rot: 0,
    thickness: 40, border: { type: "bevel", color: "#d4a838", dark: "#4a3208" },
    inside: { color: "#2d4a2d", texture: true }, outside: null,
    art: { kind: "beast", hue: 90, side: "right", scale: 1.15 }, seed: 5,
    notes: "Bevelled gold ring with a dark outer line, ~35 % of the ring covered.",
  },
  {
    id: "square-frame", W: 900, H: 900, shape: "square", cx: 450, cy: 450, short: 0, w: 780, h: 780, rot: 0,
    thickness: 26, border: { type: "gradient", from: "#5a5a5a", to: "#e0e0e0", angle: 45 },
    inside: { color: "#4b3a5a", texture: true }, outside: null,
    art: { kind: "knight", hue: 330, sword: "top-left", legs: true, scale: 0.95 }, seed: 6,
    notes: "Square frame, sword through the top-left corner.",
  },
  {
    id: "hex-pointy-isoluminant", W: 1024, H: 1024, shape: "hex-pointy", cx: 512, cy: 512, short: 900, rot: 0,
    thickness: 24, border: { type: "solid", color: "#3f8f8f" },
    inside: { color: "#9a6a5a", texture: false }, outside: { color: "#8c7468", texture: false },
    art: { kind: "blobs", hue: 15, scale: 0.9 }, seed: 7,
    notes: "Teal border with nearly the same luminance as the brown art and background: chroma-only edge.",
  },
  {
    id: "hex-flat-occluded-decoy", W: 1100, H: 1100, shape: "hex-flat", cx: 560, cy: 540, short: 900, rot: 0,
    thickness: 20, border: { type: "gradient", from: "#e04010", to: "#ffe090", angle: 90 },
    inside: { color: "#162016", texture: true }, outside: null,
    art: { kind: "beast", hue: 0, side: "bottom", scale: 1.35, shield: true }, seed: 8,
    notes: "About 40 % of the border hidden by a large creature; a round shield acts as a decoy circle.",
  },
  {
    id: "hex-pointy-2048", W: 2048, H: 2048, shape: "hex-pointy", cx: 1030, cy: 1018, short: 1780, rot: 0,
    thickness: 46, border: { type: "double", from: "#8a1010", to: "#f0d8b0", line: "#111111", angle: 120 },
    inside: { color: "#28303c", texture: true }, outside: null,
    art: { kind: "mech", hue: 200, scale: 1.0, cannon: "left" }, seed: 9,
    notes: "2048 px benchmark image, gradient band between two dark hairlines.",
  },
  {
    id: "hex-flat-small-border", W: 1200, H: 1000, shape: "hex-flat", cx: 600, cy: 520, short: 560, rot: 0,
    thickness: 14, border: { type: "solid", color: "#e8e8e8" },
    inside: { color: "#203040", texture: true }, outside: null,
    art: { kind: "dragon", hue: 0, scale: 1.0 }, seed: 10,
    notes: "Border uses only ~55 % of the image; wings and tail extend far outside it.",
  },
  {
    id: "hex-pointy-jpeg", W: 1000, H: 1000, shape: "hex-pointy", cx: 500, cy: 500, short: 880, rot: 0,
    thickness: 16, border: { type: "solid", color: "#203060" },
    inside: { color: "#d0c0a0", texture: true }, outside: { color: "#ffffff", texture: false },
    art: { kind: "knight", hue: 40, sword: "top-right", legs: true, scale: 1.0 }, seed: 11, jpeg: true, blur: 1.2,
    notes: "Opaque white background, slight blur, saved as JPEG quality 70.",
  },
  {
    id: "circle-thin-noisy", W: 900, H: 900, shape: "circle", cx: 455, cy: 445, short: 0, w: 760, h: 760, rot: 0,
    thickness: 6, border: { type: "solid", color: "#101010" },
    inside: { color: "#808070", texture: true }, outside: { color: "#707060", texture: true },
    art: { kind: "blobs", hue: 60, scale: 1.0 }, seed: 12,
    notes: "Thin dark circle on a noisy opaque background (gridless style).",
  },
];

function hsl(h, s, l) { return `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`; }

function textureFilter(id, seed, freq = 0.012, octaves = 4) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" result="a"/>
    <feComposite in="SourceGraphic" in2="a" operator="arithmetic" k1="0" k2="1" k3="-0.35" k4="0.05"/>
  </filter>`;
}

function artSvg(s, rng) {
  const { cx, cy } = s;
  const R = Math.max(s.w, s.h) / 2;
  const k = s.art.scale ?? 1;
  const h = s.art.hue;
  const parts = [];
  const shade = `filter="url(#shade)"`;
  if (s.art.kind === "knight") {
    // cape
    parts.push(`<path d="${blobPath(cx, cy + R * 0.15 * k, R * 0.48 * k, R * 0.55 * k, rng, 8, 0.25)}" fill="${hsl(h + 180, 45, 28)}" ${shade}/>`);
    // body
    parts.push(`<path d="${blobPath(cx, cy + R * 0.05 * k, R * 0.30 * k, R * 0.42 * k, rng, 8, 0.15)}" fill="url(#armor)" ${shade}/>`);
    // head
    parts.push(`<circle cx="${cx}" cy="${cy - R * 0.45 * k}" r="${R * 0.16 * k}" fill="${hsl(h, 30, 60)}" ${shade}/>`);
    // legs past the bottom border
    if (s.art.legs) {
      for (const dx of [-0.13, 0.13]) {
        parts.push(`<rect x="${cx + R * (dx - 0.07) * k}" y="${cy + R * 0.35 * k}" width="${R * 0.14 * k}" height="${R * 0.78 * k}" rx="${R * 0.04}" fill="${hsl(h, 25, 35)}" ${shade}/>`);
      }
    }
    // sword: long blade through the border
    const dir = { "top-right": -40, "bottom-left": 140, "top-left": -140 }[s.art.sword] ?? -40;
    const len = R * 1.35 * k;
    parts.push(`<g transform="translate(${cx + R * 0.1} ${cy}) rotate(${dir})">
      <rect x="0" y="${-R * 0.035}" width="${len}" height="${R * 0.07}" fill="url(#steel)" stroke="#222" stroke-width="2"/>
      <rect x="${-R * 0.02}" y="${-R * 0.12}" width="${R * 0.05}" height="${R * 0.24}" fill="#5a3a10"/>
    </g>`);
  } else if (s.art.kind === "beast") {
    const off = { left: [-0.55, 0.05], right: [0.55, 0.1], bottom: [0.05, 0.6] }[s.art.side] ?? [0, 0];
    const bx = cx + off[0] * R, by = cy + off[1] * R;
    parts.push(`<path d="${blobPath(bx, by, R * 0.62 * k, R * 0.5 * k, rng, 11, 0.3, rng() * 90)}" fill="${hsl(h, 50, 32)}" ${shade}/>`);
    parts.push(`<path d="${blobPath(bx - off[0] * R * 0.5, by - off[1] * R * 0.5 - R * 0.1, R * 0.34 * k, R * 0.3 * k, rng, 9, 0.25)}" fill="${hsl(h + 15, 55, 42)}" ${shade}/>`);
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2;
      parts.push(`<path d="${blobPath(bx + Math.cos(a) * R * 0.5 * k, by + Math.sin(a) * R * 0.45 * k, R * 0.12, R * 0.06, rng, 7, 0.3, (a * 180) / Math.PI)}" fill="${hsl(h + 30, 40, 22)}"/>`);
    }
    if (s.art.shield) {
      parts.push(`<circle cx="${cx - R * 0.15}" cy="${cy - R * 0.2}" r="${R * 0.33}" fill="${hsl(45, 60, 45)}" stroke="#f4e3a0" stroke-width="${R * 0.04}" ${shade}/>`);
      parts.push(`<circle cx="${cx - R * 0.15}" cy="${cy - R * 0.2}" r="${R * 0.12}" fill="${hsl(45, 20, 25)}"/>`);
    }
  } else if (s.art.kind === "mech") {
    parts.push(`<rect x="${cx - R * 0.35 * k}" y="${cy - R * 0.4 * k}" width="${R * 0.7 * k}" height="${R * 0.8 * k}" rx="${R * 0.08}" fill="url(#armor)" ${shade}/>`);
    parts.push(`<rect x="${cx - R * 0.15}" y="${cy - R * 0.62}" width="${R * 0.3}" height="${R * 0.22}" rx="${R * 0.04}" fill="${hsl(h, 20, 45)}" ${shade}/>`);
    const dir = s.art.cannon === "left" ? 180 + 12 : -12;
    parts.push(`<g transform="translate(${cx} ${cy - R * 0.05}) rotate(${dir})">
      <rect x="0" y="${-R * 0.08}" width="${R * 1.25}" height="${R * 0.16}" fill="${hsl(h, 15, 30)}" stroke="#111" stroke-width="3"/>
      <rect x="${R * 1.0}" y="${-R * 0.11}" width="${R * 0.2}" height="${R * 0.22}" fill="${hsl(h, 10, 20)}"/>
    </g>`);
    for (const dx of [-0.25, 0.25]) {
      parts.push(`<path d="M${cx + dx * R - R * 0.1} ${cy + R * 0.35} L${cx + dx * R * 1.5 - R * 0.08} ${cy + R * 1.02} L${cx + dx * R * 1.5 + R * 0.12} ${cy + R * 1.02} L${cx + dx * R + R * 0.1} ${cy + R * 0.35} Z" fill="${hsl(h, 18, 38)}" stroke="#111" stroke-width="3"/>`);
    }
  } else if (s.art.kind === "dragon") {
    parts.push(`<path d="${blobPath(cx, cy, R * 0.5, R * 0.35, rng, 10, 0.25)}" fill="#7a1a10" ${shade}/>`);
    for (const sgn of [-1, 1]) {
      parts.push(`<path d="M${cx} ${cy - R * 0.1} L${cx + sgn * R * 1.0} ${cy - R * 0.95} L${cx + sgn * R * 0.95} ${cy - R * 0.35} L${cx + sgn * R * 1.05} ${cy + R * 0.1} L${cx + sgn * R * 0.4} ${cy + R * 0.15} Z" fill="#9a2a18" stroke="#300" stroke-width="3" ${shade}/>`);
    }
    parts.push(`<path d="M${cx + R * 0.2} ${cy + R * 0.25} Q${cx + R * 0.7} ${cy + R * 1.1} ${cx + R * 1.05} ${cy + R * 0.95} L${cx + R * 1.0} ${cy + R * 0.85} Q${cx + R * 0.65} ${cy + R * 0.9} ${cx + R * 0.1} ${cy + R * 0.2} Z" fill="#6a1408"/>`);
  } else if (s.art.kind === "blobs") {
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, d = rng() * R * 0.9;
      parts.push(`<path d="${blobPath(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.15 + rng() * 0.25) * k, R * (0.12 + rng() * 0.2) * k, rng, 9, 0.35, rng() * 180)}" fill="${hsl(h + rng() * 30, 35, 34 + rng() * 10)}" ${shade}/>`);
    }
  }
  return parts.join("\n");
}

function sampleSvg(s) {
  const rng = mulberry32(s.seed * 7919);
  const outer = shapePoints(s.shape, s.cx, s.cy, s.w, s.h, s.rot);
  const t = s.thickness;
  let borderEls = "", clipD;
  const defs = [];
  defs.push(`<linearGradient id="armor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(s.art.hue, 25, 70)}"/><stop offset="1" stop-color="${hsl(s.art.hue, 30, 25)}"/></linearGradient>`);
  defs.push(`<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0f4f8"/><stop offset="1" stop-color="#7a8590"/></linearGradient>`);
  defs.push(`<filter id="shade"><feDropShadow dx="4" dy="6" stdDeviation="6" flood-opacity="0.55"/></filter>`);
  defs.push(textureFilter("tex-in", s.seed));
  defs.push(textureFilter("tex-out", s.seed + 100, 0.02, 3));

  const strokeFor = (b) => {
    if (b.type === "gradient" || b.type === "double") {
      const a = ((b.angle ?? 0) * Math.PI) / 180;
      const x1 = 0.5 - Math.cos(a) / 2, y1 = 0.5 - Math.sin(a) / 2, x2 = 0.5 + Math.cos(a) / 2, y2 = 0.5 + Math.sin(a) / 2;
      defs.push(`<linearGradient id="bgrad" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${b.from}"/><stop offset="1" stop-color="${b.to}"/></linearGradient>`);
      return "url(#bgrad)";
    }
    return b.color;
  };

  if (s.shape === "circle") {
    const rx = s.w / 2, ry = s.h / 2;
    clipD = `M${s.cx - rx} ${s.cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
    const ring = (inset, width, paint) => `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${rx - inset - width / 2}" ry="${ry - inset - width / 2}" fill="none" stroke="${paint}" stroke-width="${width}"/>`;
    if (s.border.type === "bevel") {
      borderEls = ring(0, t, s.border.dark) + ring(t * 0.18, t * 0.64, s.border.color) + ring(t * 0.3, t * 0.12, "#fff6c0");
    } else {
      borderEls = ring(0, t, strokeFor(s.border));
    }
  } else {
    clipD = pathD(outer);
    const band = (inset, width, paint) => `<path d="${pathD(insetPolygon(outer, inset + width / 2))}" fill="none" stroke="${paint}" stroke-width="${width}" stroke-linejoin="miter" stroke-miterlimit="10"/>`;
    if (s.border.type === "double") {
      const paint = strokeFor(s.border);
      borderEls = band(0, t, paint) + band(0, Math.max(2, t * 0.08), s.border.line) + band(t - Math.max(2, t * 0.08), Math.max(2, t * 0.08), s.border.line);
    } else {
      borderEls = band(0, t, strokeFor(s.border));
    }
  }
  defs.push(`<clipPath id="inner"><path d="${clipD}"/></clipPath>`);

  const outside = s.outside
    ? `<rect width="${s.W}" height="${s.H}" fill="${s.outside.color}" ${s.outside.texture ? 'filter="url(#tex-out)"' : ""}/>`
    : "";
  const inside = `<g clip-path="url(#inner)"><rect width="${s.W}" height="${s.H}" fill="${s.inside.color}" ${s.inside.texture ? 'filter="url(#tex-in)"' : ""}/>
     <circle cx="${s.cx}" cy="${s.cy}" r="${Math.max(s.w, s.h) * 0.45}" fill="${hsl(s.art.hue + 40, 30, 50)}" opacity="0.18"/></g>`;
  // Art is drawn partly behind the border (cape inside) and partly on top (protruding parts).
  const art = artSvg(s, rng);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.W}" height="${s.H}" viewBox="0 0 ${s.W} ${s.H}">
  <defs>${defs.join("\n")}</defs>
  ${outside}
  ${inside}
  ${borderEls}
  ${art}
</svg>`;
}

async function main() {
  const expectedPath = path.join(OUT, "expected.json");
  let expected = {};
  if (fs.existsSync(expectedPath)) {
    try { expected = JSON.parse(fs.readFileSync(expectedPath, "utf8")); } catch { expected = {}; }
  }
  // Drop old synthetic entries; keep anything the user annotated by hand.
  for (const k of Object.keys(expected)) if (k.startsWith("synthetic-")) delete expected[k];

  for (const s of SAMPLES) {
    if (s.short) Object.assign(s, regularHex(s.shape, s.short));
    const svg = sampleSvg(s);
    const file = `synthetic-${s.id}.${s.jpeg ? "jpg" : "png"}`;
    let img = sharp(Buffer.from(svg), { density: 72 });
    if (s.blur) img = img.blur(s.blur);
    if (s.jpeg) img = img.flatten({ background: "#ffffff" }).jpeg({ quality: 70 });
    else img = img.png({ compressionLevel: 9 });
    await img.toFile(path.join(OUT, file));
    expected[file] = {
      shape: s.shape,
      cx: +s.cx.toFixed(2), cy: +s.cy.toFixed(2),
      width: +s.w.toFixed(2), height: +s.h.toFixed(2),
      rotation: s.rot, thickness: s.thickness,
      edge: "outer",
      synthetic: true,
      notes: s.notes,
    };
    console.log("wrote", file);
  }
  const sorted = Object.fromEntries(Object.keys(expected).sort().map((k) => [k, expected[k]]));
  fs.writeFileSync(expectedPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log("wrote expected.json with", Object.keys(sorted).length, "entries");
}

main().catch((e) => { console.error(e); process.exit(1); });
