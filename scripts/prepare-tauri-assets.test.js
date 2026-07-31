const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { prepareAssets } = require('./prepare-tauri-assets')

test('deduplicates identical frontend files and records aliases', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'new-api-assets-'))
  const ui = path.join(root, 'ui')
  const web = path.join(root, 'web')
  const output = path.join(root, 'out')
  fs.mkdirSync(ui, { recursive: true })
  fs.writeFileSync(path.join(ui, 'index.html'), 'settings')
  for (const flavor of ['default', 'xuancat', 'classic']) {
    const dir = path.join(web, flavor, 'dist')
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), flavor)
    fs.writeFileSync(path.join(dir, 'assets', 'shared.js'), 'same-content')
  }

  const result = prepareAssets({ uiRoot: ui, webRoot: web, outputRoot: output })
  assert.equal(result.stats.aliasFiles, 2)
  assert.equal(
    result.aliases['apps/xuancat/assets/shared.js'],
    'apps/default/assets/shared.js',
  )
  assert.equal(fs.existsSync(path.join(output, 'apps', 'xuancat', 'assets', 'shared.js')), false)
  assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), 'settings')
  fs.rmSync(root, { recursive: true, force: true })
})
