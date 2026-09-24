const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog, screen, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn, execSync } = require('child_process');

const { autoUpdater } = require('electron-updater');

const store = require('./store.cjs');
const { runFullScan } = require('./scanner.cjs');
const { fetchCoverForItem, fileToDataUrl } = require('./steamgriddb.cjs');
const { getHardwareProfile } = require('./hardware.cjs');
const { DEFAULT_STEAMGRID_API_KEY } = require('./config.cjs');

// ---- Main-process i18n (tray menu + desktop widget) ----
// The renderer has its own richer i18n (src/i18n.ts), but the tray menu and
// the desktop widget are built/pushed from here in the main process, which
// never loads that TS module. Both read the very same locales/*.json files
// so the two layers can never drift, and follow the same flat "section.key"
// + {placeholder} + English-fallback contract as t() in src/i18n.ts.
const LOCALES = { en: require('../locales/en.json'), he: require('../locales/he.json') };
function mt(key, vars) {
  const lang = store.getSettings().language === 'he' ? 'he' : 'en';
  const resolve = (dict) => key.split('.').reduce((node, k) => (node == null ? undefined : node[k]), dict);
  let str = resolve(LOCALES[lang]) ?? resolve(LOCALES.en) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
  return str;
}

function effectiveApiKey(settings) {
  return settings.steamGridApiKey || DEFAULT_STEAMGRID_API_KEY;
}

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let splash = null;
let tray = null;
let widget = null;
let isQuitting = false;
// Set by createWindow() while a splash is waiting for the renderer to report
// it's ready (see 'app:rendererReady'); null otherwise.
let pendingReveal = null;

// ---- Branded splash screen (STANDARDS.md §19 — mandatory template, modeled
// 1:1 on HOMEY AI's desktop/splash.html + desktop/main.js createSplash/
// closeSplash/revealMainWindow). Frameless + transparent so the CSS
// border-radius in splash.html actually shows rounded corners instead of a
// square OS-bordered window, and it stays up at least SPLASH_MIN_MS so a
// fast/cached load never flash-and-disappears.
const SPLASH_MIN_MS = 800; // never flash-and-gone even on a fast/cached load
const SPLASH_MAX_MS = 8000; // fail-safe — show the main window regardless if loading hangs

function createSplash() {
  splash = new BrowserWindow({
    width: 320,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.webContents.once('did-finish-load', () => {
    // Inject the real running version the same way app:info reports it
    // (app.getVersion(), kept in sync with version.json by build/sync-version.cjs)
    // rather than duplicating a second source of truth inside splash.html.
    if (splash && !splash.isDestroyed()) {
      splash.webContents
        .executeJavaScript(
          `(() => { const el = document.getElementById('version'); if (el) el.textContent = ${JSON.stringify('v' + app.getVersion())}; })()`
        )
        .catch(() => {
          /* best-effort — a missing version label is not worth failing startup over */
        });
    }
  });
  return splash;
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

// ---- Persistent desktop widget (small always-on-top status panel, separate
// from the main window) — same brand gradient/rounded-corner treatment as the
// splash screen above, but interactive and long-lived instead of a one-shot
// loading screen. Shows the real Streak Tracker numbers (computeStreak(),
// further down) and offers one-click "Open Playnest" / "Launch last-played
// game" without opening the full app. Position persists the same way
// windowState does (see getInitialWindowBounds/saveWindowState above), and
// visibility is a plain settings flag (showDesktopWidget) toggled from
// Settings > System & Startup or the widget's own close control.
const WIDGET_WIDTH = 260;
const WIDGET_HEIGHT = 190;
const WIDGET_REFRESH_MS = 5 * 60 * 1000;

function getInitialWidgetPosition() {
  try {
    const saved = store.get('widgetPosition');
    if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return null;
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x >= a.x && saved.y >= a.y && saved.x < a.x + a.width && saved.y < a.y + a.height;
    });
    return onScreen ? saved : null;
  } catch {
    return null;
  }
}

// Only items performLaunch() can actually start count — a game uninstalled
// since it was last played (its .exe gone, no launcher URL) would otherwise
// sit on the widget as a button that silently does nothing, hiding the
// next-most-recent game that *would* launch. Invalid/missing timestamps are
// skipped rather than sorting as NaN.
function isLaunchable(item) {
  if (item.launchCommand) return true;
  try {
    return Boolean(item.executable) && fs.existsSync(item.executable);
  } catch {
    return false;
  }
}

function findMostRecentlyPlayedItem() {
  const library = store.get('library');
  const played = library
    .map((i) => ({ item: i, at: i.lastPlayedAt ? new Date(i.lastPlayedAt).getTime() : NaN }))
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => b.at - a.at);
  const top = played.find((p) => isLaunchable(p.item));
  return top ? { id: top.item.id, name: top.item.name } : null;
}

