// Smoke tests for the scanner's correctness-critical pure logic — the part of
// the codebase most directly responsible for "don't show the user a broken
// tile." Run with `npm test` (node --test tests/). No Electron runtime needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { _internal } = require('../electron/scanner.cjs');
const { isLaunchableExe, normalizeForDedup, dedupeByName, isUsableEntry, guessGenre } = _internal;

test('isLaunchableExe rejects real-world installer/uninstaller names', () => {
  const rejected = [
    'setup.exe', 'Setup64.exe', 'unins000.exe', 'uninstall.exe',
    'vc_redist.x64.exe', 'vcredist_x64.exe', 'dxsetup.exe',
    'CrashHandler.exe', 'crashpad_handler.exe', 'update.exe',
    'Updater.exe', 'patcher.exe', 'Installer.exe'
  ];
  for (const name of rejected) {
    assert.equal(isLaunchableExe(name), false, `expected ${name} to be rejected`);
  }
});

test('isLaunchableExe accepts real game/app executable names', () => {
  const accepted = [
    'Discord.exe', 'GameLauncher.exe', 'RiotClientServices.exe',
    'csgo.exe', 'Patchwork.exe', 'Undertale.exe', 'Settlers.exe'
  ];
  for (const name of accepted) {
    assert.equal(isLaunchableExe(name), true, `expected ${name} to be accepted`);
  }
});

test('normalizeForDedup collapses case and trailing-version-number differences', () => {
  assert.equal(normalizeForDedup('Counter-Strike 2'), normalizeForDedup('counter strike 2'));
  assert.equal(normalizeForDedup('Half-Life 2'), normalizeForDedup('Half-Life'));
});

test('dedupeByName keeps the highest-trust source for the same product', () => {
  const items = [
    { id: 'a', name: 'Elden Ring', source: 'folder', installPath: 'C:\\Games\\EldenRing' },
    { id: 'b', name: 'Elden Ring', source: 'steam', installPath: 'C:\\Steam\\EldenRing' }
  ];
  const result = dedupeByName(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'steam');
});

test('dedupeByName also collapses two differently-named entries at the same install path', () => {
  const items = [
    { id: 'a', name: 'My Game (Folder Scan)', source: 'folder', installPath: 'C:\\Games\\Thing' },
    { id: 'b', name: 'My Game', source: 'registry', installPath: 'C:\\Games\\Thing' }
  ];
  const result = dedupeByName(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'registry');
});

test('isUsableEntry exempts Steam entries regardless of local files', () => {
  assert.equal(isUsableEntry({ source: 'steam', executable: null, installPath: null }), true);
});

test('isUsableEntry accepts an entry with a real, existing executable', () => {
  assert.equal(isUsableEntry({ source: 'registry', executable: process.execPath, installPath: null }), true);
});

test('isUsableEntry accepts an entry with a real, existing install folder', () => {
  assert.equal(isUsableEntry({ source: 'registry', executable: null, installPath: __dirname }), true);
});

test('isUsableEntry rejects an entry pointing at nothing real', () => {
  const fake = path.join(__dirname, 'definitely-does-not-exist-12345');
  assert.equal(isUsableEntry({ source: 'registry', executable: fake, installPath: fake }), false);
});

test('guessGenre recognizes a well-known title', () => {
  assert.equal(guessGenre('The Witcher 3: Wild Hunt'), 'RPG');
});

test('guessGenre returns null for an unrecognized name rather than guessing wrong', () => {
  assert.equal(guessGenre('Some Totally Unknown Program XYZ'), null);
});
