export type ModelOption = { value: string; label: string }

export const MODELS: readonly ModelOption[] = [
  { value: 'claude-fable-5-1', label: 'Fable 5.1' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5' },
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5' },
]

export const bareId = (id: string): string => id.replace(/\[.*\]$/, '')

export function modelName(id: string | undefined): string {
  if (id === undefined) return '—'
  const bare = bareId(id)
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(bare)
  if (!m) return bare
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
  return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`
}

// the picker's rows: the known family, with the current model first when it is not among them
export function modelOptions(current: string | undefined): readonly ModelOption[] {
  if (current === undefined) return MODELS
  const bare = bareId(current)
  return MODELS.some(option => option.value === bare) ? MODELS : [{ value: bare, label: modelName(current) }, ...MODELS]
}
