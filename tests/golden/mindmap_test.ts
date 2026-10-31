// tests/golden/mindmap_test.ts — mindmap fixtures (plan C T78): and root, branch and depth inks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'
import { THEMES } from '../../core/themes.ts'
import { fx } from './c-lib.ts'
const ink = (id: string, s: string) =>
  renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
    .flat()
    .find((x) => x.text.includes(s))
test('A7: the root fills with the node role; a top-level branch colors its subtree; colorBy: depth colors by depth', () => {
  const n = THEMES.nord
  assert.equal(ink('mindmap-ok-01', 'Root')?.backgroundColor, n.roles.node)
  assert.deepEqual([ink('mindmap-ok-01', 'A')?.color, ink('mindmap-ok-01', 'B')?.color], [n.series.s1, n.series.s1])
  assert.deepEqual([ink('mindmap-ok-13', 'A')?.color, ink('mindmap-ok-13', 'B')?.color], [n.series.s1, n.series.s2])
})
