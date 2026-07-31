const api = window.newApiDesktop

const elements = Object.fromEntries(
  [
    'connectionStatus', 'profileSelect', 'profileName', 'dbHost', 'dbPort', 'dbName', 'dbUser', 'dbTlsMode',
    'dbPassword', 'togglePassword', 'connectButton', 'saveProfile', 'deleteProfile', 'refreshGroups',
    'tokenGroup', 'groupOptions', 'groupInfo', 'days', 'hours', 'minutes', 'dollars', 'usedOnly',
    'minEnabled', 'minUsd', 'executeBatch', 'clearOperationLog', 'operationLog', 'statsDate',
    'recentDays', 'dateField', 'recentDaysField', 'topN', 'groupBy', 'sortBy', 'modelFilter',
    'minTokens', 'excludeUserId', 'userId', 'queryStats', 'resultCount', 'totalRequests',
    'totalPrompt', 'totalCompletion', 'totalQuota', 'exportStatsCsv', 'statsRows', 'toast',
    'batchPanel', 'statsPanel',
  ].map((id) => [id, document.getElementById(id)]),
)

const messages = {
  zh: {
    'Key Batch Operations': '密钥批量操作', 'Database connection': '数据库连接',
    Disconnected: '未连接', Profile: '配置档', 'New profile': '新建配置档',
    'Profile name': '配置档名称', 'For example: Production database': '例如：生产数据库',
    Database: '数据库', Username: '用户名', 'Verify certificate and hostname (recommended)': '验证证书与主机名（推荐）',
    'Verify certificate': '验证证书', 'Require encryption': '必须加密',
    'Prefer encryption (allow fallback)': '优先加密（可回退）', 'Disable TLS': '禁用 TLS',
    Password: '密码', Show: '显示', Hide: '隐藏', 'Connect database': '连接数据库',
    'Save profile': '保存配置档', 'Delete profile': '删除配置档', Tools: '功能切换',
    'Batch operations': '批量操作', 'Log statistics': '日志统计', 'Group selection': '分组选择',
    'Refresh groups': '刷新分组', 'Group name': '分组名', 'Current group': '当前分组',
    'Connect to view token count': '连接数据库后查看 Token 数量', 'Operation mode': '操作模式',
    'Extend token expiry': '延长Token过期时间', 'Add token quota': '增加Token额度',
    'Deduct token expiry': '扣除Token过期时间', 'Deduct token quota': '扣除Token额度',
    Days: '天', Hours: '时', Minutes: '分', 'Quota in USD': '美元额度',
    'Only keys that have been used': '仅操作使用过的密钥',
    'Only keys with remaining quota above': '仅操作剩余额度大于', USD: '美元', Execute: '执行操作',
    'Operation results': '操作结果', Clear: '清空', 'No operation records': '暂无操作记录',
    'Query parameters': '查询参数', 'Query statistics': '查询统计', 'Specific date': '指定日期',
    'Recent N days': '最近N天', Date: '日期', 'Recent days': '最近天数', 'Group by': '分组',
    'Sort by': '排序', 'Model filter': '模型筛选', 'Fuzzy matching supported': '支持模糊匹配',
    'Minimum tokens': '最小Token', 'Exclude user ID': '排除用户ID', 'Specific user ID': '指定用户ID',
    'Overrides excluded user when set': '填写后忽略排除条件', 'Statistics summary': '日志统计汇总',
    Results: '结果数', Requests: '请求次数', 'Prompt tokens': '输入Token',
    'Completion tokens': '输出Token', Quota: '配额', 'Statistics results': '统计结果',
    'Export CSV': '导出 CSV', Name: '名称', 'Quota (USD)': '配额(USD)', 'Unique users': '独立用户数',
    'Connect to query statistics': '连接数据库后查询日志统计', 'Operation failed': '操作失败',
    'Leave blank to use saved password': '留空以使用已保存密码', 'Profile saved': 'MySQL 配置档已保存',
    'Delete MySQL profile “{{name}}”?': '确认删除 MySQL 配置档“{{name}}”？',
    'Profile deleted': 'MySQL 配置档已删除', Connecting: '连接中...', Connected: '已连接',
    'Connection failed': '连接失败', 'Connected to {{database}}@{{host}}:{{port}}': '成功连接到 {{database}}@{{host}}:{{port}}',
    'Loaded {{count}} groups': '已加载 {{count}} 个分组', Querying: '查询中...',
    'Group “{{group}}”: {{count}} tokens': '分组“{{group}}”：Token {{count}} 个',
    'Query failed: {{error}}': '查询失败：{{error}}', 'Select a group': '请选择分组名',
    'This will perform a deduction on group “{{group}}”. Continue?': '将执行扣除操作，分组“{{group}}”。确认继续？',
    'Executing…': '执行中...', '{{label}}: group “{{group}}”, affected {{count}} tokens': '{{label}}：分组“{{group}}”，影响 {{count}} 个 Token',
    'Select a statistics date': '请选择统计日期', 'No data': '无数据',
    'Query complete: {{count}} results': '查询完成，共 {{count}} 条结果', 'CSV exported': 'CSV 已导出',
  },
}

