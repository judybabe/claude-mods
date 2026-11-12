import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { HANDOFF_REQUEST, filesFromTranscript, firstMessage, handoffPath, isSummary, shouldOffer, transcriptSlug, withFiles } from '../hooks/handoff'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 1, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const usage = (context: number): SessionUsage => ({
  startedAt: 0,
  context: { tokens: context * 2000, window: 200000, percent: context },
  rateLimits: [],
})

const SUMMARY = '## 目前的目標\n做交接按鈕\n## 做完了什麼\n寫好了\n## 還沒做的\n無\n## 改過哪些檔案\n/a.ts\n## 要注意的地方\n無'

test('offers from 70% up', async () => {
  expect(shouldOffer(undefined)).toBe(false)
  expect(shouldOffer(69)).toBe(false)
  expect(shouldOffer(70)).toBe(true)
})

test('names the file after the project and the minute', async () => {
  const at = new Date(2026, 9, 13, 9, 5)
  expect(handoffPath('/home/u', '/home/u/multi-agent', at)).toBe('/home/u/.claude/handoffs/multi-agent-20261013-0905.md')
  expect(firstMessage('/x.md', `\n${SUMMARY}\n`)).toBe(`以下是上一段對話的交接摘要（檔案：/x.md），請讀完後接續工作。\n\n${SUMMARY}`)
})

test('no button below 70%', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: usage(69) }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    await ui.unmount()
  }
})

const line = (blocks: unknown[]) => JSON.stringify({ type: 'assistant', message: { content: blocks } })
const TRANSCRIPT = [
  line([{ type: 'tool_use', name: 'Edit', input: { file_path: '/home/u/multi-agent/a.ts' } }]),
  line([{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'Write', input: { file_path: '/home/u/multi-agent/b.md' } }]),
  line([{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]),
  line([{ type: 'tool_use', name: 'Edit', input: { file_path: '/home/u/multi-agent/a.ts' } }]),
  line([{ type: 'tool_use', name: 'NotebookEdit', input: { notebook_path: '/home/u/n.ipynb' } }]),
  '{not json',
].join('\n')

test('a summary needs the goal and four of the five headings; the files come from the whole transcript', () => {
  expect(isSummary(SUMMARY)).toBe(true)
  expect(isSummary('查清楚了，兩件事：dev 是好的')).toBe(false)
  expect(isSummary('## 做完了什麼\n## 還沒做的\n## 改過哪些檔案\n## 要注意的地方')).toBe(false)
  expect(filesFromTranscript(TRANSCRIPT)).toEqual(['/home/u/multi-agent/a.ts', '/home/u/multi-agent/b.md', '/home/u/n.ipynb'])
  expect(transcriptSlug('/home/u/multi-agent')).toBe('-home-u-multi-agent')
  expect(withFiles(SUMMARY, ['/x'])).toBe(`${SUMMARY}\n\n## 本工作階段改過的所有檔案（自動整理）\n- /x\n`)
  expect(HANDOFF_REQUEST).toContain('整個工作階段')
})

const world = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  const submitted: string[] = []
  const written: Array<[string, string]> = []
  const commands: string[] = []
  const toasts: string[] = []
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: usage(72) }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => { submitted.push(e.text); return { text: e.text } })
  on('fs.write', ($, e) => { written.push([e.path, e.text]); return { value: undefined } as never })
  on('fs.read', ($, e) => (e.path === '/home/u/.claude/projects/-home-u-multi-agent/s1.jsonl' ? { value: TRANSCRIPT } : { deny: 'no such file' }) as never)
  on('command.run', ($, e) => { commands.push(e.command); return { value: { text: '' } } as never })
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('env.get', () => ({ value: '/home/u' }))
  on('session.cwd', () => ({ value: '/home/u/multi-agent' }))
  on('session.root', () => ({ value: '/home/u/multi-agent' }) as never)
  on('session.id', () => ({ value: 's1' }) as never)
  return { submitted, written, commands, toasts }
}

test('only the turn the request opened is the handoff: the summary is saved with every file, then cleared and reopened', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on, { now: new Date(2026, 9, 13, 9, 5).getTime() })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'handoff' })
  expect(w.submitted).toEqual([HANDOFF_REQUEST])
  expect(await ui.find({ key: 'handoff-cancel' })).toBeDefined()

  // the turn that was running when the button was pressed ends first: nothing happens
  await $.turn.complete({ turnId: 'earlier', answer: '查清楚了，兩件事', reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.settle()
  expect(w.written).toEqual([])
  expect(w.commands).toEqual([])

  await $.turn.start({ text: HANDOFF_REQUEST, turnId: 'h1' })
  await $.turn.complete({ turnId: 'h1', answer: SUMMARY, reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.settle()

  const path = '/home/u/.claude/handoffs/multi-agent-20261013-0905.md'
  const content = withFiles(SUMMARY, ['/home/u/multi-agent/a.ts', '/home/u/multi-agent/b.md', '/home/u/n.ipynb'])
  expect(w.written).toEqual([[path, content]])
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted[1]).toBe(firstMessage(path, content))
  await ui.unmount()
})

test('a reply without the headings is not saved and nothing is cleared', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'handoff' })
  await $.turn.start({ text: HANDOFF_REQUEST, turnId: 'h1' })
  await $.turn.complete({ turnId: 'h1', answer: '好的，我來整理', reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.settle()
  expect(w.written).toEqual([])
  expect(w.commands).toEqual([])
  expect(w.toasts.at(-1)).toMatch(/不像交接摘要/)
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})

test('an aborted summary leaves the conversation alone', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'handoff' })
  await $.turn.start({ text: HANDOFF_REQUEST, turnId: 'h1' })
  await $.turn.complete({ turnId: 'h1', answer: '', reason: 'aborted', isAborted: true, durationMs: 1 })
  await clock.settle()
  expect(w.written).toEqual([])
  expect(w.commands).toEqual([])
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})

test('cancel drops the handoff: the summary turn then changes nothing', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'handoff' })
  await ui.press({ key: 'handoff-cancel' })
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await $.turn.start({ text: HANDOFF_REQUEST, turnId: 'h1' })
  await $.turn.complete({ turnId: 'h1', answer: SUMMARY, reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.settle()
  expect(w.written).toEqual([])
  expect(w.commands).toEqual([])
  await ui.unmount()
})

test('while Claude is working the button is not offered', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND, props: { ...BAND.props, isWorking: true } })
  expect(await ui.find({ key: 'handoff' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /等 Claude 回完/ })).toBeDefined()
  await ui.unmount()
})
