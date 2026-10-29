import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'; import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'
import { sequence } from '../../core/diagrams/sequence/layout.ts'; import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'; import { text } from './graph-fixture.ts'

// A flowchart `dir\nbody` and a sequence body, each drawn at its natural step in 80 columns.
const F = (t: string): Drawing => flowchart.layout(parseFlowchart(readSource(`flowchart ${t}`) as Source) as any, 'natural', 80) as Drawing
const S = (t: string): Drawing => sequence.layout(parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any, 'natural', 80) as Drawing
const show = (d: Drawing) => text(d).join('\n')

// QA's repro, whose edge label's row once ran through both sides of S0: the router now keeps the label off S0's border, so it
// validates. The validator half of the finding, a label drawn on a border, is pinned on a hand-built frame below.
test('A5.mutation-tests: QA\'s cluster-border repro now draws its label off the border and validates', () => {
  const d = F('BT\nsubgraph S0 [Group]\n  N1\n  subgraph S1 [后端]\n  end\nend\nN0 -.->|long label text here| N1')
  assert.deepEqual(d.expect.frames, ['S0', 'S1'])
  assert.equal(validate(d), null, show(d))
})
test('A5.mutation-tests: an edge label drawn over a cluster border fails frame-broken', () => {
  const label = (r: number, col: number) => framed(c => { straight(c); c.text(r, col, 'L', 'label', 'L1') }, ['F'], [{ owner: 'L1', text: 'L' }])
  assert.equal(validate(label(3, 6))?.reason, 'frame-broken')   // on the right border
  assert.equal(validate(label(5, 4))?.reason, 'frame-broken')   // on the bottom border
  assert.equal(validate(label(3, 5)), null)                     // inside, beside the border: the frame stays closed
})
// A sits outside S and B inside, so A→B must cross S's border; each title sits on its top border.
test('A5.mutation-tests: a cluster an edge crosses straight, its title on its top border, passes', () => {
  for (const t of ['TB\nA --> B\nsubgraph S [Group]\nB\nend', 'LR\nA --> B\nsubgraph S [后端 API]\nB\nend\nB --> C']) {
    const d = F(t); assert.deepEqual(d.expect.frames, ['S']); assert.equal(validate(d), null, `${t}\n${show(d)}`)
  }
})
// An alt frame, titled and with an else divider, inside box L; A→B leaves L through its right side and enters R through its left.
test('A5.mutation-tests: a sequence alt frame with its title and divider, and boxes a message crosses, pass', () => {
  const d = S('box L\nparticipant A\nparticipant J\nend\nbox R\nparticipant B\nend\nalt ok\nA->>J: Hello John, how are you?\nelse no\nJ->>A: Great!\nend\nA->>B: hi')
  assert.deepEqual([...d.expect.frames].sort(), ['b0', 'b1', 'f0']); assert.equal(validate(d), null, show(d))
})

// Frame F, rows 1–5 and columns 0–6, titled T at (1,2); a above it at (0,3), bb inside at (4,3); edge e from A to B as ink draws it.
function framed(ink: (c: Canvas) => void, frames = ['F'], extra: { owner: string; text: string }[] = []): Drawing {
  const c = createCanvas(6, 7, 7); c.frame(1, 0, 5, 6, 'frame', 'F', 'T'); c.text(0, 3, 'a', 'node', 'A'); c.text(4, 3, 'bb', 'node', 'B'); ink(c)
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'bb' }, { owner: 'F', text: 'T' }, ...extra],
    edges: [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [], frames })
}
const line = (c: Canvas, cells: [number, number, number][]) => cells.forEach(([r, col, dirs]) => c.line(r, col, dirs, 'light', 'edge', 'e'))
// Straight: e runs down column 3, crossing F's top border as │. Along: e turns onto the top border, └┐, and drops down column 4.
const straight = (c: Canvas) => { line(c, [[1, 3, 5], [2, 3, 5]]); c.arrow(3, 3, '▼', 'e') }
const along = (c: Canvas) => { line(c, [[1, 3, 3], [1, 4, 12], [2, 4, 5]]); c.arrow(3, 4, '▼', 'e') }
test('A5.mutation-tests: a frame passes with its title and a straight crossing; a run along it, a label on it, or no cells fail frame-broken', () => {
  assert.equal(validate(framed(straight)), null)
  assert.equal(validate(framed(along))?.reason, 'frame-broken')
  assert.equal(validate(framed(c => { straight(c); c.text(3, 6, 'L', 'label', 'L1') }, ['F'], [{ owner: 'L1', text: 'L' }]))?.reason, 'frame-broken')
  assert.equal(validate(framed(straight, ['F', 'G']))?.reason, 'frame-broken')
})
