// tests/golden/gitGraph_test.ts — gitGraph fixtures (plan C T81): and lane and tag inks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'
import { THEMES } from '../../core/themes.ts'
import { fx, spanOf } from './c-lib.ts'
test('A7: each lane takes a series color for its glyphs and name; tags take the note role', () => {
  const n = THEMES.nord
  const R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.deepEqual(
    [spanOf(R('gitGraph-ok-02'), /^main$/)?.color, spanOf(R('gitGraph-ok-02'), /^develop$/)?.color],
    [n.series.s1, n.series.s2],
  )
  assert.equal(spanOf(R('gitGraph-ok-01'), /^\[v1\.0\.0\]$/)?.color, n.roles.note)
})
