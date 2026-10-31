import test from 'node:test'
import assert from 'node:assert/strict'
import { heading, stack } from '../../core/charts/sheet.ts'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'
import { text } from './graph-fixture.ts'

// One row that draws s, owned by owner. HEAD's Expect requires frames, which validate walks, so it lists none.
const part = (owner: string, s: string): Drawing => {
  const c = createCanvas(1, 10, 10)
  c.text(0, 0, s, 'label', owner)
  return c.toDrawing({ labels: [{ owner, text: s }], edges: [], edgeLabels: [], frames: [] })
}
test('A4: a title wraps at columns; stack keeps the parts in order and validates', () => {
  const h = heading('Release plan for Q3', 'title', 'title', 10) as Drawing
  assert.deepEqual(text(h), ['Release', 'plan for', 'Q3'])
  assert.ok(h.cells[0]!.every((c) => c === null || c.role === 'title'))
  const d = stack([h, part('a', 'x'), part('b', 'y')], 10)
  assert.deepEqual(text(d), ['Release', 'plan for', 'Q3', 'x', 'y'])
  assert.equal(validate(d), null)
  assert.equal(d.columns, 10)
  assert.deepEqual(heading('Supercalifragilistic', 'title', 'title', 10), { reason: 'word-too-wide' })
  const br = heading('one<br/>two', 'title', 'title', 10) as Drawing
  assert.deepEqual(text(br), ['one', 'two'])
  assert.equal(validate(br), null)
})
test('A5.mutation-tests: one owner drawn in two stacked parts is a duplicate', () =>
  assert.deepEqual(validate(stack([part('a', 'x'), part('a', 'x')], 10)), { reason: 'label-dup' }))
test('A4: stack keeps every expect field, each asserted alone, so a heading over a drawing drops none', () => {
  const extra = {
    frames: ['S'],
    members: [{ id: 'b.m0', parent: 'b' }],
    keys: [{ key: 'a', item: 'b', cls: 'note' }],
    keyable: [{ item: 'b', cls: 'note' }],
    bars: [{ owner: 'x0', eighths: 8, axis: 'h' }],
    edgeLabels: [{ owner: 'e0:label', edge: 'e0' }],
    edges: [
      { id: 'e0', from: 'b', to: 'c', ends: [{ node: 'c', glyph: '▼' }], endLabels: [{ node: 'c', owner: 'e0:c' }] },
    ],
  }
  const d = stack(
    [
      heading('Title', 'title', 'title', 10) as Drawing,
      { ...part('b', 'y'), expect: { ...part('b', 'y').expect, ...extra } } as Drawing,
    ],
    10,
  )
  const e = d.expect as any
  assert.deepEqual(e.frames, extra.frames)
  assert.deepEqual(e.members, extra.members)
  assert.deepEqual(e.keys, extra.keys)
  assert.deepEqual(e.keyable, extra.keyable)
  assert.deepEqual(e.bars, extra.bars)
  assert.deepEqual(e.edges, extra.edges) // edges carry their ends
  assert.deepEqual(e.edgeLabels, extra.edgeLabels)
  assert.deepEqual(
    e.labels.map((l: any) => l.owner),
    ['title', 'b'],
  )
})

// The first piece has no join, a later wrap piece its wrap join, and the first piece of a later <br> line '\n'.
test('A4: a heading draws one row per piece in its ink, owned by owner, joined as wrap and <br> split it', () => {
  const h = heading('ab cd ef<br/>gh', 'value', 'sec0', 5) as Drawing
  assert.deepEqual(text(h), ['ab cd', 'ef', 'gh'])
  assert.equal(h.columns, 5)
  assert.equal(validate(h), null)
  assert.deepEqual(
    h.cells.map((r) => r[0]!.join),
    [undefined, ' ', '\n'],
  )
  assert.deepEqual(h.expect, {
    labels: [{ owner: 'sec0', text: 'ab cd ef\ngh', at: { r: 0, c: 0 } }],
    edges: [],
    edgeLabels: [],
    frames: [],
  })
  const drawn = h.cells.flat().filter((x) => x !== null)
  assert.ok(
    drawn.length === 9 && drawn.every((x) => x.role === 'value' && x.kind === 'text' && x.owners.join() === 'sec0'),
  )
  const cjk = heading('漢字漢字', 'title', 'title', 4) as Drawing
  assert.deepEqual(text(cjk), ['漢字', '漢字'])
  assert.deepEqual(
    cjk.cells.map((r) => r[0]!.join),
    [undefined, ''],
  )
  assert.equal(validate(cjk), null)
})
// draw expects a <br> label as its lines joined by '\n'; a heading does the same, in every <br> spelling.
test('A4: a <br/> heading expects its text as drawn, and a word too wide on any line fails', () => {
  for (const t of ['one<br/>two', 'one<br>two', 'one<BR />two']) {
    const br = heading(t, 'title', 'title', 10) as Drawing
    assert.deepEqual(text(br), ['one', 'two'], t)
    assert.deepEqual(br.expect.labels, [{ owner: 'title', text: 'one\ntwo', at: { r: 0, c: 0 } }], t)
    assert.equal(validate(br), null, t)
  }

  assert.deepEqual(heading('ok<br/>Supercalifragilistic', 'title', 'title', 10), { reason: 'word-too-wide' })
})

