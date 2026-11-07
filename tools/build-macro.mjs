#!/usr/bin/env node
// Bundles src/macro/macro.js (detector + apply maths + alignment dialog) into one script that
// can be pasted into a Foundry Script macro: dist/token-border-autofit-macro.js
import { build } from "esbuild";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
await build({
  entryPoints: [new URL("../src/macro/macro.js", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")],
  outfile: new URL("../dist/token-border-autofit-macro.js", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
  bundle: true, format: "iife", target: "es2022", charset: "utf8",
  loader: { ".css": "text" }, legalComments: "none", minify: false,
  banner: { js: `// Token Border Auto-Fit — stand-alone macro v${pkg.version} (generated, do not edit)\n// Select tokens and run. Hold Shift while running to always open the manual alignment dialog.\n// Source: https://github.com/DIREG502/token-border-autofit` },
});
const size = fs.statSync(new URL("../dist/token-border-autofit-macro.js", import.meta.url)).size;
console.log(`dist/token-border-autofit-macro.js  ${(size / 1024).toFixed(1)} KiB`);
