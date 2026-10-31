import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'
import { sequence } from '../../core/diagrams/sequence/layout.ts'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
import { text } from './graph-fixture.ts'
import { explain } from '../../core/render.ts'

// A flowchart `dir\nbody` and a sequence body, each drawn at its natural step in 80 columns.
const F = (t: string): Drawing =>
  flowchart.layout(parseFlowchart(readSource(`flowchart ${t}`) as Source) as any, 'natural', 80) as Drawing
const S = (t: string): Drawing =>
  sequence.layout(parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any, 'natural', 80) as Drawing
const show = (d: Drawing) => text(d).join('\n')

// QA's repro, whose edge label's row once ran through both sides of the Group subgraph: the layout keeps the label off
// its border (R2 in flowchart-layout_test.ts), but its edge can reach N1 only by running through it and back in, three
// crossings where one is due, so the router refuses it (edge-crosses-frame) and the fence falls back. The validator
// half of the finding, a label drawn on a border, is pinned on a hand-built frame below; a frame crossed wrongly, on
// between() further down.
test("A5.mutation-tests: QA's cluster-border repro, its edge through S0 and back, falls back", () => {
  const src =
    'flowchart BT\nsubgraph S0 [Group]\n  N1\n  subgraph S1 [后端]\n  end\nend\nN0 -.->|long label text here| N1'
  assert.deepEqual(flowchart.layout(parseFlowchart(readSource(src) as Source) as any, 'natural', 80), {
    reason: 'route-conflict',
  })
  for (const columns of [60, 80, 120]) {
    assert.ok(!('drawing' in explain(src, { columns })), `${columns}`)
  }
})
test('A5.mutation-tests: an edge label drawn over a cluster border fails frame-broken', () => {
  const label = (r: number, col: number) =>
    framed(
      (c) => {
        straight(c)
        c.text(r, col, 'L', 'label', 'L1')
      },
      ['F'],
      [{ owner: 'L1', text: 'L' }],
    )
  assert.equal(validate(label(3, 6))?.reason, 'frame-broken') // on the right border
  assert.equal(validate(label(5, 4))?.reason, 'frame-broken') // on the bottom border
  assert.equal(validate(label(3, 5)), null) // inside, beside the border: the frame stays closed
})
// A sits outside S and B inside, so A→B must cross S's border; each title sits on its top border.
test('A5.mutation-tests: a cluster an edge crosses straight, its title on its top border, passes', () => {
  for (const t of ['TB\nA --> B\nsubgraph S [Group]\nB\nend', 'LR\nA --> B\nsubgraph S [后端 API]\nB\nend\nB --> C']) {
    const d = F(t)
    assert.deepEqual(d.expect.frames, ['S'])
    assert.equal(validate(d), null, `${t}\n${show(d)}`)
  }
})
// An alt frame, titled and with an else divider, inside box L; A→B leaves L through its right side and enters R through
// its left.
test('A5.mutation-tests: a sequence alt frame with its title and divider, and boxes a message crosses, pass', () => {
  const d = S(
    'box L\nparticipant A\nparticipant J\nend\nbox R\nparticipant B\nend\nalt ok\nA->>J: Hello John, how are you?\nelse no\nJ->>A: Great!\nend\nA->>B: hi',
  )
  assert.deepEqual([...d.expect.frames].sort(), ['b0', 'b1', 'f0'])
  assert.equal(validate(d), null, show(d))
})

// Frame F, rows 1–5 and columns 0–6, titled T at (1,2); a above it at (0,3), bb inside at (4,3); edge e from A to B as
// ink draws it.
function framed(ink: (c: Canvas) => void, frames = ['F'], extra: { owner: string; text: string }[] = []): Drawing {
  const c = createCanvas(6, 7, 7)
  c.frame(1, 0, 5, 6, 'frame', 'F', 'T')
  c.text(0, 3, 'a', 'node', 'A')
  c.text(4, 3, 'bb', 'node', 'B')
  ink(c)
  return c.toDrawing({
    labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'bb' }, { owner: 'F', text: 'T' }, ...extra],
    edges: [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }],
    edgeLabels: [],
    frames,
  })
}

const line = (c: Canvas, cells: [number, number, number][]) =>
  cells.forEach(([r, col, dirs]) => c.line(r, col, dirs, 'light', 'edge', 'e'))
