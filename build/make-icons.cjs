const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'logo.svg');
const sizes = [16, 32, 48, 64, 128, 256];

async function main() {
  const svgBuffer = fs.readFileSync(svgPath);

  // Full-res PNG used as the window/taskbar icon and installer artwork source.
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));

  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(svgBuffer).resize(size, size).png().toBuffer())
  );

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);

  console.log('Generated assets/icon.png and assets/icon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
