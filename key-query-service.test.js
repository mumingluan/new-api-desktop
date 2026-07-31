const assert = require('node:assert/strict')
const test = require('node:test')

const {
  dateString,
  normalizeApiKey,
  normalizeBaseUrl,
  readNumber,
} = require('./key-query-service')

test('normalizes server and key input', () => {
  assert.equal(normalizeBaseUrl('api.example.com/'), 'https://api.example.com')
  assert.equal(normalizeBaseUrl('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000')
  assert.equal(normalizeApiKey('Bearer sk-test'), 'sk-test')
})

test('formats dates and rejects invalid numeric values', () => {
  assert.equal(dateString(new Date(2026, 6, 29)), '2026-07-29')
  assert.equal(readNumber('12.5'), 12.5)
  assert.equal(readNumber('invalid'), 0)
})
