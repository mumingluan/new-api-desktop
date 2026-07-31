const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { KeyQueryProfileStore } = require('./key-query-store')

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'new-api-desktop-key-query-'))
  return {
    directory,
    filePath: path.join(directory, 'profiles.json'),
    store: new KeyQueryProfileStore(path.join(directory, 'profiles.json')),
  }
}

test('stores server and key combinations independently', (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }))

  const first = fixture.store.save({
    name: 'Main',
    baseUrl: 'https://api.example.com/',
    apiKey: 'Bearer sk-main',
  })
  fixture.store.save({
    name: 'Backup',
    baseUrl: 'backup.example.com',
    apiKey: 'sk-backup',
  })

  assert.equal(first.baseUrl, 'https://api.example.com')
  assert.equal(first.apiKey, 'sk-main')
  assert.equal(fixture.store.list().length, 2)

  const reloaded = new KeyQueryProfileStore(fixture.filePath)
  assert.deepEqual(reloaded.list(), fixture.store.list())
})

test('updates and deletes only the selected profile', (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }))

  const first = fixture.store.save({
    name: 'Main',
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-main',
  })
  const second = fixture.store.save({
    name: 'Backup',
    baseUrl: 'https://backup.example.com',
    apiKey: 'sk-backup',
  })
  fixture.store.save({ ...first, name: 'Updated', apiKey: 'sk-updated' })
  fixture.store.delete(second.id)

  assert.deepEqual(
    fixture.store.list().map(({ name, apiKey }) => ({ name, apiKey })),
    [{ name: 'Updated', apiKey: 'sk-updated' }],
  )
})
