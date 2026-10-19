export const CACHE_TTL_MS = 60 * 60 * 1000
export const WARN_AT_MS = 5 * 60 * 1000

export type CacheCell = { text: string; isExpired: boolean }

export function cacheCell(lastSent: number | null, now: number): CacheCell {
  if (lastSent === null) return { text: '快取 —', isExpired: false }
  const left = lastSent + CACHE_TTL_MS - now
  if (left <= 0) return { text: '快取已過期，下一句重算', isExpired: true }
  const minutes = Math.floor(left / 60000)
  return { text: minutes < 1 ? '快取 剩 <1 分' : `快取 剩 ${minutes} 分`, isExpired: false }
}

export function shouldWarn(lastSent: number | null, now: number, warnedFor: number | null): boolean {
  if (lastSent === null || warnedFor === lastSent) return false
  const left = lastSent + CACHE_TTL_MS - now
  return left > 0 && left <= WARN_AT_MS
}
