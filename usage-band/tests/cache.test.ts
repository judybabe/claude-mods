import { expect, test } from 'claude-code/testing'

import { cacheCell, shouldWarn } from '../hooks/cache'
import { agoText, countdown, untilText } from '../hooks/time'

const MIN = 60 * 1000
const sent = 1_000_000

test('counts down mm:ss from the last main request', () => {
  expect(cacheCell(null, sent)).toEqual({ text: '—', state: 'none', isExpired: false })
  expect(cacheCell(sent, sent)).toEqual({ text: '60:00', state: 'ok', isExpired: false })
  expect(cacheCell(sent, sent + 38 * MIN).text).toBe('22:00')
  expect(cacheCell(sent, sent + 55 * MIN + 1000)).toEqual({ text: '04:59', state: 'soon', isExpired: false })
  expect(cacheCell(sent, sent + 60 * MIN)).toEqual({ text: '已過期', state: 'expired', isExpired: true })
})

test('warns once inside the last five minutes, a newer request earning its own', () => {
  expect(shouldWarn(null, sent, null)).toBe(false)
  expect(shouldWarn(sent, sent + 10 * MIN, null)).toBe(false)
  expect(shouldWarn(sent, sent + 56 * MIN, null)).toBe(true)
  expect(shouldWarn(sent, sent + 56 * MIN, sent)).toBe(false)
  expect(shouldWarn(sent + MIN, sent + 57 * MIN, sent)).toBe(true)
  expect(shouldWarn(sent, sent + 61 * MIN, null)).toBe(false)
})

test('times in words', () => {
  const now = Date.parse('2026-10-22T10:00:00Z')
  expect(untilText('2026-10-22T13:12:00Z', now)).toBe('3h12m')
  expect(untilText('2026-10-22T10:47:00Z', now)).toBe('47m')
  expect(untilText('2026-10-22T10:00:30Z', now)).toBe('<1m')
  expect(untilText('2026-10-22T09:00:00Z', now)).toBeUndefined()
  expect(untilText(undefined, now)).toBeUndefined()
  expect(agoText(now - 12_000, now)).toBe('12 秒前')
  expect(agoText(now - 6 * MIN, now)).toBe('6 分鐘前')
  expect(agoText(now - 2 * 60 * MIN, now)).toBe('2 小時前')
  expect(countdown(22 * MIN)).toBe('22:00')
  expect(countdown(4 * MIN + 59_000)).toBe('04:59')
})
