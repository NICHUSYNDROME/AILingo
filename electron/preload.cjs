const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (data) => ipcRenderer.invoke('write-settings', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveDebugLog: (filename, data) => ipcRenderer.invoke('save-debug-log', filename, data),
  cleanupOldLogs: () => ipcRenderer.invoke('cleanup-old-logs'),
});
