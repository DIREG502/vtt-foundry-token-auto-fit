// Writes a contact sheet of every image in test-images/ to the path given as argv[2].
import fs from "node:fs";
import { montage } from "./lib/montage.mjs";
const files = fs.readdirSync("test-images").filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const buf = await montage(files.map((f) => ({ input: "test-images/" + f, name: f.replace("synthetic-", "") })), { tile: 300 });
fs.writeFileSync(process.argv[2] ?? "test-output/samples.png", buf);
