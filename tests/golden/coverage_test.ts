import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')

// What is wrong with md's coverage rows for type t, given the IDs of the fixtures that exist: no row at all; a row that
// cites no existing fixture; a cited fixture that does not exist; an ok fixture that no row cites. Rows are checked one by
// one: pooled citations would hide a row whose citation was erased while another row cites the same fixture.
function problems(md: string, t: string, fixtures: readonly string[]): string[] {
  const rows = md.slice(md.indexOf('## Coverage')).split('\n').filter(l => l.startsWith(`| ${t} |`))
  const ids = (l: string) => l.match(new RegExp(`${t}-(ok|reject)-\\d+`, 'g')) ?? []
  const cited = new Set(rows.flatMap(l => ids(l))), exists = new Set(fixtures)
  return [...(rows.length > 0 ? [] : [`no ${t} coverage rows`]),
    ...rows.filter(l => !ids(l).some(id => exists.has(id))).map(l => `row cites no existing fixture: ${l}`),
    ...[...cited].filter(id => !exists.has(id)).map(id => `cited fixture does not exist: ${id}`),
    ...fixtures.filter(f => f.includes('-ok-') && !cited.has(f)).map(f => `ok fixture cited by no row: ${f}`)]
}

for (const [t, A] of [['flowchart', 'A1'], ['sequence', 'A2']] as const) test(`${A}: each coverage row cites a fixture that exists; every cited fixture exists; every ok fixture is cited`, () => {
  assert.deepEqual(problems(M, t, readdirSync(`fixtures/${t}`).map(f => f.replace(/\.mmd$/, ''))), [])
})
test('A1: a coverage row that cites no existing fixture fails, by name, though another row cites the same fixture', () => {
  const md = ['## Coverage', '', '| type | feature | fixture IDs |', '|---|---|---|', '| flowchart | `:::name` ignored | flowchart-ok-48 |',
    '| flowchart | `accTitle`/`accDescr` ignored |  |', '| flowchart | typo | flowchart-ok-480 |'].join('\n')
  assert.deepEqual(problems(md, 'flowchart', ['flowchart-ok-48']), [
    'row cites no existing fixture: | flowchart | `accTitle`/`accDescr` ignored |  |',
    'row cites no existing fixture: | flowchart | typo | flowchart-ok-480 |',
    'cited fixture does not exist: flowchart-ok-480'])
})
