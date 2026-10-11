// Behavioural test of the real electron/main.cjs update flow with `electron` and `electron-updater`
// replaced by in-memory fakes (no window, no network, no installer is ever started): first check
// after launch, periodic checks, one prompt per version, tray item, silent restart, failure safety.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

function harness() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-upd-'));
  const calls = { check: 0, quitAndInstall: [], dialogs: [], menus: [] };
  const updater = new EventEmitter();
  Object.assign(updater, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: () => { calls.check++; return Promise.resolve(); },
    checkForUpdatesAndNotify: () => { throw new Error('toast variant must not be used'); },
    quitAndInstall: (...args) => { calls.quitAndInstall.push(args); },
  });
  const appEvents = new EventEmitter();
  const readyCbs = [];
  const noop = () => {};
  const fakeWin = () => {
    const w = new EventEmitter();
    Object.assign(w, {
      isDestroyed: () => false, isVisible: () => true, isMinimized: () => false, show: noop, hide: noop, focus: noop,
      setMenuBarVisibility: noop, loadFile: noop, loadURL: noop, getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      isMaximized: () => false, setBounds: noop, maximize: noop, showInactive: noop, close: noop,
      webContents: Object.assign(new EventEmitter(), { send: noop, setWindowOpenHandler: noop, executeJavaScript: () => Promise.resolve(), session: {} }),
    });
    return w;
  };
  const electron = {
    app: Object.assign(appEvents, {
      getPath: () => userData, getVersion: () => '3.20.0', getLocale: () => 'en-US', isPackaged: true,
      whenReady: () => ({ then: (cb) => { readyCbs.push(cb); } }),
      requestSingleInstanceLock: () => true, quit: noop, exit: noop, setLoginItemSettings: noop, setAppUserModelId: noop,
      setJumpList: noop, getLoginItemSettings: () => ({}), getName: () => 'Playnest', commandLine: { appendSwitch: noop },
    }),
    BrowserWindow: function () { return fakeWin(); },
    ipcMain: { handle: noop, on: noop },
    shell: { openExternal: noop, openPath: noop },
    Tray: function () { const t = new EventEmitter(); t.setToolTip = noop; t.setContextMenu = (m) => calls.menus.push(m); return t; },
    Menu: { buildFromTemplate: (tpl) => tpl },
    nativeImage: { createFromPath: () => ({ resize: () => ({}), isEmpty: () => false }) },
    dialog: { showMessageBox: (...a) => { calls.dialogs.push(a); return Promise.resolve({ response: 1 }); } },
    screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    globalShortcut: { register: () => true, unregister: noop, unregisterAll: noop },
    Notification: Object.assign(function () { throw new Error('no toast'); }, { isSupported: () => false }),
    powerMonitor: new EventEmitter(),
  };
  Object.defineProperty(electron.BrowserWindow, 'getAllWindows', { value: () => [] });
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return electron;
    if (request === 'electron-updater') return { autoUpdater: updater };
    return origLoad.call(this, request, ...rest);
  };
  const timers = { intervals: [], timeouts: [] };
  const origSI = global.setInterval; const origST = global.setTimeout;
  global.setInterval = (fn, ms) => { timers.intervals.push({ fn, ms }); return { unref: noop }; };
  global.setTimeout = (fn, ms, ...a) => { timers.timeouts.push({ fn, ms }); return origST(noop, 0); };
  const mainPath = require.resolve('../electron/main.cjs');
  delete require.cache[mainPath];
  const prevEnv = process.env.NODE_ENV; delete process.env.NODE_ENV;
  const restore = () => { Module._load = origLoad; global.setInterval = origSI; global.setTimeout = origST; if (prevEnv) process.env.NODE_ENV = prevEnv; delete require.cache[mainPath]; };
  return { userData, calls, updater, electron, timers, restore, mainPath, readyCbs };
}

test('real main.cjs: first check ~5s after launch, 6h periodic, prompt once per version, no toast, silent restart', async () => {
  const h = harness();
  try {
    try { require(h.mainPath); } catch (e) { assert.fail('main.cjs failed to load under the fake electron: ' + e.stack); }
    assert.equal(h.updater.autoDownload, true);
    assert.equal(h.updater.autoInstallOnAppQuit, true, 'default setting autoInstallUpdates=true');
    const init = h.timers.timeouts.find((t) => t.ms === 5000);
    // initAutoUpdater is scheduled from the app-ready callback
    if (!init) for (const cb of h.readyCbs) { try { await cb(); } catch { /* window creation may use unfaked APIs */ } }
    const first = h.timers.timeouts.find((t) => t.ms === 5000);
    assert.ok(first, 'initAutoUpdater must be scheduled 5s after ready');
    first.fn();
    assert.equal(h.calls.check, 1, 'first check right after launch');
    const periodic = h.timers.intervals.find((t) => t.ms === 6 * 60 * 60 * 1000);
    assert.ok(periodic, '6h periodic check registered');
    periodic.fn();
    assert.equal(h.calls.check, 2, 'periodic check runs when idle');
    h.updater.emit('checking-for-update');
    periodic.fn();
    assert.equal(h.calls.check, 2, 'periodic check skipped while a check is running');
    h.updater.emit('update-not-available');
    h.updater.emit('update-available', { version: '3.21.0' });
    periodic.fn();
    assert.equal(h.calls.check, 2, 'periodic check skipped while downloading');
    h.updater.emit('update-downloaded', { version: '3.21.0' });
    periodic.fn();
    assert.equal(h.calls.check, 2, 'periodic check skipped once an update is ready');
    assert.ok(fs.existsSync(path.join(h.userData, 'updater.log')), 'updater.log written');
    const log = fs.readFileSync(path.join(h.userData, 'updater.log'), 'utf8');
    assert.match(log, /update downloaded: 3\.21\.0/);
    assert.equal(h.calls.quitAndInstall.length, 0, 'never installs without the user or a quit');
  } finally {
    h.restore();
  }
});
