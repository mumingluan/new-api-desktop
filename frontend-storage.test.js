const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { FrontendStorageStore } = require('./frontend-storage')

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'new-api-desktop-storage-'))
  const filePath = path.join(directory, 'frontend-storage.json')
  return {
    directory,
    filePath,
    store: new FrontendStorageStore(filePath),
  }
}

test('keeps settings separate for every backend and frontend flavor', (t) => {
  const fixture = createStore()
  t.after(() => {
    fixture.store.flush()
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  })

  fixture.store.replace('backend-a', 'default', { 'page-size': '20' })
  fixture.store.replace('backend-a', 'classic', { 'page-size': '50' })
  fixture.store.replace('backend-b', 'classic', { 'page-size': '100' })

  assert.deepEqual(fixture.store.get('backend-a', 'default'), { 'page-size': '20' })
  assert.deepEqual(fixture.store.get('backend-a', 'classic'), { 'page-size': '50' })
  assert.deepEqual(fixture.store.get('backend-b', 'classic'), { 'page-size': '100' })
})

test('persists snapshots and reloads them from disk', (t) => {
  const fixture = createStore()
  t.after(() => {
    fixture.store.flush()
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  })

  fixture.store.replace('backend-a', 'classic', {
    'page-size': '50',
    'theme-mode': 'dark',
  })
  fixture.store.flush()

  const reloaded = new FrontendStorageStore(fixture.filePath)
  assert.deepEqual(reloaded.get('backend-a', 'classic'), {
    'page-size': '50',
    'theme-mode': 'dark',
  })
})

test('deleting a backend removes only its frontend settings', (t) => {
  const fixture = createStore()
  t.after(() => {
    fixture.store.flush()
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  })

  fixture.store.replace('backend-a', 'default', { key: 'a' })
  fixture.store.replace('backend-b', 'default', { key: 'b' })
  fixture.store.deleteInstance('backend-a')

  assert.deepEqual(fixture.store.get('backend-a', 'default'), {})
  assert.deepEqual(fixture.store.get('backend-b', 'default'), { key: 'b' })
})

test('stores only string localStorage values', (t) => {
  const fixture = createStore()
  t.after(() => {
    fixture.store.flush()
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  })

  fixture.store.replace('backend-a', 'default', {
    valid: 'value',
    number: 20,
    object: { nested: true },
  })

  assert.deepEqual(fixture.store.get('backend-a', 'default'), { valid: 'value' })
})

test('shares login state between the auto-selected Xuancat asset and the default frontend', (t) => {
  const fixture = createStore()
  t.after(() => {
    fixture.store.flush()
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  })

  fixture.store.replace('backend-a', 'default', {
    user: '{"id":1,"username":"xuancat"}',
    uid: '1',
  })

  assert.deepEqual(fixture.store.get('backend-a', 'xuancat'), {
    user: '{"id":1,"username":"xuancat"}',
    uid: '1',
  })

  fixture.store.replace('backend-a', 'xuancat', {
    user: '{"id":2,"username":"updated"}',
    uid: '2',
  })
  assert.deepEqual(fixture.store.get('backend-a', 'default'), {
    user: '{"id":2,"username":"updated"}',
    uid: '2',
  })
})