// Sent alongside the data on every push so the widget (a separate, sandboxed
// renderer with no access to src/i18n.ts) can render in the app's current
// language/direction without hardcoding English — see widget.html. The two
// "*Tpl" strings keep their {placeholder} un-substituted so widget.html can
// fill in the live numbers/name itself without re-round-tripping to main.
function getWidgetData() {
  return {
    streak: computeStreak(),
    lastPlayed: findMostRecentlyPlayedItem(),
    lang: store.getSettings().language === 'he' ? 'he' : 'en',
    strings: {
      hide: mt('widgetPanel.hide'),
      dayStreak: mt('widgetPanel.dayStreak'),
      noStreak: mt('widgetPanel.noStreak'),
      longestSummaryTpl: mt('widgetPanel.longestSummary', { longest: '{longest}', days: '{days}' }),
      openPlaynest: mt('widgetPanel.openPlaynest'),
      launchLastTpl: mt('widgetPanel.launchLast', { name: '{name}' })
    }
  };
}

// Pushed (not polled) whenever something the widget shows actually changes —
// see touchLastPlayed and mergeScanResults — so the panel reflects live data
// without the user having to reopen or refresh it.
function pushWidgetUpdate() {
  if (widget && !widget.isDestroyed()) widget.webContents.send('widget:data', getWidgetData());
}

function createWidget() {
  if (widget && !widget.isDestroyed()) return widget;

  const position = getInitialWidgetPosition();
  widget = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x: position?.x,
    y: position?.y,
    minWidth: WIDGET_WIDTH,
    minHeight: WIDGET_HEIGHT,
    maxWidth: WIDGET_WIDTH,
    maxHeight: WIDGET_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Never takes keyboard focus, and shown via showInactive() below — the
    // widget is a glanceable status panel, not another window to alt-tab to,
    // and shouldn't steal focus from whatever the user is doing.
    focusable: false,
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'widgetPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  widget.loadFile(path.join(__dirname, 'widget.html'));
  widget.once('ready-to-show', () => {
    if (!widget || widget.isDestroyed()) return;
    widget.showInactive();
    pushWidgetUpdate();
  });

  // The streak is date-relative: with no launch in between, "current streak"
  // must drop to 0 once a full day passes with no activity, but nothing else
  // would push that change (pushes only fire on launches/rescans). A widget
  // left open overnight would keep showing yesterday's number. A cheap
  // periodic refresh keeps it truthful.
  const refreshTimer = setInterval(pushWidgetUpdate, WIDGET_REFRESH_MS);

  // Debounced the same way saveWindowState's caller does (scheduleSaveWindowState)
  // — dragging fires many 'move' events per second, and only the settled
  // position needs to hit disk.
  let moveTimer = null;
  widget.on('move', () => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!widget || widget.isDestroyed()) return;
      const [x, y] = widget.getPosition();
      store.set('widgetPosition', { x, y });
    }, 400);
  });
  widget.on('closed', () => {
    if (moveTimer) clearTimeout(moveTimer);
    clearInterval(refreshTimer);
    widget = null;
  });

  return widget;
}

function closeWidget() {
  if (widget && !widget.isDestroyed()) widget.close();
  widget = null;
}

function applyWidgetVisibility(enabled) {
  if (enabled) createWidget();
  else closeWidget();
}

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

// Pushes the real electron-updater event stream to the Settings screen (see
// src/components/Settings/SettingsPanel.tsx "Updates" section) so the silent
// background updater above has a visible, checkable status instead of being
// invisible until a dialog/notification pops up on its own schedule. Sent as
// a single tagged shape ({state, ...}) the renderer switches on — mirrors the
// 'settings:updated' push pattern already used elsewhere in this file.
function sendUpdaterStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status);
  }
}

