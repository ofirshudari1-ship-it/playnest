const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fg = require('fast-glob');
const { parseVdf } = require('./vdf.cjs');
const { getInstalledPrograms, getSteamInstallPath } = require('./registry.cjs');

const gamesDb = require('./data/gamesDb.json');

function makeId(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

// Strip trailing slashes before comparing paths — otherwise "E:\Games\Foo" (from a
// folder walk) fails a naive startsWith() against "E:\Games\Foo\" (from the registry),
// since the shorter string can never start with the longer one, and the same install
// gets listed twice.
function normalizePath(p) {
  return (p || '').toLowerCase().replace(/[\\/]+$/, '');
}

function isUnderKnownPath(candidatePath, knownPaths) {
  if (!candidatePath) return false;
  const normalizedCandidate = normalizePath(candidatePath);
  return knownPaths.some((known) => known && normalizedCandidate.startsWith(normalizePath(known)));
}

// The reverse of isUnderKnownPath: true when candidatePath is a *parent* of an
// already-known install (e.g. "C:\Program Files\Google" containing the already-detected
// "C:\Program Files\Google\Drive File Stream\...\GoogleDriveFS.exe"). That makes the
// candidate a vendor container folder, not a product of its own.
function isAncestorOfKnownPath(candidatePath, knownPaths) {
  const normalizedCandidate = normalizePath(candidatePath);
  return knownPaths.some((known) => {
    if (!known) return false;
    const normalizedKnown = normalizePath(known);
    return normalizedKnown.startsWith(`${normalizedCandidate}\\`) || normalizedKnown.startsWith(`${normalizedCandidate}/`);
  });
}

const LEGAL_SUFFIXES_RE = /\b(inc|llc|ltd|limited|corporation|corp|gmbh|co|company|technologies|software|group|studios?|entertainment)\b\.?/gi;

function normalizeVendorName(str) {
  // Collapse to a bare alphanumeric run (no inserted spaces) so "Node.js Foundation"
  // and folder name "nodejs" normalize to comparable strings ("nodejsfoundation" /
  // "nodejs") instead of failing to match over a stray space where the dot was.
  return (str || '')
    .toLowerCase()
    .replace(LEGAL_SUFFIXES_RE, '')
    .replace(/[^a-z0-9]+/g, '');
}

// A folder named after a vendor (e.g. "Rockstar Games", "GIGABYTE") is almost never a
// product itself — the real product ("Rockstar Games Launcher") was already found via
// the registry, and its Publisher field is that same vendor name.
function fuzzyPublisherMatch(folderName, knownPublishers) {
  const normFolder = normalizeVendorName(folderName);
  if (normFolder.length < 3) return false;
  return knownPublishers.some((pub) => {
    const normPub = normalizeVendorName(pub);
    if (normPub.length < 3) return false;
    return normPub.includes(normFolder) || normFolder.includes(normPub);
  });
}

function normalizeForDedup(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+\d+(\.\d+)*$/, '')
    .trim();
}

// The same install can surface from more than one source (a stale registry
// InstallLocation plus a matching folder-scan hit, or a vendor's own uninstall entry
// alongside our deep scan). Keep the single most trustworthy copy per product name —
// and, separately, per install path, since two differently-worded registry/folder
// entries can still point at the exact same folder on disk.
const SOURCE_PRIORITY = { steam: 0, epic: 1, registry: 2, folder: 3 };

function dedupeByName(items) {
  const byName = new Map();
  for (const item of items) {
    const key = normalizeForDedup(item.name);
    const existing = byName.get(key);
    if (!existing || SOURCE_PRIORITY[item.source] < SOURCE_PRIORITY[existing.source]) {
      byName.set(key, item);
    }
  }

  const byPath = new Map();
  for (const item of byName.values()) {
    const pathKey = item.installPath ? normalizePath(item.installPath) : null;
    if (!pathKey) {
      byPath.set(`__nopath__:${item.id}`, item);
      continue;
    }
    const existing = byPath.get(pathKey);
    if (!existing || SOURCE_PRIORITY[item.source] < SOURCE_PRIORITY[existing.source]) {
      byPath.set(pathKey, item);
    }
  }
  return [...byPath.values()];
}

