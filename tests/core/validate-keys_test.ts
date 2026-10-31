import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { validate, type Expect } from '../../core/validate.ts'
import type { Canvas } from '../../core/canvas.ts'
import { stack } from '../../core/charts/sheet.ts'
import { toRows } from '../../core/render.ts'
import { palette, THEMES } from '../../core/themes.ts'
const TEXT: Record<string, string> = { n1: 'memo', n2: 'other' }
// Row 0: each item's in-place key, or its text when it is unkeyed. Row 1 + i: item i's legend row, its key and then its
// text.
// Each tuple is [item, in-place key, legend key]; a null legend key drops that key cell, and an omitted one drops the
// whole row.
function keyed(drawn: readonly [string, string | null, (string | null)?][], keys: Expect['keys']): Drawing {
  const c = createCanvas(4, 12, 12)
  drawn.forEach(([item, key, lk], i) => {
    if (key === null) {
      c.text(0, 6 * i, TEXT[item]!, 'note', item)
      return
    }

    c.key(0, 6 * i, key, 'note', item, false)
    if (lk !== undefined) {
      if (lk !== null) {
        c.key(1 + i, 0, lk, 'note', item, true)
      }

      c.text(1 + i, 2, TEXT[item]!, 'note', item)
    }
  })
  return c.toDrawing({
    labels: drawn.map(([item]) => ({ owner: item, text: TEXT[item]! })),
    edges: [],
    edgeLabels: [],
    frames: [],
    keys,
    keyable: [
      { item: 'n1', cls: 'note' },
      { item: 'n2', cls: 'note' },
    ],
  })
}

