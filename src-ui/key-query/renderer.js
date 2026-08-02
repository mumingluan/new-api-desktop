const elements = {
  accessUntil: document.querySelector('#accessUntil'),
  apiKey: document.querySelector('#apiKey'),
  balance: document.querySelector('#balance'),
  baseUrl: document.querySelector('#baseUrl'),
  copyInfo: document.querySelector('#copyInfo'),
  deleteProfile: document.querySelector('#deleteProfile'),
  exportCsv: document.querySelector('#exportCsv'),
  logRows: document.querySelector('#logRows'),
  nextPage: document.querySelector('#nextPage'),
  pageIndicator: document.querySelector('#pageIndicator'),
  pageSize: document.querySelector('#pageSize'),
  pageSummary: document.querySelector('#pageSummary'),
  previousPage: document.querySelector('#previousPage'),
  profileName: document.querySelector('#profileName'),
  profileSelect: document.querySelector('#profileSelect'),
  queryButton: document.querySelector('#queryButton'),
  queryStatus: document.querySelector('#queryStatus'),
  remaining: document.querySelector('#remaining'),
  saveProfile: document.querySelector('#saveProfile'),
  toast: document.querySelector('#toast'),
  toggleSecret: document.querySelector('#toggleSecret'),
  tokenName: document.querySelector('#tokenName'),
  usage: document.querySelector('#usage'),
}

const messages = {
  zh: {
    'Key Query': '密钥查询',
    'Query conditions': '查询条件', Ready: '等待查询', 'Saved profiles': '常用组合',
    'New profile': '新建组合', 'Profile name': '组合名称',
    'For example: Primary personal key': '例如：主站个人密钥', 'Server URL': '服务器地址',
    'API key': '密钥', Show: '显示', Hide: '隐藏', Query: '查询', 'Save profile': '保存组合',
    'Delete profile': '删除组合', 'Copy details': '复制信息', 'Key statistics': '密钥统计',
    'Token name': '令牌名称', 'Total quota': '总额度', Used: '已使用',
    'Remaining quota': '剩余额度', Expires: '有效期', 'Usage details': '调用详情',
    'Per page': '每页', 'Export CSV': '导出 CSV', Time: '时间', Status: '状态',
    Success: '成功', Error: '错误', Group: '分组', Model: '模型',
    Duration: '用时', Streaming: '流式', Prompt: '提示', Completion: '补全', Cost: '花费',
    Ratios: '倍率', Details: '详情', 'Enter a server and key to begin': '输入服务器和密钥开始查询',
    Previous: '上一页', Next: '下一页', Unlimited: '无限', 'Never expires': '永不过期',
    'No usage records': '没有调用记录', Yes: '是', No: '否', '{{count}} records': '共 {{count}} 条',
    'Querying…': '查询中…', Querying: '查询中', 'Query succeeded': '查询成功',
    'Query failed': '查询失败', 'Profile saved': '常用组合已保存',
    'Select a profile to delete': '请选择要删除的组合', 'Profile deleted': '常用组合已删除',
    'Server: {{value}}': '服务器: {{value}}', 'Token name: {{value}}': '令牌名称: {{value}}',
    'Total quota: {{value}}': '总额度: {{value}}', 'Used: {{value}}': '已使用: {{value}}',
    'Remaining: {{value}}': '剩余: {{value}}', 'Expires: {{value}}': '有效期: {{value}}',
    'Calls: {{value}}': '调用次数: {{value}}', Unknown: '未知', 'CSV exported': 'CSV 已导出',
    'Key details copied': '密钥信息已复制',
  },
}

let t = (key) => key
let displayLocale = 'en-US'

let profiles = []
let selectedProfileId = ''
let result = null
let page = 1
let toastTimer = null

function showToast(message) {
  clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.add('visible')
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2600)
}

function setStatus(text, state = '') {
  elements.queryStatus.textContent = text
  elements.queryStatus.className = `status-pill${state ? ` ${state}` : ''}`
}

function formatMoney(value, digits = 6) {
  if (value === 100000000) return t('Unlimited')
  return `$${Number(value || 0).toFixed(digits)}`
}

