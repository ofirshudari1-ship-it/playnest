// Regression guards for the v3.11.0 audit pass (STANDARDS.md §12, §18, §19, §20).
// Where the logic is pure (history carry-over, last-played resolution, contrast
// ratios) these tests execute it for real rather than only pattern-matching.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

const main = read('electron/main.cjs');

function extract(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not find ${startMarker} … ${endMarker}`);
  return src.slice(start, end);
}

test('a rescan keeps play history (lastPlayedAt, playtime, releaseYear, addedAt) for items it finds again', () => {
  const code = extract(main, 'const PRESERVED_ITEM_FIELDS', 'function mergeScanResults');
  const carryOverItemHistory = new Function(`${code}; return carryOverItemHistory;`)();
  const previous = [
    { id: 'a', name: 'Game A', addedAt: '2026-01-01T00:00:00.000Z', lastPlayedAt: '2026-09-20T10:00:00.000Z', totalPlaytimeMinutes: 42, releaseYear: 2019 },
    { id: 'gone', name: 'Uninstalled', lastPlayedAt: '2026-09-21T10:00:00.000Z' }
  ];
  const fresh = [{ id: 'a', name: 'Game A (rescanned)' }, { id: 'new', name: 'New Game' }];
  const merged = carryOverItemHistory(fresh, previous, 'NOW');
  const a = merged.find((i) => i.id === 'a');
  assert.equal(a.name, 'Game A (rescanned)', 'fresh scan data still wins for scanner-owned fields');
  assert.equal(a.lastPlayedAt, '2026-09-20T10:00:00.000Z');
  assert.equal(a.totalPlaytimeMinutes, 42);
  assert.equal(a.releaseYear, 2019);
  assert.equal(a.addedAt, '2026-01-01T00:00:00.000Z');
  const n = merged.find((i) => i.id === 'new');
  assert.equal(n.addedAt, 'NOW');
  assert.equal(n.lastPlayedAt, undefined);
  assert.equal(merged.length, 2, 'items no longer found are dropped, not resurrected');
});

test('widget "launch last-played" skips items that can no longer be launched and bad timestamps', () => {
  const code = extract(main, 'function isLaunchable', 'function getWidgetData');
  const library = [
    { id: 'uninstalled', name: 'Gone', executable: 'C:/missing.exe', lastPlayedAt: '2026-09-22T10:00:00.000Z' },
    { id: 'garbage', name: 'Bad date', launchCommand: 'steam://run/1', lastPlayedAt: 'not a date' },
    { id: 'steam', name: 'Steam Game', launchCommand: 'steam://run/2', lastPlayedAt: '2026-09-21T10:00:00.000Z' },
    { id: 'older', name: 'Older', launchCommand: 'steam://run/3', lastPlayedAt: '2026-09-01T10:00:00.000Z' }
  ];
  const fakeFs = { existsSync: () => false };
  const fakeStore = { get: () => library };
  const find = new Function('fs', 'store', `${code}; return findMostRecentlyPlayedItem;`)(fakeFs, fakeStore);
  assert.deepEqual(find(), { id: 'steam', name: 'Steam Game' });

  const none = new Function('fs', 'store', `${code}; return findMostRecentlyPlayedItem;`)(fakeFs, { get: () => [library[0]] });
  assert.equal(none(), null);
});

test('widget refreshes periodically so a date-relative streak cannot go stale overnight, and the timer is cleared', () => {
  assert.match(main, /setInterval\(pushWidgetUpdate, WIDGET_REFRESH_MS\)/);
  assert.match(main, /clearInterval\(refreshTimer\)/);
});

test('main window is never maximize()d while hidden (maximize also shows the window)', () => {
  assert.ok(!/if \(initialBounds\.isMaximized\) mainWindow\.maximize\(\);/.test(main), 'maximize() right after creation un-hides the window under the splash');
  assert.match(main, /mainWindow\.once\('show', applyPendingMaximize\)/);
});

test('splash hands over on the renderer ready signal, keeps the 800ms floor and the 8s fail-safe', () => {
  assert.match(main, /const SPLASH_MIN_MS = 800;/);
  assert.match(main, /const SPLASH_MAX_MS = 8000;/);
  assert.match(main, /setTimeout\(revealMainWindow, SPLASH_MAX_MS\)/);
  assert.match(main, /ipcMain\.on\('app:rendererReady'/);
  assert.match(read('electron/preload.cjs'), /notifyReady: \(\) => ipcRenderer\.send\('app:rendererReady'\)/);
  const app = read('src/App.tsx');
  assert.match(app, /notifyReady/);
  assert.ok(!app.includes('MIN_SPLASH_MS'), 'the in-app loading screen must not add a second artificial splash delay');
  assert.ok(!app.includes('splash-bar'), 'no fake progress bar on the in-app loading screen');
  assert.match(read('src/main.tsx'), /notifyReady/, 'ErrorBoundary must reveal the window too');
});

test('every "bring the window back" path recreates a destroyed window instead of no-op', () => {
  assert.match(main, /function showMainWindow\(\)/);
  const code = main.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.ok(!/mainWindow\?\.show\(\)/.test(code), 'mainWindow?.show() is a silent no-op when the window was destroyed');
  const secondInstance = extract(main, "app.on('second-instance'", 'app.whenReady()');
  assert.match(secondInstance, /showMainWindow\(\)/);
});

test('closing the window with minimize-to-tray off really quits even while the widget window is open', () => {
  const closed = extract(main, "mainWindow.on('closed'", 'let revealed = false');
  assert.match(closed, /!store\.getSettings\(\)\.minimizeToTray/);
  assert.match(closed, /app\.quit\(\)/);
});

test('"View changelog" copies CHANGELOG.md out of app.asar before opening it', () => {
  const handler = extract(main, "ipcMain.handle('app:openChangelog'", "ipcMain.handle('library:getAnalytics'");
  assert.match(handler, /app\.getPath\('temp'\)/);
  assert.match(handler, /writeFileSync\(outPath/);
});

// ---- Contrast (WCAG 2.x relative luminance) ----
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('--text-faint meets WCAG AA 4.5:1 on bg, elevated and card surfaces in both themes', () => {
  const css = read('src/styles/global.css');
  const darkBlock = css.slice(css.indexOf(':root {'), css.indexOf("}", css.indexOf(':root {')));
  const lightBlock = css.slice(css.indexOf(":root[data-theme='light']"), css.indexOf('}', css.indexOf(":root[data-theme='light']")));
  for (const block of [darkBlock, lightBlock]) {
    const get = (name) => (block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
    const faint = get('text-faint');
    for (const surface of ['bg', 'bg-elevated', 'bg-card']) {
      const r = ratio(faint, get(surface));
      assert.ok(r >= 4.5, `--text-faint ${faint} on --${surface} ${get(surface)} is ${r.toFixed(2)}:1`);
    }
  }
});

test('Windows High Contrast (forced-colors), prefers-contrast and reduced-motion are handled in every UI surface', () => {
  const css = read('src/styles/global.css');
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  for (const file of ['electron/widget.html', 'electron/splash.html']) {
    assert.match(read(file), /@media \(forced-colors: active\)/, `${file} must not force its gradient over a High Contrast theme`);
  }
});

test('white text on the widget gradient clears 4.5:1 thanks to the dark scrim', () => {
  const blend = (hex, alpha) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  const html = read('electron/widget.html');
  const alpha = Number((html.match(/linear-gradient\(rgba\(0, 0, 0, ([0-9.]+)\)/) || [])[1]);
  assert.ok(alpha > 0, 'electron/widget.html should layer a dark scrim over the brand gradient');
  for (const stop of ['#7c5cff', '#22d3c5']) {
    const r = ratio('#ffffff', blend(stop, alpha));
    assert.ok(r >= 4.5, `electron/widget.html: white on ${stop} + ${alpha} scrim is ${r.toFixed(2)}:1`);
  }
});

// STANDARDS.md §21: splash.html moved off its own violet/teal brand gradient
// onto the shared cross-product palette (#0B1220 -> #2F6FED), keeping the
// same dark-scrim technique as widget.html (now 55%, since the muted
// #94A3B8 .version label needs a stronger scrim than widget.html's white
// text did to clear AA at the lighter #2F6FED end).
test('splash text clears AA contrast on the shared brand gradient thanks to the dark scrim (STANDARDS.md §21.1)', () => {
  const blend = (hex, alpha) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  const html = read('electron/splash.html');
  assert.match(html, /linear-gradient\(135deg,\s*#0B1220\s*0%,\s*#2F6FED\s*100%\)/, 'splash.html should use the shared cross-product gradient');
  const alpha = Number((html.match(/linear-gradient\(rgba\(0, 0, 0, ([0-9.]+)\)/) || [])[1]);
  assert.ok(alpha > 0, 'electron/splash.html should layer a dark scrim over the brand gradient');
  for (const stop of ['#0B1220', '#2F6FED']) {
    const bg = blend(stop, alpha);
    assert.ok(ratio('#EAEAEA', bg) >= 4.5, `electron/splash.html: #EAEAEA text on ${stop} + ${alpha} scrim is ${ratio('#EAEAEA', bg).toFixed(2)}:1`);
    assert.ok(ratio('#94A3B8', bg) >= 4.5, `electron/splash.html: #94A3B8 .version text on ${stop} + ${alpha} scrim is ${ratio('#94A3B8', bg).toFixed(2)}:1`);
  }
});

