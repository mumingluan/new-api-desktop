const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')

const { migrateLegacyUserData } = require('./user-data-migration')

const legacyUserDataName = ['new-api', 'electron'].join('-')

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'new-api-desktop-migration-'))
  const appDataPath = path.join(root, 'Roaming')
  const userDataPath = path.join(appDataPath, 'new-api-desktop')
  const legacyPath = path.join(appDataPath, legacyUserDataName)
  fs.mkdirSync(path.join(legacyPath, 'Network'), { recursive: true })
  fs.writeFileSync(path.join(legacyPath, 'desktop-config.json'), '{"instances":[{"id":"one"}]}')
  fs.writeFileSync(path.join(legacyPath, 'frontend-storage.json'), '{"version":1}')
  fs.writeFileSync(path.join(legacyPath, 'Network', 'Cookies'), 'cookie-data')
  return { root, appDataPath, userDataPath, legacyPath }
}

test('moves existing desktop data into the renamed user-data directory', (t) => {
  const fixture = makeFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  fs.mkdirSync(fixture.userDataPath, { recursive: true })

  assert.equal(
    migrateLegacyUserData(fixture.appDataPath, fixture.userDataPath),
    true
  )
  assert.equal(fs.existsSync(fixture.legacyPath), false)
  assert.equal(
    fs.readFileSync(path.join(fixture.userDataPath, 'frontend-storage.json'), 'utf8'),
    '{"version":1}'
  )
  assert.equal(
    fs.readFileSync(path.join(fixture.userDataPath, 'Network', 'Cookies'), 'utf8'),
    'cookie-data'
  )
})

test('keeps current data and removes a stale legacy directory', (t) => {
  const fixture = makeFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  fs.mkdirSync(fixture.userDataPath, { recursive: true })
  fs.writeFileSync(
    path.join(fixture.userDataPath, 'desktop-config.json'),
    '{"instances":[{"id":"current"}]}'
  )

  assert.equal(
    migrateLegacyUserData(fixture.appDataPath, fixture.userDataPath),
    true
  )
  assert.equal(fs.existsSync(fixture.legacyPath), false)
  assert.equal(
    fs.readFileSync(path.join(fixture.userDataPath, 'desktop-config.json'), 'utf8'),
    '{"instances":[{"id":"current"}]}'
  )
})

test('does not migrate when a custom user-data directory is requested', (t) => {
  const fixture = makeFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  const customPath = path.join(fixture.appDataPath, 'smoke-profile')

  assert.equal(migrateLegacyUserData(fixture.appDataPath, customPath), false)
  assert.equal(fs.existsSync(fixture.legacyPath), true)
})