let t = (key) => key
let displayLocale = 'en-US'

const state = {
  profiles: [],
  selectedProfileId: '',
  connected: false,
  activeTab: 'batch',
  operationMode: 'extend-time',
  dateMode: 'date',
  statsRows: [],
  operationEntries: [],
}

let toastTimer

function showToast(message) {
  elements.toast.textContent = String(message || '')
  elements.toast.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2600)
}

function errorMessage(error) {
  return String(error?.message || error || t('Operation failed')).replace(/^Error invoking remote method '[^']+': Error: /, '')
}

function setConnectionStatus(text, status = '') {
  elements.connectionStatus.textContent = text
  elements.connectionStatus.className = `status-pill${status ? ` ${status}` : ''}`
}

function setConnected(connected) {
  state.connected = connected
  elements.refreshGroups.disabled = !connected
  elements.executeBatch.disabled = !connected
  elements.queryStats.disabled = !connected
  if (!connected) {
    elements.groupInfo.textContent = t('Connect to view token count')
  }
}

function setButtonBusy(button, busy, busyText) {
  if (!button.dataset.label) button.dataset.label = button.textContent
  button.disabled = busy || (button === elements.executeBatch && !state.connected) || (button === elements.queryStats && !state.connected)
  button.textContent = busy ? busyText : button.dataset.label
}

function readConnection() {
  return {
    id: state.selectedProfileId || undefined,
    name: elements.profileName.value.trim(),
    host: elements.dbHost.value.trim(),
    port: Number(elements.dbPort.value || 3306),
    database: elements.dbName.value.trim(),
    user: elements.dbUser.value.trim(),
    password: elements.dbPassword.value,
    tlsMode: elements.dbTlsMode.value,
  }
}

function renderProfiles() {
  const selected = state.selectedProfileId
  elements.profileSelect.replaceChildren(new Option(t('New profile'), ''))
  for (const profile of state.profiles) {
    elements.profileSelect.append(new Option(profile.name, profile.id))
  }
  elements.profileSelect.value = state.profiles.some((item) => item.id === selected) ? selected : ''
  elements.deleteProfile.disabled = !elements.profileSelect.value
}

function applyProfile(profile) {
  state.selectedProfileId = profile?.id || ''
  elements.profileName.value = profile?.name || ''
  elements.dbHost.value = profile?.host || 'localhost'
  elements.dbPort.value = profile?.port || 3306
  elements.dbName.value = profile?.database || 'new-api'
  elements.dbUser.value = profile?.user || 'root'
  elements.dbTlsMode.value = profile?.tlsMode || 'verify_identity'
  elements.dbPassword.value = profile?.password || ''
  elements.dbPassword.placeholder = profile?.hasPassword ? t('Leave blank to use saved password') : ''
  elements.profileSelect.value = state.selectedProfileId
  elements.deleteProfile.disabled = !state.selectedProfileId
  setConnected(false)
  setConnectionStatus(t('Disconnected'))
}

