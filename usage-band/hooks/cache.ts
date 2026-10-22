import { countdown } from './time'

export const CACHE_TTL_MS = 60 * 60 * 1000
export const WARN_AT_MS = 5 * 60 * 1000

export type CacheState = 'none' | 'ok' | 'soon' | 'expired'
export type CacheCell = { text: string; state: CacheState; isExpired: boolean }

export function cacheCell(lastSent: number | null, now: number): CacheCell {
  if (lastSent === null) return { text: '—', state: 'none', isExpired: false }
  const left = lastSent + CACHE_TTL_MS - now
  if (left <= 0) return { text: '已過期', state: 'expired', isExpired: true }
  return { text: countdown(left), state: left <= WARN_AT_MS ? 'soon' : 'ok', isExpired: false }
}

export function shouldWarn(lastSent: number | null, now: number, warnedFor: number | null): boolean {
  if (lastSent === null || warnedFor === lastSent) return false
  const left = lastSent + CACHE_TTL_MS - now
  return left > 0 && left <= WARN_AT_MS
}
