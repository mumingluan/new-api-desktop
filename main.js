const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
  Tray,
} = require('electron')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { URL } = require('url')

let mainWindow
let settingsWindow
let tray
let desktopServer
let desktopServerPort = 0
let configPath = ''
let config = createDefaultConfig()
let lastStatus = { ok: false, message: 'Not checked', checkedAt: null }
let restoringWindows = false
let openWindowsSaveTimer = null

const appServers = new Map()
const appWindows = new Set()
const cookieJars = new Map()
const preferredDesktopPort = Number(process.env.NEW_API_DESKTOP_PORT || 32176)
const supportedLanguages = ['en', 'zh', 'fr', 'ja', 'ru', 'vi']
const proxyPrefixes = ['/api', '/mj', '/pg', '/v1', '/v1beta', '/dashboard', '/swagger']

const messages = {
  en: {
    Backend: 'Backend',
    Settings: 'Settings',
    Show: 'Show',
    Quit: 'Quit',
    Status: 'Status',
    Online: 'Online',
    Offline: 'Offline',
    'No backend configured': 'No backend configured',
    'Launch Default Frontend': 'Launch Default Frontend',
    'Launch Classic Frontend': 'Launch Classic Frontend',
  },
  zh: {
    Backend: '后端',
    Settings: '设置',
    Show: '显示',
    Quit: '退出',
    Status: '状态',
    Online: '在线',
    Offline: '离线',
    'No backend configured': '未配置后端',
    'Launch Default Frontend': '启动 新版前端',
    'Launch Classic Frontend': '启动 经典前端',
  },
  fr: {
    Backend: 'Backend',
    Settings: 'Parametres',
    Show: 'Afficher',
    Quit: 'Quitter',
    Status: 'Statut',
    Online: 'En ligne',
    Offline: 'Hors ligne',
    'No backend configured': 'Aucun backend configure',
    'Launch Default Frontend': 'Lancer le frontend par defaut',
    'Launch Classic Frontend': 'Lancer le frontend classique',
  },
  ja: {
    Backend: 'バックエンド',
    Settings: '設定',
    Show: '表示',
    Quit: '終了',
    Status: '状態',
    Online: 'オンライン',
    Offline: 'オフライン',
    'No backend configured': 'バックエンド未設定',
    'Launch Default Frontend': 'デフォルトフロントエンドを起動',
    'Launch Classic Frontend': 'クラシックフロントエンドを起動',
  },
  ru: {
    Backend: 'Backend',
    Settings: 'Настройки',
    Show: 'Показать',
    Quit: 'Выход',
    Status: 'Статус',
    Online: 'В сети',
    Offline: 'Не в сети',
    'No backend configured': 'Backend не настроен',
    'Launch Default Frontend': 'Запустить frontend по умолчанию',
    'Launch Classic Frontend': 'Запустить классический frontend',
  },
  vi: {
    Backend: 'Backend',
    Settings: 'Cai dat',
    Show: 'Hien thi',
    Quit: 'Thoat',
    Status: 'Trang thai',
    Online: 'Truc tuyen',
    Offline: 'Ngoai tuyen',
    'No backend configured': 'Chua cau hinh backend',
    'Launch Default Frontend': 'Mo frontend mac dinh',
    'Launch Classic Frontend': 'Mo frontend co dien',
  },
}

function createDefaultConfig() {
  return {
    activeInstanceId: '',
    activeFlavor: 'default',
    desktopLanguage: 'auto',
    autoRefreshStatus: true,
    updateFeedUrl: '',
    openWindows: [],
    instances: [],
  }
}

function createId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

function resolveLanguage(value) {
  if (value && value !== 'auto') return supportedLanguages.includes(value) ? value : 'en'
  const locale = (app.getLocale ? app.getLocale() : 'en').toLowerCase()
  if (locale.startsWith('zh')) return 'zh'
  const short = locale.slice(0, 2)
  return supportedLanguages.includes(short) ? short : 'en'
}