// Persisted the same way every other setting is (electron-store, via
// settings.lastVersionCheck) so "last checked" survives an app restart —
// reuses the existing field rather than adding a second, parallel one.
function recordUpdateCheckTime() {
  const now = new Date().toISOString();
  const updated = { ...store.getSettings(), lastVersionCheck: now };
  store.set('settings', updated);
  return now;
}

// Registered once, unconditionally (including in dev) so the manual "Check
// for updates" button in Settings always gets a real status back — even a
// dev build's inevitable "no update feed configured" error is a legitimate
// status to show rather than a silently dead button. Only the *automatic*
// startup check below is gated to packaged builds.
autoUpdater.on('checking-for-update', () => {
  sendUpdaterStatus({ state: 'checking' });
});
autoUpdater.on('update-available', (info) => {
  recordUpdateCheckTime();
  sendUpdaterStatus({ state: 'available', version: info?.version });
});
autoUpdater.on('update-not-available', () => {
  recordUpdateCheckTime();
  sendUpdaterStatus({ state: 'not-available' });
});
autoUpdater.on('download-progress', (progress) => {
  sendUpdaterStatus({ state: 'downloading', percent: Math.round(progress?.percent || 0) });
});
autoUpdater.on('error', (err) => {
  logCrash('autoUpdater', err);
  sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
});

function initAutoUpdater() {
  if (isDev) return; // dev builds have no packaged app.asar / no update feed to hit

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterStatus({ state: 'downloaded', version: info?.version });
    // A dialog attached to a hidden parent window (minimized to tray) has no
    // taskbar entry and is easy to miss entirely — use a tray notification
    // instead whenever the window isn't currently visible. This always fires
    // regardless of the opt-in backgroundActivityNotifications setting below,
    // since a missed update prompt isn't "background noise", it's the only
    // way the user finds out a restart-to-install is available right now.
    const windowHidden = !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible();
    if (windowHidden) {
      try {
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: 'Playnest Update Ready',
            body: `Playnest ${info.version} has been downloaded. Click to restart and install now.`,
            icon: path.join(__dirname, '..', 'assets', 'icon.png')
          });
          notification.on('click', () => {
            isQuitting = true;
            autoUpdater.quitAndInstall();
          });
          notification.show();
        }
      } catch (err) {
        logCrash('autoUpdater notification', err);
      }
      // Ignoring the notification is fine either way — autoInstallOnAppQuit
      // still installs it automatically the next time Playnest actually quits.
      return;
    }

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

  // A launch that starts minimized to the tray (Windows startup, see
  // startedMinimizedAtLogin above) has no window to reveal yet, so the splash
  // would just be a flash of branding before the app vanishes to the tray —
  // skip it entirely in that one case.
  const showSplash = !openHidden;
  if (showSplash) createSplash();
  const splashShownAt = Date.now();

  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    // Swapped in for the splash the moment it's ready — see revealMainWindow —
    // so the two windows never overlap or flicker against each other.
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // BrowserWindow.maximize() also *shows* a hidden window (documented Electron
  // behavior) — calling it here, right after creation, used to pop the blank
  // main window up underneath the splash for anyone whose last session ended
  // maximized, and worse, un-hid a --start-minimized-at-login launch that was
  // supposed to stay in the tray. Deferred to whenever the window is actually
  // shown for the first time instead (revealMainWindow / first 'show').
  let pendingMaximize = Boolean(initialBounds.isMaximized);
  const applyPendingMaximize = () => {
    if (!pendingMaximize || !mainWindow || mainWindow.isDestroyed()) return false;
    pendingMaximize = false;
    mainWindow.maximize();
    return true;
  };
  mainWindow.once('show', applyPendingMaximize);

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
    pendingReveal = null;
    // With minimize-to-tray OFF the user asked for X to mean "exit". But the
    // desktop widget is a second BrowserWindow, so 'window-all-closed' never
    // fires while it's open — the process used to linger with no main window,
    // and the tray's "Open Playnest" (and relaunching from the shortcut) then
    // did nothing because they only ever .show()'d the now-null mainWindow.
    // Quit explicitly instead of relying on window-all-closed.
    if (!isQuitting && !store.getSettings().minimizeToTray) {
      isQuitting = true;
      app.quit();
    }
  });

  // Swap the splash for the real window exactly once, whichever trigger fires
  // first: the renderer reports its first real content is on screen (library
  // + settings loaded — see 'app:rendererReady' below; respects the
  // SPLASH_MIN_MS floor so a fast/cached load doesn't flash-and-vanish), the
  // page failed to load or its renderer died (still has to reveal the window
  // so the user sees the error state instead of being stuck on branding), or
  // the SPLASH_MAX_MS safety timeout in case loading just hangs. Revealing on
  // did-finish-load (as before) showed the window while React was still on its
  // own in-app loading screen — a visible second splash.
  let revealed = false;
  function revealMainWindow() {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
    revealed = true;
    pendingReveal = null;
    closeSplash();
    // maximize() shows the window itself; otherwise show() as normal.
    if (!applyPendingMaximize()) mainWindow.show();
    mainWindow.focus();
  }
  if (showSplash) {
    pendingReveal = () => {
      const elapsed = Date.now() - splashShownAt;
      setTimeout(revealMainWindow, Math.max(0, SPLASH_MIN_MS - elapsed));
    };
    mainWindow.webContents.once('did-fail-load', revealMainWindow);
    mainWindow.webContents.once('render-process-gone', revealMainWindow);
    setTimeout(revealMainWindow, SPLASH_MAX_MS);
  } else {
    // No splash was shown for a started-minimized-at-login launch — just show
    // (or not) the window the same way this codepath always has.
    revealed = true;
  }

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

