import sharp from "sharp";
/** Lay out images (buffers or paths) in a grid of tiles on a checkerboard; returns PNG buffer. */
export async function montage(items, { tile = 360, cols = 4, label = true } = {}) {
  const rows = Math.ceil(items.length / cols);
  const W = cols * tile, H = rows * (tile + (label ? 22 : 0));
  const checker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="c" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#9a9a9a"/><rect width="10" height="10" fill="#bdbdbd"/><rect x="10" y="10" width="10" height="10" fill="#bdbdbd"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const { input, name } = items[i];
    const buf = await sharp(input).resize(tile, tile, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const x = (i % cols) * tile, y = Math.floor(i / cols) * (tile + (label ? 22 : 0));
    comps.push({ input: buf, left: x, top: y });
    if (label) {
      const esc = String(name).replace(/[<&>]/g, "");
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="22"><rect width="100%" height="100%" fill="#111"/><text x="6" y="16" font-family="sans-serif" font-size="13" fill="#fff">${esc}</text></svg>`), left: x, top: y + tile });
    }
  }
  return sharp(checker).composite(comps).png().toBuffer();
}
