const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const propertiesPath = path.join(projectRoot, 'src-tauri', 'gen', 'android', 'gradle.properties')

if (!fs.existsSync(propertiesPath)) {
  throw new Error('Android project is not initialized. Run `npm run android:init` first.')
}

const required = new Map([
  ['kotlin.incremental', 'false'],
  ['kotlin.compiler.execution.strategy', 'in-process'],
])
const lines = fs.readFileSync(propertiesPath, 'utf8').split(/\r?\n/)
const seen = new Set()
const updated = lines.map((line) => {
  const separator = line.indexOf('=')
  if (separator < 0) return line
  const key = line.slice(0, separator).trim()
  if (!required.has(key)) return line
  seen.add(key)
  return `${key}=${required.get(key)}`
})
for (const [key, value] of required) {
  if (!seen.has(key)) updated.push(`${key}=${value}`)
}
fs.writeFileSync(propertiesPath, `${updated.filter((line, index, all) => (
  line.length > 0 || index < all.length - 1
)).join('\n')}\n`)
console.log('Configured Android Gradle/Kotlin for cross-drive builds.')