// Executables that are never the "real" game/app — installers, uninstallers,
// redistributable prerequisites, and crash-reporting stubs that a folder scan can
// otherwise mistake for the only launchable thing in a directory.
// A plain \b after the keyword fails for the most common real installer names —
// "Setup64.exe", "vcredist_x64.exe" — because \b can't land between two word
// characters (a digit or underscore right after the keyword). Using
// "not followed by a letter" instead still blocks a real game happening to start
// with the same letters (e.g. "Patchwork.exe" keeps its 'w'), while still catching
// the keyword-plus-digits/underscore pattern installers actually use.
const NON_LAUNCHABLE_EXE_RE = /^(unins\d*|uninstall|setup|install(er)?|vc_?redist|dxsetup|dotnetfx\d*|directx_?setup|crashpad_handler|crashhandler\d*|createdump|update(r)?|patch(er)?|redist|prereq|bootstrapper)(?![a-z])/i;

function isLaunchableExe(exePath) {
  const base = path.basename(exePath, path.extname(exePath));
  return !NON_LAUNCHABLE_EXE_RE.test(base);
}

// The final gate before anything reaches the library: never show an entry the user
// can't actually act on. If neither a real launch path nor a real install folder
// exists on disk, it isn't a usable shortcut — drop it rather than show a dead tile.
// Steam/Epic entries are exempt since their launcher (not our filesystem check) owns
// the ability to start them.
function isUsableEntry(item) {
  if (item.source === 'steam') return true;
  if (item.executable && fs.existsSync(item.executable)) return true;
  if (item.installPath && fs.existsSync(item.installPath)) return true;
  return false;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A short bare word (e.g. "rust", "ark") needs a word-boundary match, or it silently
// matches inside unrelated words — "rust" inside "TrustPort", "ark" inside
// "CrystalDiskMark". Longer single words ("battlefield", "minecraft") are specific
// enough for plain substring matching, and that's actually safer for them: registry
// display names sometimes carry stray characters right against the title (a mangled
// "™" rendering as "BattlefieldT 6"), which a strict \b boundary would miss. Multi-word
// phrases ("call of duty") are already specific enough either way.
const SHORT_WORD_MAX_LENGTH = 4;

function buildMatcher(keyword) {
  const trimmed = keyword.trim();
  const isShortSingleWord = /^[a-z0-9]+$/i.test(trimmed) && trimmed.length <= SHORT_WORD_MAX_LENGTH;
  if (isShortSingleWord) {
    const re = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i');
    return (haystack) => re.test(haystack);
  }
  return (haystack) => haystack.includes(keyword);
}

function compileGroups(groups) {
  const compiled = {};
  for (const [key, keywords] of Object.entries(groups || {})) {
    compiled[key] = keywords.map(buildMatcher);
  }
  return compiled;
}

const compiledGenreKeywords = compileGroups(gamesDb.genreKeywords);
const compiledGenreTokens = compileGroups(gamesDb.genreTokens);
const compiledCrackMarkers = (gamesDb.crackGroupMarkers || []).map(buildMatcher);
const compiledSystemNameHints = (gamesDb.systemNameHints || []).map(buildMatcher);
const compiledSystemPublisherHints = (gamesDb.systemPublisherHints || []).map(buildMatcher);

function guessGenre(name) {
  const lower = name.toLowerCase();
  for (const [genre, matchers] of Object.entries(compiledGenreKeywords)) {
    if (matchers.some((test) => test(lower))) return genre;
  }
  // Broader, lower-confidence pass — generic genre words rather than exact titles,
  // so lesser-known or cracked releases still land in a real genre instead of "Other Games".
  for (const [genre, matchers] of Object.entries(compiledGenreTokens)) {
    if (matchers.some((test) => test(lower))) return genre;
  }
  return null;
}

function isSystemComponent(name, publisher) {
  const lowerName = (name || '').toLowerCase();
  const lowerPub = (publisher || '').toLowerCase();
  if (compiledSystemNameHints.some((test) => test(lowerName))) return true;
  if (compiledSystemPublisherHints.some((test) => test(lowerPub))) return true;
  return false;
}

// Catches cracked/repacked game installs that don't match a genre keyword: scene-group
// tags in the name/publisher/install path (SKIDROW, CODEX, FitGirl...), or filesystem
// markers that virtually every game install carries (Steamworks DLLs, _CommonRedist,
// Goldberg's Steam-emu folder used by pirated Steamworks games).
function isLikelyGame(name, publisher, installLocation) {
  const haystack = `${name || ''} ${publisher || ''} ${installLocation || ''}`.toLowerCase();
  if (compiledCrackMarkers.some((test) => test(haystack))) return true;

  if (installLocation && fs.existsSync(installLocation)) {
    const markers = gamesDb.gameInstallMarkers || [];
    if (markers.some((marker) => fs.existsSync(path.join(installLocation, marker)))) return true;
  }
  return false;
}

function dirSizeApprox(dirPath, maxEntries = 400) {
  // Shallow, budget-limited size estimate so a scan never hangs on huge folders.
  let total = 0;
  let count = 0;
  const stack = [dirPath];
  while (stack.length && count < maxEntries) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (count >= maxEntries) break;
      count++;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }
  return total;
}

