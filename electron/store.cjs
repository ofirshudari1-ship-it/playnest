const Store = require('electron-store');
const fs = require('fs');
const { app } = require('electron');

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
  // Playnite-style completion/play status (id -> 'playing'|'completed'|'on_hold'|
  // 'dropped'|'plan_to_play'), same map-of-ids pattern as favorites/tags above —
  // see src/types.ts CompletionStatus for why it lives here and not on the item.
  completionStatus: {},
  statusFilter: 'all',
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
  startMinimized: false,
  // Persists the dismissal of the library's "add a free SteamGridDB key" hint
  // banner (src/App.tsx CoverArtHintBanner) across sessions.
  coverArtBannerDismissed: false,
  // Small always-on-top desktop widget (electron/widget.html, main.cjs
  // createWidget/applyWidgetVisibility) showing the live streak and one-click
  // quick actions without opening the full app. Off by default (opt-in);
  // toggled from Settings > System & Startup, and its own close control
  // turns this off too.
  showDesktopWidget: false,
  // Controls autoUpdater.autoInstallOnAppQuit (electron/main.cjs) — whether a
  // downloaded update installs itself automatically the next time Playnest
  // quits, versus staying downloaded until the user explicitly restarts from
  // the "Update Ready" dialog/notification. Default ON: this is the behavior
  // Playnest has always had (autoInstallOnAppQuit was hardcoded true with no
  // toggle before this setting existed), and defaulting it OFF on an upgrade
  // would silently change what existing users experience without them ever
  // seeing an opt-in ask for that change — a bigger regression than shipping
  // an off-switch that starts in its current position. autoDownload itself
  // is NOT gated by this — Playnest always downloads a found update in the
  // background; this setting only controls whether it self-installs on quit.
  autoInstallUpdates: true,
  // Lets a connected Xbox/PlayStation-style gamepad drive the library grid's
  // existing keyboard navigation (arrow keys/Enter/Escape) — see
  // src/hooks/useGamepadNavigation.ts. On by default; it only ever acts when
  // the Gamepad API reports a connected controller, so it's a no-op otherwise.
  controllerNavigationEnabled: true
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
    windowState: null,
    // Last dragged screen position of the desktop widget (electron/main.cjs
    // createWidget) — same top-level persistence pattern as windowState,
    // separate from `settings` since it's a physical position, not a
    // preference. null until the user has ever dragged it once.
    widgetPosition: null
  }
});

// Captured once, at module load, before anything has had a chance to write to
// the config file — true only for a genuinely fresh install/profile with no
// saved data yet. electron-store creates its JSON file lazily on first write,
// so its absence here is a reliable first-run signal.
const isFreshProfile = !fs.existsSync(store.path);
let freshProfileLanguageResolved = false;

// electron-builder's NSIS `displayLanguageSelector` only changes the language
// of the INSTALLER's own UI text — it has no supported mechanism (no registry
// key, no env var, no file) to hand that choice to the app once installed. So
// there is no real installer-language signal to read here. The best honest
// cross-platform substitute is Electron's own app.getLocale(), which reflects
// the Windows display language the user already has. Only used once, on a
// profile's very first read, so it never overrides a language the user (or an
// existing profile) has since chosen.
function detectInstallLanguage() {
  try {
    const locale = (app.getLocale() || '').toLowerCase();
    return locale.startsWith('he') ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

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

  let languageDefaulted = false;
  if (isFreshProfile && !freshProfileLanguageResolved) {
    freshProfileLanguageResolved = true;
    if (merged.language === DEFAULT_SETTINGS.language) {
      merged.language = detectInstallLanguage();
      languageDefaulted = true;
    }
  }

  if (Object.keys(merged).length !== Object.keys(current).length || wasMissingSetupFlag || languageDefaulted) {
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
