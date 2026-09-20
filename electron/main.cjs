const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn, execSync } = require('child_process');

const { autoUpdater } = require('electron-updater');

const store = require('./store.cjs');
const { runFullScan } = require('./scanner.cjs');
const { fetchCoverForItem, fileToDataUrl } = require('./steamgriddb.cjs');
const { getHardwareProfile } = require('./hardware.cjs');
const { DEFAULT_STEAMGRID_API_KEY } = require('./config.cjs');

function effectiveApiKey(settings) {
  return settings.steamGridApiKey || DEFAULT_STEAMGRID_API_KEY;
}

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let tray = null;
let isQuitting = false;

// Lightweight crash log so a real user's bug report has something concrete to attach,
// without keeping a console open.
const errorLogPath = path.join(app.getPath('userData'), 'error.log');
function logCrash(label, err) {
  try {
    fs.appendFileSync(errorLogPath, `${new Date().toISOString()} ${label}: ${err?.stack || String(err)}\n`);
  } catch {
    /* ignore */
  }
}

process.on('uncaughtException', (err) => logCrash('MAIN uncaughtException', err));
process.on('unhandledRejection', (err) => logCrash('MAIN unhandledRejection', err));

// ---- Auto-update (electron-updater, GitHub Releases provider) ----
// Checks ofirshudari1-ship-it/playnest releases for a newer version. Never
// blocks startup and never throws past this module — a failed check (e.g.
// offline, GitHub unreachable) is logged and silently ignored, same as any
// other best-effort background task in this app.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function initAutoUpdater() {
  if (isDev) return; // dev builds have no packaged app.asar / no update feed to hit

  autoUpdater.on('error', (err) => {
    logCrash('autoUpdater', err);
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Playnest Update Ready',
        message: `Playnest ${info.version} has been downloaded.`,
        detail: 'Restart now to install the update, or it will install automatically the next time you quit Playnest.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      })
      .catch((err) => logCrash('autoUpdater dialog', err));
  });

  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    logCrash('autoUpdater checkForUpdatesAndNotify', err);
  }
}

// Restores the last saved window size/position (STANDARDS.md 12.3) — but only
// if that position still lands on a currently-connected display, so a window
// saved on a monitor the user has since unplugged doesn't open off-screen.
// Always opens visible/normal (never restores a minimized-to-tray state), and
// falls back to sane defaults if nothing was saved yet or the saved value is
// corrupt (e.g. a hand-edited or partially-written config file).
function getInitialWindowBounds() {
  const defaults = { width: 1440, height: 900 };
  try {
    const saved = store.get('windowState');
    if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') return defaults;

    const bounds = { width: saved.width, height: saved.height };
    if (typeof saved.x === 'number' && typeof saved.y === 'number') {
      const onScreen = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return saved.x >= a.x && saved.y >= a.y && saved.x < a.x + a.width && saved.y < a.y + a.height;
      });
      if (onScreen) {
        bounds.x = saved.x;
        bounds.y = saved.y;
      }
    }
    return { ...bounds, isMaximized: Boolean(saved.isMaximized) };
  } catch {
    return defaults;
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    store.set('windowState', { ...bounds, isMaximized });
  } catch {
    /* ignore — not worth failing app shutdown over */
  }
}

// True when this launch came from Windows starting Playnest at sign-in with
// "start minimized" on (see applyLaunchOnStartup below, which is the only
// place that ever adds --start-minimized to the login item's args) — lets
// createWindow open straight to the tray instead of flashing a window the
// user didn't ask to see this second. A manual double-click of the exe or
// the taskbar shortcut never carries this flag, so it always opens visibly.
function startedMinimizedAtLogin() {
  if (process.argv.includes('--start-minimized')) return true;
  try {
    return Boolean(app.getLoginItemSettings().wasOpenedAtLogin) && store.getSettings().startMinimized;
  } catch {
    return false;
  }
}