function t(key) {
  const language = resolveLanguage(config.desktopLanguage)
  return messages[language]?.[key] || messages.en[key] || key
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function sanitizeInstance(input = {}) {
  const now = new Date().toISOString()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  return {
    id: input.id || createId(),
    name: String(input.name || '').trim() || baseUrl || 'New API backend',
    baseUrl,
    authMode: input.authMode === 'accessToken' ? 'accessToken' : 'interactive',
    accessToken: String(input.accessToken || '').trim(),
    userId: String(input.userId || '').trim(),
    flavor: input.flavor === 'classic' ? 'classic' : 'default',
    user: input.user && typeof input.user === 'object' ? input.user : null,
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
}

function loadConfig() {
  configPath = path.join(app.getPath('userData'), 'desktop-config.json')
  try {
    if (!fs.existsSync(configPath)) return
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config = {
      ...createDefaultConfig(),
      ...parsed,
      instances: Array.isArray(parsed.instances)
        ? parsed.instances.map(sanitizeInstance).filter((item) => item.baseUrl)
        : [],
    }
    if (!config.activeInstanceId && config.instances[0]) config.activeInstanceId = config.instances[0].id
    if (!['default', 'classic'].includes(config.activeFlavor)) config.activeFlavor = 'default'
    config.openWindows = Array.isArray(parsed.openWindows)
      ? parsed.openWindows.filter((item) => item && item.instanceId && ['default', 'classic'].includes(item.flavor))
      : []
    if (!parsed.openWindows && config.activeInstanceId) {
      config.openWindows = [{ instanceId: config.activeInstanceId, flavor: config.activeFlavor }]
    }
  } catch (err) {
    console.error('Failed to load desktop config:', err)
    config = createDefaultConfig()
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  updateTrayMenu()
  broadcastConfig()
}

function maskSecret(value) {
  if (!value) return ''
  if (value.length <= 10) return '********'
  return `${value.slice(0, 5)}...${value.slice(-4)}`
}

function getActiveInstance() {
  return config.instances.find((item) => item.id === config.activeInstanceId) || null
}

function publicInstance(instance) {
  if (!instance) return null
  return {
    ...instance,
    accessToken: instance.accessToken ? maskSecret(instance.accessToken) : '',
    hasAccessToken: Boolean(instance.accessToken),
  }
}

function getPublicConfig() {
  return {
    ...config,
    instances: config.instances.map(publicInstance),
    activeInstance: publicInstance(getActiveInstance()),
    desktopUrl: getDesktopUrl(),
    appLocale: app.getLocale ? app.getLocale() : 'en',
    status: lastStatus,
  }
}

function broadcastConfig() {
  const payload = getPublicConfig()
  const windows = [settingsWindow, ...appWindows]
  for (const win of windows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop-config-changed', payload)
    }
  }
}

function getFrontendDist(flavor) {
  if (app.isPackaged) return path.join(process.resourcesPath, 'web', flavor, 'dist')
  return path.join(__dirname, '..', 'web', flavor, 'dist')
}

function getDesktopRoot() {
  return path.join(__dirname, 'desktop')
}

function getDesktopUrl() {
  return desktopServerPort ? `http://127.0.0.1:${desktopServerPort}/desktop/` : ''
}

function getDesktopSettingsUrl() {
  return `${getDesktopUrl()}?v=desktop-settings-2`
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function serveFile(res, root, requestPath, fallbackToIndex) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(requestPath.split('?')[0])
  } catch {
    sendJson(res, 400, { success: false, message: 'Invalid path' })
    return
  }
  const normalized = path.normalize(decodedPath).replace(/^(\.\.[\\/])+/, '')
  let filePath = path.join(root, normalized)
  if (!filePath.startsWith(root)) {
    sendJson(res, 403, { success: false, message: 'Forbidden' })
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (!fallbackToIndex) {
      sendJson(res, 404, { success: false, message: 'Not found' })
      return
    }
    filePath = path.join(root, 'index.html')
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 500, { success: false, message: err.message })
      return
    }
    const isDesktopAsset = root === getDesktopRoot()
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Cache-Control': filePath.endsWith('index.html') || isDesktopAsset ? 'no-store' : 'public, max-age=31536000',
    })
    if (filePath.endsWith('index.html')) {
      res.end(injectDesktopBootstrap(content.toString('utf8'), root))
    } else {
      res.end(content)
    }
  })
}

