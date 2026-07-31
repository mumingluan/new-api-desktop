const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildQuotaUpdate,
  buildStatsQuery,
  normalizeDbConfig,
  parseGroups,
} = require('./key-batch-service')

test('normalizes MySQL connection values', () => {
  assert.deepEqual(normalizeDbConfig({
    host: ' db.example.com ',
    port: '3307',
    user: ' root ',
    password: 'secret',
    database: ' new-api ',
  }), {
    host: 'db.example.com',
    port: 3307,
    user: 'root',
    password: 'secret',
    database: 'new-api',
  })
})

test('builds protected quota deduction SQL with workbench filters', () => {
  const statement = buildQuotaUpdate({
    mode: 'deduct-quota',
    group: 'default',
    dollars: 2,
    usedOnly: true,
    minEnabled: true,
    minUsd: 1,
  }, 1000)
  assert.match(statement.sql, /WHEN remain_quota - \? < 0 THEN 0/)
  assert.match(statement.sql, /AND used_quota > 0/)
  assert.match(statement.sql, /AND remain_quota > \?/)
  assert.deepEqual(statement.params, [1000000, 1000000, 'default', 500000])
})

test('builds stats query from allowlisted grouping and filters', () => {
  const statement = buildStatsQuery({
    groupBy: 'channel_name',
    sortBy: 'quota',
    start: 100,
    end: 200,
    top: 20,
    excludeUserId: 1,
    model: 'gpt',
    minTokens: 100,
  })
  assert.match(statement.sql, /`channel_name` AS name/)
  assert.match(statement.sql, /ORDER BY total_quota DESC/)
  assert.deepEqual(statement.params, [100, 200, 1, '%gpt%', 100, 20])
})

test('parses GroupRatio option with default fallback', () => {
  assert.deepEqual(parseGroups([{ value: '{"vip":2,"default":1}' }]), ['default', 'vip'])
  assert.deepEqual(parseGroups([{ value: 'broken' }]), ['default'])
})
