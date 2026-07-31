const fs = require('fs')
const path = require('path')

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`)
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function sanitizeProfile(input = {}, existing = null) {
  const now = new Date().toISOString()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const apiKey = String(input.apiKey || existing?.apiKey || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
  if (!baseUrl) throw new Error('服务器地址无效')
  if (!apiKey) throw new Error('密钥不能为空')
  return {
    id: String(input.id || existing?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`),
    name: String(input.name || '').trim() || new URL(baseUrl).host,
    baseUrl,
    apiKey,
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: input.updatedAt && !existing ? input.updatedAt : now,
  }
}

class KeyQueryProfileStore {
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

module.exports = { KeyQueryProfileStore, normalizeBaseUrl, sanitizeProfile }
