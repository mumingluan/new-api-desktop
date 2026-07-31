const http = require('http')
const https = require('https')

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('请输入服务器地址')
  let url
  try {
    url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`)
  } catch {
    throw new Error('服务器地址无效')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务器地址仅支持 HTTP 或 HTTPS')
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

function normalizeApiKey(value) {
  const key = String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
  if (!key) throw new Error('请输入密钥')
  return key
}

function requestJson(url, apiKey, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(
      target,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          let data
          try {
            data = body ? JSON.parse(body) : null
          } catch {
            reject(new Error(`接口返回了无效 JSON：HTTP ${res.statusCode || 0}`))
            return
          }
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(data?.message || data?.error || `HTTP ${res.statusCode || 0}`))
            return
          }
          resolve(data)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('查询超时')))
    req.on('error', reject)
    req.end()
  })
}

function dateString(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function readNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

async function queryToken(input) {
  const baseUrl = normalizeBaseUrl(input?.baseUrl)
  const apiKey = normalizeApiKey(input?.apiKey)
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 90)
  const end = new Date(now)
  end.setDate(end.getDate() + 1)

  const subscriptionPromise = requestJson(`${baseUrl}/v1/dashboard/billing/subscription`, apiKey)
  const usagePromise = requestJson(
    `${baseUrl}/v1/dashboard/billing/usage?start_date=${dateString(start)}&end_date=${dateString(end)}`,
    apiKey,
  )
  const logsPromise = requestJson(
    `${baseUrl}/api/log/token?key=${encodeURIComponent(apiKey)}`,
    apiKey,
  )

  const [subscription, usage, logsResponse] = await Promise.all([
    subscriptionPromise,
    usagePromise,
    logsPromise,
  ])
  if (logsResponse?.success !== true || !Array.isArray(logsResponse.data)) {
    throw new Error(logsResponse?.message || '查询调用记录失败')
  }

  const logs = logsResponse.data
    .filter((row) => row && (Number(row.type) === 0 || Number(row.type) === 2))
    .map((row, index) => {
      let other = {}
      try {
        other = typeof row.other === 'string' && row.other ? JSON.parse(row.other) : row.other || {}
      } catch {
        other = {}
      }
      return {
        id: row.id ?? `${row.created_at || 0}-${index}`,
        createdAt: readNumber(row.created_at),
        tokenName: String(row.token_name || subscription?.token_name || ''),
        group: String(row.group || ''),
        modelName: String(row.model_name || ''),
        useTime: readNumber(row.use_time),
        isStream: row.is_stream === true || Number(row.is_stream) === 1,
        promptTokens: readNumber(row.prompt_tokens),
        completionTokens: readNumber(row.completion_tokens),
        quota: readNumber(row.quota),
        content: String(row.content || ''),
        modelRatio: other?.model_ratio ?? 1,
        groupRatio: other?.group_ratio ?? 1,
      }
    })

  return {
    server: baseUrl,
    tokenName: String(subscription?.token_name || logs[0]?.tokenName || ''),
    balance: readNumber(subscription?.hard_limit_usd),
    usage: readNumber(usage?.total_usage) / 100,
    accessUntil: readNumber(subscription?.access_until),
    logs,
  }
}

module.exports = {
  dateString,
  normalizeApiKey,
  normalizeBaseUrl,
  queryToken,
  readNumber,
  requestJson,
}
