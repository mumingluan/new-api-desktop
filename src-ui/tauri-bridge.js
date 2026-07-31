(function () {
  const tauri = window.__TAURI__
  if (!tauri?.core?.invoke) {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.textContent = 'Tauri runtime is unavailable.'
    })
    return
  }

  const invoke = async (command, args = {}) => {
    try {
      return await tauri.core.invoke(command, args)
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  window.newApiDesktop = {
    platform: tauri.os?.platform?.() || 'unknown',
    versions: {},
    getConfig: () => invoke('get_config'),
    saveInstance: (input) => invoke('save_instance', { input }),
    deleteInstance: (id) => invoke('delete_instance', { id }),
    setActiveInstance: (id) => invoke('set_active_instance', { id }),
    setFlavor: (flavor) => invoke('set_flavor', { flavor }),
    setLanguage: (language) => invoke('set_language', { language }),
    refreshStatus: () => invoke('refresh_status'),
    validateAccessToken: (input) => invoke('validate_access_token', { input }),
    openExternal: (url) => invoke('open_external', { url }),
    openWindow: (options) => invoke('open_window', { options }),
    openToolWindow: (tool) => invoke('open_tool_window', { tool }),
    replaceFrontendStorage: (snapshot) => invoke('replace_frontend_storage', { snapshot }),
    getKeyQueryProfiles: () => invoke('get_key_query_profiles'),
    saveKeyQueryProfile: (profile) => invoke('save_key_query_profile', { profile }),
    deleteKeyQueryProfile: (id) => invoke('delete_key_query_profile', { id }),
    queryToken: (input) => invoke('query_token', { input }),
    exportKeyQueryCsv: (content) => invoke('export_csv', { content, kind: 'query' }),
    getKeyBatchProfiles: () => invoke('get_key_batch_profiles'),
    saveKeyBatchProfile: (profile) => invoke('save_key_batch_profile', { profile }),
    deleteKeyBatchProfile: (id) => invoke('delete_key_batch_profile', { id }),
    connectKeyBatchDatabase: (input) => invoke('connect_key_batch_database', { input }),
    getKeyBatchGroups: () => invoke('get_key_batch_groups'),
    countKeyBatchGroup: (group) => invoke('count_key_batch_group', { group }),
    executeKeyBatchOperation: (input) => invoke('execute_key_batch_operation', { input }),
    queryKeyBatchStats: (input) => invoke('query_key_batch_stats', { input }),
    exportKeyBatchCsv: (content) => invoke('export_csv', { content, kind: 'batch' }),
    checkForUpdates: () => invoke('check_for_updates'),
    reloadWindow: () => invoke('reload_window'),
    toggleDevtools: () => invoke('toggle_devtools'),
    onConfigChanged: (callback) => {
      let dispose = () => {}
      tauri.event.listen('desktop-config-changed', ({ payload }) => callback(payload))
        .then((unlisten) => { dispose = unlisten })
        .catch(() => {})
      return () => dispose()
    },
  }

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase()
    const reloadRequested = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && key === 'r')
    const devtoolsRequested =
      event.key === 'F12' ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'i') ||
      (event.metaKey && event.altKey && key === 'i')
    if (reloadRequested) {
      event.preventDefault()
      window.newApiDesktop.reloadWindow().catch(() => {})
    } else if (devtoolsRequested) {
      event.preventDefault()
      window.newApiDesktop.toggleDevtools().catch(() => {})
    }
  }, true)

  document.addEventListener('DOMContentLoaded', async () => {
    const config = await window.newApiDesktop.getConfig().catch(() => null)
    if (!config?.mobile || location.pathname === '/' || location.pathname.endsWith('/index.html') && !location.pathname.includes('key-')) return
    const back = document.createElement('button')
    back.type = 'button'
    back.textContent = '‹'
    back.title = '返回设置'
    back.className = 'tauri-mobile-back'
    Object.assign(back.style, {
      position: 'fixed', left: '12px', top: '12px', zIndex: '2147483647',
      width: '42px', height: '42px', borderRadius: '21px',
      border: '1px solid rgba(127,127,127,.35)', background: 'rgba(20,20,20,.78)',
      color: '#fff', fontSize: '30px', lineHeight: '34px',
    })
    back.addEventListener('click', () => window.newApiDesktop.openToolWindow('settings'))
    document.body.append(back)
  })
})()
