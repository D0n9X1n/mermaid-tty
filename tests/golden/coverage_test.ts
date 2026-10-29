import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, existsSync, readdirSync } from 'node:fs'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')
const rows = (t: string) => M.slice(M.indexOf('## Coverage')).split('\n').filter(l => l.startsWith(`| ${t} |`))
for (const [t, A] of [['flowchart', 'A1'], ['sequence', 'A2']] as const) test(`${A}: every coverage row cites existing fixtures; every ok fixture is cited`, () => {
  const cited = new Set(rows(t).flatMap(l => l.match(new RegExp(`${t}-(ok|reject)-\\d+`, 'g')) ?? [])); assert.ok(rows(t).length > 0)
  for (const id of cited) assert.ok(existsSync(`fixtures/${t}/${id}.mmd`), id)
  for (const f of readdirSync(`fixtures/${t}`)) if (f.includes('-ok-')) assert.ok(cited.has(f.replace('.mmd', '')), f)
})
