import { expect, test } from 'claude-code/testing'

import { cacheCell, shouldWarn } from '../hooks/cache'

const MIN = 60 * 1000
const sent = 1_000_000

test('counts down whole minutes from the last main request', async () => {
  expect(cacheCell(null, sent).text).toBe('快取 —')
  expect(cacheCell(sent, sent).text).toBe('快取 剩 60 分')
  expect(cacheCell(sent, sent + 17 * MIN + 30_000).text).toBe('快取 剩 42 分')
  expect(cacheCell(sent, sent + 59 * MIN + 30_000).text).toBe('快取 剩 <1 分')
})

test('expired reads red and says the next prompt recomputes', async () => {
  const cell = cacheCell(sent, sent + 60 * MIN)
  expect(cell.text).toBe('快取已過期，下一句重算')
  expect(cell.isExpired).toBe(true)
  expect(cacheCell(sent, sent + 59 * MIN).isExpired).toBe(false)
})

test('warns once inside the last five minutes', async () => {
  expect(shouldWarn(sent, sent + 54 * MIN, null)).toBe(false)
  expect(shouldWarn(sent, sent + 55 * MIN, null)).toBe(true)
  expect(shouldWarn(sent, sent + 56 * MIN, sent)).toBe(false)
})

test('a newer request earns its own warning', async () => {
  expect(shouldWarn(sent + MIN, sent + 57 * MIN, sent)).toBe(true)
  expect(shouldWarn(sent + MIN, sent + 57 * MIN, sent + MIN)).toBe(false)
  expect(shouldWarn(sent, sent + 60 * MIN, null)).toBe(false)
  expect(shouldWarn(null, sent, null)).toBe(false)
})
