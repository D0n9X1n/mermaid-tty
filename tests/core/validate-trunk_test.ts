import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'
import { falsePairs, text } from './graph-fixture.ts'

// A complete-bipartite trunk, A→C, A→D, B→C and B→D merged into one line down column 2, crossed straight at (2,2) by an
// unrelated P→Q. The trunk's own unrelated pairs there (A→C with B→D, A→D with B→C) run one axis, as a trunk's do;
// merges judges them. Only pairs from different lines, the trunk's and P→Q's, must cross.
//   a ─┬─ b
//   p ─┼─►q
//     ┌┴┐  (to c and d)
function bipartite(): Drawing {
  const ends: Record<string, [string, string]> = {
    e1: ['A', 'C'],
    e2: ['A', 'D'],
    e3: ['B', 'C'],
    e4: ['B', 'D'],
    f: ['P', 'Q'],
  }
  const c = createCanvas(7, 6, 6, (a, b) => ends[a]!.some((x) => ends[b]!.includes(x)))
  const L = (r: number, col: number, dirs: number, ids: string[]) =>
    ids.forEach((id) => c.line(r, col, dirs, 'light', 'edge', id))
  for (const [id, r, col] of [
    ['A', 0, 0],
    ['B', 0, 4],
    ['P', 2, 0],
    ['Q', 2, 5],
    ['C', 6, 0],
    ['D', 6, 4],
  ] as const) {
    c.text(r, col, id.toLowerCase(), 'node', id)
  }

  L(1, 0, 3, ['e1', 'e2'])
  L(1, 1, 10, ['e1', 'e2'])
  L(1, 2, 12, ['e1', 'e2'])
  L(1, 2, 6, ['e3', 'e4'])
  L(1, 3, 10, ['e3', 'e4'])
  L(1, 4, 9, ['e3', 'e4'])
  L(2, 2, 5, ['e1', 'e2', 'e3', 'e4'])
  L(3, 2, 5, ['e1', 'e2', 'e3', 'e4'])
  L(4, 2, 9, ['e1', 'e3'])
  L(4, 2, 3, ['e2', 'e4'])
  L(4, 1, 10, ['e1', 'e3'])
  L(4, 0, 6, ['e1', 'e3'])
  L(4, 3, 10, ['e2', 'e4'])
  L(4, 4, 12, ['e2', 'e4'])
  for (const id of ['e1', 'e3']) {
    c.arrow(5, 0, '▼', id)
  }

  for (const id of ['e2', 'e4']) {
    c.arrow(5, 4, '▼', id)
  }

  L(2, 1, 10, ['f'])
  L(2, 2, 10, ['f'])
  L(2, 3, 10, ['f'])
  c.arrow(2, 4, '►', 'f')
  const node = (n: string) => ({ node: n, glyph: n === 'Q' ? '►' : '▼' })
  return c.toDrawing({
    labels: ['A', 'B', 'C', 'D', 'P', 'Q'].map((o) => ({ owner: o, text: o.toLowerCase() })),
    edges: Object.entries(ends).map(([id, [from, to]]) => ({ id, from, to, ends: [node(to)] })),
    edgeLabels: [],
    frames: [],
  })
}

test('A complete-bipartite trunk crossed straight by an unrelated edge passes', () => {
  const d = bipartite()
  assert.deepEqual(d.conflicts, [])
  assert.equal(text(d)[2], 'p─┼─►q')
  assert.equal(validate(d), null, text(d).join('\n'))
})
// A trunk edge that turns inside that ┼ instead, onto P→Q's arm, joins the two lines there: read as one line, P's bare
// tail
// seems to lead to c and d, so it still fails, now for merges to judge.
test('At that crossing, a trunk edge turning onto the crossing edge still fails', () => {
  const d = bipartite()
  const x = d.cells[2]![2]!
  // e1 turns right inside the ┼
  d.cells[2]![2] = { ...x, segs: x.segs!.map((s) => (s.owner === 'e1' ? { ...s, dirs: 6 } : s)) }
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
})

// The same trunk with mixed heads. B--xD's x head, on one line with A-->D's ▶, reads as A--xD too, and A-->D's as
// B-->D; neither is in the source, so the trunk must not pass. Each path runs through its corners, from its source's
// cell to its target's, its head the cell just before the target.
function STEP(a: { r: number; c: number }, b: { r: number; c: number }): number {
  if (b.r < a.r) {
    return 1
  }

  if (b.c > a.c) {
    return 2
  }

  return b.r > a.r ? 4 : 8
}

