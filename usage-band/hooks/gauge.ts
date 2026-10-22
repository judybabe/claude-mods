export const CELLS = 8
export const WARN_AT = 60
export const DANGER_AT = 85

export type Level = 'none' | 'ok' | 'warn' | 'danger'

export const PALETTE = {
  model: '#E3956E',
  ok: '#58A6FF',
  warn: '#E3B341',
  danger: '#FF7B72',
  capsule: '#1C2128',
  muted: '#8B949E',
} as const

export function level(value: number | undefined): Level {
  if (value === undefined) return 'none'
  if (value >= DANGER_AT) return 'danger'
  if (value >= WARN_AT) return 'warn'
  return 'ok'
}

export const colour = (of: Level): string | undefined => (of === 'none' ? undefined : PALETTE[of])

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const

// eight cells, each drawn to the eighth: about 1.5% a step
export function bar(value: number | undefined, cells: number = CELLS): { filled: string; track: string } {
  const share = value === undefined ? 0 : Math.min(cells, Math.max(0, (value / 100) * cells))
  let full = Math.floor(share)
  let eighth = Math.round((share - full) * 8)
  if (eighth === 8) {
    full += 1
    eighth = 0
  }
  const filled = '█'.repeat(full) + EIGHTHS[eighth]
  return { filled, track: '█'.repeat(cells - full - (eighth > 0 ? 1 : 0)) }
}
