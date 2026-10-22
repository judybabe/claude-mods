import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Reading, RefreshState } from '../types'
import { cacheCell, shouldWarn } from './cache'
import { PALETTE, bar, colour, level } from './gauge'
import type { Level } from './gauge'
import { HANDOFF_REQUEST, firstMessage, handoffPath, shouldOffer } from './handoff'
import { bareId, modelOptions } from './model'
import { agoText, untilText } from './time'

const reading = atom({ plugin: 'usage-band', key: 'reading' } as const, null)
const lastSent = atom({ plugin: 'usage-band', key: 'lastSent' } as const, null)
const warnedFor = atom({ plugin: 'usage-band', key: 'warnedFor' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const handoff = atom({ plugin: 'usage-band', key: 'handoff' } as const, null)
const model = atom({ plugin: 'usage-band', key: 'model' } as const, null)
const picker = atom({ plugin: 'usage-band', key: 'picker' } as const, false)
const refreshedAt = atom({ plugin: 'usage-band', key: 'refreshedAt' } as const, null)
const refreshState = atom({ plugin: 'usage-band', key: 'refreshState' } as const, 'idle' as RefreshState)

const TICK_MS = 1000
const AUTO_REFRESH_MS = 60 * 1000
const STALE_MS = 5 * 60 * 1000
const DONE_MS = 2000
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

export const FULL_AT = 120
export const NUMBERS_AT = 80

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

// the figures and the model, read afresh from the engine; a failure keeps what was shown
async function pull($: EngineInterface): Promise<boolean> {
  const usage = await $.session.usage().catch(() => undefined)
  if (usage !== undefined) await update($, reading, () => toReading(usage))
  const current = await currentModel($)
  if (current !== undefined) await update($, model, () => current)
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

const FILES_OPEN = { plugin: 'turn-files', key: 'open' } as const
const FILES_SHOWN = { plugin: 'turn-files', key: 'shown' } as const

async function filesPane($: EngineInterface): Promise<{ isOpen: boolean; count: number }> {
  const opened = (await $.state.get(FILES_OPEN as never).catch(() => undefined)) as { value?: unknown } | undefined
  const shown = (await $.state.get(FILES_SHOWN as never).catch(() => undefined)) as { value?: unknown } | undefined
  return { isOpen: opened?.value === true, count: Array.isArray(shown?.value) ? shown.value.length : 0 }
}

const pct = (value: number | undefined): string => (value === undefined ? '—' : `${Math.round(value)}%`)

type Tier = 'full' | 'numbers' | 'alerts'
export const tierFor = (columns: number): Tier => (columns >= FULL_AT ? 'full' : columns >= NUMBERS_AT ? 'numbers' : 'alerts')

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

    if ((await read($, handoff)) === 'writing') {
      await update($, handoff, () => null)
      if (e.reason !== 'answer' || e.answer.trim() === '') {
        $.ui.toast('交接摘要沒寫完，對話沒有清空', { timeoutMs: 10000 })
        return result
      }
      const home = (await $.env.get('HOME')) ?? '/tmp'
      const path = handoffPath(home, await $.session.cwd(), new Date(await $.clock.now()))
      await $.fs.write(path, e.answer.trim() + '\n')
      const opening = firstMessage(path, e.answer)
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
    const tier = tierFor(e.props.bodyColumns)
    const { Box, Button, Text } = $.ui.resolve(e)

    const options = modelOptions(modelId)
    const current = options.find(option => modelId !== undefined && option.value === bareId(modelId)) ?? { value: '', label: '—' }
    const others = options.filter(option => option !== current)

    const dot = <Text color={PALETTE.muted}>  ·  </Text>

    // one quota: label, bar, figure; a danger adds ⚠ and a word of advice
    const segment = (key: string, label: string, short: string, value: number | undefined, note?: string, advice?: string) => {
      const state: Level = level(value)
      if (tier === 'alerts' && state !== 'warn' && state !== 'danger') return null
      const tone = colour(state)
      const cells = bar(value)
      const isDanger = state === 'danger'
      return (
        <Box key={key}>
          <Text color={isDanger ? tone : PALETTE.muted}>{isDanger ? `⚠ ${tier === 'full' ? label : short}` : tier === 'full' ? label : short} </Text>
          {tier === 'full' ? (
            <Box>
              <Text color={tone} dimColor={state === 'none'}>{cells.filled}</Text>
              <Text color={PALETTE.capsule}>{cells.track}</Text>
              <Text> </Text>
            </Box>
          ) : null}
          <Text color={tone} bold dimColor={isStale || state === 'none'}>{pct(value)}</Text>
          {tier === 'full' && note ? <Text color={PALETTE.muted}> · {note}</Text> : null}
          {isDanger && advice ? <Text color={PALETTE.muted}> · {advice}</Text> : null}
        </Box>
      )
    }

    const fiveHourNote =
      figures.fiveHour !== undefined && figures.fiveHour >= 100
        ? `${untilText(figures.fiveHourResetsAt, at) ?? '稍後'} 後恢復`
        : untilText(figures.fiveHourResetsAt, at)
    const fiveHourText = fiveHourNote === undefined ? undefined : fiveHourNote.endsWith('後恢復') ? fiveHourNote : `${fiveHourNote} 後重置`
    const sevenDayNote = untilText(figures.sevenDayResetsAt, at)

    const refreshFace = () => {
      if (refreshing === 'busy') return <Text color={PALETTE.muted}>{SPINNER[Math.floor(at / TICK_MS) % SPINNER.length]} 更新中</Text>
      if (refreshing === 'done') return <Text color={PALETTE.ok}>✓ 剛剛更新</Text>
      if (refreshing === 'failed') return <Text color={PALETTE.danger}>⚠ 更新失敗 · ↻ 重試</Text>
      const tone = isStale ? PALETTE.warn : PALETTE.muted
      if (tier !== 'full' || last === null) return <Text color={tone}>↻</Text>
      return <Text color={tone}>↻ {agoText(last, at)}</Text>
    }

    // the menu takes rows of its own above the status row: the band grows upward, the prompt stays put
    const menu = isOpen ? (
      <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.muted} backgroundColor={PALETTE.capsule} paddingX={1} alignSelf="flex-start">
        <Button key={`model:${current.value}`} plain onPress={() => void update($, picker, () => false)}>
          <Text color={PALETTE.model}>❯ {current.label}</Text>
          <Text color={PALETTE.muted}>  ✓ 目前</Text>
        </Button>
        {others.map(option => (
          <Button
            key={`model:${option.value}`}
            plain
            onPress={() => {
              // the engine may keep the model: the capsule follows what it settled on
              void (async () => {
                await update($, picker, () => false)
                await $.command.run({ command: 'model', args: option.value }).catch(() => undefined)
                const settled = await currentModel($)
                if (settled !== undefined) await update($, model, () => settled)
              })()
            }}
          >
            {`  ${option.label}`}
          </Button>
        ))}
        <Text color={PALETTE.muted}>↑↓ 選擇 · Enter 確認 · 再點膠囊收合</Text>
      </Box>
    ) : null

    // the band is one site shared by every mod: this row on top, whatever the mods below draw under it
    const below = await next(e)
    return (
      <Box flexDirection="column">
        {menu}
        <Box>
          <Button key="model" plain onPress={() => void update($, picker, was => !was)}>
            <Text color={PALETTE.model} backgroundColor={PALETTE.capsule}>
              {` ✳ ${current.label}${tier === 'alerts' ? '' : isOpen ? ' ▴' : ' ▾'} `}
            </Text>
          </Button>
          <Text>  </Text>
          {segment('context', '上下文', '上下文', figures.context, undefined, '建議 /compact')}
          {handingOff ? (
            <Text color={PALETTE.warn}> · 交接中…</Text>
          ) : shouldOffer(figures.context) ? (
            <Box>
              <Text> </Text>
              <Button
                key="handoff"
                label="交接"
                variant="primary"
                onPress={async () => {
                  await update($, handoff, () => 'writing')
                  await $.prompt.submit({ text: HANDOFF_REQUEST, asUser: true })
                }}
              />
            </Box>
          ) : null}
          {tier === 'alerts' && level(figures.fiveHour) !== 'warn' && level(figures.fiveHour) !== 'danger' ? null : dot}
          {segment('five-hour', '5 小時', '5h', figures.fiveHour, fiveHourText)}
          {tier === 'alerts' && level(figures.sevenDay) !== 'warn' && level(figures.sevenDay) !== 'danger' ? null : dot}
          {segment('seven-day', '本週', '週', figures.sevenDay, sevenDayNote === undefined ? undefined : `${sevenDayNote} 後重置`)}
          {tier === 'alerts' ? null : (
            <Box>
              {dot}
              <Text color={PALETTE.muted}>快取 </Text>
              <Text
                color={cache.state === 'soon' ? PALETTE.warn : cache.state === 'expired' ? PALETTE.muted : undefined}
                bold={cache.state === 'ok' || cache.state === 'soon'}
                dimColor={cache.state === 'none' || cache.state === 'expired'}
              >
                {cache.text}
              </Text>
              {cache.state === 'soon' && tier === 'full' ? <Text color={PALETTE.warn}> 即將過期</Text> : null}
              {dot}
              <Button key="refresh" plain onPress={() => void refresh($)}>
                {refreshFace()}
              </Button>
              {dot}
              <Button
                key="files"
                plain
                label={`檔案 ${files.isOpen ? '▾' : '▸'}${files.count > 0 ? ` ${files.count}` : ''}`}
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