function injectDesktopBootstrap(html, root) {
  const context = Array.from(appServers.values()).find((item) => item.frontendRoot === root)
  const instance = context?.instance || getActiveInstance()
  const bootstrap = {
    desktop: true,
    backend: instance ? { id: instance.id, baseUrl: instance.baseUrl, authMode: instance.authMode } : null,
    language: resolveLanguage(config.desktopLanguage),
  }
  const user =
    instance && instance.authMode === 'accessToken' && instance.userId
      ? instance.user || {
          id: Number(instance.userId) || instance.userId,
          username: instance.name || 'desktop-user',
          display_name: instance.name || 'Desktop user',
          role: 1,
          status: 1,
        }
      : null
  const script = `<script>
window.__NEW_API_DESKTOP__=${JSON.stringify(bootstrap)};
try {
  localStorage.setItem('i18nextLng', ${JSON.stringify(resolveLanguage(config.desktopLanguage))});
  localStorage.setItem('language', ${JSON.stringify(resolveLanguage(config.desktopLanguage))});
  ${user ? `localStorage.setItem('user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('uid', ${JSON.stringify(String(user.id))});` : ''}
} catch (_) {}
</script>`
  return html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : `${script}${html}`
}

function rememberSetCookie(instanceId, setCookieHeaders) {
  if (!instanceId || !setCookieHeaders) return
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
  const jar = cookieJars.get(instanceId) || new Map()
  for (const header of headers) {
    const first = String(header).split(';')[0]
    const index = first.indexOf('=')
    if (index <= 0) continue
    const name = first.slice(0, index).trim()
    const value = first.slice(index + 1).trim()
    if (name && value) jar.set(name, value)
    else if (name) jar.delete(name)
  }
  cookieJars.set(instanceId, jar)
}

function getCookieHeader(instanceId, incomingCookie) {
  const jar = cookieJars.get(instanceId)
  const stored = jar
    ? Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
    : ''
  if (stored && incomingCookie) return `${incomingCookie}; ${stored}`
  return stored || incomingCookie || ''
}

function rewriteSetCookie(setCookieHeaders) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
  return headers.map((header) =>
    String(header)
      .replace(/;\s*Domain=[^;]*/gi, '')
      .replace(/;\s*Secure/gi, '')
      .replace(/SameSite=None/gi, 'SameSite=Lax'),
  )
}

function shouldProxyPath(urlPath) {
  return proxyPrefixes.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`))
}

function shouldCaptureUser(url, method, statusCode) {
  const pathname = new URL(url, 'http://desktop.local').pathname
  return method === 'GET' && statusCode === 200 && pathname === '/api/user/self'
}

function shouldFallbackPasskeyStatus(req, instance, statusCode) {
  if (!instance || instance.authMode !== 'accessToken') return false
  if (req.method !== 'GET') return false
  const urlPath = new URL(req.url, instance.baseUrl).pathname
  return urlPath === '/api/user/passkey' && statusCode === 401
}

function updateInstanceFromResponse(instance, responseBody) {
  if (!instance || !responseBody) return
  try {
    const json = JSON.parse(responseBody)
    const user = json && json.data && typeof json.data === 'object' ? json.data : null
    if (!user || user.id == null) return
    instance.userId = String(user.id)
    instance.user = user
    if (!instance.name || instance.name === instance.baseUrl) {
      instance.name = user.username ? `${user.username} @ ${new URL(instance.baseUrl).host}` : instance.name
    }
    instance.updatedAt = new Date().toISOString()
    saveConfig()
  } catch {
    /* ignore non-user JSON */
  }
}

