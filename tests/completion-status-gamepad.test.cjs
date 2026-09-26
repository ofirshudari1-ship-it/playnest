// Guards for the three improvements added in this pass, informed by researching
// Playnite/GOG Galaxy (see CHANGELOG.md for the full research notes):
//  1. Playnite-style completion status (Playing/Completed/On Hold/Plan to Play/
//     Dropped) — a genuinely new organizing dimension, distinct from the
//     favorites/tags/collections Playnest already had.
//  2. launchCount — existed on the LibraryItem type before this pass but was
//     never actually incremented anywhere; now wired up on every real launch.
//  3. Gamepad/controller navigation for the library grid — Playnite's
//     fullscreen "couch mode" is built around exactly this; this reuses the
//     existing keyboard arrow-nav/Enter/Escape logic instead of a parallel
//     focus model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../electron/store.cjs');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

// ---- Completion status ----

test('DEFAULT_SETTINGS includes completionStatus ({}) and statusFilter ("all")', () => {
  assert.deepEqual(store.DEFAULT_SETTINGS.completionStatus, {});
  assert.equal(store.DEFAULT_SETTINGS.statusFilter, 'all');
});

test('main.cjs exposes item:setCompletionStatus and merges it into library:get, keyed off settings not the scanned item', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /ipcMain\.handle\('item:setCompletionStatus'/);
  assert.match(main, /completionStatus:\s*completionStatus\[item\.id\]\s*\|\|\s*undefined/, 'library:get must merge completionStatus from settings, the same pattern as isFavorite');
});

test('preload.cjs exposes setCompletionStatus', () => {
  const preload = read('electron/preload.cjs');
  assert.match(preload, /setCompletionStatus:\s*\(id, status\)\s*=>\s*ipcRenderer\.invoke\('item:setCompletionStatus'/);
});

test('src/types.ts declares CompletionStatus and the matching Settings fields', () => {
  const types = read('src/types.ts');
  assert.match(types, /export type CompletionStatus = 'playing' \| 'completed' \| 'on_hold' \| 'dropped' \| 'plan_to_play';/);
  assert.match(types, /completionStatus: Record<string, CompletionStatus>;/);
  assert.match(types, /statusFilter: CompletionStatus \| 'all';/);
});

test('src/helpers.ts defines one shared source of truth for status labels/icons, used by groupItems', () => {
  const helpers = read('src/helpers.ts');
  assert.match(helpers, /export const COMPLETION_STATUSES: CompletionStatus\[\]/);
  assert.match(helpers, /export const STATUS_LABEL_KEYS: Record<CompletionStatus, string>/);
  assert.match(helpers, /groupBy === 'status'/);
});

test('en.json and he.json both define the status.* and detailModal.* keys', () => {
  const en = JSON.parse(read('locales/en.json'));
  const he = JSON.parse(read('locales/he.json'));
  for (const dict of [en, he]) {
    for (const key of ['playing', 'completed', 'onHold', 'planToPlay', 'dropped', 'notPlayed']) {
      assert.ok(dict.status?.[key], `Missing status.${key}`);
    }
    assert.ok(dict.detailModal?.statusLabel);
    assert.ok(dict.detailModal?.launchCountLabel);
  }
});

// ---- launchCount ----

test('launchCount is preserved across a rescan (added to PRESERVED_ITEM_FIELDS, same as playtime/lastPlayedAt)', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /const PRESERVED_ITEM_FIELDS = \[[^\]]*'launchCount'[^\]]*\];/, 'launchCount must be in PRESERVED_ITEM_FIELDS or a rescan silently resets it to 0');
});

test('touchLastPlayed increments launchCount on every real launch', () => {
  const main = read('electron/main.cjs');
  const body = main.slice(main.indexOf('function touchLastPlayed'), main.indexOf('function touchLastPlayed') + 400);
  assert.match(body, /launchCount:\s*\(item\.launchCount \|\| 0\)\s*\+\s*1/);
});

// ---- Gamepad/controller navigation ----

test('DEFAULT_SETTINGS includes controllerNavigationEnabled, on by default', () => {
  assert.equal(typeof store.DEFAULT_SETTINGS.controllerNavigationEnabled, 'boolean');
  assert.equal(store.DEFAULT_SETTINGS.controllerNavigationEnabled, true);
});

test('src/hooks/useGamepadNavigation.ts exists and reuses keyboard nav via synthetic KeyboardEvents, not a parallel focus model', () => {
  const hook = read('src/hooks/useGamepadNavigation.ts');
  assert.match(hook, /export function useGamepadNavigation\(enabled: boolean\)/);
  assert.match(hook, /navigator\.getGamepads/);
  assert.match(hook, /new KeyboardEvent\('keydown', \{ key, bubbles: true/);
  // It must dispatch the same key names CategoryRow.tsx's onArrowNavigate already
  // listens for — if these ever drift apart, the gamepad hook silently stops moving focus.
  const categoryRow = read('src/components/Library/CategoryRow.tsx');
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.ok(hook.includes(`'${key}'`), `useGamepadNavigation.ts must dispatch ${key}`);
    assert.ok(categoryRow.includes(key), `CategoryRow.tsx must still handle ${key} for this to have any effect`);
  }
});

test('App.tsx wires useGamepadNavigation to the controllerNavigationEnabled setting', () => {
  const app = read('src/App.tsx');
  assert.match(app, /useGamepadNavigation\(settings\.controllerNavigationEnabled\)/);
});

test('SettingsPanel.tsx exposes a real toggle for controllerNavigationEnabled', () => {
  const panel = read('src/components/Settings/SettingsPanel.tsx');
  assert.match(panel, /checked=\{settings\.controllerNavigationEnabled\}/);
  assert.match(panel, /patchSettings\(\{ controllerNavigationEnabled: e\.target\.checked \}\)/);
});
