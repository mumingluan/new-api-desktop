const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')

const { KeyBatchProfileStore } = require('./key-batch-store')

test('saves, reloads, updates, and deletes MySQL profiles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'new-api-key-batch-'))
  const filePath = path.join(directory, 'profiles.json')
  const store = new KeyBatchProfileStore(filePath)
  const saved = store.save({
    name: '主库',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'secret',
    database: 'new-api',
  })
  assert.equal(store.list().length, 1)
  assert.equal(new KeyBatchProfileStore(filePath).list()[0].password, 'secret')
  const updated = store.save({ ...saved, name: '生产库', password: 'next' })
  assert.equal(updated.id, saved.id)
  assert.equal(store.list()[0].name, '生产库')
  assert.equal(store.delete(saved.id), true)
  assert.deepEqual(store.list(), [])
})