function proxyRequest(req, res, context = {}) {
  const instance = context.instance || getActiveInstance()
  if (!instance || !instance.baseUrl) {
    sendJson(res, 503, { success: false, message: 'No backend instance is configured.' })
    return
  }

  let target
  try {
    target = new URL(req.url, instance.baseUrl)
  } catch (err) {
    sendJson(res, 400, { success: false, message: err.message })
    return
  }

  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  delete headers['content-length']
  delete headers['accept-encoding']
  delete headers.cookie

  const cookie = instance.authMode === 'accessToken' ? '' : getCookieHeader(instance.id, req.headers.cookie)
  if (cookie) headers.cookie = cookie
  if (instance.authMode === 'accessToken' && instance.accessToken) headers.authorization = instance.accessToken
  if (instance.userId && !headers['new-api-user']) headers['new-api-user'] = instance.userId

  const client = target.protocol === 'https:' ? https : http
  const proxyReq = client.request(
    target,
    { method: req.method, headers, timeout: 120000 },
    (proxyRes) => {
      if (instance.authMode !== 'accessToken') rememberSetCookie(instance.id, proxyRes.headers['set-cookie'])
      const responseHeaders = { ...proxyRes.headers }
      delete responseHeaders['content-encoding']
      delete responseHeaders['content-length']
      if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = rewriteSetCookie(responseHeaders['set-cookie'])

      const contentType = String(proxyRes.headers['content-type'] || '')
      const isStream =
        contentType.includes('text/event-stream') ||
        req.url.includes('/stream') ||
        req.headers.accept === 'text/event-stream'

      if (isStream) {
        res.writeHead(proxyRes.statusCode || 502, responseHeaders)
        proxyRes.pipe(res)
        return
      }

      const chunks = []
      proxyRes.on('data', (chunk) => chunks.push(chunk))
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks)
        const text = body.toString('utf8')
        if (shouldCaptureUser(req.url, req.method, proxyRes.statusCode)) updateInstanceFromResponse(instance, text)
        if (shouldFallbackPasskeyStatus(req, instance, proxyRes.statusCode || 502)) {
          sendJson(res, 200, {
            success: true,
            message: '',
            data: { enabled: false, desktop_access_token: true },
          })
          return
        }
        res.writeHead(proxyRes.statusCode || 502, responseHeaders)
        res.end(body)
      })
    },
  )
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('Backend request timed out')))
  proxyReq.on('error', (err) => {
    if (res.headersSent) res.destroy(err)
    else sendJson(res, 502, { success: false, message: `Unable to reach backend: ${err.message}` })
  })
  req.pipe(proxyReq)
}

function createAppServerContext(instanceId, flavor) {
  const instance = config.instances.find((item) => item.id === instanceId) || getActiveInstance()
  if (!instance) throw new Error('No backend instance is configured.')
  const selectedFlavor = flavor === 'classic' ? 'classic' : 'default'
  return {
    id: createId(),
    instance,
    flavor: selectedFlavor,
    frontendRoot: getFrontendDist(selectedFlavor),
    server: null,
    port: 0,
  }
}

function startAppServer(context) {
  return new Promise((resolve, reject) => {
    if (context.server) {
      resolve(context)
      return
    }
    const server = http.createServer((req, res) => {
      const urlPath = new URL(req.url, 'http://127.0.0.1').pathname
      if (shouldProxyPath(urlPath)) {
        proxyRequest(req, res, context)
        return
      }
      serveFile(res, context.frontendRoot, urlPath, true)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      context.server = server
      context.port = server.address().port
      appServers.set(context.id, context)
      resolve(context)
    })
  })
}

function stopAppServer(context) {
  if (!context || !context.server) return
  context.server.close()
  appServers.delete(context.id)
  context.server = null
}

function getAppContextUrl(context) {
  return `http://127.0.0.1:${context.port}/`
}

function getOpenWindowState(win) {
  if (!win || win.isDestroyed() || !win.__newApiContext) return null
  const context = win.__newApiContext
  return {
    instanceId: context.instance.id,
    flavor: context.flavor,
    bounds: win.getBounds(),
    maximized: win.isMaximized(),
  }
}

function saveOpenWindows() {
  config.openWindows = Array.from(appWindows)
    .map(getOpenWindowState)
    .filter(Boolean)
  saveConfig()
}

