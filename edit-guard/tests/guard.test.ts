import { expect, test } from 'claude-code/testing'

import { WINDOW_MS, absolute, fresh, latestOther, question } from '../hooks/guard'

const AT = Date.UTC(2026, 9, 13, 5, 52)

test('paths resolve against the working directory', async () => {
  expect(absolute('src/a.ts', '/home/u/p')).toBe('/home/u/p/src/a.ts')
  expect(absolute('../b.ts', '/home/u/p')).toBe('/home/u/b.ts')
  expect(absolute('/x/./y//z.ts', '/ignored')).toBe('/x/y/z.ts')
})

test('only the last thirty minutes count', async () => {
  const entries = [{ file: '/a', at: AT - WINDOW_MS }, { file: '/a', at: AT - WINDOW_MS + 1 }]
  expect(fresh(entries, AT)).toEqual([{ file: '/a', at: AT - WINDOW_MS + 1 }])
  const others = [
    { session: 's1', file: '/a', at: AT - WINDOW_MS },
    { session: 's2', file: '/b', at: AT - 1000 },
  ]
  expect(latestOther(others, '/a', AT)).toBeUndefined()
  expect(latestOther([...others, { session: 's3', file: '/a', at: AT - 5000 }], '/a', AT)?.session).toBe('s3')
})

test('the question names the session, Taiwan time and the file', async () => {
  expect(question({ session: 'abcdef1234567890', file: '/home/u/x.ts', at: AT }))
    .toBe('對話 abcdef12 在 13:52 改過 /home/u/x.ts，要繼續嗎？')
})