// rows × cols cells, owner's id drawn on its last row, then '!' over it: a conflict at (rows − 1, 0).
const clashing = (owner: string, rows: number, cols: number): Drawing => {
  const c = createCanvas(rows, cols, 20)
  c.text(rows - 1, 0, owner, 'label', owner)
  c.text(rows - 1, 0, '!', 'label', 'x')
  return c.toDrawing({ labels: [{ owner, text: owner }], edges: [], edgeLabels: [], frames: [] })
}
test("A4: stack pads each row with null to the widest part, shifts each part's conflicts by its row offset, and keeps its parts", () => {
  const parts = [clashing('a', 2, 4), clashing('b', 1, 12), clashing('c', 1, 3)]
  const d = stack(parts, 20)
  assert.deepEqual(
    d.cells.map((r) => Array.from(r, (x) => (x === null ? '.' : x === undefined ? '?' : x.ch)).join('')),
    ['............', 'a...........', 'b...........', 'c...........'],
  )
  assert.deepEqual(d.conflicts, [
    { row: 1, col: 0, had: 'a', by: 'x' },
    { row: 2, col: 0, had: 'b', by: 'x' },
    { row: 3, col: 0, had: 'c', by: 'x' },
  ])
  assert.deepEqual(
    parts.map((p) => p.cells.map((r) => r.length)),
    [[4, 4], [12], [3]],
  )
})
test("A4: stack's columns is the argument, so validate measures every row against it; no parts is an empty drawing", () => {
  const wide = (): Drawing => {
    const c = createCanvas(1, 12, 12)
    c.text(0, 0, 'twelve chars', 'label', 'w')
    return c.toDrawing({ labels: [{ owner: 'w', text: 'twelve chars' }], edges: [], edgeLabels: [], frames: [] })
  }
  for (const [cols, want] of [
    [12, null],
    [11, { reason: 'row-too-wide' }],
  ] as const) {
    const d = stack([part('a', 'x'), wide()], cols)
    assert.equal(d.columns, cols)
    assert.deepEqual(validate(d), want, `${cols}`)
  }

  assert.deepEqual(stack([], 10), {
    columns: 10,
    cells: [],
    conflicts: [],
    expect: { labels: [], edges: [], edgeLabels: [], frames: [] },
  })
})

// A part whose expect lists every field, A's and C's (T86, T87), each with one entry tagged i.
const full = (i: number): Drawing =>
  ({
    ...part(`p${i}`, 'z'),
    expect: {
      labels: [{ owner: `p${i}`, text: 'z' }],
      frames: [`F${i}`],
      edges: [
        {
          id: `e${i}`,
          from: 'a',
          to: 'b',
          ends: [{ node: 'b', glyph: '▼' }],
          endLabels: [{ node: 'b', owner: `e${i}:b` }],
        },
      ],
      edgeLabels: [{ owner: `e${i}:label`, edge: `e${i}` }],
      members: [{ id: `m${i}`, parent: 'a' }],
      keys: [{ key: `k${i}`, item: 'a', cls: 'note' }],
      keyable: [{ item: `i${i}`, cls: 'note' }],
      bars: [{ owner: `b${i}`, eighths: i, axis: 'h' }],
    },
  }) as Drawing
test("A4: stack concatenates each expect field in part order, so neither part's entries drop or win", () => {
  const [a, b] = [full(0), full(1)]
  const e = stack([a, b], 10).expect as any
  for (const k of ['labels', 'edges', 'edgeLabels', 'frames', 'members', 'keys', 'keyable', 'bars']) {
    assert.deepEqual(e[k], [...(a.expect as any)[k], ...(b.expect as any)[k]], k)
  }
})
// A field Expect does not list yet merges by name, from whichever parts have it; a field no part has stays absent.
test('A4: stack carries a field Expect does not list yet, from the middle parts that have it, and adds none', () => {
  const later = (d: Drawing, v: string): Drawing => ({ ...d, expect: { ...d.expect, later: [v] } }) as Drawing
  const e = stack([part('a', 'w'), later(part('b', 'x'), 'one'), later(part('c', 'y'), 'two'), part('d', 'z')], 10)
    .expect as any
  assert.deepEqual(e.later, ['one', 'two'])
  assert.deepEqual(Object.keys(e).sort(), ['edgeLabels', 'edges', 'frames', 'labels', 'later'])
})
// Helpers QA: every entry of each part's expect arrays is carried, not only the first.
test('A5.mutation-tests: stack carries every entry of a part, so a part with two labels and two members keeps both', () => {
  const two = {
    ...part('a', 'x'),
    expect: {
      labels: [
        { owner: 'a', text: 'x' },
        { owner: 'a2', text: 'z' },
      ],
      edges: [],
      edgeLabels: [],
      frames: ['F', 'G'],
      members: [
        { id: 'a.m0', parent: 'a' },
        { id: 'a.m1', parent: 'a' },
      ],
    },
  } as Drawing
  const e = stack([two, part('b', 'y')], 10).expect
  assert.deepEqual(
    [e.labels.map((l) => l.owner), e.frames, e.members?.map((m) => m.id)],
    [
      ['a', 'a2', 'b'],
      ['F', 'G'],
      ['a.m0', 'a.m1'],
    ],
  )
})
// T87 fix: a key's at is a cell, so stacking moves it with its part; a point key under a heading stays placed.
test("A5.mutation-tests: stack moves each key position down by its part's row offset", () => {
  const k = (r: number): Drawing => {
    const c = createCanvas(1, 4, 4)
    c.key(0, 0, 'a', 'note', 'p0', false)
    return c.toDrawing({
      labels: [],
      edges: [],
      edgeLabels: [],
      frames: [],
      keys: [{ key: 'a', item: 'p0', cls: 'point', at: { r, c: 0 } }],
    })
  }
  assert.deepEqual(stack([part('t', 'T'), part('u', 'U'), k(0)], 10).expect.keys, [
    { key: 'a', item: 'p0', cls: 'point', at: { r: 2, c: 0 } },
  ])
  assert.deepEqual(stack([k(0)], 10).expect.keys, [{ key: 'a', item: 'p0', cls: 'point', at: { r: 0, c: 0 } }])
})
