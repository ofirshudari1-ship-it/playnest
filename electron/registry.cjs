const { execFile } = require('child_process');

function runReg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true, maxBuffer: 1024 * 1024 * 32 }, (err, stdout) => {
      // reg.exe returns non-zero when a key doesn't exist — treat as empty, not fatal.
      resolve(err ? '' : stdout);
    });
  });
}

const FIELD_MAP = {
  DisplayName: 'displayName',
  DisplayVersion: 'displayVersion',
  Publisher: 'publisher',
  InstallLocation: 'installLocation',
  InstallSource: 'installSource',
  EstimatedSize: 'estimatedSizeKb',
  UninstallString: 'uninstallString',
  DisplayIcon: 'displayIcon',
  SystemComponent: 'systemComponent',
  ParentKeyName: 'parentKeyName',
  URLInfoAbout: 'urlInfoAbout'
};

function parseRegDump(stdout) {
  const lines = stdout.split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    if (rawLine.startsWith('HKEY_')) {
      if (current && current.displayName) entries.push(current);
      current = { regKey: rawLine.trim() };
      continue;
    }
    const trimmed = rawLine.trim();
    const match = trimmed.match(/^(\S+)\s+(REG_\S+)\s*(.*)$/);
    if (match && current) {
      const [, name, type, rawValue] = match;
      const key = FIELD_MAP[name];
      if (!key) continue;
      let value = rawValue.trim();
      if (type === 'REG_DWORD') {
        value = parseInt(value, 16) || 0;
      }
      current[key] = value;
    }
  }
  if (current && current.displayName) entries.push(current);
  return entries;
}

const UNINSTALL_ROOTS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];

async function getInstalledPrograms() {
  // The three registry roots (HKLM, HKLM\WOW6432Node, HKCU) are independent —
  // querying them one after another left each `reg query /s` (which walks
  // every installed-program subkey, often hundreds) waiting on the previous
  // one to finish for no reason. Running them concurrently cuts this part of
  // every scan roughly to the length of the single slowest root instead of
  // the sum of all three.
  const dumps = await Promise.all(UNINSTALL_ROOTS.map((root) => runReg(['query', root, '/s'])));
  const all = [];
  for (const stdout of dumps) {
    if (!stdout) continue;
    all.push(...parseRegDump(stdout));
  }
  // De-dupe by displayName + installLocation, drop system components.
  const seen = new Set();
  const result = [];
  for (const entry of all) {
    if (entry.systemComponent === '0x1' || entry.systemComponent === 1) continue;
    if (!entry.displayName) continue;
    const dedupeKey = `${entry.displayName}::${entry.installLocation || ''}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(entry);
  }
  return result;
}

async function getSteamInstallPath() {
  const stdout = await runReg(['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
  const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i);
  if (match) return match[1].trim().replace(/\//g, '\\');
  const stdout2 = await runReg(['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', '/v', 'InstallPath']);
  const match2 = stdout2.match(/InstallPath\s+REG_SZ\s+(.+)/i);
  if (match2) return match2[1].trim();
  return null;
}

module.exports = { getInstalledPrograms, getSteamInstallPath };
