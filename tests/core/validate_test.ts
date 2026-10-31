import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'
import { labelLines } from '../../core/text.ts'; import type { Piece } from '../../core/text.ts'; import { explain } from '../../core/render.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { layoutGraph } from '../../core/graph/layered.ts'; import { routeGraph } from '../../core/graph/route.ts'
import type { Graph } from '../../core/graph/model.ts'; import { falsePairs, g, text } from './graph-fixture.ts'; import { junction } from '../../core/glyphs.ts'
function two(t1 = 'a', t2 = 'b'): Drawing {
  const c = createCanvas(4, 8, 8); c.text(0, 2, t1, 'node', 'A'); c.line(1, 2, 5, 'light', 'edge', 'A>B'); c.arrow(2, 2, '▼', 'A>B'); c.text(3, 2, t2, 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: t1 }, { owner: 'B', text: t2 }], edges: [{ id: 'A>B', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [], frames: [] })
}
const cut = (d: Drawing, r: number, c: number) => { d.cells[r]![c] = null; return d }

test('A3: edge-owned one-arm spurs fail line-dangling even when the edge connects', () => {
  const d = two()
  d.cells[1]![0] = { ch: '╶', kind: 'line', role: 'edge', owners: ['A>B'], dirs: 2 }
  assert.equal(validate(d)?.reason, 'line-dangling')
  // The │ cut to ╵ under A: it no longer points at its ▼, so the walk stops there, the head is not reached, and the edge
  // fails edge-disconnected before its one arm is read as dangling (a step into a head needs the line's arm).
  const connected = two()
  connected.cells[1]![2] = { ...connected.cells[1]![2]!, dirs: 1 }
  assert.equal(validate(connected)?.reason, 'edge-disconnected')
})

test('A3: every edge line arm has an owned reciprocal neighbour or endpoint', () => {
  const d = two()
  d.cells[1]![0] = { ch: '─', kind: 'line', role: 'edge', owners: ['A>B'], dirs: 10 }
  assert.equal(validate(d)?.reason, 'line-dangling')
  d.cells[1]![0] = { ...d.cells[1]![0]!, owners: ['frame'] }
  assert.equal(validate(d), null)
  d.cells[1]![0] = { ...d.cells[1]![0]!, owners: ['frame', 'A>B'] }
  assert.equal(validate(d)?.reason, 'line-dangling')
  const wrongOwner = two()
  wrongOwner.cells[1]![3] = { ch: '─', kind: 'line', role: 'edge', owners: ['other'], dirs: 10 }
  wrongOwner.cells[1]![2] = { ...wrongOwner.cells[1]![2]!, dirs: 7 }
  wrongOwner.cells[2]![2] = { ...wrongOwner.cells[1]![2]!, ch: '│', dirs: 5 }
  wrongOwner.expect = { ...wrongOwner.expect, edges: [{ id: 'A>B', from: 'A', to: 'B', ends: [] }] }
  assert.equal(validate(wrongOwner)?.reason, 'line-dangling')
  const loop = two()
  const line = (dirs: number, owners = ['A>B']) => ({ ch: junction(dirs, 'light'), kind: 'line' as const, role: 'edge' as const, owners, dirs })
  // A disconnected loop has two arms per cell: valid arms first, then one missing reciprocal bit. Closed, no arm dangles,
  // but it is a stray part of A>B joined to nothing, so it fails edge-disconnected; open, it dangles first.
  loop.cells[0]![4] = line(6)
  loop.cells[0]![5] = line(12)
  loop.cells[1]![4] = line(3)
  loop.cells[1]![5] = line(9)
  assert.equal(validate(loop)?.reason, 'edge-disconnected')
  loop.cells[0]![5] = line(5)
  assert.equal(validate(loop)?.reason, 'line-dangling')
  loop.cells[0]![5] = line(12, ['foreign'])
  assert.equal(validate(loop)?.reason, 'line-dangling')
  loop.cells[0]![5] = line(4, ['frame'])
  loop.cells[0]![4] = line(6, ['A>B', 'frame'])
  loop.cells[1]![5] = line(9, ['A>B', 'frame'])
  assert.equal(validate(loop)?.reason, 'line-dangling')
})

test('A5.mutation-tests: each broken invariant fails', () => {
  assert.equal(validate(two()), null)
  assert.equal(validate(cut(two(), 0, 2))?.reason, 'label-missing')
  const dup = two(); dup.cells[1]![0] = { ...dup.cells[0]![2]!, join: undefined }; assert.equal(validate(dup)?.reason, 'label-dup')
  assert.equal(validate(cut(two(), 1, 2))?.reason, 'edge-disconnected')
  const j = two(); j.cells[1]![2] = { ...j.cells[1]![2]!, dirs: 7 }; assert.equal(validate(j)?.reason, 'head-on-junction')
  assert.equal(validate({ ...two(), conflicts: [{ row: 0, col: 2, had: 'a', by: 'X' }] })?.reason, 'overwrite')
  assert.equal(validate({ ...two(), columns: 2 })?.reason, 'row-too-wide')
})
test('A5.mutation-tests: identical text on distinct ids passes', () => assert.equal(validate(two('same', 'same')), null))

