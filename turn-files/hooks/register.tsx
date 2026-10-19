import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileChange } from '../types'
import { type Hunk, counts, displayPath, figures, kindLabel, merge, summaryPrompt, toPatch } from './changes'

const PANE = 'turn-files'
const TITLE = '這一輪改的檔案'
const WHY_MAX = 600

const current = atom({ plugin: 'turn-files', key: 'current' } as const, [])
const shown = atom({ plugin: 'turn-files', key: 'shown' } as const, [])
const selected = atom({ plugin: 'turn-files', key: 'selected' } as const, null)
const summaries = atom({ plugin: 'turn-files', key: 'summaries' } as const, {})
const open = atom({ plugin: 'turn-files', key: 'open' } as const, false)

async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  await update($, open, () => opened.isPlaced)
  return opened
}

async function why($: EngineInterface, agentId: string | undefined): Promise<string[]> {
  const found = await (agentId === undefined ? $.session.messages() : $.session.messages({ agentId })).catch(() => [])
  if (!Array.isArray(found)) return []
  const said = [...found].reverse().find(m => m.role === 'assistant' && m.text.trim() !== '')
  if (said === undefined) return []
  const text = said.text.trim()
  return [text.length > WHY_MAX ? `${text.slice(0, WHY_MAX)}…` : text]
}

async function summarize($: EngineInterface, change: FileChange) {
  const before = (await read($, summaries))[change.path]
  if (before !== undefined && before.state !== 'failed') return
  await update($, summaries, all => ({ ...all, [change.path]: { state: 'loading' as const } }))
  const reply = await $.model
    .complete({ model: 'haiku', prompt: summaryPrompt(change), maxTokens: 300, effort: 'low', timeoutMs: 30000 })
    .catch(() => undefined)
  await update($, summaries, all => ({
    ...all,
    [change.path]: reply?.isAnswered ? { state: 'done' as const, text: reply.text.trim() } : { state: 'failed' as const },
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'turn-files', description: '打開／收合「這一輪改的檔案」面板；點檔案看差異與說明' })
    return next(e)
  })

  on('command.run', { command: 'turn-files' }, async $ => {
    if (await read($, open)) {
      await $.ui.close({ id: PANE })
      await update($, open, () => false)
      return { text: '已收合' }
    }
    const opened = await openPane($)
    return { text: opened.isPlaced ? '已打開' : '終端機太窄，面板等待顯示中' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    await update($, open, () => false)
    return result
  })

  on('turn.start', async ($, e, next) => {
    await update($, current, () => [])
    return next(e)
  })

  on('tool.call', { tool: ['Write', 'Edit', 'NotebookEdit'] }, async ($, e, next) => {
    const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
    const existed = await $.fs.exists(path).catch(() => true)
    const reason = await why($, e.agentId)
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const out = (ran.result ?? {}) as { structuredPatch?: Hunk[]; filePath?: string; type?: string }
    const hunks = out.structuredPatch ?? []
    const absolute = out.filePath ?? path
    const change: FileChange = {
      path: absolute,
      display: displayPath(absolute, await $.session.cwd(), await $.env.get('HOME')),
      kind: out.type === 'create' || (out.type === undefined && !existed) ? 'create' : 'update',
      ...counts(hunks),
      patch: toPatch(hunks),
      why: reason,
    }
    await update($, current, list => merge(list, change))
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const changed = await read($, current)
    if (changed.length === 0) return result
    await update($, shown, () => changed)
    await update($, selected, () => null)
    await update($, summaries, () => ({}))
    const opened = await openPane($)
    if (!opened.isPlaced) $.ui.toast(`這一輪改了 ${changed.length} 個檔案，輸入 /turn-files 查看`, { timeoutMs: 8000 })
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const list = await read($, shown)
    const pick = await read($, selected)
    const change = list.find(one => one.path === pick)

    if (change === undefined) {
      return (
        <Box flexDirection="column">
          {list.length === 0 ? (
            <Text dimColor>還沒有改過檔案。</Text>
          ) : (
            <Box flexDirection="column">
              <Text bold>這一輪改了 {list.length} 個檔案</Text>
              {list.map((one, i) => (
                <Button
                  key={`file-${i}`}
                  label={`${kindLabel(one.kind)}  ${one.display}  ${figures(one)}`.trimEnd()}
                  onPress={async () => {
                    await update($, selected, () => one.path)
                    if (one.patch !== '') await summarize($, one)
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const summary = (await read($, summaries))[change.path]
    const what =
      change.patch === ''
        ? '（這個檔案沒有差異內容可以摘要）'
        : summary?.state === 'done'
          ? summary.text
          : summary?.state === 'failed'
            ? '摘要產生失敗，按「重試」再試一次。'
            : '摘要產生中…'

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{change.display}</Text>
          <Text dimColor>  {kindLabel(change.kind)}  {figures(change)}  </Text>
          <Button key="back" label="返回" onPress={() => update($, selected, () => null)} />
          {summary?.state === 'failed' ? (
            <Button key="retry" label="重試" onPress={() => summarize($, change)} />
          ) : null}
        </Box>
        <Text>
          <Text bold>改了什麼：</Text>
          {what}
        </Text>
        <Text>
          <Text bold>為什麼：</Text>
          {change.why.length === 0 ? '（改之前沒有留下說明）' : change.why.join('\n')}
        </Text>
        {change.patch === '' ? null : <Code source={change.patch} format="diff" path={change.path} />}
      </Box>
    )
  })
}