const K = [
  { key: 'a', item: 'n1', cls: 'note' },
  { key: 'b', item: 'n2', cls: 'note' },
]
test('A5.mutation-tests: each key is drawn once at its item and once in the legend, and a class is keyed all or none', () => {
  assert.equal(
    validate(
      keyed(
        [
          ['n1', 'a', 'a'],
          ['n2', 'b', 'b'],
        ],
        K,
      ),
    ),
    null,
  )
  assert.equal(
    validate(
      keyed(
        [
          ['n1', null],
          ['n2', null],
        ],
        [],
      ),
    ),
    null,
  )
  const cases = [
    [
      [
        ['n1', 'b', 'a'],
        ['n2', 'a', 'b'],
      ],
      K,
      'key-mismatch',
    ], // two keys swapped in place
    [
      [
        ['n1', 'a', null],
        ['n2', 'b', 'b'],
      ],
      K,
      'key-missing',
    ], // a legend key deleted
    [
      [
        ['n1', 'a'],
        ['n2', 'b', 'b'],
      ],
      K,
      'label-missing',
    ], // a whole legend row deleted
    [
      [
        ['n1', 'a', 'a'],
        ['n2', null],
      ],
      [K[0]!],
      'key-partial',
    ], // half the class keyed
    [
      [
        ['n1', 'a', 'a'],
        ['n2', 'b', 'b'],
      ],
      [K[0]!],
      'key-stray',
    ], // a key no entry lists
  ] as const
  for (const [drawn, keys, reason] of cases) {
    assert.deepEqual(validate(keyed(drawn, keys)), { reason }, reason)
  }
})
test('A5.mutation-tests: a legend key is bound to its own row, so swapping whole legend key cells between rows fails', () => {
  const rows = (k1: string, k2: string): Drawing => {
    const c = createCanvas(3, 12, 12)
    const own = (k: string) => (k === 'a' ? 'n1' : 'n2')
    c.key(0, 0, 'a', 'note', 'n1', false)
    c.key(0, 6, 'b', 'note', 'n2', false)
    c.key(1, 0, k1, 'note', own(k1), true)
    c.text(1, 2, 'memo', 'note', 'n1')
    c.key(2, 0, k2, 'note', own(k2), true)
    c.text(2, 2, 'other', 'note', 'n2')
    return c.toDrawing({
      labels: [
        { owner: 'n1', text: 'memo' },
        { owner: 'n2', text: 'other' },
      ],
      edges: [],
      edgeLabels: [],
      frames: [],
      keys: K,
      keyable: [
        { item: 'n1', cls: 'note' },
        { item: 'n2', cls: 'note' },
      ],
    })
  }
  assert.equal(validate(rows('a', 'b')), null)
  assert.deepEqual(validate(rows('b', 'a')), { reason: 'key-unbound' }) // b memo / a other
})
test("A5.mutation-tests: an edge label's key cell carries its edge like the label's text", () => {
  const draw = (key: boolean): Drawing => {
    const c = createCanvas(7, 8, 8)
    c.text(0, 2, 'A', 'node', 'A')
    c.line(1, 2, 5, 'light', 'edge', 'e0')
    if (key) {
      c.key(2, 2, 'a', 'label', ['e0:label', 'e0'], false)
    }

    c.line(3, 2, 5, 'light', 'edge', 'e0')
    c.arrow(4, 2, '▼', 'e0')
    c.text(5, 2, 'B', 'node', 'B')
    c.key(6, 0, 'a', 'label', 'e0:label', true)
    c.text(6, 2, 'yes', 'label', 'e0:label')
    return c.toDrawing({
      labels: [
        { owner: 'A', text: 'A' },
        { owner: 'B', text: 'B' },
        { owner: 'e0:label', text: 'yes' },
      ],
      edges: [{ id: 'e0', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }],
      edgeLabels: [{ owner: 'e0:label', edge: 'e0' }],
      frames: [],
      keys: [{ key: 'a', item: 'e0:label', cls: 'label' }],
      keyable: [{ item: 'e0:label', cls: 'label' }],
    })
  }
  assert.equal(validate(draw(true)), null)
  assert.deepEqual(validate(draw(false)), { reason: 'edge-disconnected' })
})
test('A5.mutation-tests: a keyed member keeps its in-place key with its parent; its legend cells are owned by it alone', () => {
  const draw = (owners: string[]): Drawing => {
    const c = createCanvas(2, 10, 10)
    c.key(0, 0, 'a', 'note', owners, false)
    c.key(1, 0, 'a', 'note', 'U.c0', true)
    c.text(1, 2, 'pk', 'note', 'U.c0')
    return c.toDrawing({
      labels: [{ owner: 'U.c0', text: 'pk' }],
      edges: [],
      edgeLabels: [],
      frames: [],
      members: [{ id: 'U.c0', parent: 'U' }],
      keys: [{ key: 'a', item: 'U.c0', cls: 'comment' }],
      keyable: [{ item: 'U.c0', cls: 'comment' }],
    })
  }
  assert.equal(validate(draw(['U.c0', 'U'])), null)
  assert.deepEqual(validate(draw(['U.c0'])), { reason: 'member' })
})
// U.c0's in-place key with its parent, then its legend row: its key, then 主键 of (wide cells and their cont cells)
// wrapped to user.
test("A5.mutation-tests: a keyed member's legend text, its wide cells and its continuation row included, is owned by it alone", () => {
  const c = createCanvas(3, 10, 10)
  c.key(0, 0, 'a', 'note', ['U.c0', 'U'], false)
  c.key(1, 0, 'a', 'note', 'U.c0', true)
  c.text(1, 2, '主键 of', 'note', 'U.c0')
  c.text(2, 2, 'user', 'note', 'U.c0', ' ')
  assert.equal(
    validate(
      c.toDrawing({
        labels: [{ owner: 'U.c0', text: '主键 of user' }],
        edges: [],
        edgeLabels: [],
        frames: [],
        members: [{ id: 'U.c0', parent: 'U' }],
        keys: [{ key: 'a', item: 'U.c0', cls: 'comment' }],
        keyable: [{ item: 'U.c0', cls: 'comment' }],
      }),
    ),
    null,
  )
})
// U.c0's member row is only its in-place key, owned with its parent: no text cell. Omitting its members entry must
// still fail.
test('A5.mutation-tests: with members set, a key cell with two distinct owners, the second no edge, is a listed member too', () => {
  const draw = (members: Expect['members']): Drawing => {
    const c = createCanvas(2, 10, 10)
    c.key(0, 0, 'a', 'note', ['U.c0', 'U'], false)
    c.key(1, 0, 'a', 'note', 'U.c0', true)
    c.text(1, 2, 'pk', 'note', 'U.c0')
    return c.toDrawing({
      labels: [{ owner: 'U.c0', text: 'pk' }],
      edges: [],
      edgeLabels: [],
      frames: [],
      members,
      keys: [{ key: 'a', item: 'U.c0', cls: 'comment' }],
      keyable: [{ item: 'U.c0', cls: 'comment' }],
    })
  }
  assert.equal(validate(draw([{ id: 'U.c0', parent: 'U' }])), null)
  assert.deepEqual(validate(draw([])), { reason: 'member-unlisted' })
})
test('A5.mutation-tests: key writes one key cell per character, owners flattened, a legend key marked, and is exclusive like cap', () => {
  const c = createCanvas(2, 4, 4)
  assert.equal(c.key(0, 0, 'ab', 'note', ['n1', 'U'], false), 2)
  assert.equal(c.key(1, 0, 'a', 'label', 'n1', true), 1)
  c.text(0, 1, 'x', 'label', 'n2')
  c.key(1, 0, 'b', 'note', 'n3', true)
  c.key(1, 4, 'c', 'note', 'n4', false)
  const d = c.toDrawing({ labels: [], edges: [], edgeLabels: [], frames: [] })
  assert.deepEqual(d.cells[0]!.slice(0, 2), [
    { ch: 'a', role: 'note', kind: 'key', owners: ['n1', 'U'], dirs: 0 },
    { ch: 'b', role: 'note', kind: 'key', owners: ['n1', 'U'], dirs: 0 },
  ])
  assert.deepEqual(d.cells[1]![0], { ch: 'a', role: 'label', kind: 'key', owners: ['n1'], dirs: 0, legend: true })
  assert.deepEqual(d.conflicts, [
    { row: 0, col: 1, had: 'n1', by: 'n2' },
    { row: 1, col: 0, had: 'n1', by: 'n3' },
    { row: 1, col: 4, had: 'out-of-bounds', by: 'n4' },
  ])
})
// A node pill [x] then a key in node ink: under a filling palette the key takes no background, as a cap does, so it
// merges with ].
test('A7: toRows draws a key cell as it draws a cap: in its ink, with no pill', () => {
  const c = createCanvas(1, 6, 6)
  c.cap(0, 0, '[', 'node', 'n1')
  c.text(0, 1, 'x', 'node', 'n1')
  c.cap(0, 2, ']', 'node', 'n1')
  c.key(0, 3, 'a', 'node', 'n2', false)
  const n = THEMES.nord.roles
  assert.deepEqual(toRows(c.toDrawing({ labels: [], edges: [], edgeLabels: [], frames: [] }), palette('nord')), [
    [
      { text: '[', role: 'node', color: n.node },
      { text: 'x', role: 'node', color: THEMES.nord.onFill, backgroundColor: n.node },
      { text: ']a', role: 'node', color: n.node },
    ],
  ])
})
// n1's in-place key a at (0, 0), its legend key a at (1, 0) and its text gap cells after it, then each extra write.
function board(extra?: (c: Canvas) => void, gap = 1): Drawing {
  const c = createCanvas(3, 12, 12)
  c.key(0, 0, 'a', 'note', 'n1', false)
  c.key(1, 0, 'a', 'note', 'n1', true)
  c.text(1, 1 + gap, 'memo', 'note', 'n1')
  extra?.(c)
  return c.toDrawing({
    labels: [{ owner: 'n1', text: 'memo' }],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: [K[0]!],
    keyable: [{ item: 'n1', cls: 'note' }],
  })
}

