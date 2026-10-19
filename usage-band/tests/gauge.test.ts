import { expect, test } from 'claude-code/testing'

import { gauge, tone } from '../hooks/gauge'

test('five cells, any use lights the first, full at 100', () => {
  expect(gauge(undefined)).toBe('▱▱▱▱▱')
  expect(gauge(0)).toBe('▱▱▱▱▱')
  expect(gauge(4)).toBe('▰▱▱▱▱')
  expect(gauge(18)).toBe('▰▱▱▱▱')
  expect(gauge(62)).toBe('▰▰▰▰▱')
  expect(gauge(100)).toBe('▰▰▰▰▰')
  expect(gauge(130)).toBe('▰▰▰▰▰')
})

test('green under 50, amber from 50 to 80, red past 80, none without a figure', () => {
  expect(tone(undefined)).toBeUndefined()
  expect(tone(0)).toBe('success')
  expect(tone(49)).toBe('success')
  expect(tone(50)).toBe('warning')
  expect(tone(80)).toBe('warning')
  expect(tone(81)).toBe('error')
})
