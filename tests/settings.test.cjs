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
  assert.match(
    main,
    /label:\s*'Quit Playnest',\s*click:\s*\(\)\s*=>\s*\{\s*isQuitting\s*=\s*true;\s*app\.quit\(\);\s*\}/,
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
