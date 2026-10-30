// tests/golden/class_test.ts — class fixtures (plan C T59): coverage, member order, and nord roles.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { coverageOf, fx, spanOf } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/class').map(f => f.replace('.mmd', ''))
test('A5: every class coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'class', ids), []))
test('A4: class-ok-04 lists attributes before methods, each in source order', () => {
  const t = text((explain(fx('class-ok-04'), { columns: 80, theme: 'mono' }) as any).drawing), at = (s: string) => t.findIndex(l => l.includes(s))
  const i = ['+String name', '+int age', '+run()', '+eat()'].map(at); assert.ok(i.every(k => k >= 0), i.join())   // each found, then in order
  assert.deepEqual(i, [...i].sort((a, b) => a - b)); assert.equal(new Set(i).size, 4)
})
test('A7: headers fill with the node role; members, cardinality and notes carry their roles', () => {
  const n = THEMES.nord.roles, R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(R('class-ok-04'), /^ *Person *$/)?.backgroundColor, n.node); assert.equal(spanOf(R('class-ok-04'), /\+int age/)?.color, n.label)
  assert.equal(spanOf(R('class-ok-19'), /1\.\.\*/)?.color, n.label); assert.equal(spanOf(R('class-ok-20'), /General note/)?.color, n.note)
})
