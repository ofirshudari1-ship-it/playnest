const { contextBridge, ipcRenderer } = require('electron');

// Isolated bridge for the desktop widget window (electron/widget.html) — kept
// separate from preload.cjs (the main window's bridge) since the widget is a
// different BrowserWindow with a much smaller, read-mostly surface: it never
// needs scanning, settings editing, or any of the main window's IPC channels.
contextBridge.exposeInMainWorld('playnestWidget', {
  getData: () => ipcRenderer.invoke('widget:getData'),
  openPlaynest: () => ipcRenderer.invoke('widget:openMain'),
  launchLastPlayed: () => ipcRenderer.invoke('widget:launchLastPlayed'),
  hide: () => ipcRenderer.invoke('widget:hide'),
  onUpdate: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('widget:data', listener);
    return () => ipcRenderer.removeListener('widget:data', listener);
  }
});
