#!/usr/bin/env node
// Static package checks (no Foundry needed):
//  - module.json parses, has the required keys, and every file it references exists
//  - every JS file under src/ parses
//  - en.json and ru.json have identical key sets and {placeholders}
//  - every TBAF.* key used in the source exists in en.json (settings keys are derived)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (m) => problems.push(m);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir) => fs.readdirSync(path.join(root, dir)).flatMap((n) => {
  const rel = path.join(dir, n);
  return fs.statSync(path.join(root, rel)).isDirectory() ? walk(rel) : [rel.replaceAll("\\", "/")];
});

const manifest = JSON.parse(read("module.json"));
for (const k of ["id", "title", "description", "version", "compatibility", "esmodules", "languages", "manifest", "download"]) if (!(k in manifest)) fail(`module.json: missing ${k}`);
if (manifest.id !== "token-border-autofit") fail("module.json: wrong id");
for (const f of [...manifest.esmodules, ...(manifest.styles ?? []), ...manifest.languages.map((l) => l.path), "README.md", "CHANGELOG.md", "LICENSE"]) {
  if (!fs.existsSync(path.join(root, f))) fail(`missing file referenced by module.json: ${f}`);
}
const pkg = JSON.parse(read("package.json"));
if (pkg.version !== manifest.version) fail(`version mismatch: package.json ${pkg.version} vs module.json ${manifest.version}`);

const js = walk("src").filter((f) => f.endsWith(".js"));
for (const f of js) {
  try { execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "pipe" }); } catch (e) { fail(`syntax: ${f}: ${e.stderr}`); }
}

const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const en = Object.fromEntries(flat(JSON.parse(read("lang/en.json"))));
const ru = Object.fromEntries(flat(JSON.parse(read("lang/ru.json"))));
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const k of Object.keys(en)) {
  if (!(k in ru)) fail(`ru.json missing ${k}`);
  else if (ph(en[k]) !== ph(ru[k])) fail(`placeholder mismatch for ${k}`);
}
for (const k of Object.keys(ru)) if (!(k in en)) fail(`en.json missing ${k} (present in ru)`);

// Keys used in code: t("X.Y") -> TBAF.X.Y, literal "TBAF.X.Y", i18n("X") in align-app -> TBAF.Align.X
const used = new Set();
for (const f of js) {
  const src = read(f);
  for (const m of src.matchAll(/\bt\("([A-Za-z0-9_.-]+)"/g)) used.add(`TBAF.${m[1]}`);
  for (const m of src.matchAll(/"(TBAF\.[A-Za-z0-9_.-]+)"/g)) if (!m[1].endsWith(".")) used.add(m[1]);
  if (f.endsWith("align-app.js")) for (const m of src.matchAll(/i18n\("([A-Za-z0-9_.-]+)"/g)) used.add(`TBAF.Align.${m[1]}`);
}
// Settings: name/hint (+ choices) derived from the S table in settings.js.
const settingsSrc = read("src/foundry/settings.js");
for (const m of settingsSrc.matchAll(/^\s+\w+: "(\w+)",$/gm)) {
  used.add(`TBAF.Settings.${m[1]}.Name`); used.add(`TBAF.Settings.${m[1]}.Hint`);
}
for (const m of settingsSrc.matchAll(/choices\((S\.\w+|"\w+"), \[([^\]]+)\]\)/g)) {
  const key = m[1].startsWith('"') ? m[1].slice(1, -1) : settingsSrc.match(new RegExp(`${m[1].slice(2)}: "(\\w+)"`))[1];
  for (const v of m[2].split(",").map((s) => s.trim().slice(1, -1))) used.add(`TBAF.Settings.${key}.Choices.${v}`);
}
for (const k of used) if (!(k in en)) fail(`missing localization key: ${k}`);

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ package OK: ${js.length} JS files, ${Object.keys(en).length} localization keys (${used.size} referenced), manifest files present`);
