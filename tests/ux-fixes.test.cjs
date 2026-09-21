// Guards for the three UX fixes in this pass:
//  1. Sidebar "Tools" consolidated from 8 flat nav items into 3 grouped hubs.
//  2. Library/analytics-style pages use the wide .wide-panel container, not
//     the narrow 560px .settings-panel meant for forms.
//  3. The missing-cover-art hint banner shows/hides on the right conditions
//     and stays dismissed once dismissed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../electron/store.cjs');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('Sidebar Tools section has 3 hub entries, not 8 flat items', () => {
  const sidebar = read('src/components/Sidebar.tsx');
  const toolsSection = sidebar.split("t('sidebar.tools')")[1] || '';
  const navItemCalls = toolsSection.split("<div className=\"nav-divider\"")[0];
  const matches = navItemCalls.match(/item\(/g) || [];
  assert.equal(matches.length, 3, `Expected 3 nav-item() calls in the Tools section, found ${matches.length}`);
  assert.match(navItemCalls, /'performance-hub'/);
  assert.match(navItemCalls, /'insights-hub'/);
  assert.match(navItemCalls, /'system-hub'/);
});

test('Sidebar ViewKey no longer exposes the old 8 flat tool view keys', () => {
  const sidebar = read('src/components/Sidebar.tsx');
  for (const old of ["'performance'", "'streak'", "'benchmark'", "'analytics'", "'recommendations'", "'insights'", "'storage'", "'hardware'"]) {
    assert.ok(!sidebar.includes(`| ${old}`), `ViewKey should no longer include ${old} as a top-level view`);
  }
});

test('App.tsx renders each consolidated hub as a TabbedView with 2-3 tabs', () => {
  const app = read('src/App.tsx');
  assert.match(app, /view === 'performance-hub'[\s\S]{0,400}TabbedView/);
  assert.match(app, /view === 'insights-hub'[\s\S]{0,400}TabbedView/);
  assert.match(app, /view === 'system-hub'[\s\S]{0,400}TabbedView/);
});

test('Analytics/Recommendations/Insights/Storage views use the wide panel, not the narrow settings form width', () => {
  for (const file of [
    'src/components/AnalyticsView.tsx',
    'src/components/RecommendationsView.tsx',
    'src/components/InsightsView.tsx',
    'src/components/StorageView.tsx'
  ]) {
    const src = read(file);
    assert.match(src, /className="wide-panel"/, `${file} should use .wide-panel`);
    assert.ok(!src.includes('className="settings-panel"'), `${file} should not reuse the narrow .settings-panel`);
  }
});

test('global.css defines .wide-panel wider than .settings-panel', () => {
  const css = read('src/styles/global.css');
  const settingsMax = Number((css.match(/\.settings-panel\s*\{\s*max-width:\s*(\d+)px/) || [])[1]);
  const wideMax = Number((css.match(/\.wide-panel\s*\{[^}]*max-width:\s*(\d+)px/) || [])[1]);
  assert.ok(settingsMax > 0 && wideMax > 0, 'Expected both max-width rules to be found');
  assert.ok(wideMax > settingsMax, `.wide-panel (${wideMax}px) should be wider than .settings-panel (${settingsMax}px)`);
});

test('.content-scroll hides horizontal overflow so no view can force a horizontal scrollbar', () => {
  const css = read('src/styles/global.css');
  assert.match(css, /\.content-scroll\s*\{[^}]*overflow-x:\s*hidden/);
});

test('DEFAULT_SETTINGS includes coverArtBannerDismissed as a boolean, off by default', () => {
  assert.equal(typeof store.DEFAULT_SETTINGS.coverArtBannerDismissed, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.coverArtBannerDismissed, false);
});

// Re-implements the same predicate as src/components/CoverArtHintBanner.tsx's
// shouldShowCoverArtBanner so the show/hide contract is covered without a TSX
// build step in the test runner (this project's tests run directly via
// `node --test`, see package.json).
function shouldShowCoverArtBanner(settings, library) {
  if (settings.coverArtBannerDismissed) return false;
  if (settings.steamGridApiKey && settings.steamGridApiKey.trim()) return false;
  return library.some((item) => !item.coverArt);
}

test('cover art banner shows when no API key is set and some items lack cover art', () => {
  const settings = { steamGridApiKey: '', coverArtBannerDismissed: false };
  const library = [{ id: '1', coverArt: null }, { id: '2', coverArt: 'x.png' }];
  assert.equal(shouldShowCoverArtBanner(settings, library), true);
});

test('cover art banner stays hidden once a key is set', () => {
  const settings = { steamGridApiKey: 'abc123', coverArtBannerDismissed: false };
  const library = [{ id: '1', coverArt: null }];
  assert.equal(shouldShowCoverArtBanner(settings, library), false);
});

test('cover art banner stays hidden once dismissed, even with no key and missing art', () => {
  const settings = { steamGridApiKey: '', coverArtBannerDismissed: true };
  const library = [{ id: '1', coverArt: null }];
  assert.equal(shouldShowCoverArtBanner(settings, library), false);
});

test('cover art banner stays hidden when every item already has cover art', () => {
  const settings = { steamGridApiKey: '', coverArtBannerDismissed: false };
  const library = [{ id: '1', coverArt: 'a.png' }, { id: '2', coverArt: 'b.png' }];
  assert.equal(shouldShowCoverArtBanner(settings, library), false);
});

test('src/components/CoverArtHintBanner.tsx exports the real predicate the test above mirrors', () => {
  const src = read('src/components/CoverArtHintBanner.tsx');
  assert.match(src, /export function shouldShowCoverArtBanner/);
  assert.match(src, /settings\.coverArtBannerDismissed/);
  assert.match(src, /settings\.steamGridApiKey/);
  assert.match(src, /!item\.coverArt/);
});
