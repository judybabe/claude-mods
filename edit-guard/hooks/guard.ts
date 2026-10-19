export const WINDOW_MS = 30 * 60 * 1000
export const CONTINUE = '繼續'
export const CANCEL = '取消'

export type Entry = { file: string; at: number }
export type Other = { session: string; file: string; at: number }

export const logDir = (home: string) => `${home}/.claude/edit-log`

export const absolute = (path: string, cwd: string) => {
  const parts: string[] = []
  for (const part of (path.startsWith('/') ? path : `${cwd}/${path}`).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

export const fresh = (entries: readonly Entry[], now: number) =>
  entries.filter(entry => now - entry.at < WINDOW_MS)

export const parse = (text: string): Entry[] => {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? value.filter((v): v is Entry => typeof v?.file === 'string' && typeof v?.at === 'number')
      : []
  } catch {
    return []
  }
}

export const latestOther = (others: readonly Other[], file: string, now: number) =>
  others
    .filter(o => o.file === file && now - o.at < WINDOW_MS)
    .sort((a, b) => b.at - a.at)[0]

const hhmm = (at: number) =>
  new Date(at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })

export const question = (hit: Other) =>
  `對話 ${hit.session.slice(0, 8)} 在 ${hhmm(hit.at)} 改過 ${hit.file}，要繼續嗎？`
