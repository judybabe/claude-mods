import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { HANDOFF_REQUEST, firstMessage, handoffPath, shouldOffer } from '../hooks/handoff'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 1, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const usage = (context: number): SessionUsage => ({
  startedAt: 0,
  context: { tokens: context * 2000, window: 200000, percent: context },
  rateLimits: [],
})

const SUMMARY = '## 目前的目標\n做交接按鈕\n## 做完了什麼\n寫好了'

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

test('press writes, saves, clears, then opens with the summary', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  const clock = mock.clock(on, { now: new Date(2026, 9, 13, 9, 5).getTime() })
  const submitted: string[] = []
  const written: Array<[string, string]> = []
  const commands: string[] = []
  on('session.usage', () => ({ value: usage(72) }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => { submitted.push(e.text); return { text: e.text } })
  on('fs.write', ($, e) => { written.push([e.path, e.text]); return { value: undefined } as never })
  on('command.run', ($, e) => { commands.push(e.command); return { value: { text: '' } } as never })
  on('env.get', () => ({ value: '/home/u' }))
  on('session.cwd', () => ({ value: '/home/u/multi-agent' }))

  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'handoff' })
  expect(submitted).toEqual([HANDOFF_REQUEST])
  expect(await ui.find({ key: 'handoff' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /交接中/ })).toBeDefined()

  await $.turn.complete({ turnId: 't1', answer: SUMMARY, reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.settle()

  const path = '/home/u/.claude/handoffs/multi-agent-20261013-0905.md'
  expect(written).toEqual([[path, `${SUMMARY}\n`]])
  expect(commands).toEqual(['clear'])
  expect(submitted[1]).toBe(firstMessage(path, SUMMARY))
  await ui.unmount()
})

test('an aborted summary leaves the conversation alone', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  const clock = mock.clock(on)
  const written: string[] = []
  const commands: string[] = []
  on('session.usage', () => ({ value: usage(75) }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('fs.write', ($, e) => { written.push(e.path); return { value: undefined } as never })
  on('command.run', ($, e) => { commands.push(e.command); return { value: { text: '' } } as never })

  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'handoff' })
  await $.turn.complete({ turnId: 't1', answer: '', reason: 'aborted', isAborted: true, durationMs: 1 })
  await clock.settle()
  expect(written).toEqual([])
  expect(commands).toEqual([])
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})
