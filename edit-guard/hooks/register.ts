import type { Register } from 'claude-code'

import { CANCEL, CONTINUE, type Entry, type Other, absolute, fresh, latestOther, logDir, parse, question } from './guard'

const FILE_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const

export const register: Register = on => {
  on('tool.call', { tool: FILE_TOOLS }, async ($, e, next) => {
    const raw = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
    const file = absolute(raw, await $.session.cwd())
    const dir = logDir((await $.env.get('HOME')) ?? '')
    const me = await $.session.id()
    const now = await $.clock.now()

    const others: Other[] = []
    const listing = (await $.fs.exists(dir)) ? await $.fs.list(dir) : []
    for (const entry of listing) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
      const session = entry.name.slice(0, -'.json'.length)
      if (session === me) continue
      const path = `${dir}/${entry.name}`
      if (now - entry.mtimeMs >= 30 * 60 * 1000) {
        await $.process.run(['rm', '-f', path])
        continue
      }
      const text = await $.fs.read(path).catch(() => '[]')
      for (const { file, at } of parse(text)) others.push({ session, file, at })
    }

    const hit = latestOther(others, file, now)
    if (hit !== undefined) {
      const answer = await $.ui
        .ask(question(hit), { header: '同檔衝突', options: [CONTINUE, CANCEL] })
        .catch(() => CANCEL)
      if (answer !== CONTINUE) return { deny: `${$.plugin.name}: 使用者取消了對 ${file} 的寫入（另一個對話剛改過）。` }
    }

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const mine = `${dir}/${me}.json`
    const kept: Entry[] = (await $.fs.exists(mine)) ? parse(await $.fs.read(mine)) : []
    const at = await $.clock.now()
    await $.fs.write(mine, JSON.stringify([...fresh(kept, at), { file, at }]))
    return ran
  }).catch(($, e, next) => next(e))
}
