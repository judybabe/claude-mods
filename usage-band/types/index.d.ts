export type Reading = {
  context?: number
  fiveHour?: number
  fiveHourResetsAt?: string
  sevenDay?: number
  sevenDayResetsAt?: string
}

export type RefreshState = 'idle' | 'busy' | 'done' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      reading: Reading | null
      lastSent: number | null
      warnedFor: number | null
      now: number
      handoff: 'writing' | null
      model: string | null
      picker: boolean
      refreshedAt: number | null
      refreshState: RefreshState
    }
  }
}