async function loadProfiles() {
  state.profiles = await api.getKeyBatchProfiles()
  renderProfiles()
  if (state.profiles.length) applyProfile(state.profiles[0])
}

async function saveProfile() {
  try {
    const saved = await api.saveKeyBatchProfile(readConnection())
    const index = state.profiles.findIndex((profile) => profile.id === saved.id)
    if (index >= 0) state.profiles[index] = saved
    else state.profiles.push(saved)
    state.profiles.sort((a, b) => a.name.localeCompare(b.name))
    state.selectedProfileId = saved.id
    renderProfiles()
    showToast(t('Profile saved'))
  } catch (error) {
    showToast(errorMessage(error))
  }
}

async function deleteProfile() {
  if (!state.selectedProfileId) return
  const profile = state.profiles.find((item) => item.id === state.selectedProfileId)
  if (!window.confirm(t('Delete MySQL profile “{{name}}”?', { name: profile?.name || '' }))) return
  try {
    await api.deleteKeyBatchProfile(state.selectedProfileId)
    state.profiles = state.profiles.filter((item) => item.id !== state.selectedProfileId)
    renderProfiles()
    applyProfile(state.profiles[0] || null)
    showToast(t('Profile deleted'))
  } catch (error) {
    showToast(errorMessage(error))
  }
}

async function connectDatabase() {
  setConnectionStatus(t('Connecting'), 'pending')
  setButtonBusy(elements.connectButton, true, t('Connecting'))
  try {
    const connected = await api.connectKeyBatchDatabase(readConnection())
    setConnected(true)
    setConnectionStatus(t('Connected'), 'success')
    appendOperationLog(t('Connected to {{database}}@{{host}}:{{port}}', connected), 'success')
    await loadGroups()
  } catch (error) {
    setConnected(false)
    setConnectionStatus(t('Connection failed'), 'error')
    showToast(errorMessage(error))
  } finally {
    setButtonBusy(elements.connectButton, false, t('Connecting'))
  }
}

function renderGroups(groups) {
  elements.groupOptions.replaceChildren()
  for (const group of groups) elements.groupOptions.append(new Option(group, group))
  if (!elements.tokenGroup.value.trim() && groups.length) elements.tokenGroup.value = groups[0]
}

async function loadGroups() {
  if (!state.connected) return
  elements.refreshGroups.disabled = true
  try {
    const groups = await api.getKeyBatchGroups()
    renderGroups(groups)
    if (groups.length && !groups.includes(elements.tokenGroup.value.trim())) elements.tokenGroup.value = groups[0]
    appendOperationLog(t('Loaded {{count}} groups', { count: groups.length }), 'success')
    await refreshGroupInfo()
  } catch (error) {
    showToast(errorMessage(error))
  } finally {
    elements.refreshGroups.disabled = !state.connected
  }
}

async function refreshGroupInfo() {
  if (!state.connected) return
  const group = elements.tokenGroup.value.trim()
  if (!group) return
  elements.groupInfo.textContent = t('Querying')
  try {
    const count = await api.countKeyBatchGroup(group)
    elements.groupInfo.textContent = t('Group “{{group}}”: {{count}} tokens', { group, count: Number(count).toLocaleString(displayLocale) })
  } catch (error) {
    elements.groupInfo.textContent = t('Query failed: {{error}}', { error: errorMessage(error) })
  }
}

function setOperationMode(mode) {
  state.operationMode = mode
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode)
  })
  const timeMode = mode.endsWith('time')
  document.querySelectorAll('.time-input input').forEach((input) => { input.disabled = !timeMode })
  elements.dollars.disabled = timeMode
}

function appendOperationLog(message, status = '') {
  state.operationEntries.push({
    text: `[${new Date().toLocaleString(displayLocale, { hour12: false })}] ${message}`,
    status,
  })
  renderOperationLog()
}