function scheduleOpenWindowsSave() {
  if (restoringWindows || app.isQuitting) return
  if (openWindowsSaveTimer) clearTimeout(openWindowsSaveTimer)
  openWindowsSaveTimer = setTimeout(() => {
    openWindowsSaveTimer = null
    saveOpenWindows()
  }, 300)
}

async function restoreOpenWindows() {
  const restored = []
  restoringWindows = true
  try {
    for (const item of config.openWindows) {
      if (!config.instances.some((instance) => instance.id === item.instanceId)) continue
      try {
        restored.push(await createWindow(item))
      } catch (err) {
        console.error('Failed to restore desktop window:', err)
      }
    }
  } finally {
    restoringWindows = false
  }
  return restored
}

function startDesktopServer() {
  return new Promise((resolve, reject) => {
    desktopServer = http.createServer((req, res) => {
      const urlPath = new URL(req.url, `http://127.0.0.1:${desktopServerPort || preferredDesktopPort}`).pathname
      if (urlPath === '/__desktop/config') {
        sendJson(res, 200, getPublicConfig())
        return
      }
      if (urlPath === '/desktop' || urlPath.startsWith('/desktop/')) {
        serveFile(res, getDesktopRoot(), urlPath.replace(/^\/desktop\/?/, '/') || '/index.html', true)
        return
      }
      sendJson(res, 404, { success: false, message: 'Not found' })
    })
    desktopServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && desktopServerPort === 0) {
        desktopServer.listen(0, '127.0.0.1')
        return
      }
      reject(err)
    })
    desktopServer.listen(preferredDesktopPort, '127.0.0.1', () => {
      desktopServerPort = desktopServer.address().port
      resolve()
    })
  })
}

function installWindowShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase()
    const reloadRequested = input.key === 'F5' || ((input.control || input.meta) && key === 'r')
    const devtoolsRequested =
      input.key === 'F12' ||
      ((input.control || input.meta) && input.shift && key === 'i') ||
      (input.meta && input.alt && key === 'i')
    if (reloadRequested) {
      event.preventDefault()
      win.webContents.reloadIgnoringCache()
    }
    if (devtoolsRequested) {
      event.preventDefault()
      win.webContents.toggleDevTools()
    }
  })
}

function installEditContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const template = []
    if (params.selectionText) {
      template.push({ role: 'copy', label: 'Copy' })
    }
    if (params.isEditable) {
      if (template.length) template.push({ type: 'separator' })
      template.push(
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      )
    }
    if (!template.length) return
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}

function setBusinessWindowTitle(win) {
  if (!win || win.isDestroyed() || !win.__newApiContext) return
  const context = win.__newApiContext
  const flavorTitle = context.flavor === 'classic' ? 'Classic' : 'Default'
  win.setTitle(`New API Desktop - ${flavorTitle} - ${context.instance.name}`)
}

