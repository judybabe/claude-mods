export const OFFER_AT = 70

export const HANDOFF_REQUEST = [
  '請為這段對話寫一份交接摘要，讓清空對話後的新對話能直接接手。',
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
