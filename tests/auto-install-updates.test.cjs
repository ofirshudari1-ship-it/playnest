// Smoke tests for the Settings > Updates "install automatically on quit" toggle
// (electron/store.cjs autoInstallUpdates, electron/main.cjs wiring, Settings UI) —
// same "defaults + wiring agree across files" pattern as widget.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../electron/store.cjs');

test('DEFAULT_SETTINGS includes autoInstallUpdates as a boolean, true by default (preserves existing behavior)', () => {
  assert.equal(typeof store.DEFAULT_SETTINGS.autoInstallUpdates, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.autoInstallUpdates, true);
});

test('src/types.ts and src/App.tsx agree with electron/store.cjs on autoInstallUpdates', () => {
  const types = fs.readFileSync(path.join(__dirname, '..', 'src', 'types.ts'), 'utf8');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(types, /autoInstallUpdates:\s*boolean/, 'Settings interface missing autoInstallUpdates');
  assert.match(appTsx, /autoInstallUpdates:\s*true/, 'App.tsx DEFAULT_SETTINGS missing autoInstallUpdates');
});

test('main.cjs seeds autoUpdater.autoInstallOnAppQuit from the persisted setting instead of a hardcoded true', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /autoUpdater\.autoDownload\s*=\s*true/, 'autoDownload must stay unconditional');
  assert.match(main, /autoUpdater\.autoInstallOnAppQuit\s*=\s*store\.getSettings\(\)\.autoInstallUpdates/);
  assert.doesNotMatch(main, /autoUpdater\.autoInstallOnAppQuit\s*=\s*true;/, 'autoInstallOnAppQuit must no longer be hardcoded');
});

test('main.cjs applies a live autoInstallUpdates toggle flip from settings:set', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /'autoInstallUpdates' in newSettings\)\s*autoUpdater\.autoInstallOnAppQuit\s*=\s*updated\.autoInstallUpdates/);
});

test('main.cjs update-ready dialog and notification copy is honest about the Windows permission prompt for a perMachine install', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  // Must branch on the live setting rather than always promising a fully automatic install.
  assert.match(main, /const autoInstall = store\.getSettings\(\)\.autoInstallUpdates/);
  assert.match(main, /updateReady\.notifBodyAuto['"]?\s*:\s*['"]?updateReady\.notifBodyManual/);
  assert.match(main, /updateReady\.dialogDetailAuto['"]?\s*:\s*['"]?updateReady\.dialogDetailManual/);
});

test('locales/en.json and locales/he.json define the autoInstallUpdates toggle copy and updateReady dialog/notification strings', () => {
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8'));
  const he = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'he.json'), 'utf8'));
  for (const dict of [en, he]) {
    assert.ok(dict.settings.autoInstallUpdatesTitle);
    assert.ok(dict.settings.autoInstallUpdatesDesc);
    assert.match(dict.settings.autoInstallUpdatesDesc, /Windows|windows/i, 'Description should mention the Windows permission prompt honestly');
    assert.ok(dict.settings.updatesStatusDownloadedManual);
    assert.ok(dict.updateReady, 'Expected an updateReady locale section');
    for (const key of ['title', 'notifBodyAuto', 'notifBodyManual', 'dialogMessage', 'dialogDetailAuto', 'dialogDetailManual', 'restartNow', 'later']) {
      assert.ok(dict.updateReady[key], `updateReady.${key} missing`);
    }
  }
  // No literal em-dash in the new Hebrew strings (hebrew-copywriting rule).
  const heJoined = [he.settings.autoInstallUpdatesDesc, ...Object.values(he.updateReady)].join(' ');
  assert.ok(!heJoined.includes('—'), 'Hebrew copy must use a plain hyphen, never an em-dash');
});

test('SettingsPanel.tsx renders the auto-install-on-quit toggle wired to settings.autoInstallUpdates', () => {
  const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'Settings', 'SettingsPanel.tsx'), 'utf8');
  assert.match(panel, /checked=\{settings\.autoInstallUpdates\}/);
  assert.match(panel, /patchSettings\(\{\s*autoInstallUpdates:\s*e\.target\.checked\s*\}\)/);
  assert.match(panel, /settings\.autoInstallUpdates\s*\?\s*'settings\.updatesStatusDownloaded'\s*:\s*'settings\.updatesStatusDownloadedManual'/);
});