function formatTimestamp(timestamp) {
  if (!timestamp) return t('Never expires')
  return new Intl.DateTimeFormat(displayLocale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp * 1000))
}

function quotaMoney(quota) {
  return `$${(Number(quota || 0) / 500000).toFixed(6)}`
}

function setCell(row, text, className = '') {
  const cell = document.createElement('td')
  cell.textContent = text
  if (className) cell.className = className
  row.append(cell)
}

function renderProfiles() {
  const previous = selectedProfileId
  elements.profileSelect.replaceChildren()
  const emptyOption = document.createElement('option')
  emptyOption.value = ''
  emptyOption.textContent = t('New profile')
  elements.profileSelect.append(emptyOption)
  for (const profile of profiles) {
    const option = document.createElement('option')
    option.value = profile.id
    option.textContent = profile.name
    elements.profileSelect.append(option)
  }
  elements.profileSelect.value = profiles.some((profile) => profile.id === previous) ? previous : ''
}

function applyProfile(profile) {
  selectedProfileId = profile?.id || ''
  elements.profileSelect.value = selectedProfileId
  elements.profileName.value = profile?.name || ''
  elements.baseUrl.value = profile?.baseUrl || ''
  elements.apiKey.value = profile?.apiKey || ''
}

function renderResult() {
  elements.tokenName.textContent = result?.tokenName || '--'
  elements.balance.textContent = result ? formatMoney(result.balance, 3) : '--'
  elements.usage.textContent = result ? formatMoney(result.usage) : '--'
  elements.remaining.textContent = result
    ? result.balance === 100000000
      ? t('Unlimited')
      : formatMoney(result.balance - result.usage)
    : '--'
  elements.accessUntil.textContent = result ? formatTimestamp(result.accessUntil) : '--'
  elements.copyInfo.disabled = !result
  elements.exportCsv.disabled = !result?.logs?.length
  renderLogs()
}

function renderLogs() {
  const logs = result?.logs || []
  const pageSize = Number(elements.pageSize.value) || 10
  const pages = Math.max(1, Math.ceil(logs.length / pageSize))
  page = Math.min(page, pages)
  const rows = logs.slice((page - 1) * pageSize, page * pageSize)
  elements.logRows.replaceChildren()

  if (rows.length === 0) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.className = 'empty'
    cell.colSpan = 12
    cell.textContent = result ? t('No usage records') : t('Enter a server and key to begin')
    row.append(cell)
    elements.logRows.append(row)
  } else {
    for (const item of rows) {
      const row = document.createElement('tr')
      const isError = item.logType === 5
      if (isError) row.className = 'error-row'
      setCell(row, formatTimestamp(item.createdAt))
      setCell(row, isError ? t('Error') : t('Success'), 'log-status ' + (isError ? 'error' : 'success'))
      setCell(row, item.tokenName || '-')
      setCell(row, item.group || '-')
      setCell(row, item.modelName || '-')
      setCell(row, `${item.useTime.toFixed(2)}s`)
      setCell(row, item.isStream ? t('Yes') : t('No'))
      setCell(row, String(item.promptTokens))
      setCell(row, String(item.completionTokens))
      setCell(row, quotaMoney(item.quota))
      setCell(row, `${item.modelRatio}x / ${item.groupRatio}x`)
      setCell(row, (isError ? item.errorReason : '') || item.content || '-', 'detail')
      elements.logRows.append(row)
    }
  }

  elements.pageSummary.textContent = t('{{count}} records', { count: logs.length })
  elements.pageIndicator.textContent = `${page} / ${pages}`
  elements.previousPage.disabled = page <= 1
  elements.nextPage.disabled = page >= pages
}

async function loadProfiles() {
  profiles = await window.newApiDesktop.getKeyQueryProfiles()
  renderProfiles()
}

async function query() {
  const baseUrl = elements.baseUrl.value.trim()
  const apiKey = elements.apiKey.value.trim()
  elements.queryButton.disabled = true
  elements.queryButton.textContent = t('Querying…')
  setStatus(t('Querying'))
  try {
    result = await window.newApiDesktop.queryToken({ baseUrl, apiKey })
    page = 1
    renderResult()
    setStatus(t('Query succeeded'), 'success')
  } catch (error) {
    result = null
    renderResult()
    setStatus(t('Query failed'), 'error')
    showToast(error.message || String(error))
  } finally {
    elements.queryButton.disabled = false
    elements.queryButton.textContent = t('Query')
  }
}

