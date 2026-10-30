// tests/golden/er_test.ts — ER fixtures (plan C T62): coverage, cardinality pairs at their ends, and nord roles.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/er').map(f => f.replace('.mmd', ''))
test('A5: every er coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'er', ids), []))
test('A4: er-ok-06…09 print each cardinality pair at its two ends', () => {
  for (const [id, pair] of [['er-ok-06', ['0..1', '0..1']], ['er-ok-07', ['1', '1']], ['er-ok-08', ['0..*', '0..*']], ['er-ok-09', ['1..*', '1..*']]] as const) {
    const L = new Map((explain(fx(id), { columns: 80, theme: 'mono' }) as any).drawing.expect.labels.map((l: any) => [l.owner, l.text]))
    assert.deepEqual([L.get('r0:tail'), L.get('r0:head')], pair, id)
  }
})
test('A7: entity headers fill with the node role; comments carry note; cardinality carries arrow', () => {
  const n = THEMES.nord.roles, r = renderMermaid(fx('er-ok-04'), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(r, /^ *CAR *$/)?.backgroundColor, n.node); assert.equal(spanOf(r, /the plate/)?.color, n.note)
  assert.equal(spanOf(r, /^0\.\.\*$/)?.color, n.arrow)
})
