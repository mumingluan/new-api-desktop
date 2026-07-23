const fs = require('fs')
const path = require('path')

class FrontendStorageStore {
  constructor(filePath) {
    this.filePath = filePath
    this.data = { version: 1, instances: {} }
    this.saveTimer = null
    this.load()
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      if (parsed?.version === 1 && parsed.instances && typeof parsed.instances === 'object') {
        this.data = parsed
      }
    } catch (err) {
      console.error('Failed to load frontend storage:', err)
    }
  }

  get(instanceId, flavor) {
    return { ...(this.data.instances[instanceId]?.[flavor] || {}) }
  }

  replace(instanceId, flavor, snapshot) {
    if (!instanceId || !['default', 'classic'].includes(flavor)) return
    const normalized = {}
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      for (const [key, value] of Object.entries(snapshot)) {
        if (typeof value === 'string') normalized[String(key)] = value
      }
    }
    if (!this.data.instances[instanceId]) this.data.instances[instanceId] = {}
    this.data.instances[instanceId][flavor] = normalized
    this.scheduleSave()
  }

  deleteInstance(instanceId) {
    if (!this.data.instances[instanceId]) return
    delete this.data.instances[instanceId]
    this.scheduleSave()
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 100)
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
  }
}

module.exports = { FrontendStorageStore }
