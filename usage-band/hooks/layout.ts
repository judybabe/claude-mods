// terminal cells a string takes: CJK and fullwidth forms take two, the rest one
export function cells(text: string): number {
  let width = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1faff)
    width += wide ? 2 : 1
  }
  return width
}

export type Tier = 'full' | 'bars' | 'numbers' | 'alerts' | 'tight'
export const TIERS: readonly Tier[] = ['full', 'bars', 'numbers', 'alerts', 'tight']

export type Shape = { longLabels: boolean; showBars: boolean; showNotes: boolean; alertsOnly: boolean; showAdvice: boolean; showHandoff: boolean }

export const shapeOf = (tier: Tier): Shape => ({
  longLabels: tier === 'full' || tier === 'bars',
  showBars: tier === 'full' || tier === 'bars',
  showNotes: tier === 'full',
  alertsOnly: tier === 'alerts' || tier === 'tight',
  showAdvice: tier !== 'tight',
  showHandoff: tier !== 'tight',
})

// the widest tier whose row fits, a couple of cells spare for glyphs a terminal draws wide
export function pickTier(columns: number, widthOf: (tier: Tier) => number, spare = 2): Tier {
  return TIERS.find(tier => widthOf(tier) + spare <= columns) ?? 'tight'
}
