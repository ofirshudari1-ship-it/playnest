// version.json is the single source of truth for the app version (per
// STANDARDS.md §6) — this copies it into package.json (which electron-builder,
// Electron's own app.getVersion(), and the exe's file-version resource all read)
// so the two files can never silently drift apart. Also stamps today's date as
// the build date, shown in the About screen.
const fs = require('fs');
const path = require('path');

const versionPath = path.join(__dirname, '..', 'version.json');
const pkgPath = path.join(__dirname, '..', 'package.json');

const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
versionData.buildDate = new Date().toISOString().slice(0, 10);
fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== versionData.version) {
  pkg.version = versionData.version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`package.json version synced to ${versionData.version}`);
} else {
  console.log(`package.json already at ${versionData.version}`);
}
