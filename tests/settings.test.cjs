// Smoke tests for the settings added in this pass (grid density, quick-launch
// hotkey) — guards against the store's defaults silently drifting from what
// the renderer (src/types.ts, src/App.tsx) and the CSS (src/styles/global.css)
// actually expect, the same kind of gap version.test.cjs guards for versions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../electron/store.cjs');

test('DEFAULT_SETTINGS includes a valid gridDensity default', () => {
  assert.ok(['compact', 'comfortable', 'large'].includes(store.DEFAULT_SETTINGS.gridDensity));
});

test('DEFAULT_SETTINGS includes quickLaunchHotkeyEnabled as a boolean', () => {
  assert.equal(typeof store.DEFAULT_SETTINGS.quickLaunchHotkeyEnabled, 'boolean');
});

test('global.css defines a card-w/card-gap rule for every GridDensity value', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'global.css'), 'utf8');
  for (const density of ['compact', 'comfortable', 'large']) {
    assert.match(
      css,
      new RegExp(`\\.category-row\\.density-${density}\\s*\\{[^}]*--card-w`),
      `Missing a --card-w rule for .category-row.density-${density} in global.css`
    );
  }
});

test('main.cjs registers and tears down the quick-launch global shortcut', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /globalShortcut\.register\(/, 'Expected the quick-launch hotkey to be registered');
  assert.match(main, /globalShortcut\.unregisterAll\(\)/, 'Expected shortcuts to be released on will-quit (STANDARDS.md §11.9-style cleanup)');
});

test('DEFAULT_SETTINGS includes launchOnStartup and startMinimized as booleans, both off by default', () => {
  assert.equal(typeof store.DEFAULT_SETTINGS.launchOnStartup, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.launchOnStartup, false);
  assert.equal(typeof store.DEFAULT_SETTINGS.startMinimized, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.startMinimized, false);
});

test('main.cjs wires launchOnStartup/startMinimized to a real setLoginItemSettings call', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /app\.setLoginItemSettings\(/, 'Expected a real Windows login-item registration, not a fake toggle');
  assert.match(main, /'launchOnStartup' in newSettings/, 'Expected settings:set to re-apply the login item when launchOnStartup changes');
});

test('main.cjs checks for the real Playnest GitHub repo, not a placeholder', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /api\.github\.com\/repos\/ofirshudari1-ship-it\/playnest\/releases\/latest/, 'UPDATE_CHECK_URL must point at the real repo or the update banner silently never fires');
});

test('src/types.ts and src/App.tsx agree with electron/store.cjs on the new Settings fields', () => {
  const types = fs.readFileSync(path.join(__dirname, '..', 'src', 'types.ts'), 'utf8');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  for (const field of ['launchOnStartup', 'startMinimized']) {
    assert.match(types, new RegExp(`${field}: boolean`), `Settings interface missing ${field}`);
    assert.match(appTsx, new RegExp(`${field}: false`), `App.tsx DEFAULT_SETTINGS missing ${field}`);
  }
});

// --- Tray / background-activity pass ---

test('DEFAULT_SETTINGS defaults minimizeToTray to true (was false) and App.tsx agrees', () => {
  assert.equal(store.DEFAULT_SETTINGS.minimizeToTray, true);
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(appTsx, /minimizeToTray: true/, 'App.tsx DEFAULT_SETTINGS must match the new tray-by-default behavior');
});

test('DEFAULT_SETTINGS includes trayClickAction ("single") and backgroundActivityNotifications (false)', () => {
  assert.equal(store.DEFAULT_SETTINGS.trayClickAction, 'single');
  assert.equal(typeof store.DEFAULT_SETTINGS.backgroundActivityNotifications, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.backgroundActivityNotifications, false);
});

test('main.cjs sets isQuitting before app.quit() in the Quit Playnest tray item, so close handler cannot re-intercept it', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  // The label is now i18n'd via mt('trayMenu.quitPlaynest') (see LOCALES/mt
  // near the top of main.cjs) instead of the hardcoded English literal, so
  // this only pins down the click handler's ordering, not the label text.
  assert.match(
    main,
    /label:\s*mt\('trayMenu\.quitPlaynest'\),\s*click:\s*\(\)\s*=>\s*\{\s*isQuitting\s*=\s*true;\s*app\.quit\(\);\s*\}/,
    'Quit Playnest must set isQuitting = true before app.quit(), in that order, on the same click handler'
  );
});

test('main.cjs close handler only intercepts close when minimizeToTray is on AND not already quitting', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /store\.getSettings\(\)\.minimizeToTray\s*&&\s*!isQuitting/, 'close handler must gate on both minimizeToTray and !isQuitting');
});

