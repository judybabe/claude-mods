export type Reading = {
  context?: number
  fiveHour?: number
  fiveHourResetsAt?: string
  sevenDay?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      reading: Reading | null
      lastSent: number | null
      warnedFor: number | null
      now: number
      handoff: 'writing' | null
      model: string | null
    }
  }
}
