import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

const NOW = Date.parse('2026-10-22T10:00:00Z')
const RESET = '2026-10-22T13:12:00Z'

const usage = (context: number, fiveHour: number, sevenDay: number): SessionUsage => ({
  startedAt: 0,
  context: { tokens: context * 2000, window: 200000, percent: context },
  rateLimits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: RESET },
    { kind: 'seven_day', percentUsed: sevenDay },
  ],
})

const band = (bodyColumns: number) => ({
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 1, bodyColumns, scroll: { offset: 0, bodyRows: 40 }, view: {} },
}) as const

const quiet = (on: Parameters<Parameters<typeof test>[1]>[1]) => on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing

const texts = async (ui: { findAll: (q: { type: 'Text' }) => Promise<readonly { text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

test('one row: capsule, three quotas with eighth-cell bars, cache, refresh and files', async ($, on) => {
  quiet(on)
  on('session.usage', () => ({ value: usage(32, 11, 35) }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/home/u/p' } as never)
  await clock.advance(2000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...band(160) })
    const all = await texts(ui)
    expect(all).toContain(' ✳ Fable 5.1 ▾ ')
    expect(all).toContain('上下文 ')
    expect(all).toContain('██▌')
    expect(all).toContain('32%')
    expect(all).toContain('5 小時 ')
    expect(all).toContain('▉')
    expect(all).toContain('11%')
    expect(all).toContain(' · 3h11m 後重置')
    expect(all).toContain('本週 ')
    expect(all).toContain('██▊')
    expect(all).toContain('35%')
    expect(all).toContain('快取 ')
    expect(all).toContain('—')
    expect(all).toContain('↻ 2 秒前')
    expect((await ui.find({ key: 'files' }))?.props.label).toBe('檔案 ▸')
    expect((await ui.find({ type: 'Text', text: '32%' }))?.props.color).toBe('#58A6FF')
    expect((await ui.find({ type: 'Text', text: '32%' }))?.props.bold).toBe(true)
    await ui.unmount()
  }
})

test('60 warns in amber, 85 is danger with ⚠ and advice, a spent quota says when it is back', async ($, on) => {
  quiet(on)
  on('session.usage', () => ({ value: usage(93, 100, 72) }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/home/u/p' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(160) })
  const all = await texts(ui)
  expect(all).toContain('⚠ 上下文 ')
  expect((await ui.find({ type: 'Text', text: '93%' }))?.props.color).toBe('#FF7B72')
  expect(all).toContain(' · 建議 /compact')
  expect(all).toContain('⚠ 5 小時 ')
  expect(all).toContain(' · 3h12m 後恢復')
  expect((await ui.find({ type: 'Text', text: '72%' }))?.props.color).toBe('#E3B341')
  expect(all).not.toContain('⚠ 本週 ')
  await ui.unmount()
})

test('off a subscription the quotas read as a dash, uncoloured', async ($, on) => {
  quiet(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }) as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(160) })
  const dashes = (await ui.findAll({ type: 'Text', text: '—' })).filter(t => t.text === '—')
  expect(dashes.length).toBeGreaterThanOrEqual(3)
  expect(dashes.every(t => t.props.color === undefined)).toBe(true)
  await ui.unmount()
})

test('80 columns keeps the figures only; under 80 only the quotas that warn', async ($, on) => {
  quiet(on)
  on('session.usage', () => ({ value: usage(93, 11, 35) }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/home/u/p' } as never)
  await clock.advance(2000)

  const mid = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(100) })
  let all = await texts(mid)
  expect(all).toContain('⚠ 上下文 ')
  expect(all).toContain('5h ')
  expect(all).toContain('週 ')
  expect(all).not.toContain('██▌')
  expect(all).not.toContain(' · 3h11m 後重置')
  expect(all).toContain('↻')
  expect(all).not.toContain('↻ 0 秒前')
  expect(await mid.find({ key: 'files' })).toBeDefined()
  await mid.unmount()

  const narrow = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(60) })
  all = await texts(narrow)
  expect(all).toContain(' ✳ Fable 5.1 ')
  expect(all).toContain('⚠ 上下文 ')
  expect(all).toContain('93%')
  expect(all).not.toContain('5h ')
  expect(all).not.toContain('週 ')
  expect(all).not.toContain('快取 ')
  expect(await narrow.find({ key: 'files' })).toBeUndefined()
  expect(await narrow.find({ key: 'refresh' })).toBeUndefined()
  await narrow.unmount()
})

test('the files entry runs /turn-files and shows the pane state', async ($, on) => {
  quiet(on)
  const ran: string[] = []
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('command.run', ($, e) => { ran.push(e.command); return { value: { text: '' } } as never })
  on('state.get', ($, e) => {
    const ref = e as { plugin?: string; key?: string }
    if (ref.plugin === 'turn-files' && ref.key === 'open') return { value: { value: true } } as never
    if (ref.plugin === 'turn-files' && ref.key === 'shown') return { value: { value: [{ path: '/a' }, { path: '/b' }, { path: '/c' }] } } as never
    return { value: {} } as never
  })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(160) })
  expect((await ui.find({ key: 'files' }))?.props.label).toBe('檔案 ▾ 3')
  await ui.press({ key: 'files' })
  expect(ran).toEqual(['turn-files'])
  await ui.unmount()
})

