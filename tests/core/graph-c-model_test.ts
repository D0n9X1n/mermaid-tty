import test from 'node:test'
import assert from 'node:assert/strict'
import { nodeSize } from '../../core/graph/sizes.ts'
import type { GNode, NodeRow } from '../../core/graph/model.ts'
const N = (rows: NodeRow[], extra: Partial<GNode> = {}): GNode => ({
  id: 'n',
  shape: 'rect',
  role: 'node',
  rows,
  order: 0,
  ...extra,
})
test('A3: a mark is one cell; a bar spans across the flow', () => {
  assert.deepEqual(nodeSize(N([], { mark: 'start' }), null), { rows: 1, cols: 1 })
  assert.deepEqual(nodeSize(N([], { mark: 'bar', span: 5 }), null), { rows: 1, cols: 5 })
  assert.deepEqual(nodeSize(N([], { mark: 'bar', span: 5 }), null, true), { rows: 5, cols: 1 })
})
test('A3: every glyph mark is one cell whatever its rows, caps or direction; a bar with no span is one cell; across turns only a bar', () => {
  for (const mark of ['start', 'end', 'choice'] as const) {
    const wide = N([{ text: 'Too wide', role: 'node', align: 'center' }], { mark, shape: 'dcircle' })
    assert.deepEqual(nodeSize(wide, 2), { rows: 1, cols: 1 }, mark)
    assert.deepEqual(nodeSize(wide, 2, true), { rows: 1, cols: 1 }, `${mark} across`)
  }
  assert.deepEqual(nodeSize(N([], { mark: 'bar' }), null), { rows: 1, cols: 1 })
  assert.deepEqual(nodeSize(N([], { mark: 'bar' }), null, true), { rows: 1, cols: 1 })
  assert.deepEqual(nodeSize(N([{ text: 'ab', role: 'node', align: 'center' }]), null, true), { rows: 1, cols: 6 })
})
test('A3: fixed member rows keep their width under wrapAt; the header still wraps; columns add their gaps', () => {
  assert.deepEqual(
    nodeSize(
      N([
        { text: 'Duck Billed', role: 'node', align: 'center' },
        { text: '+String beakColor', role: 'label', align: 'left', id: 'n.m0', fixed: true },
        { text: 'more', role: 'label', align: 'left', id: 'n.m0', fixed: true, indent: 1, join: ' ' },
      ]),
      8,
    ),
    { rows: 4, cols: 21 },
  )
  assert.deepEqual(
    nodeSize(
      N([
        { text: 'CAR', role: 'node', align: 'center' },
        {
          text: 'string id',
          role: 'label',
          align: 'left',
          fixed: true,
          cols: [
            { text: 'string', role: 'label', id: 'n.a0.type', width: 6 },
            { text: 'id', role: 'label', id: 'n.a0.name', width: 5 },
          ],
        },
      ]),
      null,
    ),
    { rows: 2, cols: 16 },
  )
})
const P: NodeRow = { text: 'P', role: 'node', align: 'center' }
test('A3: a fixed row or a row of columns is one piece under any wrapAt; the same row unfixed still wraps', () => {
  const member: NodeRow = { text: '+int age', role: 'label', align: 'left', id: 'n.m0' }
  assert.deepEqual(nodeSize(N([P, { ...member, fixed: true }]), 4), { rows: 2, cols: 12 })
  assert.deepEqual(nodeSize(N([P, member]), 4), { rows: 3, cols: 8 })
  assert.deepEqual(
    nodeSize(
      N([
        P,
        {
          text: 'string id',
          role: 'label',
          align: 'left',
          cols: [
            { text: 'string', role: 'label', id: 'n.a0.type', width: 6 },
            { text: 'id', role: 'label', id: 'n.a0.name', width: 3 },
          ],
        },
      ]),
      4,
    ),
    { rows: 2, cols: 14 },
  )
})
test('A3: an indent widens a member row and a row of columns by its cells', () => {
  assert.deepEqual(nodeSize(N([P, { text: 'abc', role: 'label', align: 'left', fixed: true, indent: 2 }]), null), {
    rows: 2,
    cols: 9,
  })
  assert.deepEqual(
    nodeSize(
      N([
        P,
        {
          text: 'ab c',
          role: 'label',
          align: 'left',
          fixed: true,
          indent: 2,
          cols: [
            { text: 'ab', role: 'label', id: 'n.a0.type', width: 3 },
            { text: 'c', role: 'label', id: 'n.a0.name', width: 1 },
          ],
        },
      ]),
      null,
    ),
    { rows: 2, cols: 11 },
  )
})
test('A3: a note on either side leaves its node sized by its rows alone', () => {
  const plain = N([{ text: 'Moving', role: 'node', align: 'center' }])
  for (const side of ['left', 'right'] as const) {
    assert.deepEqual(
      nodeSize({ ...plain, note: { id: 'n0', text: 'a long note<br>more', side, key: 'a' } }, 8),
      { rows: 1, cols: 10 },
      side,
    )
  }
  assert.deepEqual(nodeSize(plain, 8), { rows: 1, cols: 10 })
})
// T40/T49 QA: a fixed row is sized by its terminal width, so a wide (CJK) member takes two cells a character.
test('A3: a fixed member row is as wide as its text in terminal cells: 字段 is 4, not 2', () => {
  assert.deepEqual(nodeSize(N([{ text: '字段', role: 'label', align: 'left', id: 'n.m0', fixed: true }]), null), {
    rows: 1,
    cols: 8,
  })
  assert.deepEqual(
    nodeSize(N([P, { text: '字段', role: 'label', align: 'left', id: 'n.m0', fixed: true, indent: 1, join: ' ' }]), 2),
    { rows: 2, cols: 9 },
  )
})