async function createWindow(options = {}) {
  const context = createAppServerContext(options.instanceId, options.flavor || 'default')
  await startAppServer(context)
  const win = new BrowserWindow({
    width: options.bounds?.width || 1320,
    height: options.bounds?.height || 860,
    x: options.bounds?.x,
    y: options.bounds?.y,
    show: true,
    minWidth: 980,
    minHeight: 640,
    title: 'New API Desktop',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.setMenuBarVisibility(false)
  win.__newApiContext = context
  appWindows.add(win)
  mainWindow = win
  setBusinessWindowTitle(win)
  installWindowShortcuts(win)
  installEditContextMenu(win)
  win.loadURL(getAppContextUrl(context))
  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    setBusinessWindowTitle(win)
  })
  win.webContents.on('did-finish-load', () => {
    setBusinessWindowTitle(win)
  })
  if (options.maximized) {
    win.maximize()
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(getAppContextUrl(context)) || url.startsWith(getDesktopUrl())) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('move', scheduleOpenWindowsSave)
  win.on('resize', scheduleOpenWindowsSave)
  win.on('closed', () => {
    appWindows.delete(win)
    stopAppServer(context)
    if (mainWindow === win) mainWindow = Array.from(appWindows).find((item) => !item.isDestroyed()) || null
    scheduleOpenWindowsSave()
  })
  scheduleOpenWindowsSave()
  return win
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.reloadIgnoringCache()
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 820,
    resizable: false,
    title: 'New API Desktop Settings',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  settingsWindow.setMenuBarVisibility(false)
  installWindowShortcuts(settingsWindow)
  session.defaultSession.clearCache().catch((err) => {
    console.error('Failed to clear desktop cache:', err)
  })
  settingsWindow.loadURL(getDesktopSettingsUrl())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function showMainWindow() {
  const windows = Array.from(appWindows).filter((win) => !win.isDestroyed())
  if (windows.length === 0) {
    createSettingsWindow()
    return
  }
  for (const win of windows) win.show()
  windows[windows.length - 1].focus()
}

function createTray() {
  const icon =
    process.platform === 'darwin'
      ? path.join(__dirname, 'tray-iconTemplate.png')
      : path.join(__dirname, 'tray-icon-windows.png')
  tray = new Tray(icon)
  tray.setToolTip('New API Desktop')
  tray.on('click', createSettingsWindow)
  updateTrayMenu()
}

function updateTrayMenu() {
  if (!tray) return
  const launchItems = (flavor) =>
    config.instances.map((item) => ({
      label: item.name,
      click: () => {
        createWindow({ instanceId: item.id, flavor }).catch((err) => dialog.showErrorBox('New API Desktop', err.message))
      },
    }))
  const hasInstances = config.instances.length > 0
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('Settings'), click: createSettingsWindow },
      { type: 'separator' },
      { label: t('Launch Default Frontend'), enabled: hasInstances, submenu: launchItems('default') },
      { label: t('Launch Classic Frontend'), enabled: hasInstances, submenu: launchItems('classic') },
      { type: 'separator' },
      {
        label: t('Quit'),
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ]),
  )
}

function requestBackend(instance, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(requestPath, instance.baseUrl)
    const headers = { Accept: 'application/json', ...(options.headers || {}) }
    if (instance.authMode === 'accessToken' && instance.accessToken) headers.Authorization = instance.accessToken
    if (instance.userId) headers['New-Api-User'] = instance.userId
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(
      target,
      { method: options.method || 'GET', headers, timeout: options.timeout || 20000 },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          let data = null
          try {
            data = body ? JSON.parse(body) : null
          } catch {
            data = null
          }
          resolve({ statusCode: res.statusCode || 0, body, data })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('Backend request timed out')))
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function refreshStatus() {
  const instance = getActiveInstance()
  if (!instance) {
    lastStatus = { ok: false, message: t('No backend configured'), checkedAt: new Date().toISOString() }
    updateTrayMenu()
    broadcastConfig()
    return lastStatus
  }
  try {
    const res = await requestBackend(instance, '/api/user/self')
    const ok = res.statusCode === 200 && res.data && res.data.success !== false
    if (ok) updateInstanceFromResponse(instance, res.body)
    lastStatus = {
      ok,
      message: ok ? t('Online') : res.data?.message || `HTTP ${res.statusCode}`,
      checkedAt: new Date().toISOString(),
    }
  } catch (err) {
    lastStatus = { ok: false, message: err.message, checkedAt: new Date().toISOString() }
  }
  updateTrayMenu()
  broadcastConfig()
  return lastStatus
}

async function validateAccessToken(input) {
  const saved = input.id ? config.instances.find((item) => item.id === input.id) : null
  const draft = sanitizeInstance({
    ...(saved || {}),
    ...input,
    authMode: 'accessToken',
    accessToken: String(input.accessToken || '').trim() || saved?.accessToken || '',
  })
  if (!draft.baseUrl) throw new Error('Backend URL is required')
  if (!draft.accessToken) throw new Error('Access token is required')
  if (!draft.userId) throw new Error('User ID is required')
  const res = await requestBackend(draft, '/api/user/self')
  if (!res.data || res.data.success === false) throw new Error(res.data?.message || `Validation failed with HTTP ${res.statusCode}`)
  updateInstanceFromResponse(draft, res.body)
  if (saved) {
    Object.assign(saved, {
      name: draft.name,
      baseUrl: draft.baseUrl,
      authMode: draft.authMode,
      accessToken: draft.accessToken,
      userId: draft.userId,
      user: draft.user,
      updatedAt: new Date().toISOString(),
    })
    saveConfig()
  }
  return publicInstance(draft)
}

