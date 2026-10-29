// tests/golden/mindmap_test.ts — mindmap fixtures (plan C T78): coverage rows, and root, branch and depth inks.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/mindmap').map(f => f.replace('.mmd', ''))
const ink = (id: string, s: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!.flat().find(x => x.text.includes(s))
test('A5: every mindmap coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'mindmap', ids), []))
test('A7: the root fills with the node role; a top-level branch colors its subtree; colorBy: depth colors by depth', () => {
  const n = THEMES.nord
  assert.equal(ink('mindmap-ok-01', 'Root')?.backgroundColor, n.roles.node)
  assert.deepEqual([ink('mindmap-ok-01', 'A')?.color, ink('mindmap-ok-01', 'B')?.color], [n.series.s1, n.series.s1])
  assert.deepEqual([ink('mindmap-ok-13', 'A')?.color, ink('mindmap-ok-13', 'B')?.color], [n.series.s1, n.series.s2])
})
