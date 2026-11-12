import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Reading, RefreshState } from '../types'
import { cacheCell, shouldWarn } from './cache'
import { PALETTE, bar, colour, level } from './gauge'
import type { Level } from './gauge'
import { HANDOFF_REQUEST, filesFromTranscript, firstMessage, handoffPath, isHandoffRequest, isSummary, shouldOffer, transcriptSlug, withFiles } from './handoff'
import { bareId, columns, modelOptions, shouldLearn } from './model'
import { agoText, atText } from './time'
import { cells as widthOf, pickTier, shapeOf } from './layout'
import type { Shape, Tier } from './layout'

const reading = atom({ plugin: 'usage-band', key: 'reading' } as const, null)
const lastSent = atom({ plugin: 'usage-band', key: 'lastSent' } as const, null)
const warnedFor = atom({ plugin: 'usage-band', key: 'warnedFor' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const handoff = atom({ plugin: 'usage-band', key: 'handoff' } as const, null)
const handoffTurn = atom({ plugin: 'usage-band', key: 'handoffTurn' } as const, null)
const model = atom({ plugin: 'usage-band', key: 'model' } as const, null)
const picker = atom({ plugin: 'usage-band', key: 'picker' } as const, false)
const refreshedAt = atom({ plugin: 'usage-band', key: 'refreshedAt' } as const, null)
const refreshState = atom({ plugin: 'usage-band', key: 'refreshState' } as const, 'idle' as RefreshState)

const TICK_MS = 1000
const AUTO_REFRESH_MS = 60 * 1000
const STALE_MS = 5 * 60 * 1000
const DONE_MS = 2000
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const


function toReading(usage: SessionUsage): Reading {
  const fiveHour = usage.rateLimits.find(r => r.kind === 'five_hour')
  const sevenDay = usage.rateLimits.find(r => r.kind === 'seven_day')
  return {
    context: usage.context.percent,
    fiveHour: fiveHour?.percentUsed,
    fiveHourResetsAt: fiveHour?.resetsAt,
    sevenDay: sevenDay?.percentUsed,
    sevenDayResetsAt: sevenDay?.resetsAt,
  }
}

async function currentModel($: EngineInterface): Promise<string | undefined> {
  return $.session.model().catch(() => undefined)
}

const LEARNED_KEY = 'learnedModels'

async function learned($: EngineInterface): Promise<string[]> {
  const kept = await $.store.get(LEARNED_KEY).catch(() => undefined)
  return Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string') : []
}

// a model the known list lacks is remembered across sessions the first time it is current
async function learn($: EngineInterface, id: string | undefined): Promise<void> {
  const kept = await learned($)
  if (!shouldLearn(id, kept)) return
  await $.store.set(LEARNED_KEY, [...kept, bareId(id!)]).catch(() => undefined)
}

// the figures and the model, read afresh from the engine; a failure keeps what was shown
async function pull($: EngineInterface): Promise<boolean> {
  const usage = await $.session.usage().catch(() => undefined)
  if (usage !== undefined) await update($, reading, () => toReading(usage))
  const current = await currentModel($)
  if (current !== undefined) await update($, model, () => current)
  await learn($, current)
  return usage !== undefined
}

async function refresh($: EngineInterface): Promise<void> {
  if ((await read($, refreshState)) === 'busy') return
  await update($, refreshState, () => 'busy')
  const ok = await pull($)
  if (!ok) {
    await update($, refreshState, () => 'failed')
    return
  }
  const at = await $.clock.now()
  await update($, refreshedAt, () => at)
  await update($, now, () => at)
  await update($, refreshState, () => 'done')
  $.clock.after(DONE_MS, async () => {
    await update($, refreshState, state => (state === 'done' ? 'idle' : state))
  })
}

// every file the session wrote: from its transcript, which outlives compaction; else from the messages in context
async function sessionFiles($: EngineInterface): Promise<string[]> {
  const home = ((await $.env.get('HOME')) ?? '').replace(/\/$/, '')
  const id = await $.session.id().catch(() => undefined)
  if (id !== undefined && home !== '') {
    const dirs = [await $.session.root().catch(() => undefined), await $.session.cwd().catch(() => undefined)]
    for (const dir of dirs) {
      if (dir === undefined) continue
      const path = `${home}/.claude/projects/${transcriptSlug(dir)}/${id}.jsonl`
      const text = await $.fs.read(path).catch(() => undefined)
      if (text !== undefined) return filesFromTranscript(text)
    }
  }
  const messages = await $.session.messages().catch(() => [])
  const seen = new Set<string>()
  for (const m of Array.isArray(messages) ? messages : [])
    for (const use of m.toolUses ?? []) {
      if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(use.tool)) continue
      const path = use.input.file_path ?? use.input.notebook_path
      if (typeof path === 'string') seen.add(path)
    }
  return [...seen]
}

const FILES_OPEN = { plugin: 'turn-files', key: 'open' } as const
const FILES_SHOWN = { plugin: 'turn-files', key: 'shown' } as const

async function filesPane($: EngineInterface): Promise<{ isOpen: boolean; count: number }> {
  const opened = (await $.state.get(FILES_OPEN as never).catch(() => undefined)) as { value?: unknown } | undefined
  const shown = (await $.state.get(FILES_SHOWN as never).catch(() => undefined)) as { value?: unknown } | undefined
  return { isOpen: opened?.value === true, count: Array.isArray(shown?.value) ? shown.value.length : 0 }
}

const pct = (value: number | undefined): string => (value === undefined ? '—' : `${Math.round(value)}%`)


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const startedAt = await $.clock.now()
    await update($, now, () => startedAt)
    await update($, picker, () => false)
    await update($, refreshState, () => 'idle')
    await refresh($)
    $.clock.every(TICK_MS, async () => {
      const at = await $.clock.now()
      await update($, now, () => at)
      const sent = await read($, lastSent)
      if (shouldWarn(sent, at, await read($, warnedFor))) {
        await update($, warnedFor, () => sent)
        $.ui.toast('快取剩 5 分鐘就過期', { timeoutMs: 10000 })
      }
      const last = await read($, refreshedAt)
      if (last === null || at - last >= AUTO_REFRESH_MS) await refresh($)
    })
    return result
  })

  // only the turn the handoff request opened counts as the handoff
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && isHandoffRequest(e.text) && (await read($, handoff)) === 'writing') {
      await update($, handoffTurn, () => e.turnId)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await update($, lastSent, () => at)
      await update($, now, () => at)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    await refresh($)

    if ((await read($, handoff)) === 'writing' && e.turnId === (await read($, handoffTurn))) {
      await update($, handoff, () => null)
      await update($, handoffTurn, () => null)
      if (e.reason !== 'answer' || e.answer.trim() === '') {
        $.ui.toast('交接摘要沒寫完，對話沒有清空', { timeoutMs: 10000 })
        return result
      }
      if (!isSummary(e.answer)) {
        $.ui.toast('這則回覆不像交接摘要（缺標題），沒有存檔也沒有清空', { timeoutMs: 10000 })
        return result
      }
      const home = (await $.env.get('HOME')) ?? '/tmp'
      const path = handoffPath(home, await $.session.cwd(), new Date(await $.clock.now()))
      const content = withFiles(e.answer, await sessionFiles($))
      await $.fs.write(path, content)
      const opening = firstMessage(path, content)
      $.clock.after(0, async () => {
        await $.command.run({ command: 'clear' })
        await $.prompt.submit({ text: opening, asUser: true })
      })
    }
    return result
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await update($, model, () => e.to_model)
    await learn($, e.to_model)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const figures = (await read($, reading)) ?? toReading(await $.session.usage())
    const at = await read($, now)
    const cache = cacheCell(await read($, lastSent), at)
    const handingOff = (await read($, handoff)) === 'writing'
    const modelId = (await read($, model)) ?? (await currentModel($))
    const files = await filesPane($)
    const isOpen = await read($, picker)
    const last = await read($, refreshedAt)
    const refreshing = await read($, refreshState)
    const isStale = last !== null && at - last > STALE_MS
    const { Box, Button, Text } = $.ui.resolve(e)

    const options = modelOptions(modelId, await learned($))
    const current = options.find(option => modelId !== undefined && option.value === bareId(modelId)) ?? { value: '', label: '—' }
    const others = options.filter(option => option !== current)

    const DOT = '  ·  '
    const dot = <Text color={PALETTE.muted}>{DOT}</Text>

    const fiveHourAt = atText(figures.fiveHourResetsAt, at)
    const isSpent = figures.fiveHour !== undefined && figures.fiveHour >= 100
    const fiveHourText = fiveHourAt === undefined ? (isSpent ? '稍後恢復' : undefined) : `${fiveHourAt} ${isSpent ? '恢復' : '重置'}`
    const sevenDayAt = atText(figures.sevenDayResetsAt, at)
    const sevenDayText = sevenDayAt === undefined ? undefined : `${sevenDayAt} 重置`

    type Quota = { key: string; label: string; short: string; value: number | undefined; note?: string; advice?: string }
    const quotas: readonly Quota[] = [
      { key: 'context', label: '上下文', short: '上下文', value: figures.context, advice: '建議 /compact' },
      { key: 'five-hour', label: '5 小時', short: '5h', value: figures.fiveHour, note: fiveHourText },
      { key: 'seven-day', label: '本週', short: '週', value: figures.sevenDay, note: sevenDayText },
    ]
    const isAlert = (value: number | undefined) => level(value) === 'warn' || level(value) === 'danger'
    const shown = (shape: Shape) => quotas.filter(q => !shape.alertsOnly || isAlert(q.value))

    // the plain words of each part, so a tier is chosen by the cells its row takes
    const capsuleText = (shape: Shape) => ` ✳ ${current.label}${shape.alertsOnly ? '' : isOpen ? ' ▴' : ' ▾'} `
    const labelText = (q: Quota, shape: Shape) => `${level(q.value) === 'danger' ? '⚠ ' : ''}${shape.longLabels ? q.label : q.short} `
    const quotaText = (q: Quota, shape: Shape) =>
      labelText(q, shape) +
      (shape.showBars ? `${'█'.repeat(8)} ` : '') +
      pct(q.value) +
      (shape.showNotes && q.note ? ` · ${q.note}` : '') +
      (shape.showAdvice && level(q.value) === 'danger' && q.advice ? ` · ${q.advice}` : '')
    const handoffText = (shape: Shape) =>
      !shape.showHandoff ? '' : handingOff ? ' · 交接中… 取消' : !shouldOffer(figures.context) ? '' : e.props.isWorking ? ' 交接（等 Claude 回完）' : ' [ 交接 ]'
    const filesLabel = `檔案 ${files.isOpen ? '▾' : '▸'}${files.count > 0 ? ` ${files.count}` : ''}`
    const refreshText = (shape: Shape) => {
      if (refreshing === 'busy') return '⠋ 更新中'
      if (refreshing === 'done') return '✓ 剛剛更新'
      if (refreshing === 'failed') return '⚠ 更新失敗 · ↻ 重試'
      return shape.showNotes && last !== null ? `↻ ${agoText(last, at)}` : '↻'
    }
    const tailText = (shape: Shape) =>
      shape.alertsOnly
        ? ''
        : `${DOT}快取 ${cache.text}${cache.state === 'soon' && shape.showNotes ? ' 即將過期' : ''}${DOT}${refreshText(shape)}${DOT}${filesLabel}`
    const rowWidth = (tier: Tier) => {
      const shape = shapeOf(tier)
      const parts = shown(shape).map(q => quotaText(q, shape))
      return widthOf(capsuleText(shape) + '  ' + parts.join(DOT) + handoffText(shape) + tailText(shape))
    }
    const tier = pickTier(e.props.bodyColumns, rowWidth)
    const shape = shapeOf(tier)

    // one quota: label, bar, figure; a danger adds ⚠ and a word of advice
    const segment = (q: Quota) => {
      const state: Level = level(q.value)
      const tone = colour(state)
      const fill = bar(q.value)
      const isDanger = state === 'danger'
      return (
        <Box key={q.key} flexShrink={0}>
          <Text wrap="truncate-end" color={isDanger ? tone : PALETTE.muted}>{labelText(q, shape)}</Text>
          {shape.showBars ? (
            <Box flexShrink={0}>
              <Text color={tone} dimColor={state === 'none'}>{fill.filled}</Text>
              <Text color={PALETTE.capsule}>{fill.track}</Text>
              <Text> </Text>
            </Box>
          ) : null}
          <Text color={tone} bold dimColor={isStale || state === 'none'}>{pct(q.value)}</Text>
          {shape.showNotes && q.note ? <Text color={PALETTE.muted}> · {q.note}</Text> : null}
          {shape.showAdvice && isDanger && q.advice ? <Text color={PALETTE.muted}> · {q.advice}</Text> : null}
        </Box>
      )
    }

    const refreshFace = () => {
      if (refreshing === 'busy') return <Text color={PALETTE.muted}>{SPINNER[Math.floor(at / TICK_MS) % SPINNER.length]} 更新中</Text>
      if (refreshing === 'done') return <Text color={PALETTE.ok}>✓ 剛剛更新</Text>
      if (refreshing === 'failed') return <Text color={PALETTE.danger}>⚠ 更新失敗 · ↻ 重試</Text>
      const tone = isStale ? PALETTE.warn : PALETTE.muted
      return <Text color={tone}>{refreshText(shape)}</Text>
    }

    // the menu takes rows of its own above the status row: the band grows upward, the prompt stays put
    const pick = (value: string) => {
      // the engine may keep the model: the capsule follows what it settled on
      void (async () => {
        await update($, picker, () => false)
        await $.command.run({ command: 'model', args: value }).catch(() => undefined)
        const settled = await currentModel($)
        if (settled !== undefined) await update($, model, () => settled)
      })()
    }

    // the menu takes rows of its own above the status row, one column per family: the band grows upward, the prompt stays put
    const menu = isOpen ? (
      <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.muted} backgroundColor={PALETTE.capsule} paddingX={1} alignSelf="flex-start">
        <Box gap={3}>
          {columns(options).map(group => (
            <Box key={`family:${group.family}`} flexDirection="column" flexShrink={0}>
              <Text color={PALETTE.muted}>{group.family}</Text>
              {group.models.map(option =>
                option === current ? (
                  <Button key={`model:${option.value}`} plain onPress={() => void update($, picker, () => false)}>
                    <Text color={PALETTE.model} bold>❯ {option.label} ✓</Text>
                  </Button>
                ) : (
                  <Button key={`model:${option.value}`} plain onPress={() => pick(option.value)}>
                    {`  ${option.label}`}
                  </Button>
                ),
              )}
            </Box>
          ))}
        </Box>
        <Text color={PALETTE.muted}>點模型切換 · 再點膠囊收合 · ✓ 目前</Text>
      </Box>
    ) : null

    // the band is one site shared by every mod: this row on top, whatever the mods below draw under it
    const below = await next(e)
    return (
      <Box flexDirection="column">
        {menu}
        <Box overflow="hidden">
          <Button key="model" plain onPress={() => void update($, picker, was => !was)}>
            <Text color={PALETTE.model} backgroundColor={PALETTE.capsule}>
              {capsuleText(shape)}
            </Text>
          </Button>
          <Text>  </Text>
          {shown(shape).map((q, i) => (
            <Box key={`quota:${q.key}`} flexShrink={0}>
              {i > 0 ? dot : null}
              {segment(q)}
              {q.key === 'context' && shape.showHandoff ? (
                handingOff ? (
                  <Box flexShrink={0}>
                    <Text color={PALETTE.warn}> · 交接中… </Text>
                    <Button
                      key="handoff-cancel"
                      plain
                      label="取消"
                      onPress={async () => {
                        await update($, handoff, () => null)
                        await update($, handoffTurn, () => null)
                        $.ui.toast('交接已取消，對話不會被清空', { timeoutMs: 6000 })
                      }}
                    />
                  </Box>
                ) : shouldOffer(figures.context) ? (
                  e.props.isWorking ? (
                    <Text color={PALETTE.muted} dimColor> 交接（等 Claude 回完）</Text>
                  ) : (
                    <Box flexShrink={0}>
                      <Text> </Text>
                      <Button
                        key="handoff"
                        label="交接"
                        variant="primary"
                        onPress={async () => {
                          await update($, handoffTurn, () => null)
                          await update($, handoff, () => 'writing')
                          await $.prompt.submit({ text: HANDOFF_REQUEST, asUser: true })
                        }}
                      />
                    </Box>
                  )
                ) : null
              ) : null}
            </Box>
          ))}
          {shape.alertsOnly ? null : (
            <Box flexShrink={0}>
              {dot}
              <Text color={PALETTE.muted}>快取 </Text>
              <Text
                color={cache.state === 'soon' ? PALETTE.warn : cache.state === 'expired' ? PALETTE.muted : undefined}
                bold={cache.state === 'ok' || cache.state === 'soon'}
                dimColor={cache.state === 'none' || cache.state === 'expired'}
              >
                {cache.text}
              </Text>
              {cache.state === 'soon' && shape.showNotes ? <Text color={PALETTE.warn}> 即將過期</Text> : null}
              {dot}
              <Button key="refresh" plain onPress={() => void refresh($)}>
                {refreshFace()}
              </Button>
              {dot}
              <Button
                key="files"
                plain
                label={filesLabel}
                onPress={() => {
                  // not awaited: the toggle answers through turn-files' own state, and a press has a short budget
                  void $.command.run({ command: 'turn-files' })
                }}
              />
            </Box>
          )}
        </Box>
        {below}
      </Box>
    )
  })

  // the ring moving to another control of the band closes the menu; leaving for the prompt does not
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    const result = await next(e)
    const element = (e as { element?: string }).element
    if (typeof element === 'string' && !element.startsWith('model')) {
      if (await read($, picker)) await update($, picker, () => false)
    }
    return result
  }).catch(($, e, next) => next(e))
}