function renderOperationLog() {
  elements.operationLog.replaceChildren()
  if (!state.operationEntries.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-message'
    empty.textContent = t('No operation records')
    elements.operationLog.append(empty)
    return
  }
  for (const entry of state.operationEntries) {
    const row = document.createElement('p')
    if (entry.status) row.className = entry.status
    row.textContent = entry.text
    elements.operationLog.append(row)
  }
  elements.operationLog.scrollTop = elements.operationLog.scrollHeight
}

async function executeBatch() {
  const group = elements.tokenGroup.value.trim()
  if (!group) return showToast(t('Select a group'))
  if (state.operationMode.startsWith('deduct') && !window.confirm(t('This will perform a deduction on group “{{group}}”. Continue?', { group }))) return
  setButtonBusy(elements.executeBatch, true, t('Executing…'))
  try {
    const result = await api.executeKeyBatchOperation({
      mode: state.operationMode,
      group,
      days: Number(elements.days.value || 0),
      hours: Number(elements.hours.value || 0),
      minutes: Number(elements.minutes.value || 0),
      dollars: Number(elements.dollars.value || 0),
      usedOnly: elements.usedOnly.checked,
      minEnabled: elements.minEnabled.checked,
      minUsd: Number(elements.minUsd.value || 0),
    })
    const labels = {
      'extend-time': 'Extend token expiry', 'add-quota': 'Add token quota',
      'deduct-time': 'Deduct token expiry', 'deduct-quota': 'Deduct token quota',
    }
    const message = t('{{label}}: group “{{group}}”, affected {{count}} tokens', {
      label: t(labels[state.operationMode]), group: result.group,
      count: Number(result.affectedRows).toLocaleString(displayLocale),
    })
    appendOperationLog(message, 'success')
    showToast(message)
    await refreshGroupInfo()
  } catch (error) {
    const message = errorMessage(error)
    appendOperationLog(message, 'error')
    showToast(message)
  } finally {
    setButtonBusy(elements.executeBatch, false, t('Executing…'))
  }
}

function setActiveTab(tab) {
  state.activeTab = tab
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab))
  elements.batchPanel.classList.toggle('active', tab === 'batch')
  elements.statsPanel.classList.toggle('active', tab === 'stats')
}

function setDateMode(mode) {
  state.dateMode = mode
  document.querySelectorAll('[data-date-mode]').forEach((button) => button.classList.toggle('active', button.dataset.dateMode === mode))
  elements.dateField.classList.toggle('hidden', mode !== 'date')
  elements.recentDaysField.classList.toggle('hidden', mode !== 'recent')
}

function localDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statsRange() {
  if (state.dateMode === 'recent') {
    const days = Math.max(1, Number.parseInt(elements.recentDays.value, 10) || 7)
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - days)
    return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) }
  }
  const value = elements.statsDate.value
  if (!value) throw new Error(t('Select a statistics date'))
  const start = new Date(`${value}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) }
}

function quotaMoney(quota) {
  const usd = Number(quota || 0) / 500000
  return usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`
}

function renderStats() {
  const totals = state.statsRows.reduce((sum, row) => ({
    requests: sum.requests + Number(row.requestCount || 0),
    prompt: sum.prompt + Number(row.promptTokens || 0),
    completion: sum.completion + Number(row.completionTokens || 0),
    quota: sum.quota + Number(row.quota || 0),
  }), { requests: 0, prompt: 0, completion: 0, quota: 0 })
  elements.resultCount.textContent = state.statsRows.length.toLocaleString(displayLocale)
  elements.totalRequests.textContent = totals.requests.toLocaleString(displayLocale)
  elements.totalPrompt.textContent = totals.prompt.toLocaleString(displayLocale)
  elements.totalCompletion.textContent = totals.completion.toLocaleString(displayLocale)
  elements.totalQuota.textContent = quotaMoney(totals.quota)
  elements.exportStatsCsv.disabled = state.statsRows.length === 0

  elements.statsRows.replaceChildren()
  if (!state.statsRows.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.className = 'empty'
    cell.colSpan = 6
    cell.textContent = t('No data')
    row.append(cell)
    elements.statsRows.append(row)
    return
  }
  for (const item of state.statsRows) {
    const row = document.createElement('tr')
    const values = [
      item.name,
      Number(item.requestCount).toLocaleString(displayLocale),
      Number(item.promptTokens).toLocaleString(displayLocale),
      Number(item.completionTokens).toLocaleString(displayLocale),
      quotaMoney(item.quota),
      Number(item.uniqueUsers).toLocaleString(displayLocale),
    ]
    for (const value of values) {
      const cell = document.createElement('td')
      cell.textContent = value
      row.append(cell)
    }
    elements.statsRows.append(row)
  }
}

