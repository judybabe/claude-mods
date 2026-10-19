import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Reading } from '../types'
import { cacheCell, shouldWarn } from './cache'
import { HANDOFF_REQUEST, firstMessage, handoffPath, shouldOffer } from './handoff'
import { gauge, tone } from './gauge'
import { bareId, modelOptions } from './model'

const reading = atom({ plugin: 'usage-band', key: 'reading' } as const, null)
const lastSent = atom({ plugin: 'usage-band', key: 'lastSent' } as const, null)
const warnedFor = atom({ plugin: 'usage-band', key: 'warnedFor' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const handoff = atom({ plugin: 'usage-band', key: 'handoff' } as const, null)
const model = atom({ plugin: 'usage-band', key: 'model' } as const, null)

const TICK_MS = 30 * 1000

function toReading(usage: SessionUsage): Reading {
  const fiveHour = usage.rateLimits.find(r => r.kind === 'five_hour')
  const sevenDay = usage.rateLimits.find(r => r.kind === 'seven_day')
  return {
    context: usage.context.percent,
    fiveHour: fiveHour?.percentUsed,
    fiveHourResetsAt: fiveHour?.resetsAt,
    sevenDay: sevenDay?.percentUsed,
  }
}

async function currentModel($: EngineInterface): Promise<string | undefined> {
  return $.session.model().catch(() => undefined)
}

const FILES_OPEN = { plugin: 'turn-files', key: 'open' } as const
const FILES_SHOWN = { plugin: 'turn-files', key: 'shown' } as const

async function filesPane($: EngineInterface): Promise<{ isOpen: boolean; count: number }> {
  const opened = (await $.state.get(FILES_OPEN as never).catch(() => undefined)) as { value?: unknown } | undefined
  const shown = (await $.state.get(FILES_SHOWN as never).catch(() => undefined)) as { value?: unknown } | undefined
  return { isOpen: opened?.value === true, count: Array.isArray(shown?.value) ? shown.value.length : 0 }
}

function clock(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return undefined
  const hh = String(at.getHours()).padStart(2, '0')
  const mm = String(at.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)}%`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const startedAt = await $.clock.now()
    const current = await currentModel($)
    if (current !== undefined) await update($, model, () => current)
    await update($, now, () => startedAt)
    $.clock.every(TICK_MS, async () => {
      const at = await $.clock.now()
      await update($, now, () => at)
      const sent = await read($, lastSent)
      if (shouldWarn(sent, at, await read($, warnedFor))) {
        await update($, warnedFor, () => sent)
        $.ui.toast('快取剩 5 分鐘就過期', { timeoutMs: 10000 })
      }
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

    const latest = toReading(await $.session.usage())
    await update($, reading, () => latest)
    const current = await currentModel($)
    if (current !== undefined) await update($, model, () => current)

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
    const cache = cacheCell(await read($, lastSent), await read($, now))
    const handingOff = (await read($, handoff)) === 'writing'
    const modelId = (await read($, model)) ?? (await currentModel($))
    const files = await filesPane($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const reset = clock(figures.fiveHourResetsAt)

    const metric = (label: string, value: number | undefined, suffix = '') => {
      const colour = tone(value)
      return (
        <Box gap={1}>
          <Text color={colour} dimColor={colour === undefined}>{gauge(value)}</Text>
          <Text color={colour} dimColor={colour === undefined} bold={colour === 'error'}>
            {label} {pct(value)}{suffix}
          </Text>
        </Box>
      )
    }
    const bar = <Text dimColor> │ </Text>

    // the band is one site shared by every mod: these rows on top, whatever the mods below draw under them
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box gap={2}>
          <Text dimColor>目前模型</Text>
          <Box gap={1}>
            {modelOptions(modelId).map(option => {
              const isCurrent = modelId !== undefined && option.value === bareId(modelId)
              return isCurrent ? (
                <Button key={`model:${option.value}`} label={option.label} variant="primary" onPress={() => undefined} />
              ) : (
                <Button
                  key={`model:${option.value}`}
                  label={option.label}
                  plain
                  dimColor
                  onPress={() => {
                    // the engine may keep the model (one the plan lacks): the highlight follows what it settled on
                    void (async () => {
                      await $.command.run({ command: 'model', args: option.value }).catch(() => undefined)
                      const settled = await currentModel($)
                      if (settled !== undefined) await update($, model, () => settled)
                    })()
                  }}
                />
              )
            })}
          </Box>
          {handingOff ? (
            <Text color="warning">交接中…</Text>
          ) : shouldOffer(figures.context) ? (
            <Button
              key="handoff"
              label="交接"
              variant="primary"
              onPress={async () => {
                await update($, handoff, () => 'writing')
                await $.prompt.submit({ text: HANDOFF_REQUEST, asUser: true })
              }}
            />
          ) : null}
        </Box>
        <Box>
          {metric('context', figures.context)}
          {bar}
          {metric('5h', figures.fiveHour, reset ? ` ↻${reset}` : '')}
          {bar}
          {metric('本週', figures.sevenDay)}
          {bar}
          <Text dimColor>◷ </Text>
          <Text color={cache.isExpired ? 'error' : undefined} dimColor={!cache.isExpired}>
            {cache.text}
          </Text>
          {bar}
          <Button
            key="files"
            label={`檔案 ${files.isOpen ? '▾' : '▸'}${files.count > 0 ? ` ${files.count}` : ''}`}
            onPress={() => {
              // not awaited: the toggle answers through turn-files' own state, and a press has a short budget
              void $.command.run({ command: 'turn-files' })
            }}
          />
        </Box>
        {below}
      </Box>
    )
  })
}
