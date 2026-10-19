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

test('shows the three figures with a gauge each, coloured by use', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'drawn by the mod below' })) // another mod's band
  on('session.usage', () => ({ value: usage(62, 85, 19) }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    const context = await ui.find({ type: 'Text', text: /^context / })
    const fiveHour = await ui.find({ type: 'Text', text: /^5h / })
    const sevenDay = await ui.find({ type: 'Text', text: /^本週 / })
    expect(context?.text).toBe('context 62%')
    expect(fiveHour?.text).toMatch(/^5h 85% ↻\d\d:\d\d$/)
    expect(sevenDay?.text).toBe('本週 19%')
    expect(context?.props.color).toBe('warning')
    expect(fiveHour?.props.color).toBe('error')
    expect(fiveHour?.props.bold).toBe(true)
    expect(sevenDay?.props.color).toBe('success')
    const gauges = (await ui.findAll({ type: 'Text', text: /^[▰▱]{5}$/ })).map(g => g.text)
    expect(gauges).toEqual(['▰▰▰▰▱', '▰▰▰▰▰', '▰▱▱▱▱'])
    expect((await ui.find({ type: 'Text', text: /^快取/ }))?.text).toBe('快取 —')
    expect(await ui.find({ type: 'Text', text: 'drawn by the mod below' })).toBeDefined()
    await ui.unmount()
  }
})

test('exactly 80% is still amber, 81 is red', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: usage(80, 10, 81) }))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /^context / }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^本週 / }))?.props.color).toBe('error')
  await ui.unmount()
})

test('off a subscription the limits read as a dash', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /^context / }))?.text).toBe('context —')
  expect((await ui.find({ type: 'Text', text: /^5h / }))?.text).toBe('5h —')
  expect((await ui.find({ type: 'Text', text: /^context / }))?.props.color).toBeUndefined()
  expect((await ui.findAll({ type: 'Text', text: /^[▰▱]{5}$/ })).every(g => g.text === '▱▱▱▱▱')).toBe(true)
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

test('the model row is titled, highlights the current model and switches on a press', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  const ran: { command: string; args: string }[] = []
  let engineModel = 'claude-fable-5-1[1m]'
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('session.model', () => ({ value: engineModel }) as never)
  on('command.run', ($, e) => {
    ran.push({ command: e.command, args: e.args })
    if (e.args === 'claude-sonnet-5-5') engineModel = 'claude-sonnet-5-5' // the engine takes this one and keeps the model on any other
    return { value: { text: '' } } as never
  })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: '目前模型' })).toBeDefined()
  const current = await ui.find({ key: 'model:claude-fable-5-1' })
  expect(current?.props.label).toBe('Fable 5.1')
  expect(current?.props.variant).toBe('primary')
  expect(current?.props.plain).toBeUndefined()
  const other = await ui.find({ key: 'model:claude-sonnet-5-5' })
  expect(other?.props.label).toBe('Sonnet 5.5')
  expect(other?.props.plain).toBe(true)
  expect((await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('model:')).map(b => b.props.label)).toEqual(['Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5'])
  await ui.press({ key: 'model:claude-fable-5-1' })
  expect(ran).toEqual([])
  await ui.press({ key: 'model:claude-sonnet-5-5' })
  expect(ran).toEqual([{ command: 'model', args: 'claude-sonnet-5-5' }])
  expect((await ui.find({ key: 'model:claude-sonnet-5-5' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'model:claude-fable-5-1' }))?.props.plain).toBe(true)
  await ui.press({ key: 'model:claude-opus-5-5' })
  expect(ran.at(-1)).toEqual({ command: 'model', args: 'claude-opus-5-5' })
  expect((await ui.find({ key: 'model:claude-sonnet-5-5' }))?.props.variant).toBe('primary') // kept: the highlight stays put
  expect((await ui.find({ key: 'model:claude-opus-5-5' }))?.props.plain).toBe(true)
  await ui.unmount()
})

test('a model outside the family is offered first so the picker never lies', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('session.model', () => ({ value: 'glm53' }) as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  const row = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('model:'))
  expect(row.map(b => b.props.label)).toEqual(['glm53', 'Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5'])
  expect(row[0]?.props.variant).toBe('primary')
  await ui.unmount()
})
