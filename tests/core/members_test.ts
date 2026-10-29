import test from 'node:test'; import assert from 'node:assert/strict'
import { classRows, erRows } from '../../core/graph/members.ts'; import type { NodeRow } from '../../core/graph/model.ts'
test('A3: class members: attributes, then methods, each in source order; a wrapped member continues indented one cell', () => {
  const rows = classRows('Duck', [{ text: '+swim()', method: true }, { text: '+String beakColor', method: false }, { text: '+quack() : bool', method: true }], 10) as NodeRow[]
  assert.deepEqual(rows.map(r => [r.text, r.id, r.indent ?? 0, r.join ?? null]),
    [['+String', 'Duck.m1', 0, null], ['beakColor', 'Duck.m1', 1, ' '], ['+swim()', 'Duck.m0', 0, null], ['+quack()', 'Duck.m2', 0, null], [': bool', 'Duck.m2', 1, ' ']])
  assert.ok(rows.every(r => r.fixed && r.align === 'left' && r.role === 'label'))
  assert.deepEqual(classRows('X', [{ text: 'averyveryverylongname', method: false }], 10), { reason: 'word-too-wide' })
})
test('A3: ER columns align; only the comment wraps; a column blank in every row is dropped', () => {
  const rows = erRows('CAR', [{ type: 'string', name: 'registrationNumber', keys: 'PK', comment: 'The unique number' }, { type: 'int', name: 'seats', keys: '', comment: '' }], 12) as NodeRow[]
  assert.deepEqual(rows.map(r => r.cols!.map(c => c.text)), [['string', 'registrationNumber', 'PK', 'The unique'], ['', '', '', 'number'], ['int', 'seats', '', '']])
  assert.deepEqual(rows[0]!.cols!.map(c => [c.width, c.role]), [[6, 'label'], [18, 'label'], [2, 'label'], [10, 'note']])
  assert.deepEqual(rows[1]!.cols!.map(c => c.id), ['CAR.a0.type', 'CAR.a0.name', 'CAR.a0.keys', 'CAR.a0.comment']); assert.equal(rows[1]!.cols![3]!.join, ' ')
  assert.deepEqual(erRows('E', [{ type: 'int', name: 'n', keys: '', comment: '' }], null), [{ text: 'int n', role: 'label', align: 'left', fixed: true,
    cols: [{ text: 'int', role: 'label', id: 'E.a0.type', width: 3 }, { text: 'n', role: 'label', id: 'E.a0.name', width: 1 }] }])
})
