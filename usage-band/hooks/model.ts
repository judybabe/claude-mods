export function modelName(id: string | undefined): string {
  if (id === undefined) return '—'
  const bare = id.replace(/\[.*\]$/, '')
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(bare)
  if (!m) return bare
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
  return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`
}
