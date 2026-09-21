export type Category = 'game' | 'application' | 'system';

export interface LibraryItem {
  id: string;
  name: string;
  source: 'steam' | 'epic' | 'gog' | 'registry' | 'folder';
  category: Category;
  genre: string | null;
  publisher?: string;
  version?: string | null;
  installPath: string | null;
  sizeBytes: number | null;
  executable: string | null;
  launchCommand: string | null;
  uninstallCommand: string | null;
  steamAppId?: string;
  coverArt: string | null;
  isFavorite: boolean;
  addedAt?: string;
  releaseYear?: number | null;
  totalPlaytimeMinutes?: number;
  lastPlayedAt?: string | null;
  launchCount?: number;
  tags?: string[];
}

export interface Drive {
  letter: string;
  path: string;
  freeGb: number | null;
  totalGb: number | null;
}

export type GroupBy = 'none' | 'genre' | 'size' | 'year';
// 'system' follows the OS light/dark setting live; 'dark'/'light' are explicit
// manual overrides — see STANDARDS.md §3 ("Dark+Light with automatic OS
// detection + manual switch").
export type Theme = 'system' | 'dark' | 'light';
export type Language = 'en' | 'he';
// How large library cards render — a personal display preference, independent
// of sort/group/filter. 'comfortable' matches the size Playnest always used.
export type GridDensity = 'compact' | 'comfortable' | 'large';

export interface Settings {
  steamGridApiKey: string;
  theme: Theme;
  language: Language;
  hiddenCategories: Category[];
  sortBy: 'name' | 'size' | 'recent' | 'playtime' | 'lastPlayed';
  groupBy: GroupBy;
  favorites: string[];
  hiddenItemIds: string[];
  collections: Record<string, string[]>;
  minimizeToTray: boolean;
  tags: Record<string, string[]>;
  filterPresets?: Record<string, { genres?: string[]; minPlaytime?: number; maxSize?: number }>;
  lastVersionCheck?: string;
  // First-run onboarding has been shown (or explicitly skipped) — the wizard
  // only forces itself open once; after that it's reachable only from Settings.
  setupWizardSeen: boolean;
  updateBannerDismissedVersion?: string;
  gridDensity: GridDensity;
  // Global (system-wide, works even when Playnest isn't focused) hotkey that
  // brings the main window to the front with the search bar focused — a
  // quick-launch shortcut in the spirit of Playnite/GOG Galaxy's overlay
  // hotkeys. Fixed to Ctrl+Shift+L for now (STANDARDS.md §12.4 calls for full
  // remapping; only an on/off toggle ships here — see SPEC.md for the
  // documented gap). Defaults on; registration is best-effort and silently
  // no-ops if the combination is already claimed by another running app.
  quickLaunchHotkeyEnabled: boolean;
  // Hours between automatic background library rescans — a quiet, local-only
  // repeat of the same scan the user already ran by hand at least once (no
  // network, no cloud AI). 0 = off (default). See electron/main.cjs
  // runAutoRescanIfDue and SettingsPanel's "Automatic rescan" control.
  autoRescanHours: number;
  // Real Windows login-item registration (electron/main.cjs
  // applyLaunchOnStartup, app.setLoginItemSettings) — off by default.
  launchOnStartup: boolean;
  // Only takes effect when launchOnStartup is on: open straight to the tray
  // on that automatic launch instead of showing a window.
  startMinimized: boolean;
  // Whether a single click or a double click on the tray icon restores the
  // window — see electron/main.cjs applyTrayClickBehavior(). Defaults to
  // 'single' (matches Discord/Spotify-style tray apps).
  trayClickAction: 'single' | 'double';
  // The library's "add a free SteamGridDB key for real cover art" hint
  // (App.tsx CoverArtHintBanner) is dismissed once and stays dismissed —
  // this persists that across sessions instead of re-showing it every launch.
  coverArtBannerDismissed?: boolean;
  // Opt-in system notification when a background auto-rescan finds new items
  // while the window is hidden (electron/main.cjs runAutoRescanIfDue). Off by
  // default — this is separate from the update-ready notification, which
  // always fires when the window is hidden regardless of this setting.
  backgroundActivityNotifications: boolean;
}

