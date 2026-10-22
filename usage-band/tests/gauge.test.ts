import { expect, test } from 'claude-code/testing'

import { bar, colour, level } from '../hooks/gauge'

test('eight cells drawn to the eighth, as the spec’s samples', () => {
  expect(bar(32)).toEqual({ filled: '██▌', track: '█████' })
  expect(bar(11)).toEqual({ filled: '▉', track: '███████' })
  expect(bar(35)).toEqual({ filled: '██▊', track: '█████' })
  expect(bar(42)).toEqual({ filled: '███▍', track: '████' })
  expect(bar(72)).toEqual({ filled: '█████▊', track: '██' })
  expect(bar(93)).toEqual({ filled: '███████▌', track: '' })
  expect(bar(100)).toEqual({ filled: '████████', track: '' })
  expect(bar(0)).toEqual({ filled: '', track: '████████' })
  expect(bar(undefined)).toEqual({ filled: '', track: '████████' })
})

test('ok under 60, warn from 60, danger from 85, none without a figure', () => {
  expect(level(undefined)).toBe('none')
  expect(level(0)).toBe('ok')
  expect(level(59)).toBe('ok')
  expect(level(60)).toBe('warn')
  expect(level(84)).toBe('warn')
  expect(level(85)).toBe('danger')
  expect(colour('none')).toBeUndefined()
  expect(colour('ok')).toBe('#58A6FF')
  expect(colour('warn')).toBe('#E3B341')
  expect(colour('danger')).toBe('#FF7B72')
})