// Label n1 drawn as pieces, one per row from row 0, on a 20-column grid: [text] has no join, [text, join] carries one.
function label(expected: string, pieces: readonly (readonly [string, Piece['join']?])[]): Drawing {
  const c = createCanvas(pieces.length, 20, 20)
  pieces.forEach(([s, join], r) => c.text(r, 0, s, 'label', 'n1', join))
  return c.toDrawing({ labels: [{ owner: 'n1', text: expected }], edges: [], edgeLabels: [], frames: [] })
}
// The first piece joins with '' or none; a piece split at a space with ' ', one split between W/F characters with '', and
// the first piece of a later label line with '\n'.
test('A5.mutation-tests: a wrapped label is one instance, its pieces joined by their join', () => {
  assert.equal(validate(label('alpha beta gamma', [['alpha'], ['beta', ' '], ['gamma', ' ']])), null)
  assert.equal(validate(label('读取配置文件', [['读取配置', ''], ['文件', '']])), null)
  assert.equal(validate(label(labelLines('first<br>second').join('\n'), [['first'], ['second', '\n']])), null)
  assert.equal(validate(label('读取配置文件', [['读取配置', ''], ['文件', ' ']]))?.reason, 'label-missing')
})
// wrap draws a run of spaces as one and drops the ends; a blank label line (<br><br>) draws no cell, so its \n is lost.
test('A5.mutation-tests: text compares with each whitespace run, \\n included, collapsed to one space and the ends trimmed', () => {
  assert.equal(validate(label('a  b', [['a b']])), null)
  assert.equal(validate(label(' a b ', [['a b']])), null)
  assert.equal(validate(label(labelLines('a<br><br>b').join('\n'), [['a'], ['', '\n'], ['b', '\n']])), null)
  assert.equal(validate(label('a b', [['ab']]))?.reason, 'label-missing')
})
// text('') draws no cell, and wrap draws a blank line as one empty piece.
test('A5.mutation-tests: a label blank after collapsing needs no instance, and any text its owner draws is a duplicate', () => {
  assert.equal(validate(label('', [['']])), null)
  assert.equal(validate(label(labelLines(' <br> ').join('\n'), [[''], ['', '\n']])), null)
  assert.equal(validate(label('', [['x']]))?.reason, 'label-dup')
  assert.equal(validate(label(' ', [[' ']]))?.reason, 'label-dup')
})
test('A5.mutation-tests: text drawn by an owner that expect does not list is a duplicate', () => {
  const c = createCanvas(1, 4, 4); c.text(0, 0, 'a', 'label', 'n1'); c.text(0, 2, 'x', 'label', 'n9')
  assert.equal(validate(c.toDrawing({ labels: [{ owner: 'n1', text: 'a' }, { owner: 'n9', text: 'x' }], edges: [], edgeLabels: [], frames: [] })), null)
  assert.equal(validate(c.toDrawing({ labels: [{ owner: 'n1', text: 'a' }], edges: [], edgeLabels: [], frames: [] }))?.reason, 'label-dup')
})
// Node N: header row n, then member row m, whose cells list N after their own id N.m. The edge touches only the member row.
test('A5.mutation-tests: a member row owns its own text, and an edge reaches its node through it', () => {
  const c = createCanvas(5, 1, 1); c.text(0, 0, 'n', 'node', 'N'); c.text(1, 0, 'm', 'node', ['N.m', 'N'])
  c.line(2, 0, 5, 'light', 'edge', 'N>B'); c.arrow(3, 0, '▼', 'N>B'); c.text(4, 0, 'b', 'node', 'B')
  const d = c.toDrawing({ labels: [{ owner: 'N', text: 'n' }, { owner: 'N.m', text: 'm' }, { owner: 'B', text: 'b' }], edges: [{ id: 'N>B', from: 'N', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [], frames: [] })
  assert.equal(validate(d), null)
})

// Edge A>B from a to b, one cell per step: down column 0, or along row 0 when across. A number is a line's dirs, a string an
// arrow glyph, null an empty cell, and { text, owners } a label cell, whose owners[0] expect lists with its text.
// Each of ends names an end mark's node, then its glyph: 'B▼'.
type Step = number | string | null | { text: string; owners: string[] }
function path(steps: readonly Step[], ends: readonly string[], across = false): Drawing {
  const n = steps.length + 2
const  c = across ? createCanvas(1, n, n) : createCanvas(n, 1, 1)
const  extra: { owner: string; text: string }[] = []
  const pos = (i: number): [number, number] => (across ? [0, i] : [i, 0])
  c.text(...pos(0), 'a', 'node', 'A')
  steps.forEach((s, i) => {
    if (typeof s === 'number') { c.line(...pos(i + 1), s, 'light', 'edge', 'A>B') }
    else if (typeof s === 'string') { c.arrow(...pos(i + 1), s, 'A>B') }
    else if (s) { c.text(...pos(i + 1), s.text, 'label', s.owners); extra.push({ owner: s.owners[0]!, text: s.text }) }
  })
  c.text(...pos(n - 1), 'b', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, ...extra], edges: [{ id: 'A>B', from: 'A', to: 'B', ends: ends.map(s => ({ node: s[0]!, glyph: s.slice(1) })) }], edgeLabels: [], frames: [] })
}
test('A5.mutation-tests: an edge whose line at from points away from it is disconnected', () => {
  assert.equal(validate(path([5, '▼'], ['B▼'])), null)
  assert.equal(validate(path([4, '▼'], ['B▼']))?.reason, 'edge-disconnected')
})
test('A5.mutation-tests: an edge whose cells stop short of to is disconnected, with or without a head', () => {
  assert.equal(validate(path([5, 5], [])), null)
  assert.equal(validate(path([5, null], []))?.reason, 'edge-disconnected')
  assert.equal(validate(path([5, null, 5, '▼'], ['B▼']))?.reason, 'edge-disconnected')
})
// [5, 4]: the upper line points down, the lower one not up; [1, 5]: the lower line points up, the upper one not down.
test('A5.mutation-tests: two line cells join only where their dirs point at each other', () => {
  assert.equal(validate(path([5, 5, '▼'], ['B▼'])), null)
  assert.equal(validate(path([5, 4, '▼'], ['B▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path([1, 5, '▼'], ['B▼']))?.reason, 'edge-disconnected')
})
// A forks at a ├ that A>B and A>C share: a in row 0, ├┐ in row 1, then ││, ▼▼ and bc.
function fork(): Drawing {
  const c = createCanvas(5, 2, 2, (x, y) => x.split('>')[0] === y.split('>')[0]); c.text(0, 0, 'a', 'node', 'A')
  c.line(1, 0, 5, 'light', 'edge', 'A>B'); c.line(2, 0, 5, 'light', 'edge', 'A>B'); c.arrow(3, 0, '▼', 'A>B')
  c.line(1, 0, 3, 'light', 'edge', 'A>C'); c.line(1, 1, 12, 'light', 'edge', 'A>C'); c.line(2, 1, 5, 'light', 'edge', 'A>C'); c.arrow(3, 1, '▼', 'A>C')
  c.text(4, 0, 'b', 'node', 'B'); c.text(4, 1, 'c', 'node', 'C')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'C', text: 'c' }],
    edges: [{ id: 'A>B', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }, { id: 'A>C', from: 'A', to: 'C', ends: [{ node: 'C', glyph: '▼' }] }], edgeLabels: [], frames: [] })
}
test('A5.mutation-tests: an edge passes through a junction cell it shares with a sibling edge, but never walks the sibling cells', () => {
  assert.equal(validate(fork()), null)
  assert.equal(validate(cut(fork(), 2, 0))?.reason, 'edge-disconnected')
})
// An edge label drawn on the path: its cells list the label id A>B:label, then the edge id. Text under any other owner is not
// the edge's label, even when its cells list A>B too.
test("A5.mutation-tests: an edge's own label cell joins any adjacent cell of its edge but starts nothing; text of another owner breaks the edge, even text the edge owns", () => {
  assert.equal(validate(path([5, { text: 'L', owners: ['A>B:label', 'A>B'] }, 5, '▼'], ['B▼'])), null)
  assert.equal(validate(path([5, { text: 'L', owners: ['L1'] }, 5, '▼'], ['B▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path([5, { text: 'L', owners: ['L1', 'A>B'] }, 5, '▼'], ['B▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path([{ text: 'L', owners: ['A>B:label', 'A>B'] }, 5, '▼'], ['B▼']))?.reason, 'edge-disconnected')
})
// a, then ─, 成功 (each W character a text cell, then a cont cell), ─, ► and b along row 0: the route enters 成 and leaves
// from 功's cont cell. The label's cells list owners: A>B:label alone, or with A>B.
function through(owners: string[]): Drawing {
  const c = createCanvas(1, 9, 9); c.text(0, 0, 'a', 'node', 'A'); c.line(0, 1, 10, 'light', 'edge', 'A>B'); c.text(0, 2, '成功', 'label', owners)
  c.line(0, 6, 10, 'light', 'edge', 'A>B'); c.arrow(0, 7, '►', 'A>B'); c.text(0, 8, 'b', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: owners[0]!, text: '成功' }],
    edges: [{ id: 'A>B', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '►' }] }], edgeLabels: [{ owner: owners[0]!, edge: 'A>B' }], frames: [] })
}
test("A5.mutation-tests: an edge's own label bridges its route through its cont cells too, whether its cells list the edge or not", () => {
  assert.equal(validate(through(['A>B:label', 'A>B'])), null)
  assert.equal(validate(through(['A>B:label'])), null)
})
// QA's repro: A, then down column 0 an edge e's line, a cell `cell` draws, ▼ and B, on a grid cols wide.
function gap(cell: (c: Canvas) => void, cols = 1): Drawing {
  const c = createCanvas(5, cols, cols); c.text(0, 0, 'A', 'node', 'A'); c.line(1, 0, 5, 'light', 'edge', 'e'); cell(c); c.arrow(3, 0, '▼', 'e'); c.text(4, 0, 'B', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'A' }, { owner: 'B', text: 'B' }], edges: [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [], frames: [] })
}
test('A5.mutation-tests: a blank fill or a cap never connects an edge, even one the edge owns', () => {
  assert.equal(validate(gap(c => c.line(2, 0, 5, 'light', 'edge', 'e'))), null)
  assert.equal(validate(gap(() => {}))?.reason, 'edge-disconnected')
  assert.equal(validate(gap(c => c.fill(2, 0, 1, 'edge', 'e')))?.reason, 'edge-disconnected')
  assert.equal(validate(gap(c => c.cap(2, 0, '(', 'edge', 'e')))?.reason, 'edge-disconnected')
})
// Padding e owns in column 1, beside its whole route in column 0.
test('A5.mutation-tests: a fill the edge owns beside its connected line changes nothing', () => {
  const route = (c: Canvas) => c.line(2, 0, 5, 'light', 'edge', 'e')
  assert.equal(validate(gap(route, 2)), null)
  assert.equal(validate(gap(c => { route(c); for (let r = 1; r < 4; r++) { c.fill(r, 1, 1, 'edge', 'e') } }, 2)), null)
})
// <--> draws ▲ next to A and ▼ next to B; o--o draws ● at each end.
test('A5.mutation-tests: each head of a two-headed edge is its own arrow cell next to an end node, and neither sits on a junction', () => {
  assert.equal(validate(path(['▲', 5, '▼'], ['A▲', 'B▼'])), null)
  assert.equal(validate(path([5, 5, '▼'], ['A▲', 'B▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['▲', 5, 5], ['A▲', 'B▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['●', 5, '●'], ['A●', 'B●'])), null)
  assert.equal(validate(path(['●', 5, 5], ['A●', 'B●']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['▲', 7, 5, '▼'], ['A▲', 'B▼']))?.reason, 'head-on-junction')
  assert.equal(validate(path(['▲', 5, 7, '▼'], ['A▲', 'B▼']))?.reason, 'head-on-junction')
  assert.equal(validate(path(['●', 7, 5, '●'], ['A●', 'B●']))?.reason, 'head-on-junction')
})
// ▲ ► ▼ ◄ must point at the node their end names; ● has no point, so it may touch its node on any side. A directional
// mark beside its node that points away is drawn, but misplaced.
test('A5.mutation-tests: a directional head points at the end node it is next to', () => {
  assert.equal(validate(path(['▲', 5], ['A▲'])), null)
  assert.equal(validate(path([5, '▲'], ['B▲']))?.reason, 'end-misplaced')
  assert.equal(validate(path(['◄', 10], ['A◄'], true)), null)
  assert.equal(validate(path([10, '►'], ['B►'], true)), null)
  assert.equal(validate(path([10, '◄'], ['B◄'], true))?.reason, 'end-misplaced')
  assert.equal(validate(path(['►', 10], ['A►'], true))?.reason, 'end-misplaced')
})
// a, an empty cell, b, then three empty cells: 3 columns once the trailing spaces drop, the gap between a and b included.
test('A5.mutation-tests: a row is measured as drawn: an empty cell counts as a space, and trailing spaces drop', () => {
  const c = createCanvas(1, 6, 6); c.text(0, 0, 'a', 'label', 'n1'); c.text(0, 2, 'b', 'label', 'n2')
  const d = c.toDrawing({ labels: [{ owner: 'n1', text: 'a' }, { owner: 'n2', text: 'b' }], edges: [], edgeLabels: [], frames: [] })
  assert.equal(validate({ ...d, columns: 3 }), null)
  assert.equal(validate({ ...d, columns: 2 })?.reason, 'row-too-wide')
})
// 中 and 文 are W and U+3000 IDEOGRAPHIC SPACE is F: two columns each. Only an ASCII space at the end drops.
test('A5.mutation-tests: a W/F character counts two columns in a row, and a trailing ideographic space does not drop', () => {
  assert.equal(validate({ ...label('中文', [['中文']]), columns: 4 }), null)
  assert.equal(validate({ ...label('中文', [['中文']]), columns: 3 })?.reason, 'row-too-wide')
  assert.equal(validate({ ...label('a', [['a\u3000']]), columns: 2 })?.reason, 'row-too-wide')
})

// Edge A>B along row 0, a──►b, and label L1 of edge `edge` as one cell L at row, col, listing L1 then that edge.
function labelled(row: number, col: number, edge = 'A>B'): Drawing {
  const c = createCanvas(3, 5, 5); c.text(0, 0, 'a', 'node', 'A'); c.line(0, 1, 10, 'light', 'edge', 'A>B'); c.line(0, 2, 10, 'light', 'edge', 'A>B')
  c.arrow(0, 3, '►', 'A>B'); c.text(0, 4, 'b', 'node', 'B'); c.text(row, col, 'L', 'label', ['L1', edge])
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'L1', text: 'L' }],
    edges: [{ id: 'A>B', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '►' }] }], edgeLabels: [{ owner: 'L1', edge }], frames: [] })
}
// (1,0) and (1,4) touch the edge only at a corner: distance 1. (2,2) is distance 2. (1,2) is under A>B, not its edge X>Y.
test('A5.mutation-tests: an edge label needs a cell within Chebyshev distance 1 of a line or arrow cell of its own edge', () => {
  assert.equal(validate(labelled(1, 0)), null)
  assert.equal(validate(labelled(1, 4)), null)
  assert.equal(validate(labelled(2, 2))?.reason, 'label-not-adjacent')
  assert.equal(validate(labelled(1, 2, 'X>Y'))?.reason, 'label-not-adjacent')
})
// Each drawing breaks two adjacent checks of labels, edges, conflicts, row widths and edge labels. The last breaks an edge
// twice: its ▲ sits on a junction, and its ▼ is missing.
test('A5.mutation-tests: a drawing broken two ways reports the earlier check', () => {
  assert.equal(validate(cut(cut(two(), 3, 2), 1, 2))?.reason, 'label-missing')
  assert.equal(validate({ ...cut(two(), 1, 2), conflicts: [{ row: 0, col: 2, had: 'a', by: 'X' }] })?.reason, 'edge-disconnected')
  assert.equal(validate({ ...two(), conflicts: [{ row: 0, col: 2, had: 'a', by: 'X' }], columns: 2 })?.reason, 'overwrite')
  assert.equal(validate({ ...labelled(2, 2), columns: 2 })?.reason, 'row-too-wide')
  assert.equal(validate(path(['▲', 7, 5, 5], ['A▲', 'B▼']))?.reason, 'edge-disconnected')
})
// An edge owns only its end marks' arrow cells. The canvas merges a same-glyph arrow of edges that share an endpoint, so an edge
// whose arrow lands on another edge's head owns an extra head, which fails; a merged fan-in head, <-->, o and x ends pass.
test('A5.mutation-tests: an arrow cell an edge owns beyond its heads fails head-extra', () => {
  const draw = (rows: number, cols: number, nodes: [string, number, number][], ink: (c: Canvas) => void,
    edges: { id: string; from: string; to: string; ends: { node: string; glyph: string }[] }[]): Drawing => {
    const c = createCanvas(rows, cols, cols, () => true)
    for (const [id, r, col] of nodes) { c.text(r, col, id, 'node', id) }
    ink(c)
    return c.toDrawing({ labels: nodes.map(([id]) => ({ owner: id, text: id })), edges, edgeLabels: [], frames: [] })
  }
  const extra = draw(2, 3, [['A', 0, 0], ['B', 0, 2], ['C', 1, 2]], c => {
    c.arrow(0, 1, '►', 'e0'); c.line(1, 0, 3, 'light', 'edge', 'e1'); c.arrow(1, 1, '►', 'e1'); c.arrow(0, 1, '►', 'e1')
  }, [{ id: 'e0', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '►' }] }, { id: 'e1', from: 'A', to: 'C', ends: [{ node: 'C', glyph: '►' }] }])
  assert.deepEqual(extra.cells[0]![1]!.owners, ['e0', 'e1'])
  assert.equal(validate(extra)?.reason, 'head-extra')
  const fanIn = draw(3, 3, [['A', 0, 0], ['B', 0, 2], ['C', 2, 1]], c => {
    c.line(1, 0, 3, 'light', 'edge', 'e0'); c.arrow(1, 1, '▼', 'e0'); c.line(1, 2, 9, 'light', 'edge', 'e1'); c.arrow(1, 1, '▼', 'e1')
  }, [{ id: 'e0', from: 'A', to: 'C', ends: [{ node: 'C', glyph: '▼' }] }, { id: 'e1', from: 'B', to: 'C', ends: [{ node: 'C', glyph: '▼' }] }])
  assert.equal(validate(fanIn), null)
  for (const [l, r] of [['◄', '►'], ['o', 'x']] as const) {
    const ends = draw(1, 5, [['A', 0, 0], ['B', 0, 4]], c => { c.arrow(0, 1, l, 'e'); c.line(0, 2, 10, 'light', 'edge', 'e'); c.arrow(0, 3, r, 'e') },
      [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'A', glyph: l }, { node: 'B', glyph: r }] }])
    assert.equal(validate(ends), null, `${l} ${r}`)
  }
})