// Straight: e runs down column 3, crossing F's top border as │. Along: e turns onto the top border, └┐, and drops down
// column 4.
const straight = (c: Canvas) => {
  line(c, [
    [1, 3, 5],
    [2, 3, 5],
  ])
  c.arrow(3, 3, '▼', 'e')
}
const along = (c: Canvas) => {
  line(c, [
    [1, 3, 3],
    [1, 4, 12],
    [2, 4, 5],
  ])
  c.arrow(3, 4, '▼', 'e')
}
test('A5.mutation-tests: a frame passes with its title and a straight crossing; a run along it, a label on it, or no cells fail frame-broken', () => {
  assert.equal(validate(framed(straight)), null)
  assert.equal(validate(framed(along))?.reason, 'frame-broken')
  assert.equal(
    validate(
      framed(
        (c) => {
          straight(c)
          c.text(3, 6, 'L', 'label', 'L1')
        },
        ['F'],
        [{ owner: 'L1', text: 'L' }],
      ),
    )?.reason,
    'frame-broken',
  )
  assert.equal(validate(framed(straight, ['F', 'G']))?.reason, 'frame-broken')
})

// A node's pill sharing cells with a frame's border, across its top or down its side, is a true overlap: frame-broken.
// Inside, beside the border, it passes. (A run of an edge along a border fails alike: framed(along) above.)
test("A node pill drawn on a frame's border fails frame-broken", () => {
  // C's pill, a cap and its text, two cells from (r, col); F spans columns 0–6, and e runs down column 3.
  const pill = (r: number, col: number) =>
    framed(
      (c) => {
        straight(c)
        c.cap(r, col, '[', 'node', 'C')
        c.text(r, col + 1, 'c', 'node', 'C')
      },
      ['F'],
      [{ owner: 'C', text: 'c' }],
    )
  assert.equal(validate(pill(5, 1))?.reason, 'frame-broken') // across the bottom border
  assert.equal(validate(pill(2, 5))?.reason, 'frame-broken') // over the right side
  assert.equal(validate(pill(2, 1)), null) // inside, beside the left side
})

// Frame F, rows 0–2 and columns 0 to w - 1, with ink drawn over it; label is the text ink draws, as one label of owner
// L.
function box(w: number, ink: (c: Canvas) => void = () => {}, label?: string): Drawing {
  const c = createCanvas(3, w, w)
  c.frame(0, 0, 2, w - 1, 'frame', 'F')
  ink(c)
  return c.toDrawing({
    labels: label === undefined ? [] : [{ owner: 'L', text: label }],
    edges: [],
    edgeLabels: [],
    frames: ['F'],
  })
}
// QA's repro: a two-row label erases the top border and both sides, so the bottom border alone spans a one-row box.
// With
// the top row erased at width 2, the │ sides over └┘ span a box with no ┌┐.
test('A5.mutation-tests: a frame whose top border or sides text erased fails frame-broken, though the cells left span a box', () => {
  const repro = box(
    7,
    (c) => {
      c.text(0, 0, 'two row', 'label', 'L')
      c.text(1, 0, 'message', 'label', 'L', '\n')
    },
    'two row\nmessage',
  )
  assert.equal(repro.conflicts.length, 0)
  assert.equal(validate(repro)?.reason, 'frame-broken')
  for (const w of [2, 7]) {
    assert.equal(
      validate(box(w, (c) => c.text(0, 0, 'x'.repeat(w), 'label', 'L'), 'x'.repeat(w)))?.reason,
      'frame-broken',
      `${w}`,
    )
  }
})
// framed(straight) above is the intact, crossed and titled case. A corner may be light or heavy, but not text or a ─.
test('A5.mutation-tests: a frame needs its four corners: one overwritten, by text or by its own ─, fails frame-broken', () => {
  assert.equal(validate(box(7)), null)
  const heavy = box(7)
  heavy.cells[0]![0] = { ...heavy.cells[0]![0]!, ch: '┏' }
  assert.equal(validate(heavy), null)
  assert.equal(validate(box(7, (c) => c.text(0, 6, 'x', 'label', 'L'), 'x'))?.reason, 'frame-broken')
  const run = box(7)
  run.cells[2]![6] = { ...run.cells[2]![5]! }
  assert.equal(validate(run)?.reason, 'frame-broken')
})

