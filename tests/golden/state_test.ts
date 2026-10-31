// tests/golden/state_test.ts — state fixtures (plan C T56): one start and one end mark per scope, and nord roles.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { fx, spanOf } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
test('A4: state-ok-05 shares one ● and one ◉ among its [*]', () => {
  const t = [...text((explain(fx('state-ok-05'), { columns: 80, theme: 'mono' }) as any).drawing).join('')]
  assert.deepEqual([t.filter(c => c === '●').length, t.filter(c => c === '◉').length], [1, 1])
})
test('A7: states, choices, notes and frames carry their nord roles', () => {
  const n = THEMES.nord.roles, R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(R('state-ok-03'), /Second/)?.backgroundColor, n.node); assert.equal(spanOf(R('state-ok-08'), /◇/)?.color, n.decision)
  assert.equal(spanOf(R('state-ok-12'), /remember/)?.color, n.note); assert.equal(spanOf(R('state-ok-06'), /┌─Moving/)?.color, n.frame)
})
