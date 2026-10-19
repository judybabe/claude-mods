import { expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

const usage = (context: number, fiveHour: number, sevenDay: number): SessionUsage => ({
  startedAt: 0,
  context: { tokens: context * 2000, window: 200000, percent: context },
  rateLimits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: '2026-10-13T07:30:00Z' },
    { kind: 'seven_day', percentUsed: sevenDay },
  ],
})

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 1, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('shows the three figures, red only past 80%', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'drawn by the mod below' })) // another mod's band
  on('session.usage', () => ({ value: usage(62, 85, 19) }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    const context = await ui.find({ type: 'Text', text: /^context / })
    const fiveHour = await ui.find({ type: 'Text', text: /^5h / })
    const sevenDay = await ui.find({ type: 'Text', text: /^本週 / })
    expect(context?.text).toBe('context 62%')
    expect(fiveHour?.text).toMatch(/^5h 85%（\d\d:\d\d 重置）$/)
    expect(sevenDay?.text).toBe('本週 19%')
    expect(context?.props.color).toBeUndefined()
    expect(fiveHour?.props.color).toBe('error')
    expect(sevenDay?.props.color).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^快取/ }))?.text).toBe('快取 —')
    expect(await ui.find({ type: 'Text', text: 'drawn by the mod below' })).toBeDefined()
    await ui.unmount()
  }
})

test('exactly 80% stays uncoloured', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: usage(80, 10, 81) }))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /^context / }))?.props.color).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^本週 / }))?.props.color).toBe('error')
  await ui.unmount()
})

test('off a subscription the limits read as a dash', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /^context / }))?.text).toBe('context —')
  expect((await ui.find({ type: 'Text', text: /^5h / }))?.text).toBe('5h —')
  await ui.unmount()
})

test('the band has a files toggle that runs /turn-files and shows the pane state', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  const ran: string[] = []
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('command.run', ($, e) => { ran.push(e.command); return { value: { text: '' } } as never })
  on('state.get', ($, e) => {
    const ref = e as { plugin?: string; key?: string }
    if (ref.plugin === 'turn-files' && ref.key === 'open') return { value: { value: true } } as never
    if (ref.plugin === 'turn-files' && ref.key === 'shown') return { value: { value: [{ path: '/a' }, { path: '/b' }, { path: '/c' }] } } as never
    return { value: {} } as never
  })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  const files = await ui.find({ key: 'files' })
  expect(files?.props.label).toBe('檔案 ▾ 3')
  await ui.press({ key: 'files' })
  expect(ran).toEqual(['turn-files'])
  await ui.unmount()
})

test('without turn-files the toggle still draws, closed and uncounted', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('state.get', ($, e) => ((e as { plugin?: string }).plugin === 'turn-files' ? { deny: 'no such plugin' } : { value: {} }) as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ key: 'files' }))?.props.label).toBe('檔案 ▸')
  await ui.unmount()
})
