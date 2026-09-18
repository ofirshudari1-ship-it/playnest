// Guards against the two locale files silently drifting apart — a key present
// in en.json but missing from he.json falls back silently (by design, see
// src/i18n.ts), which is exactly the kind of gap that's easy to never notice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flattenKeys(v, key) : [key];
  });
}

test('en.json and he.json define exactly the same set of keys', () => {
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8'));
  const he = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'he.json'), 'utf8'));
  const enKeys = flattenKeys(en).sort();
  const heKeys = flattenKeys(he).sort();

  const missingFromHe = enKeys.filter((k) => !heKeys.includes(k));
  const missingFromEn = heKeys.filter((k) => !enKeys.includes(k));

  assert.deepEqual(missingFromHe, [], `Keys missing from he.json: ${missingFromHe.join(', ')}`);
  assert.deepEqual(missingFromEn, [], `Keys missing from en.json: ${missingFromEn.join(', ')}`);
});

test('no translation string is left empty', () => {
  for (const file of ['en.json', 'he.json']) {
    const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', file), 'utf8'));
    const empties = flattenKeys(dict).filter((key) => {
      const value = key.split('.').reduce((node, k) => node?.[k], dict);
      return typeof value === 'string' && value.trim() === '';
    });
    assert.deepEqual(empties, [], `Empty strings in ${file}: ${empties.join(', ')}`);
  }
});
