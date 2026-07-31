const fs = require('fs')
const path = require('path')

function sanitizeProfile(input = {}, existing = null) {
  const now = new Date().toISOString()
  const host = String(input.host || '').trim()
  const port = Number.parseInt(input.port, 10) || 3306
  const user = String(input.user || '').trim()
  const database = String(input.database || '').trim()
  if (!host) throw new Error('Host 不能为空')
  if (port < 1 || port > 65535) throw new Error('Port 必须在 1 到 65535 之间')
  if (!user) throw new Error('用户名不能为空')
  if (!database) throw new Error('数据库不能为空')
  return {
    id: String(input.id || existing?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`),
    name: String(input.name || '').trim() || `${user}@${host}`,
    host,
    port,
    user,
    password: String(input.password ?? existing?.password ?? ''),
    database,
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: input.updatedAt && !existing ? input.updatedAt : now,
  }
}

class KeyBatchProfileStore {
  constructor(filePath) {
    this.filePath = filePath
    this.profiles = []
    this.load()
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      const profiles = Array.isArray(parsed) ? parsed : parsed?.profiles
      if (!Array.isArray(profiles)) return
      this.profiles = profiles
        .map((profile) => {
          try {
            return sanitizeProfile(profile)
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      this.profiles = []
    }
  }

  list() {
    return this.profiles.map((profile) => ({ ...profile }))
  }

  save(input) {
    const index = this.profiles.findIndex((profile) => profile.id === input.id)
    const profile = sanitizeProfile(input, index >= 0 ? this.profiles[index] : null)
    if (index >= 0) this.profiles[index] = profile
    else this.profiles.push(profile)
    this.profiles.sort((a, b) => a.name.localeCompare(b.name))
    this.flush()
    return { ...profile }
  }

  delete(id) {
    const previousLength = this.profiles.length
    this.profiles = this.profiles.filter((profile) => profile.id !== id)
    if (this.profiles.length !== previousLength) this.flush()
    return this.profiles.length !== previousLength
  }

  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(
      this.filePath,
      JSON.stringify({ version: 1, profiles: this.profiles }, null, 2),
      'utf8',
    )
  }
}

module.exports = { KeyBatchProfileStore, sanitizeProfile }