async function queryStats() {
  setButtonBusy(elements.queryStats, true, t('Querying'))
  try {
    const range = statsRange()
    const specifiedUser = elements.userId.value.trim()
    state.statsRows = await api.queryKeyBatchStats({
      ...range,
      top: Number(elements.topN.value || 10),
      groupBy: elements.groupBy.value,
      sortBy: elements.sortBy.value,
      model: elements.modelFilter.value.trim(),
      minTokens: Number(elements.minTokens.value || 1),
      excludeUserId: specifiedUser ? null : elements.excludeUserId.value.trim(),
      userId: specifiedUser || null,
    })
    renderStats()
    showToast(t('Query complete: {{count}} results', { count: state.statsRows.length }))
  } catch (error) {
    showToast(errorMessage(error))
  } finally {
    setButtonBusy(elements.queryStats, false, t('Querying'))
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

async function exportStatsCsv() {
  if (!state.statsRows.length) return
  const rows = [[t('Name'), t('Requests'), t('Prompt tokens'), t('Completion tokens'), t('Quota (USD)'), t('Unique users')]]
  for (const row of state.statsRows) {
    rows.push([row.name, row.requestCount, row.promptTokens, row.completionTokens, quotaMoney(row.quota), row.uniqueUsers])
  }
  try {
    const saved = await api.exportKeyBatchCsv(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`)
    if (saved) showToast(t('CSV exported'))
  } catch (error) {
    showToast(errorMessage(error))
  }
}

elements.profileSelect.addEventListener('change', () => {
  const profile = state.profiles.find((item) => item.id === elements.profileSelect.value)
  applyProfile(profile || null)
})
elements.togglePassword.addEventListener('click', () => {
  const hidden = elements.dbPassword.type === 'password'
  elements.dbPassword.type = hidden ? 'text' : 'password'
  elements.togglePassword.textContent = hidden ? t('Hide') : t('Show')
})
elements.connectButton.addEventListener('click', connectDatabase)
elements.saveProfile.addEventListener('click', saveProfile)
elements.deleteProfile.addEventListener('click', deleteProfile)
elements.refreshGroups.addEventListener('click', loadGroups)
elements.tokenGroup.addEventListener('change', refreshGroupInfo)
elements.tokenGroup.addEventListener('keydown', (event) => { if (event.key === 'Enter') refreshGroupInfo() })
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setOperationMode(button.dataset.mode)))
elements.minEnabled.addEventListener('change', () => { elements.minUsd.disabled = !elements.minEnabled.checked })
elements.executeBatch.addEventListener('click', executeBatch)
elements.clearOperationLog.addEventListener('click', () => { state.operationEntries = []; renderOperationLog() })
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)))
document.querySelectorAll('[data-date-mode]').forEach((button) => button.addEventListener('click', () => setDateMode(button.dataset.dateMode)))
elements.queryStats.addEventListener('click', queryStats)
elements.exportStatsCsv.addEventListener('click', exportStatsCsv)

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
elements.statsDate.value = localDateValue(yesterday)

async function initialize() {
  const i18n = await window.createDesktopI18n(messages)
  t = i18n.t
  displayLocale = i18n.locale
  i18n.apply()
  setOperationMode(state.operationMode)
  setDateMode(state.dateMode)
  renderOperationLog()
  renderStats()
  await loadProfiles()
}

initialize().catch((error) => showToast(errorMessage(error)))