test('game card keyboard: Enter on the nested play button is not hijacked, and the button shows on focus', () => {
  assert.match(read('src/components/Library/GameCard.tsx'), /if \(e\.target !== e\.currentTarget\) return;/);
  assert.match(read('src/styles/global.css'), /\.game-card:focus-within \.hover-play \{ opacity: 1; \}/);
});

test('library grid supports arrow-key navigation, mirrored in RTL', () => {
  const row = read('src/components/Library/CategoryRow.tsx');
  assert.match(row, /onKeyDown=\{onArrowNavigate\}/);
  assert.match(row, /direction === 'rtl'/);
});

test('TabbedView implements the ARIA tabs pattern (roving tabIndex, arrows, tabpanel link)', () => {
  const tabs = read('src/components/TabbedView.tsx');
  assert.match(tabs, /role="tabpanel"/);
  assert.match(tabs, /aria-controls=/);
  assert.match(tabs, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(tabs, /direction === 'rtl'/);
});

test('sidebar exposes the active view to assistive tech, not by color alone', () => {
  assert.match(read('src/components/Sidebar.tsx'), /aria-current=\{active === key \? 'page' : undefined\}/);
});

test('no physical margin-left/right left in global.css (logical properties mirror in RTL)', () => {
  const css = read('src/styles/global.css');
  assert.ok(!/(^|[\s;{])margin-(left|right):/m.test(css), 'use margin-inline-start/end instead');
});