// The pipeline at explain's natural step: rankGap 3, nodeGap 4, no wrap, 80 columns.
function drawn(gr: Graph): Drawing {
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }); if ('reason' in p) { throw new Error(p.reason) }
  const routes = routeGraph(p); if ('reason' in routes) { throw new Error(routes.reason) }
  return drawGraph(p, routes, 80)
}
// QA's repro: the ┼ under B holds B→D straight down, E's self-loop straight across, and B→E turning inside it, so the ┼
// joins all three, and the loop's bare end at E seems to lead to D.
test('A5.mutation-tests: a crossing that hides a third edge turning inside it joins all three and fails merge-ambiguous', () => {
  const c = createCanvas(8, 8, 80, () => true)
  c.text(0, 3, 'B', 'node', 'B')
  c.text(6, 3, 'D', 'node', 'D')
  c.text(3, 7, 'E', 'node', 'E')
  for (let r = 1; r <= 4; r++) { c.line(r, 3, 5, 'light', 'edge', 'B>D') }
  c.arrow(5, 3, '▼', 'B>D')
  for (let r = 4; r <= 6; r++) {
    c.line(r, 7, 5, 'light', 'edge', 'E>E')
    c.line(r, 0, 5, 'light', 'edge', 'E>E')
  }
  c.line(7, 7, 9, 'light', 'edge', 'E>E')
  for (let col = 1; col <= 6; col++) { c.line(7, col, 10, 'light', 'edge', 'E>E') }
  c.line(7, 0, 3, 'light', 'edge', 'E>E')
  c.line(3, 0, 6, 'light', 'edge', 'E>E')
  for (let col = 1; col <= 5; col++) { c.line(3, col, 10, 'light', 'edge', 'E>E') }
  c.arrow(3, 6, '►', 'E>E')
  c.line(1, 3, 5, 'light', 'edge', 'B>E')
  c.line(2, 3, 5, 'light', 'edge', 'B>E')
  c.line(3, 3, 3, 'light', 'edge', 'B>E')
  c.line(3, 4, 10, 'light', 'edge', 'B>E')
  c.line(3, 5, 10, 'light', 'edge', 'B>E')
  c.arrow(3, 6, '►', 'B>E')
  const d = c.toDrawing({ labels: ['B', 'D', 'E'].map(owner => ({ owner, text: owner })), edgeLabels: [], edges: [
    { id: 'B>D', from: 'B', to: 'D', ends: [{ node: 'D', glyph: '▼' }] },
    { id: 'E>E', from: 'E', to: 'E', ends: [{ node: 'E', glyph: '►' }] },
    { id: 'B>E', from: 'B', to: 'E', ends: [{ node: 'E', glyph: '►' }] },
  ] })
  assert.deepEqual(d.cells[3]![3]!.segs, [
    { owner: 'B>D', dirs: 5 }, { owner: 'E>E', dirs: 10 }, { owner: 'B>E', dirs: 3 },
  ])
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})
// A hand-drawn grid: nodes [id, row, col, owners?] drawn as their id; marks [edge, row, col, a line's dirs or a head glyph];
// edges 'id from to head?'. Any two owners may merge a line or arrow cell, so only the validator judges a meeting.
type Mark = [string, number, number, number | string]
const v = (o: string, c: number, r0: number, r1: number): Mark[] => Array.from({ length: r1 - r0 + 1 }, (_, i) => [o, r0 + i, c, 5])
const h = (o: string, r: number, c0: number, c1: number): Mark[] => Array.from({ length: c1 - c0 + 1 }, (_, i) => [o, r, c0 + i, 10])
function sketch(rows: number, cols: number, nodes: [string, number, number, string[]?][], marks: Mark[], edges: string[]): Drawing {
  const c = createCanvas(rows, cols, cols, () => true)
  for (const [id, r, col, owners] of nodes) { c.text(r, col, id, 'node', owners ?? id) }
  for (const [o, r, col, x] of marks) { if (typeof x === 'number') { c.line(r, col, x, 'light', 'edge', o); } else { c.arrow(r, col, x, o) } }
  return c.toDrawing({ labels: nodes.map(([id]) => ({ owner: id, text: id })), edgeLabels: [], frames: [],
    edges: edges.map(s => { const [id = '', from = '', to = '', head] = s.split(' '); return { id, from, to, ends: head ? [{ node: to, glyph: head }] : [] } }) })
}
test('A5.mutation-tests: unrelated edges cross straight and perpendicular, and related edges meet any way, and both pass', () => {
  // ┼: A→B down column 3 crosses C→D along row 3.
  assert.equal(validate(sketch(7, 7, [['A', 0, 3], ['B', 6, 3], ['C', 3, 0], ['D', 3, 6]],
    [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']], ['e0 A B ▼', 'e1 C D ►'])), null)
  // ┬: A→B and A→C leave A together, and A→C turns down at the fork.
  assert.equal(validate(sketch(4, 6, [['A', 0, 0], ['B', 0, 5], ['C', 3, 2]],
    [...h('e0', 0, 1, 3), ['e0', 0, 4, '►'], ['e1', 0, 1, 10], ['e1', 0, 2, 12], ['e1', 1, 2, 5], ['e1', 2, 2, '▼']], ['e0 A B ►', 'e1 A C ▼'])), null)
  // A→B and A→C share row 2 until A→C turns at ┬, and X→Y crosses their shared run at column 2.
  assert.equal(validate(sketch(6, 8, [['A', 2, 0], ['B', 2, 7], ['C', 5, 4], ['X', 0, 2], ['Y', 5, 2]],
    [...h('e0', 2, 1, 5), ['e0', 2, 6, '►'], ...h('e1', 2, 1, 3), ['e1', 2, 4, 12], ['e1', 3, 4, 5], ['e1', 4, 4, '▼'], ...v('e2', 2, 1, 3), ['e2', 4, 2, '▼']],
    ['e0 A B ►', 'e1 A C ▼', 'e2 X Y ▼'])), null)
})
test('A5.mutation-tests: unrelated edges overlapping on one axis, or any turn inside their crossing, join and fail merge-ambiguous', () => {
  // N→B and member row M→K drawn down one column as one line: each runs straight, but on the same axis, so N seems to lead to K.
  assert.equal(validate(sketch(7, 1, [['N', 0, 0], ['M', 1, 0, ['M', 'N']], ['K', 5, 0, ['K', 'B']], ['B', 6, 0]],
    [...v('e0', 0, 2, 3), ['e0', 4, 0, '▼'], ...v('e1', 0, 2, 3), ['e1', 4, 0, '▼']], ['e0 N B ▼', 'e1 M K ▼']))?.reason, 'merge-ambiguous')
  // B→D crosses X→Y straight, and B→Y, related to both, turns inside their ┼ onto X→Y's run, so all three join: X seems to
  // lead to D.
  assert.equal(validate(sketch(6, 8, [['B', 0, 3], ['D', 5, 3], ['X', 2, 0], ['Y', 2, 7]],
    [...v('e0', 3, 1, 3), ['e0', 4, 3, '▼'], ['e1', 1, 3, 5], ['e1', 2, 3, 3], ...h('e1', 2, 4, 5), ['e1', 2, 6, '►'], ...h('e2', 2, 1, 5), ['e2', 2, 6, '►']],
    ['e0 B D ▼', 'e1 B Y ►', 'e2 X Y ►']))?.reason, 'merge-ambiguous')
})
// C→D's middle cell drawn ─, or ┴ with an arm up at A→B's ►: an arrowhead ends only its own edges, so that arm dangles.
test("A3: a line arm that points at another edge's arrowhead fails line-dangling", () => {
  const d = (mid: number) => sketch(2, 6, [['A', 0, 0], ['B', 0, 3], ['C', 1, 0], ['D', 1, 5]],
    [['e0', 0, 1, 10], ['e0', 0, 2, '►'], ['e1', 1, 1, 10], ['e1', 1, 2, mid], ['e1', 1, 3, 10], ['e1', 1, 4, '►']], ['e0 A B ►', 'e1 C D ►'])
  assert.equal(validate(d(10)), null)
  assert.equal(validate(d(11))?.reason, 'line-dangling')
})
// dag/114's shape: A→B leaves A down, U-turns right and up into B, and C→D crosses both legs in adjacent cells. Each ┼ is a
// straight crossing, yet its neighbour ┼ points back at A→B a third time: only the dirs each edge drew there tell them apart.
test('A5.mutation-tests: an edge crossed twice in adjacent cells, as its U-turn straddles another edge, passes', () => {
  assert.equal(validate(sketch(5, 7, [['A', 0, 2], ['B', 0, 3], ['C', 3, 0], ['D', 3, 6]],
    [...v('e0', 2, 1, 3), ['e0', 4, 2, 3], ['e0', 4, 3, 9], ...v('e0', 3, 2, 3), ['e0', 1, 3, '▲'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']],
    ['e0 A B ▲', 'e1 C D ►'])), null)
})
// A plain ┼ whose cell does not say which dirs each edge drew there, as a hand-built cell may not, joins its edges, so it
// fails closed: A seems to lead to D.
test('A5.mutation-tests: a crossing cell without per-owner dirs joins its edges and fails merge-ambiguous', () => {
  const d = sketch(7, 7, [['A', 0, 3], ['B', 6, 3], ['C', 3, 0], ['D', 3, 6]],
    [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']], ['e0 A B ▼', 'e1 C D ►'])
  assert.equal(validate(d), null)
  delete d.cells[3]![3]!.segs
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
})

// merge-ambiguous: edges whose drawn lines join read as one line, so each end without a mark seems to lead to each head on
// it. A merge that implies an edge the drawing does not have fails, by explain at 80 columns and on hand-built grids.
const verdict = (src: string) => { const r = explain(src, { columns: 80, theme: 'mono' }); return 'reason' in r ? r.reason : null }
test('merge-ambiguous: QA repros render after the router separates unsafe merges', () => {
  assert.equal(verdict('flowchart TB\nA --> B\nA --> C\nD --> B'), null)
  assert.equal(verdict('flowchart TB\nA --> C\nB <--> C'), null)
})
test('merge-ambiguous: fan-out, fan-in, complete bipartite, a self-loop, a two-headed edge and open links still draw', () => {
  for (const src of ['A --> B\nA --> C', 'A --> C\nB --> C', 'A & B --> C & D', 'A --> A', 'A <--> B', 'A --- B\nA --- C'])
    { assert.equal(verdict(`flowchart TB\n${src}`), null, src) }
})
// sketch, with each edge 'id from to' then its end marks, each its node and glyph: 'e1 B C C▼ B▲'.
function marked(rows: number, cols: number, nodes: [string, number, number][], marks: Mark[], edges: string[]): Drawing {
  const d = sketch(rows, cols, nodes, marks, [])
  d.expect = { ...d.expect, edges: edges.map(s => {
    const [id = '', from = '', to = '', ...ends] = s.split(' ')
    return { id, from, to, ends: ends.map(x => ({ node: x[0]!, glyph: x.slice(1) })) }
  }) }
  return d
}
// Repro 1: A→C (e0) down column 0; A→B (e1) leaves it at ├ for ┤ and B's stem; D→B (e2) down that stem into B's ▼.
const m1: Mark[] = [...v('e0', 0, 1, 3), ['e0', 4, 0, '▼'], ['e1', 1, 0, 5], ['e1', 2, 0, 3], ...h('e1', 2, 1, 2), ['e1', 2, 3, 12],
  ['e1', 3, 3, 5], ['e1', 4, 3, '▼'], ...v('e2', 3, 1, 3), ['e2', 4, 3, '▼']]
const merge1 = (keep: string[]) => marked(6, 4, [['A', 0, 0], ['D', 0, 3], ['C', 5, 0], ['B', 5, 3]], m1.filter(m => keep.includes(m[0])),
  ['e0 A C C▼', 'e1 A B B▼', 'e2 D B B▼'].filter(s => keep.includes(s.slice(0, 2))))
// Repro 2: A→C (e0) turns at └ and joins C's stem at ┬; B's edge e1 leaves B at ▲ or │, turns at ┘ and runs into the ┬.
const merge2 = (twoHeaded: boolean) => marked(6, 4, [['A', 0, 0], ['B', 0, 3], ['C', 5, 1]],
  [['e0', 1, 0, 5], ['e0', 2, 0, 3], ['e0', 2, 1, 12], ['e0', 3, 1, 5], ['e0', 4, 1, '▼'], ['e1', 1, 3, twoHeaded ? '▲' : 5],
    ['e1', 2, 3, 9], ['e1', 2, 2, 10], ['e1', 2, 1, 6], ['e1', 3, 1, 5], ['e1', 4, 1, '▼']], ['e0 A C C▼', `e1 B C C▼${twoHeaded ? ' B▲' : ''}`])
// Open link B --- A (e1) runs from B along row 2 into A→C's (e0) stem at ├.
const merge3 = () => marked(6, 4, [['A', 0, 0], ['B', 0, 3], ['C', 5, 0]],
  [...v('e0', 0, 1, 3), ['e0', 4, 0, '▼'], ['e1', 1, 3, 5], ['e1', 2, 3, 9], ...h('e1', 2, 1, 2), ['e1', 2, 0, 3], ['e1', 1, 0, 5]], ['e0 A C C▼', 'e1 B A'])
test('merge-ambiguous: a hand-built merge fails when an unmarked end reaches a head it has no edge to, and passes otherwise', () => {
  assert.equal(validate(merge1(['e0', 'e1', 'e2']))?.reason, 'merge-ambiguous')   // D seems to lead to C
  assert.equal(validate(merge1(['e0', 'e1'])), null)                              // a fan-out on A's stem
  assert.equal(validate(merge1(['e1', 'e2'])), null)                              // a fan-in on B's stem and head
  assert.equal(validate(merge2(true))?.reason, 'merge-ambiguous')                 // A seems to lead to B
  assert.equal(validate(merge2(false)), null)                                     // B→C: a fan-in
  assert.equal(validate(merge3())?.reason, 'merge-ambiguous')                     // B seems to lead to C
  assert.equal(validate(fork()), null)
  // ┼: A→B down column 3 crosses C→D along row 3; their own dirs there share no arm, so the lines do not join.
  assert.equal(validate(sketch(7, 7, [['A', 0, 3], ['B', 6, 3], ['C', 3, 0], ['D', 3, 6]],
    [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']], ['e0 A B ▼', 'e1 C D ►'])), null)
})
// P→Q (e0) down column 0, and Q→R (e1) leaving Q's side to run up e0's line from ├ to ├ before it turns off to R. With P<-->Q,
// Q's bare end reaches Q's own ▼: a loop Q→Q that is not there. With e0 drawn reversed, only P's ▲, it reaches P's ▲, real as
// e0 drawn back, and R's ▲, real as e1.
const pq = (twoHeaded: boolean) => marked(9, 3, [['P', 0, 0], ['R', 0, 2], ['Q', 8, 0]], [['e0', 1, 0, '▲'], ...v('e0', 0, 2, 6),
  ['e0', 7, 0, twoHeaded ? '▼' : 5], ['e1', 8, 1, 9], ...v('e1', 1, 6, 7), ['e1', 5, 1, 12], ['e1', 5, 0, 3], ['e1', 4, 0, 5],
  ['e1', 3, 0, 6], ['e1', 3, 1, 10], ['e1', 3, 2, 9], ['e1', 2, 2, 5], ['e1', 1, 2, '▲']], [`e0 P Q P▲${twoHeaded ? ' Q▼' : ''}`, 'e1 Q R R▲'])
test('merge-ambiguous: a bare end merged into a line may lead to a node that line marks, but not back to its own node', () => {
  assert.equal(validate(pq(true))?.reason, 'merge-ambiguous')
  assert.equal(validate(pq(false)), null)
})

// QA's fix-cycle repros, hand-built with heads beside their targets.
// 1: A→B (e0) turns right at the ┼ (3,3) and B→C (e1) turns left there, by segs 3 and 12: no arm in common, but the ┼ shows
// all four arms joined, so A seems to lead to C. Straight through the same ┼, A→B and C→D cross.
test('merge-ambiguous: edges that turn inside one ┼ join by its glyph, though their own dirs share no arm', () => {
  const d = marked(6, 7, [['A', 0, 3], ['B', 3, 6], ['C', 3, 0]], [...v('e0', 3, 1, 2), ['e0', 3, 3, 3], ['e0', 3, 4, 10], ['e0', 3, 5, '►'],
    ['e1', 4, 6, 5], ['e1', 5, 6, 9], ...h('e1', 5, 4, 5), ['e1', 5, 3, 3], ['e1', 4, 3, 5], ['e1', 3, 3, 12], ['e1', 3, 2, 10],
    ['e1', 3, 1, '◄']], ['e0 A B B►', 'e1 B C C◄'])
  assert.deepEqual(d.cells[3]![3]!.segs, [{ owner: 'e0', dirs: 3 }, { owner: 'e1', dirs: 12 }])
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
  assert.equal(validate(sketch(7, 7, [['A', 0, 3], ['B', 6, 3], ['C', 3, 0], ['D', 3, 6]],
    [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']], ['e0 A B ▼', 'e1 C D ►'])), null)
})
// 2: A→B (e0) down column 0, and B→A (e1) up column 1, along e0's trunk from ├ to ├ and round into A's ◄: the trunk seems
// to lead A to A and B to B, loops that are not there. Up column 2 instead, apart from e0, it implies nothing.
const shared2: Mark[] = [['e1', 8, 1, 9], ...v('e1', 1, 6, 7), ['e1', 5, 1, 12], ['e1', 5, 0, 3], ['e1', 4, 0, 5], ['e1', 3, 0, 6], ['e1', 3, 1, 10], ['e1', 3, 2, 9]]
const apart2: Mark[] = [['e1', 8, 1, 10], ['e1', 8, 2, 9], ...v('e1', 2, 3, 7)]
const twoWay = (route: Mark[]) => marked(9, 3, [['A', 0, 0], ['B', 8, 0]], [...v('e0', 0, 1, 6), ['e0', 7, 0, '▼'], ...route,
  ...v('e1', 2, 1, 2), ['e1', 0, 2, 12], ['e1', 0, 1, '◄']], ['e0 A B B▼', 'e1 B A A◄'])
test('merge-ambiguous: a trunk that A→B and B→A share implies the self-loops A→A and B→B', () => {
  assert.equal(validate(twoWay(shared2))?.reason, 'merge-ambiguous')
  assert.equal(validate(twoWay(apart2)), null)
})
// 3: A, B over C, D: each edge runs down from its source, along row 3 into the trunk down column 3, along row 7 and down into
// its target's ▼, which it shares. Every pair the trunk implies is an edge, though two pairs of edges share no endpoint; with
// B→C gone, B seems to lead to C.
const trunk = (ids: string[]) => marked(11, 7, [['A', 0, 0], ['B', 0, 6], ['C', 10, 0], ['D', 10, 6]], ids.flatMap((id): Mark[] => {
  const s = id[0] === 'A' ? 0 : 6
const  t = id[1] === 'C' ? 0 : 6
  return [...v(id, s, 1, 2), [id, 3, s, s ? 9 : 3], ...h(id, 3, Math.min(s, 3) + 1, Math.max(s, 3) - 1), [id, 3, 3, s ? 6 : 12],
    ...v(id, 3, 4, 6), [id, 7, 3, t ? 3 : 9], ...h(id, 7, Math.min(t, 3) + 1, Math.max(t, 3) - 1), [id, 7, t, t ? 12 : 6], [id, 8, t, 5], [id, 9, t, '▼']]
}), ids.map(id => `${id} ${id[0]} ${id[1]} ${id[1]}▼`))
test('merge-ambiguous: a complete bipartite trunk passes, as crossings leave a cell whose edges all join to merges', () => {
  assert.equal(validate(trunk(['AC', 'AD', 'BC', 'BD'])), null)
  assert.equal(validate(trunk(['AC', 'AD', 'BD']))?.reason, 'merge-ambiguous')
})
// 4: A→C (e0) from the left and B's edge e1 from the right meet only in C's ▼. As B<-->C, A seems to lead to B; as B→C, the
// two make a fan-in.
const arrowOnly = (twoHeaded: boolean) => marked(4, 5, [['A', 0, 0], ['B', 0, 4], ['C', 3, 2]], [['e0', 1, 0, 5], ['e0', 2, 0, 3],
  ['e0', 2, 1, 10], ['e0', 2, 2, '▼'], ['e1', 1, 4, twoHeaded ? '▲' : 5], ['e1', 2, 4, 9], ['e1', 2, 3, 10], ['e1', 2, 2, '▼']],
  ['e0 A C C▼', `e1 B C C▼${twoHeaded ? ' B▲' : ''}`])
test('merge-ambiguous: edges that share only an arrowhead join there', () => {
  assert.equal(validate(arrowOnly(true))?.reason, 'merge-ambiguous')
  assert.equal(validate(arrowOnly(false)), null)
})
// A self-loop A→A (e1) leaves A down the stem of A→B (e0), turns right at ├ and up into A's ◄: A's bare ends reach B's ▼,
// real as A→B, and the loop's ◄, real as the loop.
const loopFan = (ids: string[]) => marked(6, 2, [['A', 0, 0], ['B', 5, 0]], ([...v('e0', 0, 1, 3), ['e0', 4, 0, '▼'], ['e1', 1, 0, 5],
  ['e1', 2, 0, 3], ['e1', 2, 1, 9], ['e1', 1, 1, 5], ['e1', 0, 1, '◄']] as Mark[]).filter(m => ids.includes(m[0])),
  ['e0 A B B▼', 'e1 A A A◄'].filter(s => ids.includes(s.slice(0, 2))))
test('merge-ambiguous: an honest self-loop, alone or on a stem it shares, and a lone A<-->B pass', () => {
  assert.equal(validate(loopFan(['e1'])), null)
  assert.equal(validate(loopFan(['e0', 'e1'])), null)
  assert.equal(validate(path(['▲', 5, '▼'], ['A▲', 'B▼'])), null)
})
// Unmarked edges joined in one line show no direction, so each end seems to lead to every other: only edges that all leave
// one node, or all enter one, read true. A and B over C: e0 from A and e1 from B meet at ┬ and run down one stem into C.
const open = (edges: string[]) => sketch(4, 5, [['A', 0, 0], ['B', 0, 4], ['C', 3, 2]], [['e0', 1, 0, 5], ['e0', 2, 0, 3],
  ['e0', 2, 1, 10], ['e0', 2, 2, 12], ['e1', 1, 4, 5], ['e1', 2, 4, 9], ['e1', 2, 3, 10], ['e1', 2, 2, 6]], edges)
// └ ┬ ┘ then ┌ ┴ ┐: e0 from A to D and e1 from B to C share the stem between, then cross to each other's side.
const cross = () => sketch(5, 3, [['A', 0, 0], ['B', 0, 2], ['C', 4, 0], ['D', 4, 2]], [['e0', 1, 0, 3], ['e0', 1, 1, 12],
  ['e0', 2, 1, 5], ['e0', 3, 1, 3], ['e0', 3, 2, 12], ['e1', 1, 2, 9], ['e1', 1, 1, 6], ['e1', 2, 1, 5], ['e1', 3, 1, 9], ['e1', 3, 0, 6]], ['e0 A D', 'e1 B C'])
test('merge-ambiguous: unmarked edges joined in one line pass only when all leave one node or all enter one', () => {
  assert.equal(validate(open(['e0 A C', 'e1 B C'])), null)                       // fan-in to C
  assert.equal(validate(open(['e0 C A', 'e1 C B'])), null)                       // fan-out from C
  assert.equal(validate(open(['e0 A C', 'e1 C B']))?.reason, 'merge-ambiguous')  // A seems linked to B
  assert.equal(validate(open(['e0 C A', 'e1 B C']))?.reason, 'merge-ambiguous')  // B seems linked to A
  assert.deepEqual(text(cross()), ['A B', '└┬┘', ' │', '┌┴┐', 'C D'])
  assert.equal(validate(cross())?.reason, 'merge-ambiguous')                     // A seems linked to C, B to D
})
// QA's mixed merge: A, B over C, D, each edge on one trunk along row 2 and, to H, down a stem in column 3 into H's ▼. Open
// A---B runs along the trunk and open A---C down column 0. Edges are named by their ends: 'AB', 'AH'.
const leg = (id: string, n: string): Mark[] => {
  const c = 'AC'.includes(n) ? 0 : 6
const  up = 'AB'.includes(n)
  return [[id, up ? 1 : 3, c, 5], [id, 2, c, (up ? 1 : 4) | (c ? 8 : 2)]]
}
const hub = (ids: string[]) => marked(8, 7, [['A', 0, 0], ['B', 0, 6], ['C', 4, 0], ['D', 4, 6], ['H', 7, 3]], ids.flatMap((id): Mark[] => {
  const left = 'AC'.includes(id[0]!)
  if (id[1] === 'H') { return [...leg(id, id[0]!), ...h(id, 2, left ? 1 : 4, left ? 2 : 5), [id, 2, 3, left ? 12 : 6], ...v(id, 3, 3, 5), [id, 6, 3, '▼']] }
  return id === 'AB' ? [...leg(id, 'A'), ...h(id, 2, 1, 5), ...leg(id, 'B')] : v(id, 0, 1, 3)
}), ids.map(id => `${id} ${id[0]} ${id[1]}${id[1] === 'H' ? ' H▼' : ''}`))
test('merge-ambiguous: marked and unmarked edges on one line are one network, and edges that share no node must imply only real links', () => {
  assert.deepEqual(text(hub(['AB', 'AC', 'AH', 'BH', 'CH', 'DH'])), ['A     B', '│     │', '├──┬──┤', '│  │  │', 'C  │  D', '   │', '   ▼', '   H'])
  assert.equal(validate(hub(['AB', 'AC', 'AH', 'BH', 'CH', 'DH']))?.reason, 'merge-ambiguous')  // QA: D seems linked to A, B and C
  assert.equal(validate(hub(['AB', 'AH', 'BH'])), null)                                        // a fan-in to H that A---B shares
  assert.equal(validate(hub(['AB', 'AH', 'BH', 'DH']))?.reason, 'merge-ambiguous')             // D seems linked to A and B
})
// QA: A <--> B (e0) and A <--> C (e1) share A's ▲ and one trunk along row 3 to B's and C's ▼, and an open self-loop A --- A
// (e2) runs round it. Every end is a head or bare, and a two-headed edge's heads may start a link, so B and C seem linked.
const twoHeads = (ids: string[]) => marked(8, 9, [['A', 0, 4], ['B', 7, 0], ['C', 7, 8]], ([
  ['e0', 1, 4, '▲'], ['e0', 2, 4, 5], ['e0', 3, 4, 9], ...h('e0', 3, 1, 3), ['e0', 3, 0, 6], ...v('e0', 0, 4, 5), ['e0', 6, 0, '▼'],
  ['e1', 1, 4, '▲'], ['e1', 2, 4, 5], ['e1', 3, 4, 3], ...h('e1', 3, 5, 7), ['e1', 3, 8, 12], ...v('e1', 8, 4, 5), ['e1', 6, 8, '▼'],
  ['e2', 0, 3, 6], ...v('e2', 3, 1, 2), ['e2', 3, 3, 3], ['e2', 3, 4, 10], ['e2', 3, 5, 9], ...v('e2', 5, 1, 2), ['e2', 0, 5, 12],
] as Mark[]).filter(m => ids.includes(m[0])), ['e0 A B A▲ B▼', 'e1 A C A▲ C▼', 'e2 A A'].filter(s => ids.includes(s.slice(0, 2))))
test('merge-ambiguous: heads of two-headed edges on one line imply a link between their nodes, with or without a bare end or loop', () => {
  assert.deepEqual(text(twoHeads(['e0', 'e1', 'e2'])), ['   ┌A┐', '   │▲│', '   │││', '┌──┴┴┴──┐', '│       │', '│       │', '▼       ▼', 'B       C'])
  assert.equal(validate(twoHeads(['e0', 'e1', 'e2']))?.reason, 'merge-ambiguous')  // QA: B seems linked to C
  assert.equal(validate(twoHeads(['e0', 'e1']))?.reason, 'merge-ambiguous')        // so without the loop
  // A <--> B with a bare loop at A on its line: the loop's bare ends read as A-->A and as A---B's own ends lead to B's head,
  // A-->B; the source has neither (a self-loop needs the head kind too).
  assert.deepEqual(falsePairs(twoHeads(['e0', 'e2'])), ['A->A', 'A->B'])
  assert.equal(validate(twoHeads(['e0', 'e2']))?.reason, 'merge-ambiguous')
})
// A lifeline is read as the participant whose pill heads it, so each lifeline cell lies in its own pill's columns: header
// pills of one width swapped over their lifelines reverse every message.
test('lifeline-unbound: a lifeline under another participant\'s pill fails', () => {
  const r = explain('sequenceDiagram\nparticipant A\nparticipant B\nA->>B: hi', { columns: 80, theme: 'mono' }) as { drawing: Drawing }
  const d = structuredClone(r.drawing)
  assert.equal(validate(d), null)
  assert.deepEqual(text(d)[0], '[ A ] [ B ]')
  const row = d.cells[0]!
const  a = row.slice(0, 5)
const  b = row.slice(6, 11)
  row.splice(0, 5, ...b); row.splice(6, 5, ...a)
  assert.deepEqual(text(d)[0], '[ B ] [ A ]')
  assert.equal(validate(d)?.reason, 'lifeline-unbound')
})
// A node's label reads as the node only inside its own pill: the box of the cap, fill and frame cells it draws. Moved a
// row off it, the pill is left empty and the label floats beside a line it does not end.
test('label-unbound: a node label moved off its pill fails', () => {
  for (const [src, id, dr] of [['mindmap\nRoot\n  A\n  B', 'm0', 1], ['flowchart TD\nA & B --> C & D', 'D', -1]] as const) {
    const r = explain(src, { columns: 80, theme: 'mono' }) as { drawing: Drawing }
    const d = structuredClone(r.drawing)
    assert.equal(validate(d), null, src)
    const mine = d.cells.flatMap((row, y) => row.flatMap((x, c) => (x?.kind === 'text' && x.owners[0] === id ? [[y, c] as const] : [])))
    for (const [y, c] of mine) { assert.equal(d.cells[y + dr]?.[c] ?? null, null, src) }
    for (const [y, c] of mine) { d.cells[y + dr]![c] = d.cells[y]![c]!; d.cells[y]![c] = null }
    assert.equal(validate(d)?.reason, 'label-unbound', src)
  }
})

// A complete-bipartite trunk, A→C, A→D, B→C and B→D merged into one line down column 2, crossed straight at (2,2) by an
// unrelated P→Q. The trunk's own unrelated pairs there (A→C with B→D, A→D with B→C) run one axis, as a trunk's do; merges
// judges them. Only pairs from different lines, the trunk's and P→Q's, must cross.
//   a ─┬─ b
//   p ─┼─►q
//     ┌┴┐  (to c and d)
function bipartite(): Drawing {
  const ends: Record<string, [string, string]> = { e1: ['A', 'C'], e2: ['A', 'D'], e3: ['B', 'C'], e4: ['B', 'D'], f: ['P', 'Q'] }
  const c = createCanvas(7, 6, 6, (a, b) => ends[a]!.some(x => ends[b]!.includes(x)))
  const L = (r: number, col: number, dirs: number, ids: string[]) => ids.forEach(id => c.line(r, col, dirs, 'light', 'edge', id))
  for (const [id, r, col] of [['A', 0, 0], ['B', 0, 4], ['P', 2, 0], ['Q', 2, 5], ['C', 6, 0], ['D', 6, 4]] as const) { c.text(r, col, id.toLowerCase(), 'node', id) }
  L(1, 0, 3, ['e1', 'e2']); L(1, 1, 10, ['e1', 'e2']); L(1, 2, 12, ['e1', 'e2']); L(1, 2, 6, ['e3', 'e4']); L(1, 3, 10, ['e3', 'e4']); L(1, 4, 9, ['e3', 'e4'])
  L(2, 2, 5, ['e1', 'e2', 'e3', 'e4']); L(3, 2, 5, ['e1', 'e2', 'e3', 'e4'])
  L(4, 2, 9, ['e1', 'e3']); L(4, 2, 3, ['e2', 'e4']); L(4, 1, 10, ['e1', 'e3']); L(4, 0, 6, ['e1', 'e3']); L(4, 3, 10, ['e2', 'e4']); L(4, 4, 12, ['e2', 'e4'])
  for (const id of ['e1', 'e3']) { c.arrow(5, 0, '▼', id) }
  for (const id of ['e2', 'e4']) { c.arrow(5, 4, '▼', id) }
  L(2, 1, 10, ['f']); L(2, 2, 10, ['f']); L(2, 3, 10, ['f']); c.arrow(2, 4, '►', 'f')
  const node = (n: string) => ({ node: n, glyph: n === 'Q' ? '►' : '▼' })
  return c.toDrawing({ labels: ['A', 'B', 'C', 'D', 'P', 'Q'].map(o => ({ owner: o, text: o.toLowerCase() })),
    edges: Object.entries(ends).map(([id, [from, to]]) => ({ id, from, to, ends: [node(to)] })), edgeLabels: [], frames: [] })
}
test('A complete-bipartite trunk crossed straight by an unrelated edge passes', () => {
  const d = bipartite()
  assert.deepEqual(d.conflicts, []); assert.equal(text(d)[2], 'p─┼─►q')
  assert.equal(validate(d), null, text(d).join('\n'))
})
// A trunk edge that turns inside that ┼ instead, onto P→Q's arm, joins the two lines there: read as one line, P's bare tail
// seems to lead to c and d, so it still fails, now for merges to judge.
test('At that crossing, a trunk edge turning onto the crossing edge still fails', () => {
  const d = bipartite()
const  x = d.cells[2]![2]!
  d.cells[2]![2] = { ...x, segs: x.segs!.map(s => (s.owner === 'e1' ? { ...s, dirs: 6 } : s)) }   // e1 turns right inside the ┼
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
})

// The same trunk with mixed heads. B--xD's x head, on one line with A-->D's ▶, reads as A--xD too,
// and A-->D's as B-->D; neither is in the source, so the trunk must not pass. Each path runs through its corners, from its
// source's cell to its target's, its head the cell just before the target.
const STEP = (a: { r: number; c: number }, b: { r: number; c: number }) => (b.r < a.r ? 1 : b.c > a.c ? 2 : b.r > a.r ? 4 : 8)
function drawPath(c: Canvas, id: string, corners: [number, number][], head: string): void {
  const cells: { r: number; c: number }[] = []
  for (const [i, [r, col]] of corners.entries()) {
    if (i === 0) { cells.push({ r, c: col }); continue }
    const [r0, c0] = corners[i - 1]!
    for (let k = 1; k <= Math.abs(r - r0) + Math.abs(col - c0); k++) { cells.push({ r: r0 + Math.sign(r - r0) * k, c: c0 + Math.sign(col - c0) * k }) }
  }
  for (let i = 1; i < cells.length - 2; i++) { c.line(cells[i]!.r, cells[i]!.c, STEP(cells[i]!, cells[i - 1]!) | STEP(cells[i]!, cells[i + 1]!), 'light', 'edge', id) }
  const h = cells.at(-2)!; c.arrow(h.r, h.c, head, id)
}
function mixedHeads(): Drawing {
  const c = createCanvas(7, 8, 8, () => true)
  for (const [id, r, col] of [['A', 0, 0], ['B', 0, 4], ['P', 2, 0], ['Q', 2, 7], ['C', 6, 0], ['D', 6, 4]] as const) { c.text(r, col, id.toLowerCase(), 'node', id) }
  drawPath(c, 'AC', [[0, 0], [1, 0], [1, 2], [4, 2], [4, 0], [6, 0]], '▼')
  drawPath(c, 'AD', [[0, 0], [1, 0], [1, 2], [6, 2], [6, 4]], '►')
  drawPath(c, 'BC', [[0, 4], [1, 4], [1, 2], [4, 2], [4, 0], [6, 0]], '▼')
  drawPath(c, 'BD', [[0, 4], [1, 4], [1, 2], [4, 2], [4, 4], [6, 4]], 'x')
  drawPath(c, 'PQ', [[2, 0], [2, 7]], '►')
  const e = (id: string, from: string, to: string, glyph: string) => ({ id, from, to, ends: [{ node: to, glyph }] })
  return c.toDrawing({ labels: ['A', 'B', 'C', 'D', 'P', 'Q'].map(o => ({ owner: o, text: o.toLowerCase() })),
    edges: [e('AC', 'A', 'C', '▼'), e('AD', 'A', 'D', '►'), e('BC', 'B', 'C', '▼'), e('BD', 'B', 'D', 'x'), e('PQ', 'P', 'Q', '►')], edgeLabels: [], frames: [] })
}
test('A trunk whose heads differ implies links the source lacks, and fails merge-ambiguous', () => {
  const d = mixedHeads()
  assert.deepEqual(falsePairs(d), ['A-xD', 'B->D'], text(d).join('\n'))
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})
// The same trunk with B-->D dotted instead: its own cells ┄ beside the trunk's solid ones read as the merged line changing
// style, so any of its implied links may be dotted or solid. One line draws one style.
test('A trunk whose edges draw different line styles fails merge-ambiguous', () => {
  const c = createCanvas(7, 8, 8, () => true)
  for (const [id, r, col] of [['A', 0, 0], ['B', 0, 4], ['P', 2, 0], ['Q', 2, 7], ['C', 6, 0], ['D', 6, 4]] as const) { c.text(r, col, id.toLowerCase(), 'node', id) }
  drawPath(c, 'AC', [[0, 0], [1, 0], [1, 2], [4, 2], [4, 0], [6, 0]], '▼')
  drawPath(c, 'AD', [[0, 0], [1, 0], [1, 2], [6, 2], [6, 4]], '►')
  drawPath(c, 'BC', [[0, 4], [1, 4], [1, 2], [4, 2], [4, 0], [6, 0]], '▼')
  drawPath(c, 'PQ', [[2, 0], [2, 7]], '►')
  c.line(4, 3, 10, 'dotted', 'edge', 'BD'); c.line(4, 4, 12, 'dotted', 'edge', 'BD'); c.arrow(5, 4, '▼', 'BD')
  for (const [r, col, dirs] of [[1, 4, 9], [1, 3, 10], [1, 2, 6], [2, 2, 5], [3, 2, 5], [4, 2, 3]] as const) { c.line(r, col, dirs, 'light', 'edge', 'BD') }
  const e = (id: string, from: string, to: string, glyph: string) => ({ id, from, to, ends: [{ node: to, glyph }] })
  const d = c.toDrawing({ labels: ['A', 'B', 'C', 'D', 'P', 'Q'].map(o => ({ owner: o, text: o.toLowerCase() })),
    edges: [e('AC', 'A', 'C', '▼'), e('AD', 'A', 'D', '►'), e('BC', 'B', 'C', '▼'), e('BD', 'B', 'D', '▼'), e('PQ', 'P', 'Q', '►')], edgeLabels: [], frames: [] })
  assert.deepEqual(d.conflicts, [])
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})

// A self-loop needs the head kind too. A-->B and B-->A share column 3; read as one line, A's bare
// end leads to B-->A's ▶ at A (A->A) and B's to A-->B's at B (B->B). The loops at A and B are --x and --o, so neither
// pair is in the source.
test('A merged line implying a self-loop whose head the loop lacks fails merge-ambiguous', () => {
  const c = createCanvas(14, 8, 8, () => true)
  c.text(3, 3, 'a', 'node', 'A'); c.text(11, 3, 'b', 'node', 'B')
  drawPath(c, 'AB', [[3, 3], [11, 3]], '▼')
  drawPath(c, 'BA', [[11, 3], [11, 4], [8, 4], [8, 3], [6, 3], [6, 6], [3, 6], [3, 3]], '◄')
  drawPath(c, 'AA', [[3, 3], [0, 3], [0, 0], [3, 0], [3, 3]], 'x')
  drawPath(c, 'BB', [[11, 3], [13, 3], [13, 0], [11, 0], [11, 3]], 'o')
  const e = (id: string, from: string, to: string, glyph: string) => ({ id, from, to, ends: [{ node: to, glyph }] })
  const d = c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }],
    edges: [e('AB', 'A', 'B', '▼'), e('BA', 'B', 'A', '◄'), e('AA', 'A', 'A', 'x'), e('BB', 'B', 'B', 'o')], edgeLabels: [], frames: [] })
  assert.deepEqual(d.conflicts, [])
  assert.deepEqual(falsePairs(d), ['A->A', 'B->B'], text(d).join('\n'))
  assert.equal(validate(d)?.reason, 'merge-ambiguous', text(d).join('\n'))
})
// Hole 2: one edge draws one weight in every arm, not just one cell style. A-->C leaves A-->B's light stem at (0,2) with a
// heavy arm down, ┰, then runs on light: style 'light' everywhere, but the junction shows a thick branch. Its glyph shows a
// weight its edge does not draw, so it fails line-glyph.
test('A merged junction with a heavy arm on a light line fails line-glyph', () => {
  const c = createCanvas(4, 6, 6, () => true)
  c.text(0, 0, 'a', 'node', 'A'); c.text(0, 5, 'b', 'node', 'B'); c.text(3, 2, 'c', 'node', 'C')
  for (const col of [1, 2, 3]) { c.line(0, col, 10, 'light', 'edge', 'AB') }
  c.arrow(0, 4, '►', 'AB')
  c.line(0, 1, 10, 'light', 'edge', 'AC'); c.line(0, 2, 8, 'light', 'edge', 'AC'); c.line(0, 2, 4, 'heavy', 'edge', 'AC')
  c.line(1, 2, 5, 'light', 'edge', 'AC'); c.arrow(2, 2, '▼', 'AC')
  const d = c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'C', text: 'c' }],
    edges: [{ id: 'AB', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '►' }] }, { id: 'AC', from: 'A', to: 'C', ends: [{ node: 'C', glyph: '▼' }] }],
    edgeLabels: [], frames: [] })
  assert.deepEqual(d.conflicts, []); assert.equal(text(d)[0], 'a─┰─►b')
  assert.equal(validate(d)?.reason, 'line-glyph', text(d).join('\n'))
})

// X3. Emphasis is part of a label's text: a label is drawn as its marked text (core/emphasis.ts), each marker its cell's em.
test('X3.emphasis: a label drawn with emphasis it does not have, or without emphasis it has, fails label-missing', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  const b = emphasize('**b**')!
  assert.equal(validate(two('a', b)), null)
  const lost = two('a', b); lost.cells[3]![2] = { ...lost.cells[3]![2]!, em: undefined }
  assert.equal(validate(lost)?.reason, 'label-missing')
  const swapped = two('a', b); swapped.cells[3]![2] = { ...swapped.cells[3]![2]!, em: 2 }
  assert.equal(validate(swapped)?.reason, 'label-missing')
  const added = two(); added.cells[0]![2] = { ...added.cells[0]![2]!, em: 1 }
  assert.equal(validate(added)?.reason, 'label-missing')
})

test('X3.emphasis: em on any cell but a text cell, or outside BOLD | ITALIC, fails emphasis', () => {
  const line = two(); line.cells[1]![2] = { ...line.cells[1]![2]!, em: 1 }
  assert.equal(validate(line)?.reason, 'emphasis')
  const odd = two(); odd.cells[0]![2] = { ...odd.cells[0]![2]!, em: 4 }
  assert.equal(validate(odd)?.reason, 'emphasis')
})

// X3. A marker or any other control character in a cell's ch would carry emphasis, or nothing, past labels: instances
// reads ch as written, so a ch of marker + 'b' reads like em 1 on 'b'. No drawn glyph or source text holds one.
test('X3.emphasis: a control character in any cell\'s ch, a marker included, fails emphasis', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  for (const ch of [String.fromCharCode(1), String.fromCharCode(2), String.fromCharCode(3), String.fromCharCode(0), String.fromCharCode(27), String.fromCharCode(0x85)]) {
    const d = two('a', emphasize('**b**')!)
const  x = d.cells[3]![2]!
    const { em: _e, ...rest } = x
    d.cells[3]![2] = { ...rest, ch: ch + x.ch }
    assert.equal(validate(d)?.reason, 'emphasis', JSON.stringify(ch))
    const line = two(); line.cells[1]![2] = { ...line.cells[1]![2]!, ch: line.cells[1]![2]!.ch + ch }
    assert.equal(validate(line)?.reason, 'emphasis', JSON.stringify(ch))
  }
})