// The one restore/show/focus path for every "bring Playnest back" entry point
// (tray click, tray menu, relaunch via shortcut/second-instance, widget,
// hotkey). Recreates the window if it no longer exists instead of silently
// doing nothing — previously the tray/second-instance paths called
// mainWindow?.show() and were no-ops whenever mainWindow was null.
// Returns true if a window was already there to show (false = one is being
// created and will reveal itself via the splash flow).
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return false;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  return true;
}

function bringMainWindowToFront() {
  if (showMainWindow()) mainWindow.webContents.send('quickLaunch:trigger');
}

// Same as bringMainWindowToFront above, minus the search-bar jump — used by
// the widget's "Open Playnest" button, which just wants the window in front.
function bringMainWindowToFrontQuiet() {
  showMainWindow();
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
    { label: mt('trayMenu.openPlaynest'), click: () => showMainWindow() },
    ...(favorites.length
      ? [
          { type: 'separator' },
          ...favorites.map((item) => ({ label: `▶ ${item.name}`, click: () => performLaunch(item.id) }))
        ]
      : []),
    { type: 'separator' },
    // The one unambiguous full-exit path in the whole app: isQuitting must be
    // set before app.quit() so mainWindow's 'close' handler (which otherwise
    // intercepts every close while minimizeToTray is on) lets this one through
    // instead of just hiding the window again. See mainWindow.on('close', ...).
    { label: mt('trayMenu.quitPlaynest'), click: () => { isQuitting = true; app.quit(); } }
  ]);
}

// Windows' own taskbar jump-list (right-click the pinned/taskbar icon) — a
// second, native quick-launch surface alongside the tray menu above. Rebuilt
// wherever the tray menu is (favorites change, library changes), so it never
// drifts from what's actually in the tray. No user-facing toggle: it's pure
// upside (nothing shows unless there are favorites with a real .exe on disk)
// and matches how every other Windows game launcher behaves.
function refreshJumpList() {
  if (isDev) return; // no installed exe to register jump-list tasks against
  try {
    const settings = store.getSettings();
    const favIds = new Set(settings.favorites || []);
    const favorites = store
      .get('library')
      .filter((i) => favIds.has(i.id) && i.executable && fs.existsSync(i.executable))
      .slice(0, 5);

    app.setJumpList([
      {
        type: 'custom',
        name: 'Favorites',
        items: favorites.map((item) => ({
          type: 'task',
          title: item.name,
          program: process.execPath,
          // Forwarded through the single-instance lock to launchFromArgv() in
          // the already-running instance (or handled directly if Playnest
          // wasn't running yet) — never launched by the jump-list entry itself.
          args: `--launch=${item.id}`,
          iconPath: item.executable,
          iconIndex: 0,
          description: `Launch ${item.name}`
        }))
      },
      {
        type: 'tasks',
        items: [{ type: 'task', title: 'Open Playnest', program: process.execPath, args: '', iconPath: process.execPath, iconIndex: 0, description: 'Open Playnest' }]
      }
    ]);
  } catch (err) {
    logCrash('setJumpList', err);
  }
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
  refreshJumpList();
}

