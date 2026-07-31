const fs = require('fs')
const path = require('path')

const currentUserDataName = 'new-api-desktop'
const legacyUserDataName = ['new-api', 'electron'].join('-')
const migrationFiles = [
  'desktop-config.json',
  'frontend-storage.json',
  'key-query-profiles.json',
]

function migrateLegacyUserData(appDataPath, userDataPath) {
  if (path.basename(userDataPath).toLowerCase() !== currentUserDataName) return false

  const legacyPath = path.join(appDataPath, legacyUserDataName)
  if (path.resolve(legacyPath) === path.resolve(userDataPath) || !fs.existsSync(legacyPath)) {
    return false
  }

  const currentConfigPath = path.join(userDataPath, 'desktop-config.json')
  if (!fs.existsSync(currentConfigPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.cpSync(legacyPath, userDataPath, { recursive: true, force: true })
    for (const fileName of migrationFiles) {
      const legacyFile = path.join(legacyPath, fileName)
      if (fs.existsSync(legacyFile) && !fs.existsSync(path.join(userDataPath, fileName))) {
        throw new Error(`Failed to migrate ${fileName}`)
      }
    }
  }

  fs.rmSync(legacyPath, { recursive: true, force: true })
  return true
}

module.exports = { migrateLegacyUserData }
