const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const test = require('node:test')

const root = path.join(__dirname, 'key-query')

function read(fileName) {
  return fs.readFileSync(path.join(root, fileName), 'utf8')
}

test('key query content starts directly with the query form', () => {
  const html = read('index.html')
  assert.doesNotMatch(html, /<header/)
  assert.doesNotMatch(html, /themeToggle/)
  assert.match(html, /<body>\s*<main class="page">/)
})

test('key query colors follow the operating system preference', () => {
  const css = read('styles.css')
  const renderer = read('renderer.js')
  assert.match(css, /@media \(prefers-color-scheme: dark\)/)
  assert.doesNotMatch(css, /data-theme/)
  assert.doesNotMatch(renderer, /key-query-theme/)
  assert.doesNotMatch(renderer, /themeToggle/)
})
