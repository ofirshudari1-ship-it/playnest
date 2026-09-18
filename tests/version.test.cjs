// version.json is the single source of truth for the app version (STANDARDS.md
// §6) — this guards against it silently drifting from package.json, which is
// exactly the kind of thing that's easy to forget after a manual version bump.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('package.json version matches version.json', () => {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(
    pkg.version,
    version.version,
    'Run `npm run version:sync` — package.json and version.json have drifted apart'
  );
});

test('version.json uses a valid semantic version', () => {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
  assert.match(version.version, /^\d+\.\d+\.\d+$/);
});