export interface HardwareProfile {
  os: string;
  cpu: { model: string; tier: string; cores: number; speed: number };
  gpu: { tier: string; vramGb: number; model: string };
  ramGb: number;
  ramLabel: string;
  storage: { name: string; type: string; sizeGb: number }[];
  overallScore: number;
  overallLabel: string;
}

export interface ScanOptions {
  drives: string[];
  deepScan: boolean;
}

export interface StaleItem {
  id: string;
  name: string;
  installPath: string | null;
}

export interface DriveUsage {
  drive: string;
  totalBytes: number;
  itemCount: number;
}

export interface LibraryAnalytics {
  totalGames: number;
  totalApplications: number;
  totalPlaytimeMinutes: number;
  averagePlaytimePerGame: number;
  mostPlayedGenres: { genre: string; minutes: number; count: number }[];
  topGames: LibraryItem[];
  recentlyPlayed: LibraryItem[];
  unplayedGames: number;
  totalLibrarySizeGb: number;
}

export interface GameRecommendation {
  item: LibraryItem;
  score: number;
  reason: string;
}

declare global {
  interface Window {
    playnest: {
      getDrives: () => Promise<Drive[]>;
      startScan: (options: ScanOptions) => Promise<number>;
      onScanProgress: (callback: (msg: { message: string }) => void) => () => void;
      getLibrary: () => Promise<LibraryItem[]>;
      getLastScan: () => Promise<string | null>;
      fetchMissingArt: () => Promise<{ ok: boolean; fetched?: number; total?: number; error?: string }>;
      onArtProgress: (callback: (msg: { message: string }) => void) => () => void;
      onLibraryUpdated: (callback: () => void) => () => void;
      getSettings: () => Promise<Settings>;
      setSettings: (settings: Partial<Settings>) => Promise<Settings>;
      getHardwareProfile: () => Promise<HardwareProfile>;
      launchItem: (id: string) => Promise<{ ok: boolean; error?: string }>;
      openFolder: (id: string) => Promise<{ ok: boolean; error?: string }>;
      uninstallItem: (id: string) => Promise<{ ok: boolean; error?: string }>;
      toggleFavorite: (id: string) => Promise<string[]>;
      verifyLibrary: () => Promise<StaleItem[]>;
      removeItems: (ids: string[]) => Promise<{ ok: boolean; removed: number }>;
      appInfo: () => Promise<{ name: string; version: string; buildDate: string | null }>;
      openChangelog: () => Promise<void>;
      exportLibrary: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      importLibrary: () => Promise<{ ok: boolean; imported?: number; error?: string }>;
      getDriveUsage: () => Promise<DriveUsage[]>;
      toggleCollectionItem: (collectionName: string, itemId: string) => Promise<Record<string, string[]>>;
      renameCollection: (oldName: string, newName: string) => Promise<Record<string, string[]>>;
      deleteCollection: (name: string) => Promise<Record<string, string[]>>;
      toggleHiddenItem: (id: string) => Promise<string[]>;
      getAnalytics: (library: LibraryItem[]) => Promise<LibraryAnalytics>;
      getRecommendations: (library: LibraryItem[], topCount?: number) => Promise<GameRecommendation[]>;
      toggleTag: (tagName: string, itemId: string) => Promise<Record<string, string[]>>;
      deleteTag: (name: string) => Promise<Record<string, string[]>>;
      checkForUpdates: () => Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }>;
      getStreak: () => Promise<{ currentStreak: number; longestStreak: number; totalActiveDays: number }>;
      getGameMode: () => Promise<boolean>;
      setGameMode: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
      setPowerPlan: (plan: 'balanced' | 'performance' | 'saver') => Promise<{ ok: boolean; error?: string }>;
      getActivePowerPlan: () => Promise<string>;
      getLiveStats: () => Promise<{ cpuLoad: number | null; ramUsedGb: number | null; ramTotalGb: number | null; ramPercent: number | null; cpuTempC: number | null; error?: string }>;
      // Fires when the user presses the global quick-launch hotkey (main.cjs already
      // brought the window to the front by the time this arrives) — the renderer just
      // needs to focus the search bar.
      onQuickLaunchTrigger: (callback: () => void) => () => void;
    };
  }
}
