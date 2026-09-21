// Smoke tests for the persistent desktop widget (electron/widget.html,
// electron/widgetPreload.cjs, main.cjs createWidget/applyWidgetVisibility) —
// same "defaults + wiring agree across files" pattern as settings.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../electron/store.cjs');

test('DEFAULT_SETTINGS includes showDesktopWidget as a boolean, true by default', () => {
  assert.equal(typeof store.DEFAULT_SETTINGS.showDesktopWidget, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.showDesktopWidget, true);
});

test('src/types.ts and src/App.tsx agree with electron/store.cjs on showDesktopWidget', () => {
  const types = fs.readFileSync(path.join(__dirname, '..', 'src', 'types.ts'), 'utf8');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(types, /showDesktopWidget:\s*boolean/, 'Settings interface missing showDesktopWidget');
  assert.match(appTsx, /showDesktopWidget:\s*true/, 'App.tsx DEFAULT_SETTINGS missing showDesktopWidget');
});

test('electron/widget.html and electron/widgetPreload.cjs exist', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'electron', 'widget.html')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'electron', 'widgetPreload.cjs')));
});

test('widget.html is frameless/transparent and uses the brand gradient, matching splash.html\'s treatment', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'electron', 'widget.html'), 'utf8');
  assert.match(html, /linear-gradient\(135deg,\s*#7c5cff\s*0%,\s*#22d3c5\s*100%\)/, 'Expected the real brand gradient, not a flat/generic color');
  assert.match(html, /border-radius/, 'Expected rounded corners');
  assert.match(html, /-webkit-app-region:\s*drag/, 'Expected the card to be draggable');
  assert.match(html, /-webkit-app-region:\s*no-drag/, 'Expected buttons to opt out of the drag region so they stay clickable');
});

test('widgetPreload.cjs exposes exactly the widget IPC surface, isolated from the main window bridge', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'widgetPreload.cjs'), 'utf8');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('playnestWidget'/);
  for (const channel of ['widget:getData', 'widget:openMain', 'widget:launchLastPlayed', 'widget:hide']) {
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('${channel.replace(':', '\\:')}'`), `Expected ${channel} to be wired`);
  }
  assert.match(preload, /ipcRenderer\.on\('widget:data'/, 'Expected a push-update listener for live streak/last-played data');
});

test('main.cjs creates the widget as frameless/transparent/alwaysOnTop and non-focusable so it never steals focus', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /function createWidget/);
  assert.match(main, /frame:\s*false[\s\S]{0,400}?transparent:\s*true[\s\S]{0,400}?alwaysOnTop:\s*true/, 'Expected the widget BrowserWindow options to include frame/transparent/alwaysOnTop');
  assert.match(main, /focusable:\s*false/, 'Widget must not take keyboard focus');
  assert.match(main, /widget\.showInactive\(\)/, 'Widget must be shown without focusing, via showInactive()');
});

test('main.cjs persists the widget position the same way windowState is persisted, and restores only an on-screen position', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /store\.set\('widgetPosition'/, 'Expected the dragged position to be persisted');
  assert.match(main, /function getInitialWidgetPosition/);
  assert.match(main, /getAllDisplays\(\)\.some/, 'Expected an on-screen check before restoring a saved position, mirroring getInitialWindowBounds');
});

test('main.cjs toggles the widget from settings:set and exposes a matching IPC surface', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /function applyWidgetVisibility/);
  assert.match(main, /'showDesktopWidget' in newSettings\)\s*applyWidgetVisibility\(updated\.showDesktopWidget\)/);
  for (const channel of ["'widget:getData'", "'widget:openMain'", "'widget:launchLastPlayed'", "'widget:hide'"]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\(${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('main.cjs reuses computeStreak/performLaunch for the widget instead of duplicating logic', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /function getWidgetData\(\)\s*\{\s*return\s*\{\s*streak:\s*computeStreak\(\)/, 'Widget must reuse the real computeStreak(), not a second implementation');
  assert.match(main, /ipcMain\.handle\('widget:launchLastPlayed',[\s\S]{0,200}?performLaunch\(item\.id\)/, 'Widget launch action must reuse performLaunch (playtime tracking, streak touch, etc.)');
});

test('main.cjs pushes live widget updates on real state changes (a launch, a rescan) instead of relying on polling', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /function pushWidgetUpdate/);
  const touchLastPlayedBody = main.slice(main.indexOf('function touchLastPlayed'), main.indexOf('function touchLastPlayed') + 800);
  assert.match(touchLastPlayedBody, /pushWidgetUpdate\(\)/, 'touchLastPlayed must push a live widget update');
  const mergeScanResultsBody = main.slice(main.indexOf('function mergeScanResults'), main.indexOf('function mergeScanResults') + 800);
  assert.match(mergeScanResultsBody, /pushWidgetUpdate\(\)/, 'mergeScanResults must push a live widget update');
});

test('package.json build.files already packages electron/**/* (covers the new widget.html/widgetPreload.cjs without a build config change)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.build.files.includes('electron/**/*'));
});
