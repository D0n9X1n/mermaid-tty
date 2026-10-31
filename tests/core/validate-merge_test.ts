import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'
import { explain } from '../../core/render.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { layoutGraph } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Graph } from '../../core/graph/model.ts'
import { falsePairs, text } from './graph-fixture.ts'
import { fork, path } from './validate-fixture.ts'

// The pipeline at explain's natural step: rankGap 3, nodeGap 4, no wrap, 80 columns.
function drawn(gr: Graph): Drawing {
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null })
  if ('reason' in p) {
    throw new Error(p.reason)
  }

  const routes = routeGraph(p)
  if ('reason' in routes) {
    throw new Error(routes.reason)
  }

  return drawGraph(p, routes, 80)
}
// QA's repro: the ┼ under B holds B→D straight down, E's self-loop straight across, and B→E turning inside it, so the ┼
// joins all three, and the loop's bare end at E seems to lead to D.
test('A5.mutation-tests: a crossing that hides a third edge turning inside it joins all three and fails merge-ambiguous', () => {
  const c = createCanvas(8, 8, 80, () => true)
  c.text(0, 3, 'B', 'node', 'B')
  c.text(6, 3, 'D', 'node', 'D')
  c.text(3, 7, 'E', 'node', 'E')
  for (let r = 1; r <= 4; r++) {
    c.line(r, 3, 5, 'light', 'edge', 'B>D')
  }

  c.arrow(5, 3, '▼', 'B>D')
  for (let r = 4; r <= 6; r++) {
    c.line(r, 7, 5, 'light', 'edge', 'E>E')
    c.line(r, 0, 5, 'light', 'edge', 'E>E')
  }

  c.line(7, 7, 9, 'light', 'edge', 'E>E')
  for (let col = 1; col <= 6; col++) {
    c.line(7, col, 10, 'light', 'edge', 'E>E')
  }

  c.line(7, 0, 3, 'light', 'edge', 'E>E')
  c.line(3, 0, 6, 'light', 'edge', 'E>E')
  for (let col = 1; col <= 5; col++) {
    c.line(3, col, 10, 'light', 'edge', 'E>E')
  }

  c.arrow(3, 6, '►', 'E>E')
  c.line(1, 3, 5, 'light', 'edge', 'B>E')
  c.line(2, 3, 5, 'light', 'edge', 'B>E')
  c.line(3, 3, 3, 'light', 'edge', 'B>E')
  c.line(3, 4, 10, 'light', 'edge', 'B>E')
  c.line(3, 5, 10, 'light', 'edge', 'B>E')
  c.arrow(3, 6, '►', 'B>E')
  const d = c.toDrawing({
    labels: ['B', 'D', 'E'].map((owner) => ({ owner, text: owner })),
    edgeLabels: [],
    edges: [
      { id: 'B>D', from: 'B', to: 'D', ends: [{ node: 'D', glyph: '▼' }] },
      { id: 'E>E', from: 'E', to: 'E', ends: [{ node: 'E', glyph: '►' }] },
      { id: 'B>E', from: 'B', to: 'E', ends: [{ node: 'E', glyph: '►' }] },
    ],
  })
  assert.deepEqual(d.cells[3]![3]!.segs, [
    { owner: 'B>D', dirs: 5 },
    { owner: 'E>E', dirs: 10 },
    { owner: 'B>E', dirs: 3 },
  ])
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})
// A hand-drawn grid: nodes [id, row, col, owners?] drawn as their id; marks [edge, row, col, a line's dirs or a head
// glyph]; edges 'id from to head?'. Any two owners may merge a line or arrow cell, so only the validator judges a
// meeting.
type Mark = [string, number, number, number | string]
const v = (o: string, c: number, r0: number, r1: number): Mark[] =>
  Array.from({ length: r1 - r0 + 1 }, (_, i) => [o, r0 + i, c, 5])
const h = (o: string, r: number, c0: number, c1: number): Mark[] =>
  Array.from({ length: c1 - c0 + 1 }, (_, i) => [o, r, c0 + i, 10])
