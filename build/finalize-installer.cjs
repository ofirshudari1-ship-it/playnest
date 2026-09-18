// Per STANDARDS.md §1, the final installer belongs in the project ROOT, not
// buried in a release/ subfolder — electron-builder itself still needs a
// working output directory (win-unpacked/, blockmap, builder-debug.yml), so
// that stays under build/release/ (an allowed "intermediate" location) and
// only the finished .exe is moved up to root. Also removes any older
// Playnest-Setup-*.exe left in root from a previous version, so exactly one
// installer is ever visible there.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'build', 'release');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

const exeName = `Playnest-Setup-${version}.exe`;
const src = path.join(releaseDir, exeName);
if (!fs.existsSync(src)) {
  console.error(`Expected installer not found: ${src}`);
  process.exit(1);
}

for (const old of fs.readdirSync(root)) {
  if (/^Playnest-Setup-.*\.exe$/.test(old) && old !== exeName) {
    fs.unlinkSync(path.join(root, old));
    console.log(`Removed older installer from root: ${old}`);
  }
}

fs.copyFileSync(src, path.join(root, exeName));
console.log(`Installer ready at project root: ${exeName}`);
