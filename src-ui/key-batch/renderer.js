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
  return String(error?.message || error || '操作失败').replace(/^Error invoking remote method '[^']+': Error: /, '')
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
    elements.groupInfo.textContent = '连接数据库后查看 Token 数量'
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
  elements.profileSelect.replaceChildren(new Option('新建配置档', ''))
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
  elements.dbPassword.placeholder = profile?.hasPassword ? '留空以使用已保存密码' : ''
  elements.profileSelect.value = state.selectedProfileId
  elements.deleteProfile.disabled = !state.selectedProfileId
  setConnected(false)
  setConnectionStatus('未连接')
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
    showToast('MySQL 配置档已保存')
  } catch (error) {
    showToast(errorMessage(error))
  }
}

async function deleteProfile() {
  if (!state.selectedProfileId) return
  const profile = state.profiles.find((item) => item.id === state.selectedProfileId)
  if (!window.confirm(`确认删除 MySQL 配置档“${profile?.name || ''}”？`)) return
  try {
    await api.deleteKeyBatchProfile(state.selectedProfileId)
    state.profiles = state.profiles.filter((item) => item.id !== state.selectedProfileId)
    renderProfiles()
    applyProfile(state.profiles[0] || null)
    showToast('MySQL 配置档已删除')
  } catch (error) {
    showToast(errorMessage(error))
  }
}

async function connectDatabase() {
  setConnectionStatus('连接中...', 'pending')
  setButtonBusy(elements.connectButton, true, '连接中...')
  try {
    const connected = await api.connectKeyBatchDatabase(readConnection())
    setConnected(true)
    setConnectionStatus('已连接', 'success')
    appendOperationLog(`成功连接到 ${connected.database}@${connected.host}:${connected.port}`, 'success')
    await loadGroups()
  } catch (error) {
    setConnected(false)
    setConnectionStatus('连接失败', 'error')
    showToast(errorMessage(error))
  } finally {
    setButtonBusy(elements.connectButton, false, '连接中...')
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
    appendOperationLog(`已加载 ${groups.length} 个分组`, 'success')
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
  elements.groupInfo.textContent = '查询中...'
  try {
    const count = await api.countKeyBatchGroup(group)
    elements.groupInfo.textContent = `分组“${group}”：Token ${Number(count).toLocaleString('zh-CN')} 个`
  } catch (error) {
    elements.groupInfo.textContent = `查询失败：${errorMessage(error)}`
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
    text: `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${message}`,
    status,
  })
  renderOperationLog()
}

function renderOperationLog() {
  elements.operationLog.replaceChildren()
  if (!state.operationEntries.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-message'
    empty.textContent = '暂无操作记录'
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
  if (!group) return showToast('请选择分组名')
  if (state.operationMode.startsWith('deduct') && !window.confirm(`将执行扣除操作，分组“${group}”。确认继续？`)) return
  setButtonBusy(elements.executeBatch, true, '执行中...')
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
    const message = `${result.label}：分组“${result.group}”，影响 ${Number(result.affectedRows).toLocaleString('zh-CN')} 个 Token`
    appendOperationLog(message, 'success')
    showToast(message)
    await refreshGroupInfo()
  } catch (error) {
    const message = errorMessage(error)
    appendOperationLog(message, 'error')
    showToast(message)
  } finally {
    setButtonBusy(elements.executeBatch, false, '执行中...')
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
  if (!value) throw new Error('请选择统计日期')
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
  elements.resultCount.textContent = state.statsRows.length.toLocaleString('zh-CN')
  elements.totalRequests.textContent = totals.requests.toLocaleString('zh-CN')
  elements.totalPrompt.textContent = totals.prompt.toLocaleString('zh-CN')
  elements.totalCompletion.textContent = totals.completion.toLocaleString('zh-CN')
  elements.totalQuota.textContent = quotaMoney(totals.quota)
  elements.exportStatsCsv.disabled = state.statsRows.length === 0

  elements.statsRows.replaceChildren()
  if (!state.statsRows.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.className = 'empty'
    cell.colSpan = 6
    cell.textContent = '无数据'
    row.append(cell)
    elements.statsRows.append(row)
    return
  }
  for (const item of state.statsRows) {
    const row = document.createElement('tr')
    const values = [
      item.name,
      Number(item.requestCount).toLocaleString('zh-CN'),
      Number(item.promptTokens).toLocaleString('zh-CN'),
      Number(item.completionTokens).toLocaleString('zh-CN'),
      quotaMoney(item.quota),
      Number(item.uniqueUsers).toLocaleString('zh-CN'),
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
  setButtonBusy(elements.queryStats, true, '查询中...')
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
    showToast(`查询完成，共 ${state.statsRows.length} 条结果`)
  } catch (error) {
    showToast(errorMessage(error))
  } finally {
    setButtonBusy(elements.queryStats, false, '查询中...')
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

async function exportStatsCsv() {
  if (!state.statsRows.length) return
  const rows = [['名称', '请求次数', '输入Token', '输出Token', '配额(USD)', '独立用户数']]
  for (const row of state.statsRows) {
    rows.push([row.name, row.requestCount, row.promptTokens, row.completionTokens, quotaMoney(row.quota), row.uniqueUsers])
  }
  try {
    const saved = await api.exportKeyBatchCsv(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`)
    if (saved) showToast('CSV 已导出')
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
  elements.togglePassword.textContent = hidden ? '隐藏' : '显示'
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
setOperationMode(state.operationMode)
setDateMode(state.dateMode)
renderOperationLog()
renderStats()
loadProfiles().catch((error) => showToast(errorMessage(error)))