function sketch(
  rows: number,
  cols: number,
  nodes: [string, number, number, string[]?][],
  marks: Mark[],
  edges: string[],
): Drawing {
  const c = createCanvas(rows, cols, cols, () => true)
  for (const [id, r, col, owners] of nodes) {
    c.text(r, col, id, 'node', owners ?? id)
  }

  for (const [o, r, col, x] of marks) {
    if (typeof x === 'number') {
      c.line(r, col, x, 'light', 'edge', o)
    } else {
      c.arrow(r, col, x, o)
    }
  }

  return c.toDrawing({
    labels: nodes.map(([id]) => ({ owner: id, text: id })),
    edgeLabels: [],
    frames: [],
    edges: edges.map((s) => {
      const [id = '', from = '', to = '', head] = s.split(' ')
      return { id, from, to, ends: head ? [{ node: to, glyph: head }] : [] }
    }),
  })
}

test('A5.mutation-tests: unrelated edges cross straight and perpendicular, and related edges meet any way, and both pass', () => {
  // ┼: A→B down column 3 crosses C→D along row 3.
  assert.equal(
    validate(
      sketch(
        7,
        7,
        [
          ['A', 0, 3],
          ['B', 6, 3],
          ['C', 3, 0],
          ['D', 3, 6],
        ],
        [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']],
        ['e0 A B ▼', 'e1 C D ►'],
      ),
    ),
    null,
  )
  // ┬: A→B and A→C leave A together, and A→C turns down at the fork.
  assert.equal(
    validate(
      sketch(
        4,
        6,
        [
          ['A', 0, 0],
          ['B', 0, 5],
          ['C', 3, 2],
        ],
        [
          ...h('e0', 0, 1, 3),
          ['e0', 0, 4, '►'],
          ['e1', 0, 1, 10],
          ['e1', 0, 2, 12],
          ['e1', 1, 2, 5],
          ['e1', 2, 2, '▼'],
        ],
        ['e0 A B ►', 'e1 A C ▼'],
      ),
    ),
    null,
  )
  // A→B and A→C share row 2 until A→C turns at ┬, and X→Y crosses their shared run at column 2.
  assert.equal(
    validate(
      sketch(
        6,
        8,
        [
          ['A', 2, 0],
          ['B', 2, 7],
          ['C', 5, 4],
          ['X', 0, 2],
          ['Y', 5, 2],
        ],
        [
          ...h('e0', 2, 1, 5),
          ['e0', 2, 6, '►'],
          ...h('e1', 2, 1, 3),
          ['e1', 2, 4, 12],
          ['e1', 3, 4, 5],
          ['e1', 4, 4, '▼'],
          ...v('e2', 2, 1, 3),
          ['e2', 4, 2, '▼'],
        ],
        ['e0 A B ►', 'e1 A C ▼', 'e2 X Y ▼'],
      ),
    ),
    null,
  )
})
test('A5.mutation-tests: unrelated edges overlapping on one axis, or any turn inside their crossing, join and fail merge-ambiguous', () => {
  // N→B and member row M→K drawn down one column as one line: each runs straight, but on the same axis, so N seems to
  // lead to K.
  assert.equal(
    validate(
      sketch(
        7,
        1,
        [
          ['N', 0, 0],
          ['M', 1, 0, ['M', 'N']],
          ['K', 5, 0, ['K', 'B']],
          ['B', 6, 0],
        ],
        [...v('e0', 0, 2, 3), ['e0', 4, 0, '▼'], ...v('e1', 0, 2, 3), ['e1', 4, 0, '▼']],
        ['e0 N B ▼', 'e1 M K ▼'],
      ),
    )?.reason,
    'merge-ambiguous',
  )
  // B→D crosses X→Y straight, and B→Y, related to both, turns inside their ┼ onto X→Y's run, so all three join: X seems
  // to
  // lead to D.
  assert.equal(
    validate(
      sketch(
        6,
        8,
        [
          ['B', 0, 3],
          ['D', 5, 3],
          ['X', 2, 0],
          ['Y', 2, 7],
        ],
        [
          ...v('e0', 3, 1, 3),
          ['e0', 4, 3, '▼'],
          ['e1', 1, 3, 5],
          ['e1', 2, 3, 3],
          ...h('e1', 2, 4, 5),
          ['e1', 2, 6, '►'],
          ...h('e2', 2, 1, 5),
          ['e2', 2, 6, '►'],
        ],
        ['e0 B D ▼', 'e1 B Y ►', 'e2 X Y ►'],
      ),
    )?.reason,
    'merge-ambiguous',
  )
})
// C→D's middle cell drawn ─, or ┴ with an arm up at A→B's ►: an arrowhead ends only its own edges, so that arm dangles.
test("A3: a line arm that points at another edge's arrowhead fails line-dangling", () => {
  const d = (mid: number) =>
    sketch(
      2,
      6,
      [
        ['A', 0, 0],
        ['B', 0, 3],
        ['C', 1, 0],
        ['D', 1, 5],
      ],
      [
        ['e0', 0, 1, 10],
        ['e0', 0, 2, '►'],
        ['e1', 1, 1, 10],
        ['e1', 1, 2, mid],
        ['e1', 1, 3, 10],
        ['e1', 1, 4, '►'],
      ],
      ['e0 A B ►', 'e1 C D ►'],
    )
  assert.equal(validate(d(10)), null)
  assert.equal(validate(d(11))?.reason, 'line-dangling')
})
// dag/114's shape: A→B leaves A down, U-turns right and up into B, and C→D crosses both legs in adjacent cells. Each ┼
// is a
// straight crossing, yet its neighbour ┼ points back at A→B a third time: only the dirs each edge drew there tell them
// apart.
test('A5.mutation-tests: an edge crossed twice in adjacent cells, as its U-turn straddles another edge, passes', () => {
  assert.equal(
    validate(
      sketch(
        5,
        7,
        [
          ['A', 0, 2],
          ['B', 0, 3],
          ['C', 3, 0],
          ['D', 3, 6],
        ],
        [
          ...v('e0', 2, 1, 3),
          ['e0', 4, 2, 3],
          ['e0', 4, 3, 9],
          ...v('e0', 3, 2, 3),
          ['e0', 1, 3, '▲'],
          ...h('e1', 3, 1, 4),
          ['e1', 3, 5, '►'],
        ],
        ['e0 A B ▲', 'e1 C D ►'],
      ),
    ),
    null,
  )
})
// A plain ┼ whose cell does not say which dirs each edge drew there, as a hand-built cell may not, joins its edges, so
// it
// fails closed: A seems to lead to D.
test('A5.mutation-tests: a crossing cell without per-owner dirs joins its edges and fails merge-ambiguous', () => {
  const d = sketch(
    7,
    7,
    [
      ['A', 0, 3],
      ['B', 6, 3],
      ['C', 3, 0],
      ['D', 3, 6],
    ],
    [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']],
    ['e0 A B ▼', 'e1 C D ►'],
  )
  assert.equal(validate(d), null)
  delete d.cells[3]![3]!.segs
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
})

// merge-ambiguous: edges whose drawn lines join read as one line, so each end without a mark seems to lead to each head
// on it. A merge that implies an edge the drawing does not have fails, by explain at 80 columns and on hand-built
// grids.
const verdict = (src: string) => {
  const r = explain(src, { columns: 80, theme: 'mono' })
  return 'reason' in r ? r.reason : null
}
test('merge-ambiguous: QA repros render after the router separates unsafe merges', () => {
  assert.equal(verdict('flowchart TB\nA --> B\nA --> C\nD --> B'), null)
  assert.equal(verdict('flowchart TB\nA --> C\nB <--> C'), null)
})
test('merge-ambiguous: fan-out, fan-in, complete bipartite, a self-loop, a two-headed edge and open links still draw', () => {
  for (const src of [
    'A --> B\nA --> C',
    'A --> C\nB --> C',
    'A & B --> C & D',
    'A --> A',
    'A <--> B',
    'A --- B\nA --- C',
  ]) {
    assert.equal(verdict(`flowchart TB\n${src}`), null, src)
  }
})
// sketch, with each edge 'id from to' then its end marks, each its node and glyph: 'e1 B C C▼ B▲'.
function marked(
  rows: number,
  cols: number,
  nodes: [string, number, number][],
  marks: Mark[],
  edges: string[],
): Drawing {
  const d = sketch(rows, cols, nodes, marks, [])
  d.expect = {
    ...d.expect,
    edges: edges.map((s) => {
      const [id = '', from = '', to = '', ...ends] = s.split(' ')
      return { id, from, to, ends: ends.map((x) => ({ node: x[0]!, glyph: x.slice(1) })) }
    }),
  }
  return d
}
// Repro 1: A→C (e0) down column 0; A→B (e1) leaves it at ├ for ┤ and B's stem; D→B (e2) down that stem into B's ▼.
const m1: Mark[] = [
  ...v('e0', 0, 1, 3),
  ['e0', 4, 0, '▼'],
  ['e1', 1, 0, 5],
  ['e1', 2, 0, 3],
  ...h('e1', 2, 1, 2),
  ['e1', 2, 3, 12],
  ['e1', 3, 3, 5],
  ['e1', 4, 3, '▼'],
  ...v('e2', 3, 1, 3),
  ['e2', 4, 3, '▼'],
]
const merge1 = (keep: string[]) =>
  marked(
    6,
    4,
    [
      ['A', 0, 0],
      ['D', 0, 3],
      ['C', 5, 0],
      ['B', 5, 3],
    ],
    m1.filter((m) => keep.includes(m[0])),
    ['e0 A C C▼', 'e1 A B B▼', 'e2 D B B▼'].filter((s) => keep.includes(s.slice(0, 2))),
  )
// Repro 2: A→C (e0) turns at └ and joins C's stem at ┬; B's edge e1 leaves B at ▲ or │, turns at ┘ and runs into the ┬.
const merge2 = (twoHeaded: boolean) =>
  marked(
    6,
    4,
    [
      ['A', 0, 0],
      ['B', 0, 3],
      ['C', 5, 1],
    ],
    [
      ['e0', 1, 0, 5],
      ['e0', 2, 0, 3],
      ['e0', 2, 1, 12],
      ['e0', 3, 1, 5],
      ['e0', 4, 1, '▼'],
      ['e1', 1, 3, twoHeaded ? '▲' : 5],
      ['e1', 2, 3, 9],
      ['e1', 2, 2, 10],
      ['e1', 2, 1, 6],
      ['e1', 3, 1, 5],
      ['e1', 4, 1, '▼'],
    ],
    ['e0 A C C▼', `e1 B C C▼${twoHeaded ? ' B▲' : ''}`],
  )
// Open link B --- A (e1) runs from B along row 2 into A→C's (e0) stem at ├.
const merge3 = () =>
  marked(
    6,
    4,
    [
      ['A', 0, 0],
      ['B', 0, 3],
      ['C', 5, 0],
    ],
    [
      ...v('e0', 0, 1, 3),
      ['e0', 4, 0, '▼'],
      ['e1', 1, 3, 5],
      ['e1', 2, 3, 9],
      ...h('e1', 2, 1, 2),
      ['e1', 2, 0, 3],
      ['e1', 1, 0, 5],
    ],
    ['e0 A C C▼', 'e1 B A'],
  )
test('merge-ambiguous: a hand-built merge fails when an unmarked end reaches a head it has no edge to, and passes otherwise', () => {
  assert.equal(validate(merge1(['e0', 'e1', 'e2']))?.reason, 'merge-ambiguous') // D seems to lead to C
  assert.equal(validate(merge1(['e0', 'e1'])), null) // a fan-out on A's stem
  assert.equal(validate(merge1(['e1', 'e2'])), null) // a fan-in on B's stem and head
  assert.equal(validate(merge2(true))?.reason, 'merge-ambiguous') // A seems to lead to B
  assert.equal(validate(merge2(false)), null) // B→C: a fan-in
  assert.equal(validate(merge3())?.reason, 'merge-ambiguous') // B seems to lead to C
  assert.equal(validate(fork()), null)
  // ┼: A→B down column 3 crosses C→D along row 3; their own dirs there share no arm, so the lines do not join.
  assert.equal(
    validate(
      sketch(
        7,
        7,
        [
          ['A', 0, 3],
          ['B', 6, 3],
          ['C', 3, 0],
          ['D', 3, 6],
        ],
        [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']],
        ['e0 A B ▼', 'e1 C D ►'],
      ),
    ),
    null,
  )
})
// P→Q (e0) down column 0, and Q→R (e1) leaving Q's side to run up e0's line from ├ to ├ before it turns off to R. With
// P<-->Q,
// Q's bare end reaches Q's own ▼: a loop Q→Q that is not there. With e0 drawn reversed, only P's ▲, it reaches P's ▲,
// real as
// e0 drawn back, and R's ▲, real as e1.
const pq = (twoHeaded: boolean) =>
  marked(
    9,
    3,
    [
      ['P', 0, 0],
      ['R', 0, 2],
      ['Q', 8, 0],
    ],
    [
      ['e0', 1, 0, '▲'],
      ...v('e0', 0, 2, 6),
      ['e0', 7, 0, twoHeaded ? '▼' : 5],
      ['e1', 8, 1, 9],
      ...v('e1', 1, 6, 7),
      ['e1', 5, 1, 12],
      ['e1', 5, 0, 3],
      ['e1', 4, 0, 5],
      ['e1', 3, 0, 6],
      ['e1', 3, 1, 10],
      ['e1', 3, 2, 9],
      ['e1', 2, 2, 5],
      ['e1', 1, 2, '▲'],
    ],
    [`e0 P Q P▲${twoHeaded ? ' Q▼' : ''}`, 'e1 Q R R▲'],
  )
test('merge-ambiguous: a bare end merged into a line may lead to a node that line marks, but not back to its own node', () => {
  assert.equal(validate(pq(true))?.reason, 'merge-ambiguous')
  assert.equal(validate(pq(false)), null)
})

// QA's fix-cycle repros, hand-built with heads beside their targets.
// 1: A→B (e0) turns right at the ┼ (3,3) and B→C (e1) turns left there, by segs 3 and 12: no arm in common, but the ┼
// shows
// all four arms joined, so A seems to lead to C. Straight through the same ┼, A→B and C→D cross.
test('merge-ambiguous: edges that turn inside one ┼ join by its glyph, though their own dirs share no arm', () => {
  const d = marked(
    6,
    7,
    [
      ['A', 0, 3],
      ['B', 3, 6],
      ['C', 3, 0],
    ],
    [
      ...v('e0', 3, 1, 2),
      ['e0', 3, 3, 3],
      ['e0', 3, 4, 10],
      ['e0', 3, 5, '►'],
      ['e1', 4, 6, 5],
      ['e1', 5, 6, 9],
      ...h('e1', 5, 4, 5),
      ['e1', 5, 3, 3],
      ['e1', 4, 3, 5],
      ['e1', 3, 3, 12],
      ['e1', 3, 2, 10],
      ['e1', 3, 1, '◄'],
    ],
    ['e0 A B B►', 'e1 B C C◄'],
  )
  assert.deepEqual(d.cells[3]![3]!.segs, [
    { owner: 'e0', dirs: 3 },
    { owner: 'e1', dirs: 12 },
  ])
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
  assert.equal(
    validate(
      sketch(
        7,
        7,
        [
          ['A', 0, 3],
          ['B', 6, 3],
          ['C', 3, 0],
          ['D', 3, 6],
        ],
        [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']],
        ['e0 A B ▼', 'e1 C D ►'],
      ),
    ),
    null,
  )
})
// 2: A→B (e0) down column 0, and B→A (e1) up column 1, along e0's trunk from ├ to ├ and round into A's ◄: the trunk
// seems
// to lead A to A and B to B, loops that are not there. Up column 2 instead, apart from e0, it implies nothing.
const shared2: Mark[] = [
  ['e1', 8, 1, 9],
  ...v('e1', 1, 6, 7),
  ['e1', 5, 1, 12],
  ['e1', 5, 0, 3],
  ['e1', 4, 0, 5],
  ['e1', 3, 0, 6],
  ['e1', 3, 1, 10],
  ['e1', 3, 2, 9],
]
const apart2: Mark[] = [['e1', 8, 1, 10], ['e1', 8, 2, 9], ...v('e1', 2, 3, 7)]
const twoWay = (route: Mark[]) =>
  marked(
    9,
    3,
    [
      ['A', 0, 0],
      ['B', 8, 0],
    ],
    [...v('e0', 0, 1, 6), ['e0', 7, 0, '▼'], ...route, ...v('e1', 2, 1, 2), ['e1', 0, 2, 12], ['e1', 0, 1, '◄']],
    ['e0 A B B▼', 'e1 B A A◄'],
  )
test('merge-ambiguous: a trunk that A→B and B→A share implies the self-loops A→A and B→B', () => {
  assert.equal(validate(twoWay(shared2))?.reason, 'merge-ambiguous')
  assert.equal(validate(twoWay(apart2)), null)
})
// 3: A, B over C, D: each edge runs down from its source, along row 3 into the trunk down column 3, along row 7 and
// down into its target's ▼, which it shares. Every pair the trunk implies is an edge, though two pairs of edges share
// no endpoint; with B→C gone, B seems to lead to C.
const trunk = (ids: string[]) =>
  marked(
    11,
    7,
    [
      ['A', 0, 0],
      ['B', 0, 6],
      ['C', 10, 0],
      ['D', 10, 6],
    ],
    ids.flatMap((id): Mark[] => {
      const s = id[0] === 'A' ? 0 : 6
      const t = id[1] === 'C' ? 0 : 6
      return [
        ...v(id, s, 1, 2),
        [id, 3, s, s ? 9 : 3],
        ...h(id, 3, Math.min(s, 3) + 1, Math.max(s, 3) - 1),
        [id, 3, 3, s ? 6 : 12],
        ...v(id, 3, 4, 6),
        [id, 7, 3, t ? 3 : 9],
        ...h(id, 7, Math.min(t, 3) + 1, Math.max(t, 3) - 1),
        [id, 7, t, t ? 12 : 6],
        [id, 8, t, 5],
        [id, 9, t, '▼'],
      ]
    }),
    ids.map((id) => `${id} ${id[0]} ${id[1]} ${id[1]}▼`),
  )
test('merge-ambiguous: a complete bipartite trunk passes, as crossings leave a cell whose edges all join to merges', () => {
  assert.equal(validate(trunk(['AC', 'AD', 'BC', 'BD'])), null)
  assert.equal(validate(trunk(['AC', 'AD', 'BD']))?.reason, 'merge-ambiguous')
})
// 4: A→C (e0) from the left and B's edge e1 from the right meet only in C's ▼. As B<-->C, A seems to lead to B; as B→C,
// the two make a fan-in.
const arrowOnly = (twoHeaded: boolean) =>
  marked(
    4,
    5,
    [
      ['A', 0, 0],
      ['B', 0, 4],
      ['C', 3, 2],
    ],
    [
      ['e0', 1, 0, 5],
      ['e0', 2, 0, 3],
      ['e0', 2, 1, 10],
      ['e0', 2, 2, '▼'],
      ['e1', 1, 4, twoHeaded ? '▲' : 5],
      ['e1', 2, 4, 9],
      ['e1', 2, 3, 10],
      ['e1', 2, 2, '▼'],
    ],
    ['e0 A C C▼', `e1 B C C▼${twoHeaded ? ' B▲' : ''}`],
  )
test('merge-ambiguous: edges that share only an arrowhead join there', () => {
  assert.equal(validate(arrowOnly(true))?.reason, 'merge-ambiguous')
  assert.equal(validate(arrowOnly(false)), null)
})
// A self-loop A→A (e1) leaves A down the stem of A→B (e0), turns right at ├ and up into A's ◄: A's bare ends reach B's
// ▼,
// real as A→B, and the loop's ◄, real as the loop.
const loopFan = (ids: string[]) =>
  marked(
    6,
    2,
    [
      ['A', 0, 0],
      ['B', 5, 0],
    ],
    (
      [
        ...v('e0', 0, 1, 3),
        ['e0', 4, 0, '▼'],
        ['e1', 1, 0, 5],
        ['e1', 2, 0, 3],
        ['e1', 2, 1, 9],
        ['e1', 1, 1, 5],
        ['e1', 0, 1, '◄'],
      ] as Mark[]
    ).filter((m) => ids.includes(m[0])),
    ['e0 A B B▼', 'e1 A A A◄'].filter((s) => ids.includes(s.slice(0, 2))),
  )
test('merge-ambiguous: an honest self-loop, alone or on a stem it shares, and a lone A<-->B pass', () => {
  assert.equal(validate(loopFan(['e1'])), null)
  assert.equal(validate(loopFan(['e0', 'e1'])), null)
  assert.equal(validate(path(['▲', 5, '▼'], ['A▲', 'B▼'])), null)
})
// Unmarked edges joined in one line show no direction, so each end seems to lead to every other: only edges that all
// leave
// one node, or all enter one, read true. A and B over C: e0 from A and e1 from B meet at ┬ and run down one stem into
// C.
const open = (edges: string[]) =>
  sketch(
    4,
    5,
    [
      ['A', 0, 0],
      ['B', 0, 4],
      ['C', 3, 2],
    ],
    [
      ['e0', 1, 0, 5],
      ['e0', 2, 0, 3],
      ['e0', 2, 1, 10],
      ['e0', 2, 2, 12],
      ['e1', 1, 4, 5],
      ['e1', 2, 4, 9],
      ['e1', 2, 3, 10],
      ['e1', 2, 2, 6],
    ],
    edges,
  )
// └ ┬ ┘ then ┌ ┴ ┐: e0 from A to D and e1 from B to C share the stem between, then cross to each other's side.
const cross = () =>
  sketch(
    5,
    3,
    [
      ['A', 0, 0],
      ['B', 0, 2],
      ['C', 4, 0],
      ['D', 4, 2],
    ],
    [
      ['e0', 1, 0, 3],
      ['e0', 1, 1, 12],
      ['e0', 2, 1, 5],
      ['e0', 3, 1, 3],
      ['e0', 3, 2, 12],
      ['e1', 1, 2, 9],
      ['e1', 1, 1, 6],
      ['e1', 2, 1, 5],
      ['e1', 3, 1, 9],
      ['e1', 3, 0, 6],
    ],
    ['e0 A D', 'e1 B C'],
  )
test('merge-ambiguous: unmarked edges joined in one line pass only when all leave one node or all enter one', () => {
  assert.equal(validate(open(['e0 A C', 'e1 B C'])), null) // fan-in to C
  assert.equal(validate(open(['e0 C A', 'e1 C B'])), null) // fan-out from C
  assert.equal(validate(open(['e0 A C', 'e1 C B']))?.reason, 'merge-ambiguous') // A seems linked to B
  assert.equal(validate(open(['e0 C A', 'e1 B C']))?.reason, 'merge-ambiguous') // B seems linked to A
  assert.deepEqual(text(cross()), ['A B', '└┬┘', ' │', '┌┴┐', 'C D'])
  assert.equal(validate(cross())?.reason, 'merge-ambiguous') // A seems linked to C, B to D
})
// QA's mixed merge: A, B over C, D, each edge on one trunk along row 2 and, to H, down a stem in column 3 into H's ▼.
// Open A---B runs along the trunk and open A---C down column 0. Edges are named by their ends: 'AB', 'AH'.
const leg = (id: string, n: string): Mark[] => {
  const c = 'AC'.includes(n) ? 0 : 6
  const up = 'AB'.includes(n)
  return [
    [id, up ? 1 : 3, c, 5],
    [id, 2, c, (up ? 1 : 4) | (c ? 8 : 2)],
  ]
}
const hub = (ids: string[]) =>
  marked(
    8,
    7,
    [
      ['A', 0, 0],
      ['B', 0, 6],
      ['C', 4, 0],
      ['D', 4, 6],
      ['H', 7, 3],
    ],
    ids.flatMap((id): Mark[] => {
      const left = 'AC'.includes(id[0]!)
      if (id[1] === 'H') {
        return [
          ...leg(id, id[0]!),
          ...h(id, 2, left ? 1 : 4, left ? 2 : 5),
          [id, 2, 3, left ? 12 : 6],
          ...v(id, 3, 3, 5),
          [id, 6, 3, '▼'],
        ]
      }

      return id === 'AB' ? [...leg(id, 'A'), ...h(id, 2, 1, 5), ...leg(id, 'B')] : v(id, 0, 1, 3)
    }),
    ids.map((id) => `${id} ${id[0]} ${id[1]}${id[1] === 'H' ? ' H▼' : ''}`),
  )
test('merge-ambiguous: marked and unmarked edges on one line are one network, and edges that share no node must imply only real links', () => {
  assert.deepEqual(text(hub(['AB', 'AC', 'AH', 'BH', 'CH', 'DH'])), [
    'A     B',
    '│     │',
    '├──┬──┤',
    '│  │  │',
    'C  │  D',
    '   │',
    '   ▼',
    '   H',
  ])
  // QA: D seems linked to A, B and C
  assert.equal(validate(hub(['AB', 'AC', 'AH', 'BH', 'CH', 'DH']))?.reason, 'merge-ambiguous')
  assert.equal(validate(hub(['AB', 'AH', 'BH'])), null) // a fan-in to H that A---B shares
  assert.equal(validate(hub(['AB', 'AH', 'BH', 'DH']))?.reason, 'merge-ambiguous') // D seems linked to A and B
})
// QA: A <--> B (e0) and A <--> C (e1) share A's ▲ and one trunk along row 3 to B's and C's ▼, and an open self-loop A
// --- A (e2) runs round it. Every end is a head or bare, and a two-headed edge's heads may start a link, so B and C
// seem linked.
const twoHeads = (ids: string[]) =>
  marked(
    8,
    9,
    [
      ['A', 0, 4],
      ['B', 7, 0],
      ['C', 7, 8],
    ],
    (
      [
        ['e0', 1, 4, '▲'],
        ['e0', 2, 4, 5],
        ['e0', 3, 4, 9],
        ...h('e0', 3, 1, 3),
        ['e0', 3, 0, 6],
        ...v('e0', 0, 4, 5),
        ['e0', 6, 0, '▼'],
        ['e1', 1, 4, '▲'],
        ['e1', 2, 4, 5],
        ['e1', 3, 4, 3],
        ...h('e1', 3, 5, 7),
        ['e1', 3, 8, 12],
        ...v('e1', 8, 4, 5),
        ['e1', 6, 8, '▼'],
        ['e2', 0, 3, 6],
        ...v('e2', 3, 1, 2),
        ['e2', 3, 3, 3],
        ['e2', 3, 4, 10],
        ['e2', 3, 5, 9],
        ...v('e2', 5, 1, 2),
        ['e2', 0, 5, 12],
      ] as Mark[]
    ).filter((m) => ids.includes(m[0])),
    ['e0 A B A▲ B▼', 'e1 A C A▲ C▼', 'e2 A A'].filter((s) => ids.includes(s.slice(0, 2))),
  )
test('merge-ambiguous: heads of two-headed edges on one line imply a link between their nodes, with or without a bare end or loop', () => {
  assert.deepEqual(text(twoHeads(['e0', 'e1', 'e2'])), [
    '   ┌A┐',
    '   │▲│',
    '   │││',
    '┌──┴┴┴──┐',
    '│       │',
    '│       │',
    '▼       ▼',
    'B       C',
  ])
  assert.equal(validate(twoHeads(['e0', 'e1', 'e2']))?.reason, 'merge-ambiguous') // QA: B seems linked to C
  assert.equal(validate(twoHeads(['e0', 'e1']))?.reason, 'merge-ambiguous') // so without the loop
  // A <--> B with a bare loop at A on its line: the loop's bare ends read as A-->A and as A---B's own ends lead to B's
  // head, A-->B; the source has neither (a self-loop needs the head kind too).
  assert.deepEqual(falsePairs(twoHeads(['e0', 'e2'])), ['A->A', 'A->B'])
  assert.equal(validate(twoHeads(['e0', 'e2']))?.reason, 'merge-ambiguous')
})
