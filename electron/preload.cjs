const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('playnest', {
  getDrives: () => ipcRenderer.invoke('drives:list'),
  startScan: (options) => ipcRenderer.invoke('scan:start', options),
  onScanProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('scan:progress', listener);
    return () => ipcRenderer.removeListener('scan:progress', listener);
  },
  getLibrary: () => ipcRenderer.invoke('library:get'),
  getLastScan: () => ipcRenderer.invoke('library:lastScan'),
  fetchMissingArt: () => ipcRenderer.invoke('art:fetchMissing'),
  onArtProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('art:progress', listener);
    return () => ipcRenderer.removeListener('art:progress', listener);
  },
  onLibraryUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('library:updated', listener);
    return () => ipcRenderer.removeListener('library:updated', listener);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  getHardwareProfile: () => ipcRenderer.invoke('hardware:get'),
  launchItem: (id) => ipcRenderer.invoke('item:launch', id),
  openFolder: (id) => ipcRenderer.invoke('item:openFolder', id),
  uninstallItem: (id) => ipcRenderer.invoke('item:uninstall', id),
  toggleFavorite: (id) => ipcRenderer.invoke('item:toggleFavorite', id),
  verifyLibrary: () => ipcRenderer.invoke('library:verify'),
  removeItems: (ids) => ipcRenderer.invoke('library:removeItems', ids),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openChangelog: () => ipcRenderer.invoke('app:openChangelog'),
  // Tells main.cjs the first real screen is rendered so it can close the
  // splash and reveal this window (STANDARDS.md §19.2). Fire-and-forget.
  notifyReady: () => ipcRenderer.send('app:rendererReady'),
  exportLibrary: () => ipcRenderer.invoke('library:export'),
  importLibrary: () => ipcRenderer.invoke('library:import'),
  getDriveUsage: () => ipcRenderer.invoke('library:driveUsage'),
  toggleCollectionItem: (collectionName, itemId) => ipcRenderer.invoke('collections:toggleItem', collectionName, itemId),
  renameCollection: (oldName, newName) => ipcRenderer.invoke('collections:rename', oldName, newName),
  deleteCollection: (name) => ipcRenderer.invoke('collections:delete', name),
  toggleHiddenItem: (id) => ipcRenderer.invoke('item:toggleHidden', id),
  getAnalytics: (library) => ipcRenderer.invoke('library:getAnalytics', library),
  getRecommendations: (library, topCount) => ipcRenderer.invoke('library:getRecommendations', library, topCount),
  toggleTag: (tagName, itemId) => ipcRenderer.invoke('item:toggleTag', tagName, itemId),
  deleteTag: (name) => ipcRenderer.invoke('tags:delete', name),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  getStreak: () => ipcRenderer.invoke('stats:getStreak'),
  getGameMode: () => ipcRenderer.invoke('system:getGameMode'),
  setGameMode: (enabled) => ipcRenderer.invoke('system:setGameMode', enabled),
  setPowerPlan: (plan) => ipcRenderer.invoke('system:setPowerPlan', plan),
  getActivePowerPlan: () => ipcRenderer.invoke('system:getActivePowerPlan'),
  getLiveStats: () => ipcRenderer.invoke('system:liveStats'),
  onQuickLaunchTrigger: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('quickLaunch:trigger', listener);
    return () => ipcRenderer.removeListener('quickLaunch:trigger', listener);
  },
  // Pushed when a setting changes from somewhere other than this window's own
  // Settings panel — currently only the desktop widget's close control (see
  // widget:hide in main.cjs), which flips showDesktopWidget off directly.
  onSettingsUpdated: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:updated', listener);
    return () => ipcRenderer.removeListener('settings:updated', listener);
  }
});