// A border cell draws its border's glyph, ─ or ━ across and │ or ┃ down a side, or a tee whose stem a divider of the
// frame's own, `${id}.${k}`, continues inside: ┬ over it, ┴ under it, ├ or ┤ beside it. A stray tee leads nowhere.
const tee = (d: Drawing, r: number, c: number, ch: string, dirs: number) => {
  d.cells[r]![c] = { ...d.cells[r]![c]!, ch, dirs }
  return d
}
const divider = (owner: string) => (c: Canvas) => c.line(1, 3, 5, 'light', 'frame', owner)
test('A5.mutation-tests: V5 a border tee with no divider of its own frame inside it fails frame-broken', () => {
  assert.equal(validate(tee(box(7), 0, 3, '┬', 14))?.reason, 'frame-broken') // stray ┬, nothing below
  assert.equal(validate(tee(box(7), 2, 3, '┴', 11))?.reason, 'frame-broken') // stray ┴, nothing above
  assert.equal(validate(tee(box(7), 1, 0, '├', 7))?.reason, 'frame-broken') // stray ├, nothing beside
  assert.equal(validate(tee(box(7, divider('G.2')), 0, 3, '┬', 14))?.reason, 'frame-broken') // another frame's divider
  const side = box(7)
  side.cells[0]![3] = { ...side.cells[1]![0]! }
  assert.equal(validate(side)?.reason, 'frame-broken') // a │ on the top border
})
test("A5.mutation-tests: V5 a divider's tees pass, and so does the quadrant's cross", () => {
  assert.equal(validate(tee(tee(box(7, divider('F.2')), 0, 3, '┬', 14), 2, 3, '┴', 11)), null)
  const q = explain('quadrantChart\nx-axis Low --> High\ny-axis Cold --> Hot\nquadrant-1 Expand\nA: [0.3, 0.6]', {
    columns: 80,
  }) as { drawing: Drawing }
  assert.ok(
    text(q.drawing).some((row) => row.includes('┬')) && text(q.drawing).some((row) => row.includes('┴')),
    show(q.drawing),
  )
  assert.equal(validate(q.drawing), null, show(q.drawing))
})

// Frame F, rows 0–4 and columns 0–8, holds a at (2,2) and b at (2,5); edge e from A to B, its head g, as ink draws it.
function inner(ink: (c: Canvas) => void, g: string): Drawing {
  const c = createCanvas(6, 9, 9)
  c.frame(0, 0, 4, 8, 'frame', 'F', 'T')
  c.text(2, 2, 'a', 'node', 'A')
  c.text(2, 5, 'b', 'node', 'B')
  ink(c)
  return c.toDrawing({
    labels: [
      { owner: 'A', text: 'a' },
      { owner: 'B', text: 'b' },
      { owner: 'F', text: 'T' },
    ],
    edges: [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'B', glyph: g }] }],
    edgeLabels: [],
    frames: ['F'],
  })
}

test('V6: an edge between two nodes of one frame that leaves it through its border and comes back fails edge-outside-frame', () => {
  // Under a, along row 3, down through the bottom border at (4,4), back up at (4,5), ▲ into b: each crossing a straight
  // │.
  const out = inner((c) => {
    line(c, [
      [3, 2, 3],
      [3, 3, 10],
      [3, 4, 12],
      [4, 4, 5],
      [5, 4, 3],
      [5, 5, 9],
      [4, 5, 5],
    ])
    c.arrow(3, 5, '▲', 'e')
  }, '▲')
  assert.equal(validate(out)?.reason, 'edge-outside-frame', show(out))
  const kept = inner((c) => {
    line(c, [[2, 3, 10]])
    c.arrow(2, 4, '►', 'e')
  }, '►') // a─►b, inside F
  assert.equal(validate(kept), null, show(kept))
})

// Frame F, rows 1–5 and columns 1–7, between a at (0,4) above it and b at (7,4) below it; edge e from A to B, its head
// ▼ at (6,4), as ink draws it. F holds neither end, so e must not cross its border at all.
function between(ink: (c: Canvas) => void): Drawing {
  const c = createCanvas(8, 9, 9)
  c.frame(1, 1, 5, 7, 'frame', 'F', 'T')
  c.text(0, 4, 'a', 'node', 'A')
  c.text(7, 4, 'b', 'node', 'B')
  ink(c)
  c.arrow(6, 4, '▼', 'e')
  return c.toDrawing({
    labels: [
      { owner: 'A', text: 'a' },
      { owner: 'B', text: 'b' },
      { owner: 'F', text: 'T' },
    ],
    edges: [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }],
    edgeLabels: [],
    frames: ['F'],
  })
}