async function scanSteam(onProgress) {
  const games = [];
  const steamPath = await getSteamInstallPath();
  if (!steamPath || !fs.existsSync(steamPath)) return games;

  const libraryVdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  const libraries = [path.join(steamPath, 'steamapps')];

  if (fs.existsSync(libraryVdfPath)) {
    try {
      const parsed = parseVdf(fs.readFileSync(libraryVdfPath, 'utf8'));
      const root = parsed.libraryfolders || {};
      for (const key of Object.keys(root)) {
        const entry = root[key];
        const libPath = typeof entry === 'string' ? entry : entry.path;
        if (libPath) {
          const steamappsPath = path.join(libPath, 'steamapps');
          if (!libraries.includes(steamappsPath)) libraries.push(steamappsPath);
        }
      }
    } catch (err) {
      onProgress?.({ key: 'scan.steamParseError', vars: { error: err.message } });
    }
  }

  for (const lib of libraries) {
    if (!fs.existsSync(lib)) continue;
    const manifests = fs.readdirSync(lib).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    for (const manifestFile of manifests) {
      try {
        const raw = fs.readFileSync(path.join(lib, manifestFile), 'utf8');
        const parsed = parseVdf(raw).AppState;
        if (!parsed || !parsed.name) continue;
        const installDir = path.join(lib, 'common', parsed.installdir || parsed.name);
        games.push({
          id: makeId('steam', parsed.appid),
          name: parsed.name,
          source: 'steam',
          steamAppId: parsed.appid,
          installPath: installDir,
          sizeBytes: parseInt(parsed.SizeOnDisk || '0', 10) || null,
          category: 'game',
          genre: guessGenre(parsed.name),
          executable: null,
          uninstallCommand: `steam://uninstall/${parsed.appid}`,
          launchCommand: `steam://rungameid/${parsed.appid}`
        });
      } catch (err) {
        onProgress?.({ key: 'scan.steamManifestSkipped', vars: { error: err.message } });
      }
    }
  }
  return games;
}

async function scanEpic(onProgress) {
  const games = [];
  const manifestDir = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  if (!fs.existsSync(manifestDir)) return games;
  const files = fs.readdirSync(manifestDir).filter((f) => f.endsWith('.item'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
      if (!data.DisplayName) continue;
      games.push({
        id: makeId('epic', data.AppName || data.DisplayName),
        name: data.DisplayName,
        source: 'epic',
        installPath: data.InstallLocation || null,
        sizeBytes: data.InstallSize || null,
        category: 'game',
        genre: guessGenre(data.DisplayName),
        executable: data.InstallLocation && data.LaunchExecutable ? path.join(data.InstallLocation, data.LaunchExecutable) : null,
        uninstallCommand: null,
        launchCommand: null
      });
    } catch (err) {
      onProgress?.({ key: 'scan.epicManifestSkipped', vars: { error: err.message } });
    }
  }
  return games;
}

