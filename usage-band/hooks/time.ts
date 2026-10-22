const MIN = 60_000
const HOUR = 60 * MIN

// "3h12m", "47m", "<1m"; nothing for a time already past or unreadable
export function untilText(iso: string | undefined, now: number): string | undefined {
  if (!iso) return undefined
  const at = new Date(iso).getTime()
  if (Number.isNaN(at) || at <= now) return undefined
  const left = at - now
  const hours = Math.floor(left / HOUR)
  const minutes = Math.floor((left % HOUR) / MIN)
  if (hours === 0) return minutes === 0 ? '<1m' : `${minutes}m`
  return `${hours}h${String(minutes).padStart(2, '0')}m`
}

// "12 秒前", "6 分鐘前", "2 小時前"
export function agoText(since: number, now: number): string {
  const gone = Math.max(0, now - since)
  if (gone < MIN) return `${Math.floor(gone / 1000)} 秒前`
  if (gone < HOUR) return `${Math.floor(gone / MIN)} 分鐘前`
  return `${Math.floor(gone / HOUR)} 小時前`
}

// mm:ss of what is left
export function countdown(leftMs: number): string {
  const total = Math.max(0, Math.floor(leftMs / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
