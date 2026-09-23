// Generates the NSIS installer's branded bitmaps (header banner + welcome/finish
// sidebar) from the same logo.svg used for the app icon, so the installer actually
// looks like it belongs to the app instead of showing NSIS's generic default art.
// NSIS's LoadBitmap-based header/sidebar images must be plain 24-bit BMPs (no
// alpha) — sharp doesn't emit BMP, so we rasterize to raw RGB and write the BMP
// container by hand (a 24bpp uncompressed BMP is a simple, well-defined format).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'logo.svg');

function writeBmp24(rawRgbBuffer, width, height, outPath) {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows are padded to 4-byte boundary
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buf = Buffer.alloc(fileSize);
  // BITMAPFILEHEADER
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10); // pixel data offset

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // no compression
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38); // ~72 DPI
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixel data: BMP rows are stored bottom-up, BGR order, padded per row.
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // flip to bottom-up
    const rowStart = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 3;
      const dstIdx = rowStart + x * 3;
      buf[dstIdx] = rawRgbBuffer[srcIdx + 2]; // B
      buf[dstIdx + 1] = rawRgbBuffer[srcIdx + 1]; // G
      buf[dstIdx + 2] = rawRgbBuffer[srcIdx]; // R
    }
  }
  fs.writeFileSync(outPath, buf);
}

async function svgToBmp(svg, width, height, outPath) {
  const { data } = await sharp(Buffer.from(svg))
    .resize(width, height)
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  writeBmp24(data, width, height, outPath);
  console.log(`Generated ${path.relative(process.cwd(), outPath)} (${width}x${height})`);
}

async function main() {
  const logoSvg = fs.readFileSync(svgPath, 'utf8');
  // Re-embed the logo's inner markup (drop its own width/height/viewBox wrapper)
  // at whatever size each composite SVG below needs.
  const logoInner = logoSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  // Header banner (top of every "assisted installer" page): small mark + wordmark
  // on white, right-aligned per MUI_HEADERIMAGE_RIGHT. Left as white per NSIS
  // convention (the header strip sits above the page content, not part of the
  // dark brand banner) — wordmark color updated to the shared accent blue so
  // it still reads as the same brand as the sidebar below.
  const header = `
    <svg width="150" height="57" viewBox="0 0 150 57" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="57" fill="#ffffff"/>
      <g transform="translate(96,8) scale(0.0393)">${logoInner}</g>
      <text x="90" y="35" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700" fill="#0B1220">Playnest</text>
    </svg>`;
  await svgToBmp(header, 150, 57, path.join(assetsDir, 'installerHeader.bmp'));

  // Welcome/finish sidebar: shared cross-product brand banner (STANDARDS.md
  // §21 — "IObit-style" unified installer+splash across OptiGuard/Playnest/
  // ActionClip/SnapCap). Same dark base + accent-blue gradient in every
  // tool's installer sidebar, so people immediately recognize one company
  // made all of them — only the mark/wordmark inside stays product-specific.
  // Was a Playnest-only violet->teal gradient; replaced with the shared
  // palette from STANDARDS.md §21.1 (#0B1220 base, #2F6FED accent, #5B9AFF
  // accent-light, #94A3B8 muted text) per that decision.
  const sidebar = `
    <svg width="164" height="314" viewBox="0 0 164 314" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0B1220"/>
          <stop offset="55%" stop-color="#0B1220"/>
          <stop offset="100%" stop-color="#2F6FED"/>
        </linearGradient>
      </defs>
      <rect width="164" height="314" fill="url(#bg)"/>
      <rect x="0" y="274" width="164" height="40" fill="#5B9AFF" opacity="0.16"/>
      <g transform="translate(32,60) scale(0.0875)">${logoInner}</g>
      <text x="82" y="185" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="19" font-weight="800" fill="#EAEAEA">Playnest</text>
      <text x="82" y="208" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10.5" fill="#94A3B8">Your game library,</text>
      <text x="82" y="222" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10.5" fill="#94A3B8">organized</text>
    </svg>`;
  await svgToBmp(sidebar, 164, 314, path.join(assetsDir, 'installerSidebar.bmp'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
