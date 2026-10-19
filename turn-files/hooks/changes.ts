import type { FileChange } from '../types'

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }

const PATCH_FOR_SUMMARY = 12000

export function toPatch(hunks: readonly Hunk[]): string {
  return hunks
    .map(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines].join('\n'))
    .join('\n')
}

export function counts(hunks: readonly Hunk[]) {
  let added = 0
  let removed = 0
  for (const h of hunks)
    for (const line of h.lines) {
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  return { added, removed }
}

export function displayPath(path: string, cwd: string, home: string | undefined): string {
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  return path
}

export function merge(list: readonly FileChange[], change: FileChange): FileChange[] {
  const at = list.findIndex(one => one.path === change.path)
  if (at === -1) return [...list, change]
  const was = list[at]!
  const joined: FileChange = {
    ...was,
    added: was.added + change.added,
    removed: was.removed + change.removed,
    patch: [was.patch, change.patch].filter(Boolean).join('\n'),
    why: [...was.why, ...change.why.filter(w => !was.why.includes(w))],
  }
  return list.map((one, i) => (i === at ? joined : one))
}

export const kindLabel = (kind: FileChange['kind']) => (kind === 'create' ? '新增' : '修改')

export function figures(change: FileChange): string {
  if (change.added === 0 && change.removed === 0) return ''
  return [change.added ? `+${change.added}` : '', change.removed ? `−${change.removed}` : ''].filter(Boolean).join(' ')
}

export function summaryPrompt(change: FileChange): string {
  const patch =
    change.patch.length > PATCH_FOR_SUMMARY ? `${change.patch.slice(0, PATCH_FOR_SUMMARY)}\n…（後面省略）` : change.patch
  return [
    `以下是檔案 ${change.display} 的${kindLabel(change.kind)}差異（unified diff）。`,
    '請用繁體中文，以一到兩句話說明這次改了什麼、效果是什麼。不要重述程式碼細節、不要加標題或條列。',
    '',
    patch || '（沒有差異內容）',
  ].join('\n')
}
