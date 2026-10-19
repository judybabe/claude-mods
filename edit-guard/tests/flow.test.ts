import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CANCEL, CONTINUE, WINDOW_MS } from '../hooks/guard'

const DIR = '/home/judy/.claude/edit-log'
const NOW = Date.UTC(2026, 9, 13, 5, 52)

type World = { files: Map<string, { text: string; mtimeMs: number }>; asked: string[]; ran: string[]; removed: string[] }

const world = (on: On, answer: string | undefined): World => {
  const w: World = { files: new Map(), asked: [], ran: [], removed: [] }
  mock.clock(on, { now: NOW })
  on('session.id', () => ({ value: 'me-session' }) as never)
  on('session.cwd', () => ({ value: '/home/judy/p' }) as never)
  on('env.get', () => ({ value: '/home/judy' }) as never)
  on('fs.exists', ($, e) => ({ value: e.path === DIR ? w.files.size > 0 : w.files.has(e.path) }) as never)
  on('fs.list', () => ({
    value: [...w.files].map(([path, f]) => ({
      name: path.slice(DIR.length + 1), kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false,
    })),
  }) as never)
  on('fs.read', ($, e) => ({ value: w.files.get(e.path)?.text ?? '' }) as never)
  on('fs.write', ($, e) => { w.files.set(e.path, { text: e.text, mtimeMs: NOW }); return { value: undefined } as never })
  on('process.run', ($, e) => {
    w.removed.push(String(e.argv.at(-1)))
    w.files.delete(String(e.argv.at(-1)))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      const q = e.questions[0]!.question
      w.asked.push(q)
      if (answer === undefined) return { deny: 'dismissed' }
      return { result: { questions: e.questions, answers: { [q]: answer } } } as never
    }
    if ('file_path' in e) w.ran.push(String(e.file_path))
    return { result: { ok: true } } as never
  })
  return w
}

const other = (w: World, session: string, file: string, at: number) =>
  w.files.set(`${DIR}/${session}.json`, { text: JSON.stringify([{ file, at }]), mtimeMs: at })

const edit = (file_path: string) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' }) as const

test('a quiet file is written and recorded without asking', async ($, on) => {
  const w = world(on, CONTINUE)
  await $.tool.call(edit('src/a.ts'))
  expect(w.asked).toEqual([])
  expect(w.ran).toEqual(['src/a.ts'])
  expect(JSON.parse(w.files.get(`${DIR}/me-session.json`)!.text)).toEqual([{ file: '/home/judy/p/src/a.ts', at: NOW }])
})

test('another session’s recent edit asks, and continue writes', async ($, on) => {
  const w = world(on, CONTINUE)
  other(w, 'other-session-1', '/home/judy/p/src/a.ts', NOW - 60_000)
  await $.tool.call(edit('/home/judy/p/src/a.ts'))
  expect(w.asked).toEqual(['對話 other-se 在 13:51 改過 /home/judy/p/src/a.ts，要繼續嗎？'])
  expect(w.ran).toEqual(['/home/judy/p/src/a.ts'])
})

for (const [name, answer] of [['cancel', CANCEL], ['closing the dialog', undefined]] as const) {
  test(`${name} refuses and records nothing`, async ($, on) => {
    const w = world(on, answer)
    other(w, 'other-session-1', '/home/judy/p/a.ts', NOW - 60_000)
    const r = await $.tool.call(edit('/home/judy/p/a.ts'))
    expect(r.deny).toContain('使用者取消')
    expect(w.ran).toEqual([])
    expect(w.files.has(`${DIR}/me-session.json`)).toBe(false)
  })
}

test('my own earlier edit does not ask', async ($, on) => {
  const w = world(on, CANCEL)
  other(w, 'me-session', '/home/judy/p/a.ts', NOW - 60_000)
  await $.tool.call(edit('a.ts'))
  expect(w.asked).toEqual([])
  expect(JSON.parse(w.files.get(`${DIR}/me-session.json`)!.text)).toHaveLength(2)
})

test('records older than thirty minutes are dropped, stale session files removed', async ($, on) => {
  const w = world(on, CANCEL)
  other(w, 'old-session', '/home/judy/p/a.ts', NOW - WINDOW_MS - 1)
  other(w, 'me-session', '/home/judy/p/old.ts', NOW - WINDOW_MS - 1)
  await $.tool.call(edit('a.ts'))
  expect(w.asked).toEqual([])
  expect(w.removed).toEqual([`${DIR}/old-session.json`])
  expect(JSON.parse(w.files.get(`${DIR}/me-session.json`)!.text)).toEqual([{ file: '/home/judy/p/a.ts', at: NOW }])
})