async function saveProfile() {
  try {
    const profile = await window.newApiDesktop.saveKeyQueryProfile({
      id: selectedProfileId,
      name: elements.profileName.value,
      baseUrl: elements.baseUrl.value,
      apiKey: elements.apiKey.value,
    })
    await loadProfiles()
    applyProfile(profile)
    showToast(t('Profile saved'))
  } catch (error) {
    showToast(error.message || String(error))
  }
}

async function deleteProfile() {
  if (!selectedProfileId) {
    showToast(t('Select a profile to delete'))
    return
  }
  await window.newApiDesktop.deleteKeyQueryProfile(selectedProfileId)
  selectedProfileId = ''
  await loadProfiles()
  applyProfile(null)
  showToast(t('Profile deleted'))
}

function resultInfo() {
  if (!result) return ''
  return [
    t('Server: {{value}}', { value: result.server }),
    t('Token name: {{value}}', { value: result.tokenName || t('Unknown') }),
    t('Total quota: {{value}}', { value: formatMoney(result.balance, 3) }),
    t('Used: {{value}}', { value: formatMoney(result.usage) }),
    t('Remaining: {{value}}', { value: result.balance === 100000000 ? t('Unlimited') : formatMoney(result.balance - result.usage) }),
    t('Expires: {{value}}', { value: formatTimestamp(result.accessUntil) }),
    t('Calls: {{value}}', { value: result.logs.length }),
  ].join('\n')
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

async function exportCsv() {
  if (!result?.logs?.length) return
  const header = [t('Time'), t('Status'), t('Token name'), t('Group'), t('Model'), `${t('Duration')}(s)`, t('Streaming'), `${t('Prompt')} Token`, `${t('Completion')} Token`, t('Cost'), `${t('Model')} ${t('Ratios')}`, `${t('Group')} ${t('Ratios')}`, t('Details')]
  const rows = result.logs.map((item) => [
    formatTimestamp(item.createdAt),
    item.logType === 5 ? t('Error') : t('Success'),
    item.tokenName,
    item.group,
    item.modelName,
    item.useTime.toFixed(2),
    item.isStream ? t('Yes') : t('No'),
    item.promptTokens,
    item.completionTokens,
    quotaMoney(item.quota),
    item.modelRatio,
    item.groupRatio,
    (item.logType === 5 ? item.errorReason : '') || item.content,
  ])
  const content = `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const saved = await window.newApiDesktop.exportKeyQueryCsv(content)
  if (saved) showToast(t('CSV exported'))
}

elements.profileSelect.addEventListener('change', () => {
  const profile = profiles.find((item) => item.id === elements.profileSelect.value)
  applyProfile(profile || null)
})
elements.queryButton.addEventListener('click', query)
elements.apiKey.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') query()
})
elements.saveProfile.addEventListener('click', saveProfile)
elements.deleteProfile.addEventListener('click', deleteProfile)
elements.copyInfo.addEventListener('click', async () => {
  await navigator.clipboard.writeText(resultInfo())
  showToast(t('Key details copied'))
})
elements.exportCsv.addEventListener('click', exportCsv)
elements.pageSize.addEventListener('change', () => {
  page = 1
  renderLogs()
})
elements.previousPage.addEventListener('click', () => {
  page -= 1
  renderLogs()
})
elements.nextPage.addEventListener('click', () => {
  page += 1
  renderLogs()
})
elements.toggleSecret.addEventListener('click', () => {
  const hidden = elements.apiKey.type === 'password'
  elements.apiKey.type = hidden ? 'text' : 'password'
  elements.toggleSecret.textContent = hidden ? t('Hide') : t('Show')
})

async function initialize() {
  const i18n = await window.createDesktopI18n(messages)
  t = i18n.t
  displayLocale = i18n.locale
  i18n.apply()
  renderResult()
  await loadProfiles()
}

initialize().catch((error) => showToast(error.message || String(error)))
