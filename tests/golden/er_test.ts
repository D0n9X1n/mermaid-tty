// tests/golden/er_test.ts — ER fixtures (plan C T62): cardinality pairs at their ends, and nord roles.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { fx, spanOf } from './c-lib.ts'
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
