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
  if (value === 100000000) return '无限'
  return `$${Number(value || 0).toFixed(digits)}`
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '永不过期'
  return new Intl.DateTimeFormat('zh-CN', {
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
  emptyOption.textContent = '新建组合'
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
      ? '无限'
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
    cell.colSpan = 11
    cell.textContent = result ? '没有调用记录' : '输入服务器和密钥开始查询'
    row.append(cell)
    elements.logRows.append(row)
  } else {
    for (const item of rows) {
      const row = document.createElement('tr')
      setCell(row, formatTimestamp(item.createdAt))
      setCell(row, item.tokenName || '-')
      setCell(row, item.group || '-')
      setCell(row, item.modelName || '-')
      setCell(row, `${item.useTime.toFixed(2)}s`)
      setCell(row, item.isStream ? '是' : '否')
      setCell(row, String(item.promptTokens))
      setCell(row, String(item.completionTokens))
      setCell(row, quotaMoney(item.quota))
      setCell(row, `${item.modelRatio}x / ${item.groupRatio}x`)
      setCell(row, item.content || '-', 'detail')
      elements.logRows.append(row)
    }
  }

  elements.pageSummary.textContent = `共 ${logs.length} 条`
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
  elements.queryButton.textContent = '查询中…'
  setStatus('查询中')
  try {
    result = await window.newApiDesktop.queryToken({ baseUrl, apiKey })
    page = 1
    renderResult()
    setStatus('查询成功', 'success')
  } catch (error) {
    result = null
    renderResult()
    setStatus('查询失败', 'error')
    showToast(error.message || String(error))
  } finally {
    elements.queryButton.disabled = false
    elements.queryButton.textContent = '查询'
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
    showToast('常用组合已保存')
  } catch (error) {
    showToast(error.message || String(error))
  }
}

async function deleteProfile() {
  if (!selectedProfileId) {
    showToast('请选择要删除的组合')
    return
  }
  await window.newApiDesktop.deleteKeyQueryProfile(selectedProfileId)
  selectedProfileId = ''
  await loadProfiles()
  applyProfile(null)
  showToast('常用组合已删除')
}

function resultInfo() {
  if (!result) return ''
  return [
    `服务器: ${result.server}`,
    `令牌名称: ${result.tokenName || '未知'}`,
    `总额度: ${formatMoney(result.balance, 3)}`,
    `已使用: ${formatMoney(result.usage)}`,
    `剩余: ${result.balance === 100000000 ? '无限' : formatMoney(result.balance - result.usage)}`,
    `有效期: ${formatTimestamp(result.accessUntil)}`,
    `调用次数: ${result.logs.length}`,
  ].join('\n')
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

async function exportCsv() {
  if (!result?.logs?.length) return
  const header = ['时间', '令牌名称', '分组', '模型', '用时(s)', '流式', '提示Token', '补全Token', '花费', '模型倍率', '分组倍率', '详情']
  const rows = result.logs.map((item) => [
    formatTimestamp(item.createdAt),
    item.tokenName,
    item.group,
    item.modelName,
    item.useTime.toFixed(2),
    item.isStream ? '是' : '否',
    item.promptTokens,
    item.completionTokens,
    quotaMoney(item.quota),
    item.modelRatio,
    item.groupRatio,
    item.content,
  ])
  const content = `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const saved = await window.newApiDesktop.exportKeyQueryCsv(content)
  if (saved) showToast('CSV 已导出')
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
  showToast('密钥信息已复制')
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
  elements.toggleSecret.textContent = hidden ? '隐藏' : '显示'
})
loadProfiles().catch((error) => showToast(error.message || String(error)))
