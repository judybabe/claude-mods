export const OFFER_AT = 70

export const HANDOFF_REQUEST = [
  '請為這整個工作階段（從一開始到現在，包含較早被壓縮成摘要的部分）寫一份交接摘要，讓清空對話後的新對話能直接接手。',
  '不要只寫最近一兩個問題；工作階段裡做過的每一件事都要涵蓋。',
  '只回覆摘要本身，不要前言或結語，用以下五個標題：',
  '',
  '## 目前的目標',
  '## 做完了什麼',
  '## 還沒做的',
  '## 改過哪些檔案',
  '（列出完整路徑，每個檔案一句說明改了什麼）',
  '## 要注意的地方',
  '（使用者的偏好與決定、踩過的坑、還沒確認的事）',
].join('\n')

export function shouldOffer(contextPercent: number | undefined): boolean {
  return contextPercent !== undefined && contextPercent >= OFFER_AT
}

function two(n: number): string {
  return String(n).padStart(2, '0')
}

export function handoffPath(home: string, cwd: string, at: Date): string {
  const project = cwd.split('/').filter(Boolean).pop() ?? 'home'
  const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`
  return `${home.replace(/\/$/, '')}/.claude/handoffs/${project}-${stamp}.md`
}

export function firstMessage(path: string, summary: string): string {
  return `以下是上一段對話的交接摘要（檔案：${path}），請讀完後接續工作。\n\n${summary.trim()}`
}

export const HEADINGS = ['## 目前的目標', '## 做完了什麼', '## 還沒做的', '## 改過哪些檔案', '## 要注意的地方'] as const

// a reply is a summary when it opens with the goal and holds at least four of the five headings
export function isSummary(answer: string): boolean {
  const found = HEADINGS.filter(h => answer.includes(h)).length
  return answer.includes(HEADINGS[0]) && found >= 4
}

export const isHandoffRequest = (text: string): boolean => text.trim() === HANDOFF_REQUEST.trim()

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// every file the session's tool calls wrote, in first-touched order, read from the transcript's lines
export function filesFromTranscript(jsonl: string): string[] {
  const seen = new Set<string>()
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"tool_use"')) continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const content = (row as { message?: { content?: unknown } }).message?.content
    if (!Array.isArray(content)) continue
    for (const block of content as { type?: string; name?: string; input?: Record<string, unknown> }[]) {
      if (block.type !== 'tool_use' || !FILE_TOOLS.has(block.name ?? '')) continue
      const path = block.input?.file_path ?? block.input?.notebook_path
      if (typeof path === 'string' && path !== '') seen.add(path)
    }
  }
  return [...seen]
}

export const transcriptSlug = (dir: string): string => dir.replace(/[^A-Za-z0-9]/g, '-')

export function withFiles(summary: string, files: readonly string[]): string {
  const list = files.length === 0 ? '- （這個工作階段沒有用 Write／Edit 改過檔案）' : files.map(f => `- ${f}`).join('\n')
  return `${summary.trim()}\n\n## 本工作階段改過的所有檔案（自動整理）\n${list}\n`
}