test('A5.mutation-tests: a second run fails key-dup; a legend key not one blank before its text, key-unbound; a run read longer, key-mismatch', () => {
  assert.equal(validate(board()), null)
  // a second in-place run
  assert.deepEqual(validate(board((c) => c.key(0, 4, 'a', 'note', 'n1', false))), { reason: 'key-dup' })
  // a second legend run
  assert.deepEqual(validate(board((c) => c.key(2, 0, 'a', 'note', 'n1', true))), { reason: 'key-dup' })
  for (const gap of [0, 2]) {
    assert.deepEqual(validate(board(undefined, gap)), { reason: 'key-unbound' }, `gap ${gap}`)
  }

  // its in-place run reads ab
  assert.deepEqual(validate(board((c) => c.key(0, 1, 'b', 'note', 'n1', false))), { reason: 'key-mismatch' })
})
// One in-place key a owned by both points p1 and p2, at (0, 0) and (0, 1), then each point's own legend row.
test('A5.mutation-tests: a point key owned by several points is one in-place run for each, and each still needs its legend row', () => {
  const draw = (owners: string[]): Drawing => {
    const c = createCanvas(3, 6, 6)
    c.key(0, 0, 'a', 'note', owners, false)
    c.key(1, 0, 'a', 'note', 'p1', true)
    c.text(1, 2, 'x', 'note', 'p1')
    c.key(2, 0, 'a', 'note', 'p2', true)
    c.text(2, 2, 'y', 'note', 'p2')
    return c.toDrawing({
      labels: [
        { owner: 'p1', text: 'x' },
        { owner: 'p2', text: 'y' },
      ],
      edges: [],
      edgeLabels: [],
      frames: [],
      keys: [
        { key: 'a', item: 'p1', cls: 'note', at: { r: 0, c: 0 } },
        { key: 'a', item: 'p2', cls: 'note', at: { r: 0, c: 1 } },
      ],
      keyable: [
        { item: 'p1', cls: 'note' },
        { item: 'p2', cls: 'note' },
      ],
    })
  }
  assert.equal(validate(draw(['p1', 'p2'])), null)
  assert.deepEqual(validate(draw(['p1'])), { reason: 'key-missing' })
})
// Each part draws its item's in-place key over its legend row; stack merges their expects, keys and keyable included.
test('A5.mutation-tests: stacked keyed parts validate on their merged expect, and dropping one merged key entry fails', () => {
  const part = (k: (typeof K)[number], text: string): Drawing => {
    const c = createCanvas(2, 8, 8)
    c.key(0, 0, k.key, 'note', k.item, false)
    c.key(1, 0, k.key, 'note', k.item, true)
    c.text(1, 2, text, 'note', k.item)
    return c.toDrawing({
      labels: [{ owner: k.item, text }],
      edges: [],
      edgeLabels: [],
      frames: [],
      keys: [k],
      keyable: [{ item: k.item, cls: k.cls }],
    })
  }
  const d = stack([part(K[0]!, 'memo'), part(K[1]!, 'other')], 8)
  assert.deepEqual(d.expect.keys, K)
  assert.equal(validate(d), null)
  for (const i of [0, 1]) {
    assert.deepEqual(
      validate({ ...d, expect: { ...d.expect, keys: d.expect.keys!.filter((_, j) => j !== i) } }),
      { reason: 'key-stray' },
      `${i}`,
    )
  }
})
// n1's in-place key a at (0, 0) and n2's b at (0, k), then each one's legend row.
function apart(k: number): Drawing {
  const c = createCanvas(3, 12, 12)
  c.key(0, 0, 'a', 'note', 'n1', false)
  c.key(0, k, 'b', 'note', 'n2', false)
  c.key(1, 0, 'a', 'note', 'n1', true)
  c.text(1, 2, 'memo', 'note', 'n1')
  c.key(2, 0, 'b', 'note', 'n2', true)
  c.text(2, 2, 'other', 'note', 'n2')
  return c.toDrawing({
    labels: [
      { owner: 'n1', text: 'memo' },
      { owner: 'n2', text: 'other' },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: K,
    keyable: [
      { item: 'n1', cls: 'note' },
      { item: 'n2', cls: 'note' },
    ],
  })
}

test('A5.mutation-tests: an in-place key touching another key on its row reads as one key and fails key-adjacent; a gap passes', () => {
  assert.deepEqual(validate(apart(1)), { reason: 'key-adjacent' })
  assert.equal(validate(apart(2)), null) // ab, then a b
})
// Two points as ● caps at (0, 0) and (0, c2), one key 1 at (0, 1) owned by both, then each point's own legend row;
// placed:
// each entry gives its point's cell as at.
function points(c2: number, placed = true): Drawing {
  const c = createCanvas(3, 24, 24)
  c.cap(0, 0, '●', 's1', 'p0.pt')
  c.cap(0, c2, '●', 's1', 'p1.pt')
  c.key(0, 1, '1', 'note', ['p0', 'p1'], false)
  c.key(1, 0, '1', 'note', 'p0', true)
  c.text(1, 2, 'Alpha', 'note', 'p0')
  c.key(2, 0, '1', 'note', 'p1', true)
  c.text(2, 2, 'Beta', 'note', 'p1')
  const pos = (col: number) => (placed ? { at: { r: 0, c: col } } : {})
  return c.toDrawing({
    labels: [
      { owner: 'p0', text: 'Alpha' },
      { owner: 'p1', text: 'Beta' },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: [
      { key: '1', item: 'p0', cls: 'point', ...pos(0) },
      { key: '1', item: 'p1', cls: 'point', ...pos(c2) },
    ],
    keyable: [
      { item: 'p0', cls: 'point' },
      { item: 'p1', cls: 'point' },
    ],
  })
}
// n1's in-place key a at (0, 2), its entry's at (r, c), then its legend row.
function lone(r: number, c: number): Drawing {
  const d = createCanvas(2, 8, 8)
  d.key(0, 2, 'a', 'note', 'n1', false)
  d.key(1, 0, 'a', 'note', 'n1', true)
  d.text(1, 2, 'memo', 'note', 'n1')
  return d.toDrawing({
    labels: [{ owner: 'n1', text: 'memo' }],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: [{ ...K[0]!, at: { r, c } }],
    keyable: [{ item: 'n1', cls: 'note' }],
  })
}

test("A5.mutation-tests: an entry's at is in its in-place key or beside it on its row, and a key several items own needs at on each", () => {
  assert.deepEqual(validate(points(20)), { reason: 'key-unplaced' })
  assert.equal(validate(points(2)), null) // the second point far off; then beside the key
  assert.deepEqual(validate(points(2, false)), { reason: 'key-unplaced' }) // a shared key, and no at
  for (const c of [1, 2, 3]) {
    assert.equal(validate(lone(0, c)), null, `${c}`)
  } // beside it on the left, in it, beside it on the right

  for (const [r, c] of [
    [0, 0],
    [0, 4],
    [1, 2],
  ] as const) {
    assert.deepEqual(validate(lone(r, c)), { reason: 'key-unplaced' }, `${r},${c}`)
  }
})
// In-place keys a and b at (0, 0) and (0, 2), then the legend: a alpha · 0.3, its separator and value owned by others,
// then
// n1's wrapped tail and b beta in the given order.
function legendRows(order: readonly ('tail' | 'b')[]): Drawing {
  const c = createCanvas(4, 16, 16)
  c.key(0, 0, 'a', 'note', 'n1', false)
  c.key(0, 2, 'b', 'note', 'n2', false)
  c.key(1, 0, 'a', 'note', 'n1', true)
  c.text(1, 2, 'alpha', 'note', 'n1')
  c.text(1, 7, ' · ', 'note', 'sep')
  c.text(1, 10, '0.3', 'value', 'n1.xy')
  order.forEach((x, i) => {
    if (x === 'tail') {
      c.text(2 + i, 2, 'tail', 'note', 'n1', ' ')
    } else {
      c.key(2 + i, 0, 'b', 'note', 'n2', true)
      c.text(2 + i, 2, 'beta', 'note', 'n2')
    }
  })
  return c.toDrawing({
    labels: [
      { owner: 'n1', text: 'alpha tail' },
      { owner: 'sep', text: '·' },
      { owner: 'n1.xy', text: '0.3' },
      { owner: 'n2', text: 'beta' },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: K,
    keyable: [
      { item: 'n1', cls: 'note' },
      { item: 'n2', cls: 'note' },
    ],
  })
}
// A legend beside the diagram: a alpha in row 0 and its wrapped tail in row 1, b beta in row 2; the in-place keys at
// column 10,
// b's in row 0 and a's in row 1, tail's row.
function beside(): Drawing {
  const c = createCanvas(3, 16, 16)
  c.key(0, 0, 'a', 'note', 'n1', true)
  c.text(0, 2, 'alpha', 'note', 'n1')
  c.key(0, 10, 'b', 'note', 'n2', false)
  c.text(1, 2, 'tail', 'note', 'n1', ' ')
  c.key(1, 10, 'a', 'note', 'n1', false)
  c.key(2, 0, 'b', 'note', 'n2', true)
  c.text(2, 2, 'beta', 'note', 'n2')
  return c.toDrawing({
    labels: [
      { owner: 'n1', text: 'alpha tail' },
      { owner: 'n2', text: 'beta' },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: K,
    keyable: [
      { item: 'n1', cls: 'note' },
      { item: 'n2', cls: 'note' },
    ],
  })
}

test("A5.mutation-tests: an item's legend text, wrapped rows included, stays in its own block, which runs to the next legend key row", () => {
  assert.equal(validate(legendRows(['tail', 'b'])), null)
  assert.deepEqual(validate(legendRows(['b', 'tail'])), { reason: 'key-unbound' }) // tail reads as b's
  assert.equal(validate(beside()), null) // an in-place key's row starts no block
})
// apart(2)'s drawing, its keys and keyable replaced.
const classed = (keys: Expect['keys'], keyable: Expect['keyable']): Drawing => {
  const d = apart(2)
  return { ...d, expect: { ...d.expect, keys, keyable } }
}
test('A5.mutation-tests: each entry matches a keyable item by item and class, else key-class; a class is still keyed all or none', () => {
  const kn = [
    { item: 'n1', cls: 'note' },
    { item: 'n2', cls: 'note' },
  ]
  assert.equal(validate(classed(K, kn)), null)
  // n2 keyed as a label, its class a note
  assert.deepEqual(validate(classed([K[0]!, { ...K[1]!, cls: 'label' }], kn)), { reason: 'key-class' })
  assert.deepEqual(
    validate(
      classed(
        [{ ...K[0]!, cls: 'label' }, K[1]!],
        [
          { item: 'n1', cls: 'note' },
          { item: 'n2', cls: 'label' },
        ],
      ),
    ),
    { reason: 'key-class' },
  ) // label is n2's class, not n1's
  assert.deepEqual(validate(classed(K, [])), { reason: 'key-class' }) // entries for items no class keys
})
// n1's in-place key reads its entry's a, but its legend key reads b, as n2's does: only the legend key's read catches
// it.
test("A5.mutation-tests: a legend key reads its entry's key even where the in-place key does, else key-mismatch", () =>
  assert.deepEqual(
    validate(
      keyed(
        [
          ['n1', 'a', 'b'],
          ['n2', 'b', 'b'],
        ],
        K,
      ),
    ),
    { reason: 'key-mismatch' },
  )) // a / b; b memo, b other
// In-place keys a and b at (0, 0) and (0, 2), then a alpha as the legend's first row. Shared: b beta on that row at
// column 12,
// and alpha's wrapped tail under beta at column 14. Else alpha's tail at (2, 2), then b 设计, wide cells, in the next
// row.
function oneRow(shared: boolean): Drawing {
  const c = createCanvas(4, 20, 20)
  c.key(0, 0, 'a', 'note', 'n1', false)
  c.key(0, 2, 'b', 'note', 'n2', false)
  c.key(1, 0, 'a', 'note', 'n1', true)
  c.text(1, 2, 'alpha', 'note', 'n1')
  const [br, bc, tc, b] = shared ? [1, 12, 14, 'beta'] : [3, 0, 2, '设计']
  c.text(2, tc, 'tail', 'note', 'n1', ' ')
  c.key(br, bc, 'b', 'note', 'n2', true)
  c.text(br, bc + 2, b, 'note', 'n2')
  return c.toDrawing({
    labels: [
      { owner: 'n1', text: 'alpha tail' },
      { owner: 'n2', text: b },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
    keys: K,
    keyable: [
      { item: 'n1', cls: 'note' },
      { item: 'n2', cls: 'note' },
    ],
  })
}

test("A5.mutation-tests: a legend key is its row's first drawn cell, so a row holds one entry, else key-unbound", () => {
  assert.deepEqual(validate(oneRow(true)), { reason: 'key-unbound' })
  assert.equal(validate(oneRow(false)), null) // tail reads as beta's; then CJK below
})
test('A5.mutation-tests: a class is keyed all or none by item and class, so keying an item in another class fails key-partial', () => {
  const kn = [
    { item: 'n1', cls: 'note' },
    { item: 'n2', cls: 'note' },
    { item: 'n2', cls: 'label' },
  ]
  // n2 keyed as a label, not as a note
  assert.deepEqual(validate(classed([K[0]!, { ...K[1]!, cls: 'label' }], kn)), { reason: 'key-partial' })
})
