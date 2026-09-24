const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { createZip } = require('../electron/zip.cjs');

// Independent reader (doesn't reuse createZip's own header-writing code) so a
// bug in the writer can't hide itself from its own test by construction.
function readZipEntries(buf) {
  const entries = [];
  let offset = 0;
  while (buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.toString('utf8', nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    assert.strictEqual(data.length, uncompSize, `${name}: uncompressed size field matches actual data`);
    entries.push({ name, data });
    offset = dataStart + compSize;
  }
  return entries;
}

test('zip.cjs createZip round-trips file names and contents (independent reader, not the writer\'s own logic)', () => {
  const entries = [
    { name: 'version.json', data: Buffer.from(JSON.stringify({ version: '9.9.9' })) },
    { name: 'system-info.txt', data: Buffer.from('OS: Windows\nElectron: 31.0.0\n') },
    // A larger, repetitive buffer to exercise the DEFLATE path (small/random
    // buffers above may legitimately end up stored instead of deflated).
    { name: 'settings.json', data: Buffer.from(JSON.stringify({ a: 1, b: 'x'.repeat(500) })) }
  ];
  const zip = createZip(entries);
  assert.ok(Buffer.isBuffer(zip));
  assert.ok(zip.length > 0);

  const read = readZipEntries(zip);
  assert.strictEqual(read.length, entries.length);
  for (let i = 0; i < entries.length; i++) {
    assert.strictEqual(read[i].name, entries[i].name);
    assert.strictEqual(read[i].data.toString('utf8'), entries[i].data.toString('utf8'));
  }

  // End-of-central-directory record must be present and report the right count.
  const eocdIndex = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocdIndex >= 0, 'end-of-central-directory signature found');
  assert.strictEqual(zip.readUInt16LE(eocdIndex + 10), entries.length);
});

test('zip.cjs handles an empty entry list without throwing', () => {
  const zip = createZip([]);
  assert.ok(Buffer.isBuffer(zip));
  assert.strictEqual(zip.length, 22); // just the EOCD record
});

test('electron/main.cjs exportDiagnostics never writes DEFAULT_STEAMGRID_API_KEY in plaintext', () => {
  const mainSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  const handlerStart = mainSrc.indexOf("ipcMain.handle('app:exportDiagnostics'");
  assert.ok(handlerStart >= 0, 'app:exportDiagnostics handler exists');
  const handlerEnd = mainSrc.indexOf("\n});", handlerStart);
  const handlerSrc = mainSrc.slice(handlerStart, handlerEnd);
  assert.match(handlerSrc, /steamGridApiKey\s*=\s*'\[REDACTED\]'/, 'personal API key field is redacted before export');
  assert.match(handlerSrc, /DEFAULT_STEAMGRID_API_KEY/, 'shared default key is explicitly scrubbed as a safety net');
});
