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
    exportConfiguration: (sections) => invoke('export_configuration', { sections }),
    importConfiguration: (sections) => invoke('import_configuration', { sections }),
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
    const controls = document.createElement('div')
    const makeButton = (label, icon) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.title = label
      button.setAttribute('aria-label', label)
      button.innerHTML = icon
      Object.assign(button.style, {
        display: 'grid', placeItems: 'center', width: '40px', height: '36px', minHeight: '36px',
        padding: '0', border: '0', background: 'transparent', color: 'inherit',
        lineHeight: '1', touchAction: 'none',
      })
      return button
    }
    const language = config.desktopLanguage === 'zh' || (config.desktopLanguage === 'auto' && navigator.language.toLowerCase().startsWith('zh')) ? 'zh' : 'en'
    const back = makeButton(language === 'zh' ? '返回设置' : 'Back to settings',
      '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    const refresh = makeButton(language === 'zh' ? '刷新' : 'Refresh',
      '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="19" height="19"><path d="M19 8a8 8 0 1 0 1 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19 3v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    const divider = document.createElement('span')
    Object.assign(divider.style, { width: '1px', height: '20px', background: 'rgba(255,255,255,.24)' })
    controls.append(back, divider, refresh)
    controls.className = 'tauri-mobile-tool-controls'
    Object.assign(controls.style, {
      position: 'fixed', left: '12px', top: '12px', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '82px', height: '38px', boxSizing: 'border-box', padding: '0',
      border: '1px solid rgba(127,127,127,.38)', borderRadius: '19px',
      background: 'rgba(20,20,20,.82)', color: '#fff', overflow: 'hidden',
      boxShadow: '0 4px 14px rgba(0,0,0,.24)', backdropFilter: 'blur(8px)',
      cursor: 'grab', touchAction: 'none', userSelect: 'none',
    })
    const storageKey = '__desktopToolButtonPosition'
    let dragging = null
    let moved = false
    const clamp = (x, y) => {
      const edge = 8
      const width = controls.offsetWidth || 82
      const height = controls.offsetHeight || 38
      controls.style.left = `${Math.max(edge, Math.min(x, innerWidth - width - edge))}px`
      controls.style.top = `${Math.max(edge, Math.min(y, innerHeight - height - edge))}px`
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) clamp(saved.x, saved.y)
    } catch (_) {}
    controls.addEventListener('pointerdown', (event) => {
      const bounds = controls.getBoundingClientRect()
      dragging = { id: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top, startX: event.clientX, startY: event.clientY }
      moved = false
      controls.setPointerCapture(event.pointerId)
      controls.style.cursor = 'grabbing'
    })
    controls.addEventListener('pointermove', (event) => {
      if (!dragging || dragging.id !== event.pointerId) return
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 5) moved = true
      if (moved) clamp(event.clientX - dragging.dx, event.clientY - dragging.dy)
    })
    const finishDrag = (event) => {
      if (!dragging || dragging.id !== event.pointerId) return
      if (controls.hasPointerCapture(event.pointerId)) controls.releasePointerCapture(event.pointerId)
      controls.style.cursor = 'grab'
      if (moved) localStorage.setItem(storageKey, JSON.stringify({ x: parseFloat(controls.style.left), y: parseFloat(controls.style.top) }))
      dragging = null
      setTimeout(() => { moved = false }, 0)
    }
    controls.addEventListener('pointerup', finishDrag)
    controls.addEventListener('pointercancel', finishDrag)
    controls.addEventListener('click', (event) => {
      if (moved) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }, true)
    back.addEventListener('click', () => window.newApiDesktop.openToolWindow('settings'))
    refresh.addEventListener('click', () => window.newApiDesktop.reloadWindow())
    document.body.append(controls)
    addEventListener('resize', () => clamp(parseFloat(controls.style.left), parseFloat(controls.style.top)))
  })
})()
