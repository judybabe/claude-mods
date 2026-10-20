import { expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { modelName } from '../hooks/model'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 1, bodyColumns: 160, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const usage = (rateLimits: SessionUsage['rateLimits']): SessionUsage => ({
  startedAt: 0,
  context: { tokens: 1000, window: 200000, percent: 1 },
  rateLimits,
})

test('model ids read as their short names', async () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(modelName('glm53')).toBe('glm53')
})

test('the band leads with the model', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' })) // the mods below the band draw nothing
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.usage', () => ({
    value: usage([
      { kind: 'seven_day', percentUsed: 40 },
      { kind: 'seven_day_fable', percentUsed: 90, resetsAt: '2026-10-16T06:00:00Z' },
    ]),
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect((await ui.find({ key: 'model' }))?.props.label).toBe('Opus 5.5 ▾')
    expect(await ui.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^本週 / }))?.text).toBe('本週 40%')
    await ui.unmount()
  }
})
