export type FileChange = {
  path: string
  display: string
  kind: 'create' | 'update'
  added: number
  removed: number
  patch: string
  why: readonly string[]
}

export type Summary = { state: 'loading' } | { state: 'done'; text: string } | { state: 'failed' }

declare module 'claude-code' {
  interface PluginState {
    'turn-files': {
      current: FileChange[]
      shown: FileChange[]
      selected: string | null
      summaries: Record<string, Summary>
      open: boolean
    }
  }
}