// A registry entry's DisplayIcon is meant to point at the program's real executable,
// but plenty of installers instead point it at their own uninstaller. When that
// happens (or the icon path is simply gone), fall back to a shallow search of the
// install folder for a real, launchable .exe rather than showing a shortcut that
// would just pop open an uninstall dialog or a "file not found" error.
function findRealExecutable(installLocation, displayName) {
  if (!installLocation || !fs.existsSync(installLocation)) return null;
  let matches = [];
  try {
    matches = fg.sync(['*.exe', '*/*.exe'], { cwd: installLocation, suppressErrors: true });
  } catch {
    return null;
  }
  const launchable = matches.filter(isLaunchableExe);
  if (launchable.length === 0) return null;

  const normalizedName = normalizeVendorName(displayName);
  const byNameMatch = launchable.find((m) => normalizeVendorName(path.basename(m, '.exe')) === normalizedName);
  const chosen = byNameMatch || launchable.sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length)[0];
  return path.join(installLocation, chosen);
}

// Node's fs.*Sync calls (readdirSync/statSync/existsSync, and fast-glob's .sync())
// never yield to the event loop — they block the single-threaded main process for
// their full duration. Electron's async IPC (the onProgress `event.sender.send`
// calls below, and any other IPC the renderer fires while a scan is running) only
// actually gets delivered once control returns to the event loop. Without a yield
// point, a deep scan across several drives runs as one long unbroken synchronous
// block: progress messages queue up and arrive in a single batch at the very end
// instead of live, and the whole app appears frozen (STANDARDS.md §2 "no UI
// freeze") for however long the scan takes. `yieldToEventLoop` is a cheap,
// zero-dependency way to hand control back periodically so queued IPC actually
// flushes and the renderer stays responsive during a long scan.
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function scanRegistryPrograms(knownInstallPaths, onProgress) {
  const programs = await getInstalledPrograms();
  const items = [];
  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    // Yield every 20 items rather than every item — frequent enough that progress
    // and other IPC stay live, infrequent enough not to meaningfully slow the scan
    // itself (setImmediate still costs a full event-loop turn each time).
    if (i > 0 && i % 20 === 0) await yieldToEventLoop();
    if (isUnderKnownPath(p.installLocation, knownInstallPaths)) continue;

    const systemComponent = isSystemComponent(p.displayName, p.publisher);
    const genre = guessGenre(p.displayName);
    const looksLikeGame = !systemComponent && (genre || isLikelyGame(p.displayName, p.publisher, p.installLocation));

    let executable = p.displayIcon ? p.displayIcon.split(',')[0].replace(/"/g, '') : null;
    const executableIsBad = !executable || !fs.existsSync(executable) || !isLaunchableExe(executable);
    if (executableIsBad) {
      executable = findRealExecutable(p.installLocation, p.displayName);
    }

    items.push({
      id: makeId('registry', p.displayName, p.installLocation || ''),
      name: p.displayName,
      source: 'registry',
      publisher: p.publisher || 'Unknown',
      version: p.displayVersion || null,
      installPath: p.installLocation || null,
      sizeBytes: p.estimatedSizeKb ? p.estimatedSizeKb * 1024 : null,
      category: systemComponent ? 'system' : (looksLikeGame ? 'game' : 'application'),
      genre,
      executable: executable || null,
      uninstallCommand: p.uninstallString || null,
      launchCommand: null
    });
  }
  return items;
}

