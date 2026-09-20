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