function createWindow() {
  const initialBounds = getInitialWindowBounds();
  const openHidden = startedMinimizedAtLogin();
  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    show: !openHidden,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (initialBounds.isMaximized) mainWindow.maximize();

  let saveStateTimer = null;
  const scheduleSaveWindowState = () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(saveWindowState, 400);
  };
  mainWindow.on('resize', scheduleSaveWindowState);
  mainWindow.on('move', scheduleSaveWindowState);
  mainWindow.on('close', () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveWindowState();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logCrash('RENDERER process gone', new Error(JSON.stringify(details)));
  });
  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    logCrash(`PRELOAD error (${preloadPath})`, error);
  });

  // Security: this window never needs to navigate anywhere but its own bundled page,
  // and never needs to spawn a raw new Electron window. Any link a user clicks (e.g.
  // the SteamGridDB signup link in Settings) is routed to the system browser instead —
  // opening it in-app would hand a random external site a window with our preload
  // context isolation active but no reason to trust it.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isOwnPage = url.startsWith('file://') || (isDev && url.startsWith('http://localhost:5173'));
    if (!isOwnPage) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    }
  });

  // Minimize-to-tray is opt-in (default off in Settings) so closing the window behaves
  // like any normal app unless the user specifically wants Playnest to keep running
  // in the background for its tray quick-launch menu.
  mainWindow.on('close', (event) => {
    if (store.getSettings().minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Release the reference once the window is actually destroyed (not just
  // hidden to tray above) so it can be garbage-collected — window-all-closed
  // quits the whole process on Windows anyway, but this keeps the pattern
  // correct per STANDARDS.md 11.9 rather than relying on process exit alone.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'dist', 'index.html'));
  }
}

// Global quick-launch hotkey (STANDARDS.md §12.4 wants full remapping; this ships
// as a fixed combo behind an on/off toggle in Settings — a documented, scoped gap,
// see SPEC.md §9). Chosen to avoid the well-known collisions §12.4 calls out
// (Win+*, Ctrl+Alt+Del, common OBS/Discord defaults): Ctrl+Shift+L is not a
// default binding in Windows, OBS, Discord, Steam, or the browsers.
const QUICK_LAUNCH_ACCELERATOR = 'Control+Shift+L';

function bringMainWindowToFront() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('quickLaunch:trigger');
}

// Registration is best-effort: globalShortcut.register() returns false (never
// throws) when another already-running application owns the same combination,
// so this silently no-ops rather than crashing the app over an OS-level conflict.
function applyQuickLaunchHotkey(enabled) {
  globalShortcut.unregister(QUICK_LAUNCH_ACCELERATOR);
  if (!enabled) return;
  try {
    globalShortcut.register(QUICK_LAUNCH_ACCELERATOR, bringMainWindowToFront);
  } catch {
    /* combination unavailable on this system — quick-launch just won't fire */
  }
}

// Real Windows startup registration via Electron's own setLoginItemSettings
// (writes the standard "Run" registry entry Task Manager's Startup tab shows
// and controls) — not a fake preference. --start-minimized is only ever added
// here, so startedMinimizedAtLogin() above can trust it as a signal this launch
// came from Windows, not from the user double-clicking Playnest by hand.
function applyLaunchOnStartup(enabled, startMinimized) {
  if (isDev) return; // no installed exe path to register in a dev checkout
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: startMinimized ? ['--start-minimized'] : []
    });
  } catch (err) {
    logCrash('setLoginItemSettings', err);
  }
}

