export const CELLS = 5
export const WARN_AT = 50
export const RED_AT = 80

export type Tone = 'success' | 'warning' | 'error' | undefined

// five cells, each a fifth; any use at all lights the first cell
export function gauge(value: number | undefined, cells: number = CELLS): string {
  const lit = value === undefined || value <= 0 ? 0 : Math.min(cells, Math.ceil(value / (100 / cells)))
  return '▰'.repeat(lit) + '▱'.repeat(cells - lit)
}

export function tone(value: number | undefined): Tone {
  if (value === undefined) return undefined
  if (value > RED_AT) return 'error'
  if (value >= WARN_AT) return 'warning'
  return 'success'
}
