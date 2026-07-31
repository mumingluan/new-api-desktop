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
  replaceFrontendStorage: (snapshot) => ipcRenderer.invoke('desktop:replace-frontend-storage', snapshot),
  getKeyQueryProfiles: () => ipcRenderer.invoke('desktop:get-key-query-profiles'),
  saveKeyQueryProfile: (profile) => ipcRenderer.invoke('desktop:save-key-query-profile', profile),
  deleteKeyQueryProfile: (id) => ipcRenderer.invoke('desktop:delete-key-query-profile', id),
  queryToken: (input) => ipcRenderer.invoke('desktop:query-token', input),
  exportKeyQueryCsv: (content) => ipcRenderer.invoke('desktop:export-key-query-csv', content),
  getKeyBatchProfiles: () => ipcRenderer.invoke('desktop:get-key-batch-profiles'),
  saveKeyBatchProfile: (profile) => ipcRenderer.invoke('desktop:save-key-batch-profile', profile),
  deleteKeyBatchProfile: (id) => ipcRenderer.invoke('desktop:delete-key-batch-profile', id),
  connectKeyBatchDatabase: (input) => ipcRenderer.invoke('desktop:connect-key-batch-database', input),
  getKeyBatchGroups: () => ipcRenderer.invoke('desktop:get-key-batch-groups'),
  countKeyBatchGroup: (group) => ipcRenderer.invoke('desktop:count-key-batch-group', group),
  executeKeyBatchOperation: (input) => ipcRenderer.invoke('desktop:execute-key-batch-operation', input),
  queryKeyBatchStats: (input) => ipcRenderer.invoke('desktop:query-key-batch-stats', input),
  exportKeyBatchCsv: (content) => ipcRenderer.invoke('desktop:export-key-batch-csv', content),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  onConfigChanged: (callback) => {
    const listener = (_event, config) => callback(config)
    ipcRenderer.on('desktop-config-changed', listener)
    return () => ipcRenderer.removeListener('desktop-config-changed', listener)
  },
})