function buildTrayMenu() {
  const settings = store.getSettings();
  const favIds = new Set(settings.favorites || []);
  const favorites = store.get('library').filter((i) => favIds.has(i.id)).slice(0, 5);

  return Menu.buildFromTemplate([
    { label: 'Open Playnest', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    ...(favorites.length
      ? [
          { type: 'separator' },
          ...favorites.map((item) => ({ label: `▶ ${item.name}`, click: () => performLaunch(item.id) }))
        ]
      : []),
    { type: 'separator' },
    { label: 'Quit Playnest', click: () => { isQuitting = true; app.quit(); } }
  ]);
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Playnest');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    applyQuickLaunchHotkey(store.getSettings().quickLaunchHotkeyEnabled);
    // Re-assert the login-item registration on every launch — self-heals if
    // Windows (or the user, via Task Manager's Startup tab) dropped it, and
    // keeps the --start-minimized arg in sync if that preference changed.
    { const s = store.getSettings(); applyLaunchOnStartup(s.launchOnStartup, s.startMinimized); }
    // A one-off check right at launch (a user who leaves Playnest closed for
    // days shouldn't have to wait up to another 30 minutes after opening it
    // for an overdue rescan), then the recurring poll for as long as the app
    // process stays alive.
    runAutoRescanIfDue();
    setInterval(runAutoRescanIfDue, AUTO_RESCAN_POLL_MS);
    // Non-blocking; give the window a few seconds to settle before hitting
    // the network so first-launch feels snappy.
    setTimeout(initAutoUpdater, 5000);
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// Global shortcuts are OS-level registrations that outlive the app if not
// explicitly released — always unregister before the process actually exits.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- Drives ----
ipcMain.handle('drives:list', async () => {
  const drives = [];
  for (let charCode = 67; charCode <= 90; charCode++) {
    const letter = String.fromCharCode(charCode);
    const drivePath = `${letter}:\\`;
    if (fs.existsSync(drivePath)) {
      let freeGb = null;
      let totalGb = null;
      try {
        const si = require('systeminformation');
        const fsSizeData = await si.fsSize();
        const match = fsSizeData.find((d) => d.mount?.toUpperCase().startsWith(letter));
        if (match) {
          freeGb = Math.round(match.available / 1024 / 1024 / 1024);
          totalGb = Math.round(match.size / 1024 / 1024 / 1024);
        }
      } catch {
        /* best-effort */
      }
      drives.push({ letter, path: drivePath, freeGb, totalGb });
    }
  }
  return drives;
});

// ---- Scan ----
// Cover art is fetched from SteamGridDB one item at a time, which is by far the
// slowest part of a scan. We used to make the user wait through the entire art pass
// before the library ever appeared. Instead: save and hand back the library the
// moment the filesystem/registry scan itself is done, then fetch art in the
// background and notify the renderer as covers land, so the UI shows up fast and
// artwork fills in behind it.
// Shared by the manual scan (scan:start below) and the silent automatic
// rescan (runAutoRescanIfDue further down) — both need to merge fresh scan
// results into the store the same way (keep each item's original addedAt,
// stamp lastScan, refresh the tray) so the two paths can't drift apart.
function mergeScanResults(rawItems) {
  const previousLibrary = store.get('library');
  const previousAddedAt = new Map(previousLibrary.map((i) => [i.id, i.addedAt]));
  const now = new Date().toISOString();
  const withTimestamps = rawItems.map((item) => ({
    ...item,
    addedAt: previousAddedAt.get(item.id) || now
  }));

  store.set('library', withTimestamps);
  store.set('lastScan', now);
  refreshTrayMenu();
  return withTimestamps;
}

ipcMain.handle('scan:start', async (event, options) => {
  const send = (message) => event.sender.send('scan:progress', { message });

  const rawItems = await runFullScan(options, send);
  const withTimestamps = mergeScanResults(rawItems);
  // Remembered so a scheduled automatic rescan (see runAutoRescanIfDue) can
  // repeat this same drives/deepScan scope instead of guessing one.
  store.set('lastScanOptions', options);
  send('Scan complete — fetching artwork in the background...');

  fetchArtInBackground(event.sender, withTimestamps);

  return rawItems.length;
});

// ---- Automatic background rescan (STANDARDS.md-style local automation —
// no cloud calls, purely a scheduled repeat of the same local filesystem/
// registry scan the user already ran by hand at least once). Off by default
// (settings.autoRescanHours === 0); the user opts in from Settings with a
// "Never / Daily / Weekly" choice. Runs quietly: no progress toasts, just a
// 'library:updated' push so any open window's grid refreshes if anything
// changed, the same way it already does after cover art finishes fetching.
let autoRescanInFlight = false;
async function runAutoRescanIfDue() {
  if (autoRescanInFlight) return;
  const settings = store.getSettings();
  const hours = Number(settings.autoRescanHours) || 0;
  // Never auto-scan before the user has been through setup at least once —
  // a silent scan on a profile that hasn't opted into scanning yet would be
  // a surprising filesystem/registry read the user never asked for.
  if (hours <= 0 || !settings.setupWizardSeen) return;

  const lastScan = store.get('lastScan');
  const dueAt = lastScan ? new Date(lastScan).getTime() + hours * 60 * 60 * 1000 : 0;
  if (Date.now() < dueAt) return;

  autoRescanInFlight = true;
  try {
    const options = store.get('lastScanOptions') || { drives: [], deepScan: false };
    const rawItems = await runFullScan(options, () => {});
    mergeScanResults(rawItems);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:updated');
  } catch (err) {
    logCrash('AUTO-RESCAN', err);
  } finally {
    autoRescanInFlight = false;
  }
}

// Checked on a slow poll rather than a single long-lived timer keyed to the
// configured interval — the user can change autoRescanHours in Settings at
// any time, and a 30-minute poll picks that up on its own next tick instead
// of needing the timer torn down and rebuilt on every settings change.
const AUTO_RESCAN_POLL_MS = 30 * 60 * 1000;

let artFetchInProgress = false;

async function fetchArtInBackground(sender, items) {
  if (artFetchInProgress) return;
  artFetchInProgress = true;
  try {
    const settings = store.getSettings();
    const userDataPath = app.getPath('userData');

    let done = 0;
    for (const item of items) {
      if (sender.isDestroyed()) break; // window closed mid-fetch — no point continuing or sending

      try {
        const result = await fetchCoverForItem(effectiveApiKey(settings), item, userDataPath);
        // A cover that didn't exist yet when getCoverDataUrl() first cached this item
        // (returning null) would otherwise stay cached as "no cover" forever — drop
        // the stale entry so the next library:get re-reads the newly written file.
        if (result?.coverPath) coverDataUrlCache.delete(item.id);
        if (result?.releaseYear) {
          const library = store.get('library');
          store.set('library', library.map((i) => (i.id === item.id ? { ...i, releaseYear: result.releaseYear } : i)));
        }
      } catch {
        /* best-effort — one failed cover shouldn't stop the rest */
      }
      done++;
      if ((done % 3 === 0 || done === items.length) && !sender.isDestroyed()) {
        sender.send('art:progress', { message: `Fetched artwork ${done}/${items.length}` });
        sender.send('library:updated');
      }
    }
  } finally {
    artFetchInProgress = false;
  }
}

// ---- Cover art (on-demand, e.g. after pasting an API key without a full rescan) ----
ipcMain.handle('art:fetchMissing', async (event) => {
  const send = (message) => event.sender.send('art:progress', { message });
  const settings = store.getSettings();

  const library = store.get('library');
  const userDataPath = app.getPath('userData');
  const missing = library.filter((item) => !fs.existsSync(path.join(userDataPath, 'covers', `${item.id}.jpg`)));

  if (missing.length === 0) {
    send('All items already have cover art.');
    return { ok: true, fetched: 0, total: 0 };
  }

  send(`Fetching cover art for ${missing.length} items...`);
  let fetched = 0;
  const missingIds = new Set(missing.map((i) => i.id));
  const releaseYearById = new Map();
  for (const item of missing) {
    const result = await fetchCoverForItem(effectiveApiKey(settings), item, userDataPath);
    if (result?.coverPath) {
      fetched++;
      coverDataUrlCache.delete(item.id); // see the cache note above library:get
    }
    if (result?.releaseYear) releaseYearById.set(item.id, result.releaseYear);
    if ((fetched + 1) % 5 === 0 || missing.indexOf(item) === missing.length - 1) {
      send(`Checked ${missing.indexOf(item) + 1}/${missing.length} (found ${fetched})`);
    }
  }

  if (releaseYearById.size > 0) {
    const updatedLibrary = library.map((item) =>
      missingIds.has(item.id) && releaseYearById.has(item.id)
        ? { ...item, releaseYear: releaseYearById.get(item.id) }
        : item
    );
    store.set('library', updatedLibrary);
  }

  send(`Done — found artwork for ${fetched} of ${missing.length} items.`);
  return { ok: true, fetched, total: missing.length };
});

// ---- Library ----
ipcMain.handle('library:lastScan', () => store.get('lastScan'));

// Cover art is content-addressed by item id and, once written, never rewritten
// (fetchCoverForItem skips re-fetching whenever the file already exists) — so
// its base64 data URL is safe to cache for the life of the process instead of
// re-reading and re-encoding the same JPEG from disk on every library:get call.
// Before this cache, favoriting/hiding/tagging a single item (each of which
// triggers a full loadLibrary() round-trip from the renderer) synchronously
// re-read and re-base64'd every cover in the whole library on the main
// process — for a few hundred games that's real, repeated main-process I/O
// blocking on every single click, not just at startup or after a scan.
const coverDataUrlCache = new Map();

function getCoverDataUrl(itemId, userDataPath) {
  if (coverDataUrlCache.has(itemId)) return coverDataUrlCache.get(itemId);
  const coverPath = path.join(userDataPath, 'covers', `${itemId}.jpg`);
  const dataUrl = fs.existsSync(coverPath) ? fileToDataUrl(coverPath) : null;
  coverDataUrlCache.set(itemId, dataUrl);
  return dataUrl;
}

ipcMain.handle('library:get', async () => {
  const library = store.get('library');
  const userDataPath = app.getPath('userData');
  const favorites = new Set(store.getSettings().favorites || []);
  return library.map((item) => ({
    ...item,
    coverArt: getCoverDataUrl(item.id, userDataPath),
    isFavorite: favorites.has(item.id)
  }));
});

// ---- Library correctness check ----
// Games get uninstalled, drives get unplugged, folders get moved — the catalogue can
// silently drift from what's actually still on disk. This finds entries that no longer
// point anywhere real, so the user can clear them out instead of clicking a dead tile.
ipcMain.handle('library:verify', () => {
  const library = store.get('library');
  const stale = library.filter((item) => {
    if (item.source === 'steam' || item.source === 'epic') return false; // launcher-managed, not ours to judge
    const path1 = item.executable;
    const path2 = item.installPath;
    if (!path1 && !path2) return false;
    const path1Exists = path1 ? fs.existsSync(path1) : false;
    const path2Exists = path2 ? fs.existsSync(path2) : false;
    return !path1Exists && !path2Exists;
  });
  return stale.map((item) => ({ id: item.id, name: item.name, installPath: item.installPath }));
});

ipcMain.handle('library:removeItems', (event, ids) => {
  const idSet = new Set(ids);
  const library = store.get('library');
  const userDataPath = app.getPath('userData');
  for (const id of idSet) {
    const coverPath = path.join(userDataPath, 'covers', `${id}.jpg`);
    if (fs.existsSync(coverPath)) {
      try {
        fs.unlinkSync(coverPath);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
  store.set('library', library.filter((item) => !idSet.has(item.id)));
  refreshTrayMenu();
  return { ok: true, removed: idSet.size };
});

// ---- Settings ----
ipcMain.handle('settings:get', () => store.getSettings());
ipcMain.handle('settings:set', (event, newSettings) => {
  store.set('settings', { ...store.getSettings(), ...newSettings });
  const updated = store.getSettings();
  if ('quickLaunchHotkeyEnabled' in newSettings) applyQuickLaunchHotkey(updated.quickLaunchHotkeyEnabled);
  if ('launchOnStartup' in newSettings || 'startMinimized' in newSettings) {
    applyLaunchOnStartup(updated.launchOnStartup, updated.startMinimized);
  }
  return updated;
});

// ---- Hardware ----
ipcMain.handle('hardware:get', () => getHardwareProfile());

// ---- Item actions ----
function findItem(id) {
  return store.get('library').find((i) => i.id === id);
}

// toISOString() converts to UTC, so slicing it for a "today" key silently uses the
// UTC calendar day instead of the user's — for anyone east of UTC that flips over
// hours before local midnight, breaking streaks at the wrong time. Build the key
// from local getFullYear/Month/Date instead.
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function touchLastPlayed(id) {
  const library = store.get('library');
  store.set('library', library.map((item) => (item.id === id ? { ...item, lastPlayedAt: new Date().toISOString() } : item)));

  const today = localDateKey(new Date());
  const days = store.getActivityDays();
  if (!days.includes(today)) store.set('activityDays', [...days, today].sort());
}

// A "streak" is only meaningful if it's counted from something the app actually
// recorded — every launch of a local .exe stamps today's date via touchLastPlayed
// above. This walks that real date list instead of inventing a number.
function computeStreak() {
  const days = new Set(store.getActivityDays());
  const oneDayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  const cursor = new Date(today);
  // A streak "counts" through today even if today has no entry yet (the user just
  // hasn't launched anything yet this session) — but breaks immediately once
  // yesterday is missing too.
  if (!days.has(localDateKey(today))) cursor.setTime(cursor.getTime() - oneDayMs);
  while (days.has(localDateKey(cursor))) {
    current++;
    cursor.setTime(cursor.getTime() - oneDayMs);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    if (prev !== null && new Date(d).getTime() - new Date(prev).getTime() === oneDayMs) {
      run++;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }

  return { currentStreak: current, longestStreak: Math.max(longest, current), totalActiveDays: days.size };
}

ipcMain.handle('stats:getStreak', () => computeStreak());

// ---- Windows Game Mode toggle (real registry key, not a fake switch) ----
const GAME_MODE_REG_KEY = 'HKCU\\Software\\Microsoft\\GameBar';
ipcMain.handle('system:getGameMode', () => {
  try {
    const out = execSync(`reg query "${GAME_MODE_REG_KEY}" /v AutoGameModeEnabled`, { encoding: 'utf8' });
    return /0x1/.test(out);
  } catch {
    return true; // key absent means Windows' own default (enabled) applies
  }
});
ipcMain.handle('system:setGameMode', (event, enabled) => {
  try {
    execSync(`reg add "${GAME_MODE_REG_KEY}" /v AutoGameModeEnabled /t REG_DWORD /d ${enabled ? 1 : 0} /f`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---- Power plan switch (real powercfg call, Windows' own built-in plan GUIDs) ----
const POWER_PLANS = {
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  performance: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a'
};
ipcMain.handle('system:setPowerPlan', (event, plan) => {
  const guid = POWER_PLANS[plan];
  if (!guid) return { ok: false, error: 'Unknown power plan' };
  try {
    execSync(`powercfg /setactive ${guid}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('system:getActivePowerPlan', () => {
  try {
    const out = execSync('powercfg /getactivescheme', { encoding: 'utf8' });
    const match = Object.entries(POWER_PLANS).find(([, guid]) => out.toLowerCase().includes(guid));
    return match ? match[0] : 'unknown';
  } catch {
    return 'unknown';
  }
});

// ---- Live system stats (real CPU/RAM/temperature, polled on demand from the UI) ----
ipcMain.handle('system:liveStats', async () => {
  const si = require('systeminformation');
  try {
    const [load, mem, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature().catch(() => ({ main: null }))
    ]);
    return {
      cpuLoad: Math.round(load.currentLoad),
      ramUsedGb: Math.round((mem.active / 1024 / 1024 / 1024) * 10) / 10,
      ramTotalGb: Math.round(mem.total / 1024 / 1024 / 1024),
      ramPercent: Math.round((mem.active / mem.total) * 100),
      cpuTempC: typeof temp.main === 'number' && temp.main > 0 ? Math.round(temp.main) : null
    };
  } catch (err) {
    return { cpuLoad: null, ramUsedGb: null, ramTotalGb: null, ramPercent: null, cpuTempC: null, error: err.message };
  }
});

function addPlaytimeMinutes(id, minutes) {
  if (minutes <= 0) return;
  const library = store.get('library');
  store.set(
    'library',
    library.map((item) => (item.id === id ? { ...item, totalPlaytimeMinutes: (item.totalPlaytimeMinutes || 0) + minutes } : item))
  );
}

// Steam/Epic games hand off entirely to their own launcher via a protocol URL, so we
// have no process to watch — we can only note that the user pressed Play. For a local
// .exe we spawn it ourselves (rather than shell.openPath) specifically so we get an
// 'exit' event to time the session. This is inherently approximate: a game whose .exe
// is really a launcher that starts the real game and quits will under-report playtime,
// the same limitation any tool without Steam's own instrumentation has.
function performLaunch(id) {
  const item = findItem(id);
  if (!item) return { ok: false, error: 'Item not found' };

  if (item.launchCommand) {
    shell.openExternal(item.launchCommand);
    touchLastPlayed(id);
    return { ok: true };
  }

  if (item.executable && fs.existsSync(item.executable)) {
    try {
      const startedAt = Date.now();
      const child = spawn(item.executable, [], {
        cwd: path.dirname(item.executable),
        detached: true,
        stdio: 'ignore'
      });
      child.on('exit', () => addPlaytimeMinutes(id, Math.round((Date.now() - startedAt) / 60000)));
      child.on('error', () => shell.openPath(item.executable));
      child.unref();
    } catch {
      shell.openPath(item.executable);
    }
    touchLastPlayed(id);
    return { ok: true };
  }

  if (item.installPath && fs.existsSync(item.installPath)) {
    shell.openPath(item.installPath);
    return { ok: true };
  }

  return { ok: false, error: 'No launchable executable found' };
}

ipcMain.handle('item:launch', (event, id) => performLaunch(id));

ipcMain.handle('item:openFolder', (event, id) => {
  const item = findItem(id);
  if (item?.executable && fs.existsSync(item.executable)) {
    shell.showItemInFolder(item.executable);
    return { ok: true };
  }
  if (item?.installPath && fs.existsSync(item.installPath)) {
    shell.openPath(item.installPath);
    return { ok: true };
  }
  return { ok: false, error: 'Install location unknown' };
});

ipcMain.handle('item:uninstall', (event, id) => {
  const item = findItem(id);
  if (!item?.uninstallCommand) return { ok: false, error: 'No uninstaller found' };
  if (item.uninstallCommand.startsWith('steam://')) {
    shell.openExternal(item.uninstallCommand);
    return { ok: true };
  }
  // uninstallCommand comes verbatim from this machine's own registry (Programs & Features
  // uses the same string), not from user or network input, so shell execution is safe here.
  exec(item.uninstallCommand, () => {});
  return { ok: true };
});

ipcMain.handle('item:toggleFavorite', (event, id) => {
  const settings = store.getSettings();
  const favorites = new Set(settings.favorites || []);
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  store.set('settings', { ...settings, favorites: [...favorites] });
  refreshTrayMenu();
  return [...favorites];
});

ipcMain.handle('item:toggleHidden', (event, id) => {
  const settings = store.getSettings();
  const hidden = new Set(settings.hiddenItemIds || []);
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  store.set('settings', { ...settings, hiddenItemIds: [...hidden] });
  return [...hidden];
});

// ---- Collections (user-defined groupings, e.g. "Couch Co-op" or "Backlog") ----
ipcMain.handle('collections:toggleItem', (event, collectionName, itemId) => {
  const settings = store.getSettings();
  const collections = { ...settings.collections };
  const members = new Set(collections[collectionName] || []);
  if (members.has(itemId)) members.delete(itemId);
  else members.add(itemId);
  collections[collectionName] = [...members];
  store.set('settings', { ...settings, collections });
  return collections;
});

ipcMain.handle('collections:rename', (event, oldName, newName) => {
  const settings = store.getSettings();
  const trimmed = newName.trim();
  if (!settings.collections[oldName] || !trimmed || settings.collections[trimmed]) return settings.collections;
  const collections = { ...settings.collections };
  collections[trimmed] = collections[oldName];
  delete collections[oldName];
  store.set('settings', { ...settings, collections });
  return collections;
});

ipcMain.handle('collections:delete', (event, name) => {
  const settings = store.getSettings();
  const collections = { ...settings.collections };
  delete collections[name];
  store.set('settings', { ...settings, collections });
  return collections;
});

// ---- Storage overview ----
ipcMain.handle('library:driveUsage', () => {
  const library = store.get('library');
  const usage = new Map();
  for (const item of library) {
    if (!item.installPath || !item.sizeBytes) continue;
    const match = item.installPath.match(/^([A-Za-z]:)/);
    if (!match) continue;
    const drive = match[1].toUpperCase();
    const entry = usage.get(drive) || { drive, totalBytes: 0, itemCount: 0 };
    entry.totalBytes += item.sizeBytes;
    entry.itemCount += 1;
    usage.set(drive, entry);
  }
  return [...usage.values()].sort((a, b) => b.totalBytes - a.totalBytes);
});

// ---- Backup / restore ----
ipcMain.handle('library:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Playnest Library',
    defaultPath: `playnest-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Playnest Backup', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  const data = {
    exportedAt: new Date().toISOString(),
    library: store.get('library'),
    settings: store.getSettings()
  };
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
  return { ok: true, path: result.filePath };
});

ipcMain.handle('library:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Playnest Library',
    filters: [{ name: 'Playnest Backup', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };

  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    if (!Array.isArray(data.library)) return { ok: false, error: "That file doesn't look like a Playnest backup." };
    store.set('library', data.library);
    if (data.settings) store.set('settings', { ...store.getSettings(), ...data.settings });
    refreshTrayMenu();
    return { ok: true, imported: data.library.length };
  } catch {
    return { ok: false, error: 'Could not read that file — it may be corrupted.' };
  }
});

ipcMain.handle('app:info', () => {
  let buildDate = null;
  try {
    buildDate = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).buildDate || null;
  } catch {
    /* packaged builds still work fine without a build date shown */
  }
  return { name: app.getName(), version: app.getVersion(), buildDate };
});

ipcMain.handle('app:openChangelog', () => {
  shell.openPath(path.join(__dirname, '..', 'CHANGELOG.md'));
});

// ---- Analytics & Recommendations ----
ipcMain.handle('library:getAnalytics', (event, library) => {
  const games = library.filter((i) => i.category === 'game');
  const totalPlaytimeMinutes = games.reduce((sum, g) => sum + (g.totalPlaytimeMinutes || 0), 0);
  const topGames = [...games].sort((a, b) => (b.totalPlaytimeMinutes || 0) - (a.totalPlaytimeMinutes || 0));
  const recentlyPlayed = [...games].sort((a, b) => {
    const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
    const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
    return bTime - aTime;
  });
  const unplayedGames = games.filter((g) => !g.totalPlaytimeMinutes || g.totalPlaytimeMinutes === 0).length;

  const genreCounts = {};
  games.forEach((g) => {
    const genre = g.genre || 'Other';
    if (!genreCounts[genre]) genreCounts[genre] = { minutes: 0, count: 0 };
    genreCounts[genre].minutes += g.totalPlaytimeMinutes || 0;
    genreCounts[genre].count += 1;
  });

  const mostPlayedGenres = Object.entries(genreCounts)
    .map(([genre, data]) => ({ genre, minutes: data.minutes, count: data.count }))
    .sort((a, b) => b.minutes - a.minutes);

  const totalSizeBytes = games.reduce((sum, g) => sum + (g.sizeBytes || 0), 0);

  return {
    totalGames: games.length,
    totalApplications: library.filter((i) => i.category === 'application').length,
    totalPlaytimeMinutes,
    averagePlaytimePerGame: games.length > 0 ? Math.round(totalPlaytimeMinutes / games.length) : 0,
    mostPlayedGenres,
    topGames: topGames.slice(0, 5),
    recentlyPlayed: recentlyPlayed.slice(0, 5),
    unplayedGames,
    totalLibrarySizeGb: totalSizeBytes / 1e9
  };
});

ipcMain.handle('library:getRecommendations', (event, library, topCount = 12) => {
  const games = library.filter((i) => i.category === 'game' && i.genre);
  if (games.length === 0) return [];

  const playedGenres = new Map();
  games.filter((g) => g.totalPlaytimeMinutes && g.totalPlaytimeMinutes > 0).forEach((g) => {
    if (!g.genre) return;
    const count = (playedGenres.get(g.genre) || 0) + 1;
    playedGenres.set(g.genre, count);
  });

  if (playedGenres.size === 0) {
    return games.slice(0, topCount).map((item) => ({
      item,
      score: 0.5,
      reason: 'Popular game in your library'
    }));
  }

  const scored = games.map((game) => {
    let score = 0;
    if (!game.totalPlaytimeMinutes || game.totalPlaytimeMinutes === 0) {
      if (game.genre && playedGenres.has(game.genre)) {
        score = 0.3 + (playedGenres.get(game.genre) * 0.1);
      } else if (playedGenres.size > 0) {
        score = 0.2;
      }
    }
    return { item: game, score: Math.min(score, 0.95) };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topCount)
    .map((s) => ({
      ...s,
      reason: s.item.genre && playedGenres.has(s.item.genre) ? `Similar to your favorites in ${s.item.genre}` : 'Hidden gem recommendation'
    }));
});

// ---- Tags ----
ipcMain.handle('item:toggleTag', (event, tagName, itemId) => {
  const settings = store.getSettings();
  const tags = settings.tags || {};
  if (!tags[tagName]) tags[tagName] = [];
  const idx = tags[tagName].indexOf(itemId);
  if (idx >= 0) tags[tagName].splice(idx, 1);
  else tags[tagName].push(itemId);
  store.set('settings', { ...settings, tags });
  return tags;
});

ipcMain.handle('tags:delete', (event, name) => {
  const settings = store.getSettings();
  const tags = { ...settings.tags };
  delete tags[name];
  store.set('settings', { ...settings, tags });
  return tags;
});

// ---- Update Check ----
// Plain string comparison ("3.9.0" > "3.10.0") is wrong past a single-digit
// version segment — compare numerically, segment by segment.
function isNewerVersion(latest, current) {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Playnest's own real GitHub Releases repo — this used to point at a
// placeholder ("anthropics/playnest", which 404s), so the in-app "update
// available" banner silently never fired even though electron-updater's
// separate background auto-update was working fine. Fixed to the actual repo.
const UPDATE_CHECK_URL = 'https://api.github.com/repos/ofirshudari1-ship-it/playnest/releases/latest';

ipcMain.handle('app:checkForUpdates', async () => {
  try {
    const response = await fetch(UPDATE_CHECK_URL, {
      headers: { 'User-Agent': 'Playnest' }
    }).catch(() => null);
    if (!response || !response.ok) return { hasUpdate: false };
    const latest = await response.json();
    const currentVersion = app.getVersion();
    const latestVersion = latest.tag_name?.replace(/^v/, '');
    const hasUpdate = Boolean(latestVersion && isNewerVersion(latestVersion, currentVersion));
    return {
      hasUpdate,
      latestVersion,
      downloadUrl: latest.html_url
    };
  } catch {
    return { hasUpdate: false };
  }
});
