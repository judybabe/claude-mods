import { expect, test } from 'claude-code/testing'

import { counts, displayPath, figures, merge, toPatch } from '../hooks/changes'

const hunk = { oldStart: 3, oldLines: 2, newStart: 3, newLines: 3, lines: [' a', '-b', '+c', '+d'] }

test('hunks become a unified diff with its counts', async () => {
  expect(toPatch([hunk])).toBe('@@ -3,2 +3,3 @@\n a\n-b\n+c\n+d')
  expect(counts([hunk])).toEqual({ added: 2, removed: 1 })
})

test('paths read relative to the folder, then to home', async () => {
  expect(displayPath('/home/judy/p/src/a.ts', '/home/judy/p', '/home/judy')).toBe('src/a.ts')
  expect(displayPath('/home/judy/.claude/x.json', '/home/judy/p', '/home/judy')).toBe('~/.claude/x.json')
  expect(displayPath('/etc/hosts', '/home/judy/p', '/home/judy')).toBe('/etc/hosts')
})

test('a second edit of the same file joins the first', async () => {
  const first = { path: '/a', display: 'a', kind: 'create', added: 3, removed: 0, patch: 'p1', why: ['先建檔'] } as const
  const second = { ...first, kind: 'update', added: 1, removed: 2, patch: 'p2', why: ['先建檔', '再修正'] } as const
  const joined = merge(merge([], first), second)
  expect(joined).toHaveLength(1)
  expect(joined[0]).toEqual({ ...first, added: 4, removed: 2, patch: 'p1\np2', why: ['先建檔', '再修正'] })
  expect(figures(joined[0]!)).toBe('+4 −2')
})
