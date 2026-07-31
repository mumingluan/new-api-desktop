const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const test = require('node:test')

const root = path.join(__dirname, 'key-batch')
const read = (fileName) => fs.readFileSync(path.join(root, fileName), 'utf8')

test('key batch page includes workbench batch and statistics controls', () => {
  const html = read('index.html')
  assert.match(html, /密钥批量操作/)
  assert.match(html, /延长Token过期时间/)
  assert.match(html, /扣除Token额度/)
  assert.match(html, /日志统计/)
  assert.match(html, /id="queryStats"/)
  assert.match(html, /id="exportStatsCsv"/)
})

test('key batch page follows the key-query system color style', () => {
  const css = read('styles.css')
  assert.match(css, /--primary: #0064fa/)
  assert.match(css, /@media \(prefers-color-scheme: dark\)/)
  assert.match(css, /\.status-pill\.success/)
  assert.doesNotMatch(css, /data-theme/)
})

test('tray places key batch operations directly below key query', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8')
  const queryItem = main.indexOf("{ label: t('Key Query'), click: createKeyQueryWindow }")
  const batchItem = main.indexOf("{ label: t('Key Batch Operations'), click: createKeyBatchWindow }")
  assert.ok(queryItem >= 0)
  assert.ok(batchItem > queryItem)
  assert.doesNotMatch(main.slice(queryItem, batchItem), /type: 'separator'/)
})