// A --launch=<id> arg comes only from a jump-list task above (see
// refreshJumpList) — arrives either on a fresh launch (Playnest wasn't
// running) or via the 'second-instance' event when it was.
function launchFromArgv(argv) {
  const arg = argv.find((a) => a.startsWith('--launch='));
  if (!arg) return;
  const id = arg.slice('--launch='.length);
  if (id) performLaunch(id);
}

// Single click vs. double click to restore from the tray — 'single' (default)
// matches Discord/Spotify-style tray apps; 'double' suits anyone who finds a
// single click too easy to trigger by accident. Re-applied whenever the
// setting changes (see settings:set) rather than only at tray creation.
function applyTrayClickBehavior() {
  if (!tray) return;
  tray.removeAllListeners('click');
  tray.removeAllListeners('double-click');
  const restore = () => showMainWindow();
  if (store.getSettings().trayClickAction === 'double') {
    tray.on('double-click', restore);
  } else {
    tray.on('click', restore);
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Playnest');
  tray.setContextMenu(buildTrayMenu());
  applyTrayClickBehavior();
  refreshJumpList();
}

// Opt-in system notification for low-priority background activity (currently:
// an auto-rescan finding new items). Suppressed while the window is already
// visible and focused — the user is looking at Playnest, they don't need a
// toast to tell them something they're about to see refresh in the grid.
function notifyBackgroundActivity(title, body) {
  try {
    if (!store.getSettings().backgroundActivityNotifications) return;
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) return;
    if (!Notification.isSupported()) return;
    new Notification({ title, body, icon: path.join(__dirname, '..', 'assets', 'icon.png') }).show();
  } catch (err) {
    logCrash('notifyBackgroundActivity', err);
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // A jump-list "Favorites" click carries --launch=<id> and should launch
    // that game rather than (or in addition to) just refocusing the window.
    launchFromArgv(argv);
    showMainWindow();
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    // Independent of mainWindow's own visibility (even a started-minimized-at-login
    // launch gets the widget) — its whole point is glanceable status without opening
    // the full app.
    if (store.getSettings().showDesktopWidget) createWidget();
    launchFromArgv(process.argv); // covers a --launch=<id> jump-list click when Playnest wasn't already running
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
// Fields that only Playnest itself ever writes onto a library item (never the
// scanner) — play history and SteamGridDB metadata. A fresh scan result has
// none of them, so without carrying them over every rescan (manual OR the
// silent scheduled one) used to wipe the whole library's play history:
// lastPlayedAt (the widget's "launch last-played" action and the "Last
// played" sort), totalPlaytimeMinutes (Analytics/Insights), releaseYear.
// Scanner ids are stable content hashes (scanner.cjs makeId), so matching by
// id is exact.
const PRESERVED_ITEM_FIELDS = ['addedAt', 'lastPlayedAt', 'totalPlaytimeMinutes', 'releaseYear'];

function carryOverItemHistory(rawItems, previousLibrary, now) {
  const previousById = new Map(previousLibrary.map((i) => [i.id, i]));
  return rawItems.map((item) => {
    const previous = previousById.get(item.id);
    const merged = { ...item };
    if (previous) {
      for (const field of PRESERVED_ITEM_FIELDS) {
        if (previous[field] != null && merged[field] == null) merged[field] = previous[field];
      }
    }
    if (!merged.addedAt) merged.addedAt = now;
    return merged;
  });
}

function mergeScanResults(rawItems) {
  const previousLibrary = store.get('library');
  const now = new Date().toISOString();
  const withTimestamps = carryOverItemHistory(rawItems, previousLibrary, now);

  store.set('library', withTimestamps);
  store.set('lastScan', now);
  refreshTrayMenu();
  pushWidgetUpdate(); // a rescan can drop the last-played item (uninstalled) — keep the widget honest
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
    const previousCount = store.get('library').length;
    const options = store.get('lastScanOptions') || { drives: [], deepScan: false };
    const rawItems = await runFullScan(options, () => {});
    const merged = mergeScanResults(rawItems);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:updated');

    const added = merged.length - previousCount;
    if (added > 0) {
      notifyBackgroundActivity('Playnest', `Found ${added} new item${added === 1 ? '' : 's'} in your library.`);
    }
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
  if ('trayClickAction' in newSettings) applyTrayClickBehavior();
  if ('showDesktopWidget' in newSettings) applyWidgetVisibility(updated.showDesktopWidget);
  // Tray menu labels and the widget's on-screen text are both built from
  // mt()/getWidgetData() in the main process (see LOCALES above) — a language
  // switch needs both rebuilt/re-pushed here, same as the renderer's own
  // language switch re-renders via src/i18n.ts's subscribeLanguage().
  if ('language' in newSettings) {
    refreshTrayMenu();
    pushWidgetUpdate();
  }
  return updated;
});

// ---- Desktop widget ----
ipcMain.handle('widget:getData', () => getWidgetData());
ipcMain.handle('widget:openMain', () => {
  bringMainWindowToFrontQuiet();
  return { ok: true };
});
ipcMain.handle('widget:launchLastPlayed', () => {
  const item = findMostRecentlyPlayedItem();
  if (!item) return { ok: false, error: 'No recently played item' };
  return performLaunch(item.id);
});
// The widget's own close control turns off the same persisted setting the
// Settings toggle controls (rather than just hiding this window instance),
// so it doesn't silently reappear on the next launch — and pushes the change
// back to any open main window so its Settings panel doesn't go stale.
ipcMain.handle('widget:hide', () => {
  store.set('settings', { ...store.getSettings(), showDesktopWidget: false });
  const updated = store.getSettings();
  applyWidgetVisibility(false);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:updated', updated);
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

  // Every real launch can move the streak and the "last played" quick-action —
  // keep the widget live without the user reopening it. Safe to call before
  // createWidget() ever ran (pushWidgetUpdate no-ops while widget is null).
  pushWidgetUpdate();
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

// The renderer's first real screen is up (library + settings loaded) — the
// splash can hand over now. Only the current main window's own webContents
// can trigger it (any other sender is ignored).
ipcMain.on('app:rendererReady', (event) => {
  if (!pendingReveal || !mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender !== mainWindow.webContents) return;
  pendingReveal();
});

// CHANGELOG.md is packed inside app.asar in an installed build. Electron's asar
// transparency only applies to Node's fs inside this process — shell.openPath
// hands the path to the Windows shell, which can't see into the archive, so
// the About screen's "View changelog" link silently failed in every installed
// build (it only worked in a dev checkout). Copy it out to a real temp file
// first and open that.
ipcMain.handle('app:openChangelog', async () => {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    const outPath = path.join(app.getPath('temp'), 'Playnest-CHANGELOG.md');
    fs.writeFileSync(outPath, content, 'utf8');
    const error = await shell.openPath(outPath);
    if (error) logCrash('openChangelog', new Error(error));
    return { ok: !error };
  } catch (err) {
    logCrash('openChangelog', err);
    return { ok: false };
  }
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

// ---- Settings > Updates section — the real electron-updater instance above,
// exposed to the renderer as a manual trigger + persisted "last checked"
// timestamp. Distinct from app:checkForUpdates (the lightweight GitHub API
// poll behind App.tsx's dismissible top banner) — this one drives the actual
// silent auto-download/auto-install pipeline and its live status stream.
ipcMain.handle('updater:checkNow', async () => {
  if (isDev || !app.isPackaged) {
    // No packaged app.asar / update feed to hit — report a real status
    // instead of leaving the Settings button spinning forever.
    recordUpdateCheckTime();
    return { ok: false, reason: 'dev' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    logCrash('autoUpdater checkForUpdates (manual)', err);
    recordUpdateCheckTime();
    sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
    return { ok: false, reason: 'error' };
  }
});

ipcMain.handle('updater:getStatus', () => {
  return { lastCheckedAt: store.getSettings().lastVersionCheck || null };
});
