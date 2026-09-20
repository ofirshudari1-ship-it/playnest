const Store = require('electron-store');

const DEFAULT_SETTINGS = {
  steamGridApiKey: '',
  theme: 'system',
  language: 'en',
  hiddenCategories: ['system'],
  sortBy: 'name',
  groupBy: 'none',
  favorites: [],
  hiddenItemIds: [],
  collections: {},
  // Default changed to true (was false) so closing the window keeps Playnest
  // running in the tray out of the box — the Quit Playnest tray menu item is
  // the unambiguous full-exit path, see main.cjs buildTrayMenu(). Existing
  // users who already have a saved `false` keep their own choice; this only
  // changes what a fresh profile starts with.
  minimizeToTray: true,
  tags: {},
  // 'single' (default) restores the window on a single tray-icon click, matching
  // most Windows tray apps (Discord, Spotify). 'double' requires a double-click,
  // which some users prefer to avoid an accidental single-click reopening the
  // window. See main.cjs applyTrayClickBehavior().
  trayClickAction: 'single',
  // Off by default — an opt-in system notification when a background auto-rescan
  // (see runAutoRescanIfDue) finds new items while the window isn't visible. An
  // update-ready notification is shown regardless of this flag when the window is
  // hidden, since that dialog would otherwise go unseen — see initAutoUpdater.
  backgroundActivityNotifications: false,
  filterPresets: {},
  lastVersionCheck: null,
  setupWizardSeen: false,
  updateBannerDismissedVersion: null,
  gridDensity: 'comfortable',
  quickLaunchHotkeyEnabled: true,
  // Hours between automatic background rescans; 0 = disabled (default — a
  // scan touches the filesystem/registry and we never do that without the
  // user having opted in at least once). 24 = daily, 168 = weekly.
  autoRescanHours: 0,
  // Real Windows login-item registration (app.setLoginItemSettings), not a
  // decorative toggle — off by default so installing Playnest never silently
  // adds itself to Windows startup without the user asking. See main.cjs
  // applyLaunchOnStartup().
  launchOnStartup: false,
  // Only meaningful in combination with launchOnStartup — whether the app
  // should open straight to the tray (via a --start-minimized launch arg)
  // instead of popping a window the moment Windows signs the user in.
  startMinimized: false
};

const store = new Store({
  name: 'playnest-library',
  defaults: {
    library: [],
    lastScan: null,
    // Remembers the drives/deepScan choice from the user's last manual scan
    // so a scheduled automatic rescan (see main.cjs) can repeat the same
    // scope instead of guessing or re-prompting.
    lastScanOptions: null,
    settings: DEFAULT_SETTINGS,
    activityDays: [],
    windowState: null
  }
});

// electron-store only applies `defaults` when a top-level key is entirely missing.
// A settings object saved by an older build (before a field like groupBy existed)
// keeps that field permanently undefined otherwise — self-heal it on every read.
function getSettings() {
  const current = store.get('settings') || {};
  const wasMissingSetupFlag = current.setupWizardSeen === undefined;
  const merged = { ...DEFAULT_SETTINGS, ...current };

  // A profile upgrading from a build that predates this flag has, by definition,
  // already been through setup — it has a real library. Defaulting a returning
  // user with existing games into the first-run wizard would be a regression,
  // not a fresh install. Only a genuinely empty, flag-less profile is first-run.
  if (wasMissingSetupFlag && store.get('library', []).length > 0) {
    merged.setupWizardSeen = true;
  }

  if (Object.keys(merged).length !== Object.keys(current).length || wasMissingSetupFlag) {
    store.set('settings', merged);
  }
  return merged;
}

// Same self-heal as getSettings — an older store file predates this key entirely.
function getActivityDays() {
  return store.get('activityDays') || [];
}

module.exports = store;
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports.getSettings = getSettings;
module.exports.getActivityDays = getActivityDays;
