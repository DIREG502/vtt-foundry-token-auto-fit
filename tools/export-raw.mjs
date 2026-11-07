// Dev tool: export test images as raw RGBA (test-output/raw/*.rgba + index.json) so the browser
// harness can time the detector without depending on image decoding (?raw=1).
import fs from "node:fs";
import sharp from "sharp";
fs.mkdirSync("test-output/raw", { recursive: true });
const expected = JSON.parse(fs.readFileSync("test-images/expected.json", "utf8"));
const index = {};
for (const f of Object.keys(expected)) {
  const { data, info } = await sharp(`test-images/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const name = f.replace(/\.\w+$/, ".rgba");
  fs.writeFileSync(`test-output/raw/${name}`, data);
  index[f] = { raw: name, width: info.width, height: info.height };
}
fs.writeFileSync("test-output/raw/index.json", JSON.stringify(index, null, 2));
console.log("exported", Object.keys(index).length);