async function scanDriveFolders(drives, knownInstallPaths, knownPublishers, onProgress) {
  const found = [];
  const targetFolders = ['Program Files', 'Program Files (x86)', 'Games', 'GOG Games'];
  const containerFolderNames = new Set(gamesDb.knownContainerFolders || []);

  for (const drive of drives) {
    for (const folder of targetFolders) {
      const base = path.join(drive, folder);
      if (!fs.existsSync(base)) continue;
      let subdirs;
      try {
        subdirs = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
      } catch {
        continue;
      }
      for (const dir of subdirs) {
        // Each iteration does a fast-glob .sync() walk (up to 3 levels deep) plus,
        // for anything that survives the filters, a budgeted dirSizeApprox() walk —
        // the two heaviest synchronous operations in the whole scan. Yielding once
        // per folder (not just every 20 like the lighter registry loop above) is
        // what actually keeps "Checking <path>" progress updates flowing live
        // instead of silently batching until deep scan finishes.
        await yieldToEventLoop();
        const fullPath = path.join(base, dir.name);
        if (isUnderKnownPath(fullPath, knownInstallPaths)) continue;
        if (isAncestorOfKnownPath(fullPath, knownInstallPaths)) continue;
        if (containerFolderNames.has(dir.name.toLowerCase())) continue;
        if (fuzzyPublisherMatch(dir.name, knownPublishers)) continue;

        onProgress?.({ key: 'scan.checkingPath', vars: { path: fullPath } });
        let exeMatches = [];
        try {
          exeMatches = fg.sync(['*.exe', '*/*.exe', '*/*/*.exe'], { cwd: fullPath, suppressErrors: true });
        } catch {
          exeMatches = [];
        }
        // Drop installer/uninstaller/redist stubs before picking one — a folder that
        // contains only "unins000.exe" or "vc_redist.x64.exe" isn't a launchable product.
        const launchable = exeMatches.filter(isLaunchableExe);
        if (launchable.length === 0) continue;

        const normalizedFolder = normalizeVendorName(dir.name);
        const byNameMatch = launchable.find((m) => normalizeVendorName(path.basename(m, '.exe')) === normalizedFolder);
        const chosenExe = byNameMatch || launchable.sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length)[0];

        const folderGenre = guessGenre(dir.name);
        const folderLooksLikeGame = folder.toLowerCase().includes('game') || folderGenre || isLikelyGame(dir.name, null, fullPath);
        found.push({
          id: makeId('folder', fullPath),
          name: dir.name,
          source: 'folder',
          installPath: fullPath,
          sizeBytes: dirSizeApprox(fullPath),
          category: folderLooksLikeGame ? 'game' : 'application',
          genre: folderGenre,
          executable: path.join(fullPath, chosenExe),
          uninstallCommand: null,
          launchCommand: null
        });
      }
    }
  }
  return found;
}

async function runFullScan({ drives = [], deepScan = false }, onProgress) {
  // onProgress is called with { key, vars } — a translation key + interpolation
  // vars, never a pre-built string. This file has no access to the user's
  // language preference (that lives in electron-store, read on the main-process
  // side), so translating here would silently always render in English. The
  // caller (electron/main.cjs ipcMain.handle('scan:start')) resolves each key
  // through the same mt() helper the tray menu and desktop widget already use,
  // against the current settings.language, right before forwarding it to the
  // renderer over 'scan:progress'.
  onProgress?.({ key: 'scan.lookingSteam' });
  const steamGames = await scanSteam(onProgress);

  onProgress?.({ key: 'scan.lookingEpic' });
  const epicGames = await scanEpic(onProgress);

  onProgress?.({ key: 'scan.readingApps' });
  const knownPaths = [...steamGames, ...epicGames].map((g) => g.installPath).filter(Boolean);
  const registryItems = await scanRegistryPrograms(knownPaths, onProgress);

  let folderItems = [];
  if (deepScan && drives.length) {
    onProgress?.({ key: 'scan.scanningDrives' });
    const allKnown = [...knownPaths, ...registryItems.map((r) => r.installPath).filter(Boolean)];
    const knownPublishers = registryItems.map((r) => r.publisher).filter((p) => p && p !== 'Unknown');
    folderItems = await scanDriveFolders(drives, allKnown, knownPublishers, onProgress);
  }

  const deduped = dedupeByName([...steamGames, ...epicGames, ...registryItems, ...folderItems]);
  // Never show a tile the user can't act on — if we can't find a real, launchable
  // executable AND can't find the install folder either, it isn't a working shortcut.
  const usable = deduped.filter(isUsableEntry);
  const dropped = deduped.length - usable.length;
  onProgress?.(
    dropped > 0
      ? { key: 'scan.foundItemsSkipped', vars: { count: usable.length, skipped: dropped } }
      : { key: 'scan.foundItems', vars: { count: usable.length } }
  );
  return usable;
}

module.exports = { runFullScan };
// Pure helpers exported for unit testing only (tests/scanner.test.cjs) — not
// part of the app's runtime IPC surface.
module.exports._internal = { isLaunchableExe, normalizeForDedup, dedupeByName, isUsableEntry, guessGenre };