test('the capsule opens a menu above it; a pick switches and closes; the engine keeping the model keeps the capsule', async ($, on) => {
  quiet(on)
  const ran: { command: string; args: string }[] = []
  let engineModel = 'claude-fable-5-1[1m]'
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('session.model', () => ({ value: engineModel }) as never)
  on('command.run', ($, e) => {
    ran.push({ command: e.command, args: e.args })
    if (e.args === 'claude-haiku-5-5') engineModel = 'claude-haiku-5-5'
    return { value: { text: '' } } as never
  })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(160) })
  expect(await ui.find({ type: 'Text', text: ' ✳ Fable 5.1 ▾ ' })).toBeDefined()
  expect(await ui.find({ key: 'model:claude-opus-5-5' })).toBeUndefined()

  await ui.press({ key: 'model' })
  expect(await ui.find({ type: 'Text', text: ' ✳ Fable 5.1 ▴ ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '❯ Fable 5.1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  ✓ 目前' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↑↓ 選擇 · Enter 確認 · 再點膠囊收合' })).toBeDefined()
  const rows = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('model:')).map(b => String(b.key))
  expect(rows).toEqual(['model:claude-fable-5-1', 'model:claude-opus-5-5', 'model:claude-haiku-5-5'])

  await ui.press({ key: 'model' })
  expect(await ui.find({ key: 'model:claude-opus-5-5' })).toBeUndefined()

  await ui.press({ key: 'model' })
  await ui.press({ key: 'model:claude-haiku-5-5' })
  expect(ran).toEqual([{ command: 'model', args: 'claude-haiku-5-5' }])
  expect(await ui.find({ type: 'Text', text: ' ✳ Haiku 5.5 ▾ ' })).toBeDefined()
  expect(await ui.find({ key: 'model:claude-opus-5-5' })).toBeUndefined()

  await ui.press({ key: 'model' })
  await ui.press({ key: 'model:claude-opus-5-5' })
  expect(ran.at(-1)).toEqual({ command: 'model', args: 'claude-opus-5-5' })
  expect(await ui.find({ type: 'Text', text: ' ✳ Haiku 5.5 ▾ ' })).toBeDefined()
  await ui.unmount()
})

test('a model outside the family still heads the capsule and the menu', async ($, on) => {
  quiet(on)
  on('session.usage', () => ({ value: usage(10, 10, 10) }))
  on('session.model', () => ({ value: 'glm53' }) as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(160) })
  expect(await ui.find({ type: 'Text', text: ' ✳ glm53 ▾ ' })).toBeDefined()
  await ui.press({ key: 'model' })
  const rows = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('model:')).map(b => String(b.key))
  expect(rows).toEqual(['model:glm53', 'model:claude-fable-5-1', 'model:claude-opus-5-5', 'model:claude-haiku-5-5'])
  await ui.unmount()
})

test('↻ reads afresh: busy, then ✓ for two seconds, then how long ago; stale past five minutes; a failure keeps the figures', async ($, on) => {
  quiet(on)
  let served: SessionUsage | undefined = usage(10, 10, 10)
  let engineModel = 'claude-fable-5-1'
  let asked = 0
  on('session.usage', () => { asked += 1; return served === undefined ? ({ deny: 'no usage' } as never) : { value: served } })
  on('session.model', () => ({ value: engineModel }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/home/u/p' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...band(160) })
  expect(await ui.find({ type: 'Text', text: '✓ 剛剛更新' })).toBeDefined()
  await clock.advance(2000)
  expect(await ui.find({ type: 'Text', text: '↻ 2 秒前' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '10%' })).toBeDefined()

  served = usage(55, 90, 20)
  engineModel = 'claude-haiku-5-5'
  const before = asked
  await ui.press({ key: 'refresh' })
  expect(asked).toBe(before + 1)
  expect(await ui.find({ type: 'Text', text: '55%' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '90%' }))?.props.color).toBe('#FF7B72')
  expect(await ui.find({ type: 'Text', text: ' ✳ Haiku 5.5 ▾ ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ 剛剛更新' })).toBeDefined()

  // the minute tick reads again by itself
  served = usage(70, 10, 10)
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: '70%' })).toBeDefined()

  // a failure keeps what was shown and offers a retry
  served = undefined
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: '⚠ 更新失敗 · ↻ 重試' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '70%' })).toBeDefined()

  // six minutes on with nothing read, the figures read as old
  await clock.advance(6 * 60_000)
  expect((await ui.find({ type: 'Text', text: '70%' }))?.props.dimColor).toBe(true)
  await ui.unmount()
})
