const mysql = require('mysql2/promise')

const QUOTA_PER_USD = 500000

function toInteger(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function normalizeDbConfig(input = {}) {
  const host = String(input.host || '').trim()
  const port = toInteger(input.port, 3306)
  const user = String(input.user || '').trim()
  const database = String(input.database || '').trim()
  const password = String(input.password || '')
  if (!host) throw new Error('Host 不能为空')
  if (port < 1 || port > 65535) throw new Error('Port 必须在 1 到 65535 之间')
  if (!user) throw new Error('用户名不能为空')
  if (!database) throw new Error('数据库不能为空')
  return { host, port, user, password, database }
}

function normalizeNonNegativeNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}必须是非负数`)
  return number
}

function appendQuotaFilters(sql, params, input = {}) {
  let query = sql
  const nextParams = [...params]
  if (input.usedOnly) query += '\nAND used_quota > 0'
  if (input.minEnabled) {
    const minUsd = normalizeNonNegativeNumber(input.minUsd, '最小剩余额度')
    query += '\nAND remain_quota > ?'
    nextParams.push(Math.round(minUsd * QUOTA_PER_USD))
  }
  return { sql: query, params: nextParams }
}

function buildQuotaUpdate(input = {}, now = Math.floor(Date.now() / 1000)) {
  const group = String(input.group || '').trim()
  if (!group) throw new Error('请选择分组名')

  const days = normalizeNonNegativeNumber(input.days || 0, '天数')
  const hours = normalizeNonNegativeNumber(input.hours || 0, '小时')
  const minutes = normalizeNonNegativeNumber(input.minutes || 0, '分钟')
  const seconds = Math.round(days * 86400 + hours * 3600 + minutes * 60)
  const dollars = normalizeNonNegativeNumber(input.dollars || 0, '美元额度')
  const quota = Math.round(dollars * QUOTA_PER_USD)

  let statement
  switch (input.mode) {
    case 'extend-time':
      if (seconds <= 0) throw new Error('延长时间必须大于 0')
      statement = {
        label: '延长Token过期时间',
        sql: `UPDATE tokens
SET expired_time = CASE
  WHEN expired_time = -1 THEN -1
  WHEN expired_time < ? THEN ? + ?
  ELSE expired_time + ?
END
WHERE \`group\` = ?
AND deleted_at IS NULL
AND expired_time != -1`,
        params: [now, now, seconds, seconds, group],
      }
      break
    case 'add-quota':
      if (quota <= 0) throw new Error('增加额度必须大于 0')
      statement = {
        label: '增加Token额度',
        sql: `UPDATE tokens
SET remain_quota = remain_quota + ?
WHERE \`group\` = ?
AND deleted_at IS NULL
AND unlimited_quota = 0`,
        params: [quota, group],
      }
      break
    case 'deduct-time':
      if (seconds <= 0) throw new Error('扣除时间必须大于 0')
      statement = {
        label: '扣除Token过期时间',
        sql: `UPDATE tokens
SET expired_time = CASE
  WHEN expired_time = -1 THEN -1
  WHEN expired_time - ? < ? THEN ?
  ELSE expired_time - ?
END
WHERE \`group\` = ?
AND deleted_at IS NULL
AND expired_time != -1`,
        params: [seconds, now, now, seconds, group],
      }
      break
    case 'deduct-quota':
      if (quota <= 0) throw new Error('扣除额度必须大于 0')
      statement = {
        label: '扣除Token额度',
        sql: `UPDATE tokens
SET remain_quota = CASE
  WHEN remain_quota - ? < 0 THEN 0
  ELSE remain_quota - ?
END
WHERE \`group\` = ?
AND deleted_at IS NULL
AND unlimited_quota = 0`,
        params: [quota, quota, group],
      }
      break
    default:
      throw new Error('未知批量操作模式')
  }

  return { ...appendQuotaFilters(statement.sql, statement.params, input), label: statement.label, group }
}