function setFlavor(flavor) {
  config.activeFlavor = flavor === 'classic' ? 'classic' : 'default'
  const active = getActiveInstance()
  if (active) {
    active.flavor = config.activeFlavor
    active.updatedAt = new Date().toISOString()
  }
  saveConfig()
}

function setupIpc() {
  ipcMain.handle('desktop:get-config', () => getPublicConfig())
  ipcMain.handle('desktop:save-instance', (_event, input) => {
    const instance = sanitizeInstance(input)
    if (!instance.baseUrl) throw new Error('Backend URL is invalid')
    const index = config.instances.findIndex((item) => item.id === instance.id)
    if (index >= 0) {
      config.instances[index] = {
        ...config.instances[index],
        ...instance,
        accessToken: input.accessToken || config.instances[index].accessToken,
        user: input.user || config.instances[index].user,
      }
    } else {
      config.instances.push(instance)
    }
    config.activeInstanceId = instance.id
    config.activeFlavor = instance.flavor
    saveConfig()
    return getPublicConfig()
  })
  ipcMain.handle('desktop:delete-instance', (_event, id) => {
    config.instances = config.instances.filter((item) => item.id !== id)
    cookieJars.delete(id)
    if (config.activeInstanceId === id) config.activeInstanceId = config.instances[0]?.id || ''
    saveConfig()
    return getPublicConfig()
  })
  ipcMain.handle('desktop:set-active-instance', (_event, id) => {
    if (!config.instances.some((item) => item.id === id)) throw new Error('Instance not found')
    config.activeInstanceId = id
    const active = getActiveInstance()
    if (active?.flavor) config.activeFlavor = active.flavor
    saveConfig()
    return getPublicConfig()
  })
  ipcMain.handle('desktop:set-flavor', (_event, flavor) => {
    setFlavor(flavor)
    return getPublicConfig()
  })
  ipcMain.handle('desktop:set-language', (_event, language) => {
    config.desktopLanguage = ['auto', ...supportedLanguages].includes(language) ? language : 'auto'
    saveConfig()
    return getPublicConfig()
  })
  ipcMain.handle('desktop:refresh-status', () => refreshStatus())
  ipcMain.handle('desktop:validate-access-token', (_event, input) => validateAccessToken(input))
  ipcMain.handle('desktop:open-external', (_event, url) => shell.openExternal(url))
  ipcMain.handle('desktop:open-window', (_event, options) => createWindow(options))
  ipcMain.handle('desktop:check-for-updates', () => checkForUpdates())
}

async function checkForUpdates() {
  if (!config.updateFeedUrl) return { ok: false, message: 'No update feed URL is configured.' }
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.setFeedURL({ provider: 'generic', url: config.updateFeedUrl })
    autoUpdater.autoDownload = true
    const result = await autoUpdater.checkForUpdatesAndNotify()
    return {
      ok: true,
      message: result?.updateInfo ? `Update check completed: ${result.updateInfo.version}` : 'Update check completed.',
    }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

app.whenReady().then(async () => {
  loadConfig()
  setupIpc()
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'system'
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'notifications', 'openExternal'].includes(permission))
  })
  await startDesktopServer()
  createTray()
  const restored = await restoreOpenWindows()
  if (restored.length === 0) {
    createSettingsWindow()
  }
})

app.on('activate', showMainWindow)

app.on('window-all-closed', () => {
  /* keep tray app alive */
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (openWindowsSaveTimer) {
    clearTimeout(openWindowsSaveTimer)
    openWindowsSaveTimer = null
  }
  saveOpenWindows()
  for (const context of appServers.values()) stopAppServer(context)
  if (desktopServer) desktopServer.close()
})