test('An edge through a frame that holds neither of its ends fails edge-crosses-frame', () => {
  // Down column 4, in through F's top border and out through its bottom, each crossing a straight │.
  const through = between((c) =>
    line(c, [
      [1, 4, 5],
      [2, 4, 5],
      [3, 4, 5],
      [4, 4, 5],
      [5, 4, 5],
    ]),
  )
  assert.equal(validate(through)?.reason, 'edge-crosses-frame', show(through))
  // framed(straight) above is the passing case: F holds one end, and the edge crosses its border once.
  assert.equal(validate(framed(straight)), null)
})
// The two-subgraph LR chart (case 2) at 80 columns: the dotted W2 → Job queue edge enters Data tier, which holds
// neither end, and leaves through its right wall. Every step of the ladder draws a frame crossed so, or another broken
// drawing, so the fence falls back.
test('The two-subgraph LR chart at 80 columns, its dotted edge crossing Data tier, falls back', () => {
  const src =
    'flowchart LR\n  User((User)) --> CDN[/CDN/] --> LB{{Load balancer}}\n  subgraph app [App tier]\n    LB --> W1[Web 1] & W2[Web 2]\n  end\n' +
    '  subgraph data [Data tier]\n    Cache[(Redis)]\n    DB[(Postgres)]\n  end\n  W1 --> Cache\n  W2 --> DB\n  W2 -.-> Q>Job queue] --> Worker[[Worker]]\n'
  const r = explain(src, { columns: 80 })
  assert.ok(!('drawing' in r), 'drawing' in r ? show(r.drawing) : '')
})
// An edge whose end is the frame itself is not exempt from every crossing. Only its mark, which meets the border from
// outside, is the frame's; its line obeys the rule like any other, so a self-loop on S stays outside S. Here S-->S ran
// down through S, across its top and bottom borders, and drew at 60, 80 and 120.
test("A self-loop on a frame never runs over the frame's border", () => {
  const src = 'flowchart BT\nsubgraph S\nX\nY\nend\nB --> F\nS --> F\nF --> S\nS --> B\nS --> S'
  for (const columns of [60, 80, 120]) {
    const r = explain(src, { columns, theme: 'mono' })
    if (!('drawing' in r)) {
      continue
    } // falling back is fine

    const d = r.drawing
    const b = d.cells.flatMap((row, y) =>
      row.flatMap((x, c) => (x?.kind === 'frame' && x.owners[0] === 'S' ? [[y, c]] : [])),
    )
    const [top, bottom] = [Math.min(...b.map((q) => q[0]!)), Math.max(...b.map((q) => q[0]!))]
    const [left, right] = [Math.min(...b.map((q) => q[1]!)), Math.max(...b.map((q) => q[1]!))]
    const onBorder = (y: number, c: number) =>
      y >= top && y <= bottom && c >= left && c <= right && (y === top || y === bottom || c === left || c === right)
    const loop = d.cells.flatMap((row, y) =>
      row.flatMap((x, c) => (x?.kind === 'line' && x.owners.includes('L_S_S_0') ? [[y, c] as const] : [])),
    )
    assert.ok(loop.length > 0 && !loop.some(([y, c]) => onBorder(y, c)), `${columns}\n${show(d)}`)
  }
})
// The validator half alone, on F of between() with no a: e from F to b leaves F's top from above, at (0,3), then runs
// down column 4 through F's interior, crossing its top and bottom borders. F is e's end, but not that way.
test('An edge from a frame that runs through the frame fails edge-crosses-frame', () => {
  const c = createCanvas(8, 9, 9)
  c.frame(1, 1, 5, 7, 'frame', 'F', 'T')
  c.text(7, 4, 'b', 'node', 'B')
  line(c, [
    [0, 3, 6],
    [0, 4, 12],
    [1, 4, 5],
    [2, 4, 5],
    [3, 4, 5],
    [4, 4, 5],
    [5, 4, 5],
  ])
  c.arrow(6, 4, '▼', 'e')
  const d = c.toDrawing({
    labels: [
      { owner: 'B', text: 'b' },
      { owner: 'F', text: 'T' },
    ],
    edges: [{ id: 'e', from: 'F', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }],
    edgeLabels: [],
    frames: ['F'],
  })
  assert.equal(validate(d)?.reason, 'edge-crosses-frame', show(d))
})