function buildStatsQuery(input = {}) {
  const groupFields = {
    token_name: '`token_name`',
    model_name: '`model_name`',
    username: '`username`',
    channel_name: '`channel_name`',
    user_id: '`user_id`',
  }
  const sortFields = {
    count: 'request_count',
    prompt_tokens: 'total_prompt_tokens',
    completion_tokens: 'total_completion_tokens',
    quota: 'total_quota',
  }
  const groupField = groupFields[input.groupBy] || groupFields.token_name
  const sortField = sortFields[input.sortBy] || sortFields.count
  const start = toInteger(input.start)
  const end = toInteger(input.end)
  if (start <= 0 || end <= start) throw new Error('查询日期范围无效')
  const top = Math.min(1000, Math.max(1, toInteger(input.top, 10)))
  const minTokens = Math.max(1, toInteger(input.minTokens, 1))

  let sql = `SELECT
  ${groupField} AS name,
  COUNT(*) AS request_count,
  SUM(prompt_tokens) AS total_prompt_tokens,
  SUM(completion_tokens) AS total_completion_tokens,
  SUM(quota) AS total_quota,
  COUNT(DISTINCT user_id) AS unique_users
FROM logs
WHERE created_at >= ?
  AND created_at < ?
  AND prompt_tokens > 0
  AND completion_tokens > 0`
  const params = [start, end]

  if (input.excludeUserId !== null && input.excludeUserId !== undefined && input.excludeUserId !== '') {
    sql += '\nAND user_id != ?'
    params.push(toInteger(input.excludeUserId))
  }
  if (input.userId !== null && input.userId !== undefined && input.userId !== '') {
    sql += '\nAND user_id = ?'
    params.push(toInteger(input.userId))
  }
  const model = String(input.model || '').trim()
  if (model) {
    sql += '\nAND model_name LIKE ?'
    params.push(`%${model}%`)
  }
  if (minTokens > 1) {
    sql += '\nAND (prompt_tokens + completion_tokens) >= ?'
    params.push(minTokens)
  }
  sql += `
GROUP BY ${groupField}
HAVING name IS NOT NULL AND name != ''
ORDER BY ${sortField} DESC
LIMIT ?`
  params.push(top)
  return { sql, params }
}

function parseGroups(rows) {
  const raw = rows?.[0]?.value
  if (!raw) return ['default']
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const groups = parsed && typeof parsed === 'object' ? Object.keys(parsed) : []
    return groups.length ? groups.sort((a, b) => a.localeCompare(b)) : ['default']
  } catch {
    return ['default']
  }
}

class KeyBatchService {
  constructor(createPool = mysql.createPool) {
    this.createPool = createPool
    this.pool = null
    this.config = null
  }

  get connected() {
    return Boolean(this.pool)
  }

  async connect(input) {
    await this.close()
    this.config = normalizeDbConfig(input)
    this.pool = this.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      waitForConnections: true,
      connectionLimit: 3,
      maxIdle: 3,
      idleTimeout: 60000,
      connectTimeout: 8000,
      enableKeepAlive: true,
      decimalNumbers: true,
    })
    try {
      await this.pool.query('SELECT 1')
    } catch (error) {
      await this.close()
      throw error
    }
    return {
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      database: this.config.database,
    }
  }

  async close() {
    const pool = this.pool
    this.pool = null
    if (pool) await pool.end().catch(() => {})
  }

  ensurePool() {
    if (!this.pool) throw new Error('尚未连接数据库')
    return this.pool
  }

  async loadGroups() {
    const [rows] = await this.ensurePool().execute(
      "SELECT `value` FROM options WHERE `key` = 'GroupRatio'",
    )
    return parseGroups(rows)
  }

  async countGroup(group) {
    const name = String(group || '').trim()
    if (!name) throw new Error('请选择分组名')
    const [rows] = await this.ensurePool().execute(
      'SELECT COUNT(*) AS count FROM tokens WHERE `group` = ? AND deleted_at IS NULL',
      [name],
    )
    return Number(rows?.[0]?.count || 0)
  }

  async executeBatch(input) {
    const statement = buildQuotaUpdate(input)
    const [result] = await this.ensurePool().execute(statement.sql, statement.params)
    return {
      affectedRows: Number(result?.affectedRows || 0),
      label: statement.label,
      group: statement.group,
    }
  }

  async queryStats(input) {
    const statement = buildStatsQuery(input)
    const [rows] = await this.ensurePool().execute(statement.sql, statement.params)
    return rows.map((row) => ({
      name: String(row.name ?? ''),
      requestCount: Number(row.request_count || 0),
      promptTokens: Number(row.total_prompt_tokens || 0),
      completionTokens: Number(row.total_completion_tokens || 0),
      quota: Number(row.total_quota || 0),
      uniqueUsers: Number(row.unique_users || 0),
    }))
  }
}

module.exports = {
  KeyBatchService,
  QUOTA_PER_USD,
  buildQuotaUpdate,
  buildStatsQuery,
  normalizeDbConfig,
  parseGroups,
}
