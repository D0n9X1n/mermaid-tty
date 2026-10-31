// tests/golden/class_test.ts — class fixtures (plan C T59): member order, and nord roles.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { fx, spanOf } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
test('A4: class-ok-04 lists attributes before methods, each in source order', () => {
  const t = text((explain(fx('class-ok-04'), { columns: 80, theme: 'mono' }) as any).drawing)
const  at = (s: string) => t.findIndex(l => l.includes(s))
  const i = ['+String name', '+int age', '+run()', '+eat()'].map(at); assert.ok(i.every(k => k >= 0), i.join())   // each found, then in order
  assert.deepEqual(i, [...i].sort((a, b) => a - b)); assert.equal(new Set(i).size, 4)
})
test('A7: headers fill with the node role; members, cardinality and notes carry their roles', () => {
  const n = THEMES.nord.roles
const  R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(R('class-ok-04'), /^ *Person *$/)?.backgroundColor, n.node); assert.equal(spanOf(R('class-ok-04'), /\+int age/)?.color, n.label)
  assert.equal(spanOf(R('class-ok-19'), /1\.\.\*/)?.color, n.label); assert.equal(spanOf(R('class-ok-20'), /General note/)?.color, n.note)
})
