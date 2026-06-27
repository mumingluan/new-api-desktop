const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('newApiDesktop', {
  platform: process.platform,
  versions: process.versions,
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveInstance: (instance) => ipcRenderer.invoke('desktop:save-instance', instance),
  deleteInstance: (id) => ipcRenderer.invoke('desktop:delete-instance', id),
  setActiveInstance: (id) => ipcRenderer.invoke('desktop:set-active-instance', id),
  setFlavor: (flavor) => ipcRenderer.invoke('desktop:set-flavor', flavor),
  setLanguage: (language) => ipcRenderer.invoke('desktop:set-language', language),
  refreshStatus: () => ipcRenderer.invoke('desktop:refresh-status'),
  validateAccessToken: (instance) => ipcRenderer.invoke('desktop:validate-access-token', instance),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  openWindow: (options) => ipcRenderer.invoke('desktop:open-window', options),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  onConfigChanged: (callback) => {
    const listener = (_event, config) => callback(config)
    ipcRenderer.on('desktop-config-changed', listener)
    return () => ipcRenderer.removeListener('desktop-config-changed', listener)
  },
})
