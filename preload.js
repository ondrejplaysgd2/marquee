const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mp', {
  scanMovies: () => ipcRenderer.invoke('movies:scan'),
  addFolder: () => ipcRenderer.invoke('movies:addFolder'),
  addFolderPath: (dir) => ipcRenderer.invoke('movies:addFolderPath', dir),
  openInVlc: (file, fullscreen) => ipcRenderer.invoke('movies:openVlc', file, fullscreen),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  storeGet: () => ipcRenderer.invoke('store:get'),
  storeSet: (data) => ipcRenderer.invoke('store:set', data)
});