function drawPath(c: Canvas, id: string, corners: [number, number][], head: string): void {
  const cells: { r: number; c: number }[] = []
  for (const [i, [r, col]] of corners.entries()) {
    if (i === 0) {
      cells.push({ r, c: col })
      continue
    }

    const [r0, c0] = corners[i - 1]!
    for (let k = 1; k <= Math.abs(r - r0) + Math.abs(col - c0); k++) {
      cells.push({ r: r0 + Math.sign(r - r0) * k, c: c0 + Math.sign(col - c0) * k })
    }
  }

  for (let i = 1; i < cells.length - 2; i++) {
    c.line(
      cells[i]!.r,
      cells[i]!.c,
      STEP(cells[i]!, cells[i - 1]!) | STEP(cells[i]!, cells[i + 1]!),
      'light',
      'edge',
      id,
    )
  }

  const h = cells.at(-2)!
  c.arrow(h.r, h.c, head, id)
}

function mixedHeads(): Drawing {
  const c = createCanvas(7, 8, 8, () => true)
  for (const [id, r, col] of [
    ['A', 0, 0],
    ['B', 0, 4],
    ['P', 2, 0],
    ['Q', 2, 7],
    ['C', 6, 0],
    ['D', 6, 4],
  ] as const) {
    c.text(r, col, id.toLowerCase(), 'node', id)
  }

  drawPath(
    c,
    'AC',
    [
      [0, 0],
      [1, 0],
      [1, 2],
      [4, 2],
      [4, 0],
      [6, 0],
    ],
    '▼',
  )
  drawPath(
    c,
    'AD',
    [
      [0, 0],
      [1, 0],
      [1, 2],
      [6, 2],
      [6, 4],
    ],
    '►',
  )
  drawPath(
    c,
    'BC',
    [
      [0, 4],
      [1, 4],
      [1, 2],
      [4, 2],
      [4, 0],
      [6, 0],
    ],
    '▼',
  )
  drawPath(
    c,
    'BD',
    [
      [0, 4],
      [1, 4],
      [1, 2],
      [4, 2],
      [4, 4],
      [6, 4],
    ],
    'x',
  )
  drawPath(
    c,
    'PQ',
    [
      [2, 0],
      [2, 7],
    ],
    '►',
  )
  const e = (id: string, from: string, to: string, glyph: string) => ({ id, from, to, ends: [{ node: to, glyph }] })
  return c.toDrawing({
    labels: ['A', 'B', 'C', 'D', 'P', 'Q'].map((o) => ({ owner: o, text: o.toLowerCase() })),
    edges: [
      e('AC', 'A', 'C', '▼'),
      e('AD', 'A', 'D', '►'),
      e('BC', 'B', 'C', '▼'),
      e('BD', 'B', 'D', 'x'),
      e('PQ', 'P', 'Q', '►'),
    ],
    edgeLabels: [],
    frames: [],
  })
}

test('A trunk whose heads differ implies links the source lacks, and fails merge-ambiguous', () => {
  const d = mixedHeads()
  assert.deepEqual(falsePairs(d), ['A-xD', 'B->D'], text(d).join('\n'))
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})
// The same trunk with B-->D dotted instead: its own cells ┄ beside the trunk's solid ones read as the merged line
// changing style, so any of its implied links may be dotted or solid. One line draws one style.
test('A trunk whose edges draw different line styles fails merge-ambiguous', () => {
  const c = createCanvas(7, 8, 8, () => true)
  for (const [id, r, col] of [
    ['A', 0, 0],
    ['B', 0, 4],
    ['P', 2, 0],
    ['Q', 2, 7],
    ['C', 6, 0],
    ['D', 6, 4],
  ] as const) {
    c.text(r, col, id.toLowerCase(), 'node', id)
  }

  drawPath(
    c,
    'AC',
    [
      [0, 0],
      [1, 0],
      [1, 2],
      [4, 2],
      [4, 0],
      [6, 0],
    ],
    '▼',
  )
  drawPath(
    c,
    'AD',
    [
      [0, 0],
      [1, 0],
      [1, 2],
      [6, 2],
      [6, 4],
    ],
    '►',
  )
  drawPath(
    c,
    'BC',
    [
      [0, 4],
      [1, 4],
      [1, 2],
      [4, 2],
      [4, 0],
      [6, 0],
    ],
    '▼',
  )
  drawPath(
    c,
    'PQ',
    [
      [2, 0],
      [2, 7],
    ],
    '►',
  )
  c.line(4, 3, 10, 'dotted', 'edge', 'BD')
  c.line(4, 4, 12, 'dotted', 'edge', 'BD')
  c.arrow(5, 4, '▼', 'BD')
  for (const [r, col, dirs] of [
    [1, 4, 9],
    [1, 3, 10],
    [1, 2, 6],
    [2, 2, 5],
    [3, 2, 5],
    [4, 2, 3],
  ] as const) {
    c.line(r, col, dirs, 'light', 'edge', 'BD')
  }

  const e = (id: string, from: string, to: string, glyph: string) => ({ id, from, to, ends: [{ node: to, glyph }] })
  const d = c.toDrawing({
    labels: ['A', 'B', 'C', 'D', 'P', 'Q'].map((o) => ({ owner: o, text: o.toLowerCase() })),
    edges: [
      e('AC', 'A', 'C', '▼'),
      e('AD', 'A', 'D', '►'),
      e('BC', 'B', 'C', '▼'),
      e('BD', 'B', 'D', '▼'),
      e('PQ', 'P', 'Q', '►'),
    ],
    edgeLabels: [],
    frames: [],
  })
  assert.deepEqual(d.conflicts, [])
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})

