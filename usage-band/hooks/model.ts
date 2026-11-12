export type ModelOption = { value: string; label: string }

export const FAMILIES = ['Fable', 'Opus', 'Sonnet', 'Haiku'] as const

// every model this account can run, newest first in each family; a model outside it is learned the first time it is current
export const MODELS: readonly ModelOption[] = [
  { value: 'claude-fable-5-2', label: 'Fable 5.2' },
  { value: 'claude-fable-5-1', label: 'Fable 5.1' },
  { value: 'claude-fable-5', label: 'Fable 5' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5' },
  { value: 'claude-opus-5', label: 'Opus 5' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-opus-4-5', label: 'Opus 4.5' },
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
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

const version = (id: string): number[] => (/-(\d+)(?:-(\d{1,2}))?$/.exec(id) ?? []).slice(1).map(n => Number(n ?? 0))
const newer = (a: string, b: string): number => {
  const [x, y] = [version(a), version(b)]
  return (y[0] ?? 0) - (x[0] ?? 0) || (y[1] ?? 0) - (x[1] ?? 0)
}

// the known models, any learned ones and the current one, each once
export function modelOptions(current: string | undefined, learned: readonly string[] = []): readonly ModelOption[] {
  const all = [...MODELS]
  const add = (id: string) => {
    const bare = bareId(id)
    if (!all.some(option => option.value === bare)) all.push({ value: bare, label: modelName(bare) })
  }
  for (const id of learned) add(id)
  if (current !== undefined) add(current)
  return all
}

export const familyOf = (option: ModelOption): string => {
  const found = FAMILIES.find(f => option.label.startsWith(f))
  return found ?? '其他'
}

// the menu's columns: one per family, newest on top; models of no known family last
export function columns(options: readonly ModelOption[]): { family: string; models: ModelOption[] }[] {
  const groups = new Map<string, ModelOption[]>()
  for (const f of [...FAMILIES, '其他']) groups.set(f, [])
  for (const option of options) groups.get(familyOf(option))!.push(option)
  return [...groups.entries()]
    .filter(([, models]) => models.length > 0)
    .map(([family, models]) => ({ family, models: [...models].sort((a, b) => newer(a.value, b.value)) }))
}

// a model worth remembering: a Claude id the known list lacks
export const shouldLearn = (id: string | undefined, learned: readonly string[]): boolean => {
  if (id === undefined) return false
  const bare = bareId(id)
  return /^claude-[a-z]+-\d/.test(bare) && !MODELS.some(m => m.value === bare) && !learned.includes(bare)
}
