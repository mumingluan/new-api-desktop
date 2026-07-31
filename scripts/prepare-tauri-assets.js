const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const uiRoot = path.join(projectRoot, 'src-ui')
const outputRoot = path.join(projectRoot, '.tauri-dist')
const flavors = ['default', 'xuancat', 'classic']

function listFiles(root, prefix = '') {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name)
    const absolute = path.join(root, entry.name)
    return entry.isDirectory() ? listFiles(absolute, relative) : [{ absolute, relative }]
  })
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function prepareAssets(options = {}) {
  const sourceUi = options.uiRoot || uiRoot
  const destination = options.outputRoot || outputRoot
  const sourceWeb = options.webRoot || path.join(projectRoot, 'web')
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })

  for (const file of listFiles(sourceUi)) {
    copyFile(file.absolute, path.join(destination, file.relative))
  }

  const canonicalByHash = new Map()
  const aliases = {}
  const stats = { sourceBytes: 0, outputBytes: 0, uniqueFiles: 0, aliasFiles: 0 }

  for (const flavor of flavors) {
    const source = path.join(sourceWeb, flavor, 'dist')
    if (!fs.existsSync(path.join(source, 'index.html'))) {
      throw new Error(`Missing frontend build: ${path.relative(projectRoot, source)}`)
    }
    for (const file of listFiles(source)) {
      const logicalPath = path.posix.join('apps', flavor, file.relative)
      const size = fs.statSync(file.absolute).size
      const hash = digest(file.absolute)
      stats.sourceBytes += size
      const canonical = canonicalByHash.get(hash)
      if (canonical) {
        aliases[logicalPath] = canonical
        stats.aliasFiles += 1
        continue
      }
      canonicalByHash.set(hash, logicalPath)
      copyFile(file.absolute, path.join(destination, logicalPath))
      stats.outputBytes += size
      stats.uniqueFiles += 1
    }
  }

  fs.writeFileSync(
    path.join(destination, 'asset-aliases.json'),
    JSON.stringify({ version: 1, aliases, stats }, null, 2),
  )
  return { aliases, stats }
}

if (require.main === module) {
  const { stats } = prepareAssets()
  const savedMiB = (stats.sourceBytes - stats.outputBytes) / 1024 / 1024
  console.log(
    `Prepared ${stats.uniqueFiles} unique files; ${stats.aliasFiles} aliases save ${savedMiB.toFixed(1)} MiB.`,
  )
}

module.exports = { listFiles, prepareAssets }