test('main.cjs applies and re-applies tray click behavior (single vs double click)', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /function applyTrayClickBehavior/, 'Expected an applyTrayClickBehavior function');
  assert.match(main, /'trayClickAction' in newSettings\)\s*applyTrayClickBehavior\(\)/, 'settings:set must re-apply tray click behavior when trayClickAction changes');
  assert.match(main, /tray\.on\('double-click'/, "Expected a 'double-click' listener path for trayClickAction: 'double'");
});

test('main.cjs builds a real Windows jump-list via app.setJumpList and wires --launch=<id> back through the single-instance lock', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /app\.setJumpList\(/, 'Expected a real taskbar jump-list, not a decorative one');
  assert.match(main, /function launchFromArgv/, 'Expected a launchFromArgv helper to parse --launch=<id>');
  assert.match(main, /second-instance',\s*\(event,\s*argv\)\s*=>\s*\{[\s\S]*?launchFromArgv\(argv\)/, "second-instance handler must forward argv into launchFromArgv");
});

test('main.cjs shows a system notification for a downloaded update when the window is hidden, and gates the background-activity notification behind the opt-in setting', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /windowHidden/, 'Expected update-downloaded to branch on whether the window is currently visible');
  assert.match(main, /function notifyBackgroundActivity/, 'Expected a notifyBackgroundActivity helper');
  assert.match(main, /if\s*\(!store\.getSettings\(\)\.backgroundActivityNotifications\)\s*return;/, 'notifyBackgroundActivity must be gated behind the opt-in setting');
});

test('src/types.ts declares trayClickAction and backgroundActivityNotifications, matching electron/store.cjs', () => {
  const types = fs.readFileSync(path.join(__dirname, '..', 'src', 'types.ts'), 'utf8');
  assert.match(types, /trayClickAction:\s*'single'\s*\|\s*'double'/);
  assert.match(types, /backgroundActivityNotifications:\s*boolean/);
});

// --- Installer -> app first-run language handoff ---
//
// electron/store.cjs's detectInstallLanguage() and Electron's `app` mock (the
// npm 'electron' package resolves to a plain path string outside a real
// Electron runtime, so app.getPath/app.getLocale can't actually be invoked
// here) mean this can't be exercised end-to-end under `node --test`. Instead,
// these pin down the two halves of the handoff by source inspection, the same
// static-assertion pattern the jump-list/tray tests above already use: the
// NSIS installer writes the marker on a fresh install only, and store.cjs
// reads-then-deletes that exact marker before falling back to app.getLocale().
test('build/installer.nsh writes a first-run-language marker on a fresh install only, using $LANGUAGE', () => {
  const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  assert.match(nsh, /!macro WriteFirstRunLanguageMarker/, 'Expected a WriteFirstRunLanguageMarker macro');
  assert.match(nsh, /\$LANGUAGE == 1037/, 'Expected the marker to branch on the NSIS language-selector value (1037 = Hebrew)');
  assert.match(nsh, /FileOpen \$8 "\$APPDATA\\playnest\\first-run-language\.txt" w/, 'Marker must be written to the same userData dir electron-store uses');
  assert.match(
    nsh,
    /\$\{ifNot\}\s*\$\{FileExists\}\s*"\$APPDATA\\playnest\\playnest-library\.json"[\s\S]*?FileOpen \$8 "\$APPDATA\\playnest\\first-run-language\.txt"/,
    'Marker must only be written when no existing store file is present, so an update/reinstall never clobbers a saved language choice'
  );
  assert.match(nsh, /!insertmacro WriteFirstRunLanguageMarker/, 'customInit must actually call the macro, not just define it');
});

test('electron/store.cjs consumes the installer marker before falling back to app.getLocale()', () => {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'electron', 'store.cjs'), 'utf8');
  assert.match(storeSrc, /first-run-language\.txt/, 'Expected detectInstallLanguage to read the NSIS-written marker file');
  assert.match(storeSrc, /fs\.unlinkSync\(markerPath\)/, 'Marker must be deleted once consumed, so it is never re-read on a later launch');
  // Both phrases also appear in the explanatory comment above the function —
  // scope the ordering check to the function body itself (from its
  // declaration onward) so that comment can't accidentally satisfy it.
  const fnStart = storeSrc.indexOf('function detectInstallLanguage');
  assert.ok(fnStart > -1, 'Expected a detectInstallLanguage function');
  const markerIdx = storeSrc.indexOf('first-run-language.txt', fnStart);
  const localeIdx = storeSrc.indexOf('app.getLocale()', fnStart);
  assert.ok(markerIdx > -1 && localeIdx > -1 && markerIdx < localeIdx, 'The installer marker must be checked before the app.getLocale() fallback, not after');
});