// A self-loop needs the head kind too. A-->B and B-->A share column 3; read as one line, A's bare end leads to B-->A's
// ▶ at A (A->A) and B's to A-->B's at B (B->B). The loops at A and B are --x and --o, so neither pair is in the source.
test('A merged line implying a self-loop whose head the loop lacks fails merge-ambiguous', () => {
  const c = createCanvas(14, 8, 8, () => true)
  c.text(3, 3, 'a', 'node', 'A')
  c.text(11, 3, 'b', 'node', 'B')
  drawPath(
    c,
    'AB',
    [
      [3, 3],
      [11, 3],
    ],
    '▼',
  )
  drawPath(
    c,
    'BA',
    [
      [11, 3],
      [11, 4],
      [8, 4],
      [8, 3],
      [6, 3],
      [6, 6],
      [3, 6],
      [3, 3],
    ],
    '◄',
  )
  drawPath(
    c,
    'AA',
    [
      [3, 3],
      [0, 3],
      [0, 0],
      [3, 0],
      [3, 3],
    ],
    'x',
  )
  drawPath(
    c,
    'BB',
    [
      [11, 3],
      [13, 3],
      [13, 0],
      [11, 0],
      [11, 3],
    ],
    'o',
  )
  const e = (id: string, from: string, to: string, glyph: string) => ({ id, from, to, ends: [{ node: to, glyph }] })
  const d = c.toDrawing({
    labels: [
      { owner: 'A', text: 'a' },
      { owner: 'B', text: 'b' },
    ],
    edges: [e('AB', 'A', 'B', '▼'), e('BA', 'B', 'A', '◄'), e('AA', 'A', 'A', 'x'), e('BB', 'B', 'B', 'o')],
    edgeLabels: [],
    frames: [],
  })
  assert.deepEqual(d.conflicts, [])
  assert.deepEqual(falsePairs(d), ['A->A', 'B->B'], text(d).join('\n'))
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})
// Hole 2: one edge draws one weight in every arm, not just one cell style. A-->C leaves A-->B's light stem at (0,2)
// with a heavy arm down, ┰, then runs on light: style 'light' everywhere, but the junction shows a thick branch. Its
// glyph shows a weight its edge does not draw, so it fails line-glyph.
test('A merged junction with a heavy arm on a light line fails line-glyph', () => {
  const c = createCanvas(4, 6, 6, () => true)
  c.text(0, 0, 'a', 'node', 'A')
  c.text(0, 5, 'b', 'node', 'B')
  c.text(3, 2, 'c', 'node', 'C')
  for (const col of [1, 2, 3]) {
    c.line(0, col, 10, 'light', 'edge', 'AB')
  }

  c.arrow(0, 4, '►', 'AB')
  c.line(0, 1, 10, 'light', 'edge', 'AC')
  c.line(0, 2, 8, 'light', 'edge', 'AC')
  c.line(0, 2, 4, 'heavy', 'edge', 'AC')
  c.line(1, 2, 5, 'light', 'edge', 'AC')
  c.arrow(2, 2, '▼', 'AC')
  const d = c.toDrawing({
    labels: [
      { owner: 'A', text: 'a' },
      { owner: 'B', text: 'b' },
      { owner: 'C', text: 'c' },
    ],
    edges: [
      { id: 'AB', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '►' }] },
      { id: 'AC', from: 'A', to: 'C', ends: [{ node: 'C', glyph: '▼' }] },
    ],
    edgeLabels: [],
    frames: [],
  })
  assert.deepEqual(d.conflicts, [])
  assert.equal(text(d)[0], 'a─┰─►b')
  assert.equal(validate(d)?.reason, 'line-glyph', text(d).join('\n'))
})
