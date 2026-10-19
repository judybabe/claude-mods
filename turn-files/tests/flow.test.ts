import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  component: 'Pane',
  requestId: 'turn-files',
  props: {
    title: '這一輪改的檔案',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const world = (on: On, summary: string | undefined) => {
  const prompts: string[] = []
  const opened: string[] = []
  on('session.cwd', () => ({ value: '/home/u/p' }) as never)
  on('env.get', () => ({ value: '/home/u' }) as never)
  on('fs.exists', ($, e) => ({ value: e.path !== '/home/u/p/new.ts' }) as never)
  on('session.messages', () => ({
    value: [
      { role: 'user', text: '幫我改', toolUses: [] },
      { role: 'assistant', text: '把門檻改回 70。', toolUses: [] },
    ],
  }) as never)
  on('model.complete', ($, e) => {
    prompts.push(String(e.prompt))
    return {
      value: summary === undefined ? { isAnswered: false, reason: 'empty-reply' } : { isAnswered: true, text: summary, usage: {} },
    } as never
  })
  on('ui.open', ($, e) => { opened.push(e.id); return { value: { isPlaced: true } } as never })
  on('tool.call', ($, e) => {
    if (e.tool === 'Write')
      return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } } as never
    if (e.tool === 'Edit') {
      if (e.file_path.endsWith('locked.ts')) return { deny: 'blocked' }
      return {
        result: {
          filePath: e.file_path,
          structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-export const OFFER_AT = 0', '+export const OFFER_AT = 70'] }],
        },
      } as never
    }
    return { result: {} } as never
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  return { prompts, opened }
}

const turn = async ($: Engine, run: () => Promise<unknown>) => {
  await $.turn.start({ text: '幫我改', turnId: 't1' })
  await run()
  await $.turn.complete({ turnId: 't1', answer: '好了', reason: 'answer', isAborted: false, durationMs: 1 })
}

test('the turn’s files list, open one for its diff, why and summary', async ($, on) => {
  const w = world(on, '交接門檻從 0 改回 70，按鈕只在 context 達 70% 時出現。')
  await turn($, async () => {
    await $.tool.call({ tool: 'Edit', file_path: '/home/u/p/hooks/handoff.ts', old_string: '0', new_string: '70' })
    await $.tool.call({ tool: 'Write', file_path: '/home/u/p/new.ts', content: 'x' })
    await $.tool.call({ tool: 'Edit', file_path: '/home/u/p/locked.ts', old_string: 'a', new_string: 'b' })
  })
  expect(w.opened).toEqual(['turn-files'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'turn-files', surface, ...PANE })
    expect((await ui.find({ type: 'Text', text: /^這一輪改了/ }))?.text).toBe('這一輪改了 2 個檔案')
    expect((await ui.find({ key: 'file-0' }))?.props.label).toBe('修改  hooks/handoff.ts  +1 −1')
    expect((await ui.find({ key: 'file-1' }))?.props.label).toBe('新增  new.ts')
    expect(await ui.find({ key: 'file-2' })).toBeUndefined()

    await ui.press({ key: 'file-0' })
    expect((await ui.find({ type: 'Text', text: /交接門檻從 0 改回 70/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /把門檻改回 70。/ }))).toBeDefined()
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('@@ -1,1 +1,1 @@\n-export const OFFER_AT = 0\n+export const OFFER_AT = 70')

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'file-0' })).toBeDefined()
    await ui.unmount()
  }
  expect(w.prompts).toHaveLength(1)
  expect(w.prompts[0]).toContain('hooks/handoff.ts')
})

test('a failed summary offers a retry', async ($, on) => {
  const w = world(on, undefined)
  await turn($, () => $.tool.call({ tool: 'Edit', file_path: '/home/u/p/a.ts', old_string: '0', new_string: '70' }))
  const ui = await $.ui.mount({ plugin: 'turn-files', surface: 'terminal', ...PANE })
  await ui.press({ key: 'file-0' })
  expect((await ui.find({ type: 'Text', text: /摘要產生失敗/ }))).toBeDefined()
  await ui.press({ key: 'retry' })
  expect(w.prompts).toHaveLength(2)
  await ui.unmount()
})

test('a turn that writes nothing keeps the last list and opens nothing', async ($, on) => {
  const w = world(on, '摘要')
  await turn($, () => $.tool.call({ tool: 'Edit', file_path: '/home/u/p/a.ts', old_string: '0', new_string: '70' }))
  await turn($, async () => {})
  expect(w.opened).toEqual(['turn-files'])
  const ui = await $.ui.mount({ plugin: 'turn-files', surface: 'terminal', ...PANE })
  expect((await ui.find({ type: 'Text', text: /^這一輪改了/ }))?.text).toBe('這一輪改了 1 個檔案')
  await ui.unmount()
})

test('/turn-files opens the pane, runs again to close it, and tracks the open state', async ($, on) => {
  const panes: string[] = []
  const closed: string[] = []
  on('ui.open', ($, e) => { panes.push(e.id); return { value: { isPlaced: true } } as never })
  on('ui.close', ($, e) => { closed.push(e.id); panes.splice(0, panes.length, ...panes.filter(id => id !== e.id)); return { value: undefined } as never })
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  const opens: unknown[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'open') opens.push(e.value)
    return next(e)
  })
  const run = () => $.command.run({ command: 'turn-files', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)
  await run()
  expect(panes).toEqual(['turn-files'])
  expect(opens.at(-1)).toBe(true)
  await run()
  expect(closed).toEqual(['turn-files'])
  expect(opens.at(-1)).toBe(false)
})
