import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'
import { labelLines } from '../../core/text.ts'; import type { Piece } from '../../core/text.ts'; import { explain } from '../../core/render.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { layoutGraph } from '../../core/graph/layered.ts'; import { routeGraph } from '../../core/graph/route.ts'
import type { Graph } from '../../core/graph/model.ts'; import { g, text } from './graph-fixture.ts'
function two(t1 = 'a', t2 = 'b'): Drawing {
  const c = createCanvas(4, 8, 8); c.text(0, 2, t1, 'node', 'A'); c.line(1, 2, 5, 'light', 'edge', 'A>B'); c.arrow(2, 2, '▼', 'A>B'); c.text(3, 2, t2, 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: t1 }, { owner: 'B', text: t2 }], edges: [{ id: 'A>B', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [], frames: [] })
}
const cut = (d: Drawing, r: number, c: number) => { d.cells[r]![c] = null; return d }

test('A3: edge-owned one-arm spurs fail line-dangling even when the edge connects', () => {
  const d = two()
  d.cells[1]![0] = { ch: '╶', kind: 'line', role: 'edge', owners: ['A>B'], dirs: 2 }
  assert.equal(validate(d)?.reason, 'line-dangling')
  const connected = two()
  connected.cells[1]![2] = { ...connected.cells[1]![2]!, dirs: 1 }
  assert.equal(validate(connected)?.reason, 'line-dangling')
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
  const line = (dirs: number, owners = ['A>B']) => ({ ch: '─', kind: 'line' as const, role: 'edge' as const, owners, dirs })
  // A disconnected loop has two arms per cell: valid arms first, then one missing reciprocal bit.
  loop.cells[0]![4] = line(6)
  loop.cells[0]![5] = line(12)
  loop.cells[1]![4] = line(3)
  loop.cells[1]![5] = line(9)
  assert.equal(validate(loop), null)
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
  const n = steps.length + 2, c = across ? createCanvas(1, n, n) : createCanvas(n, 1, 1), extra: { owner: string; text: string }[] = []
  const pos = (i: number): [number, number] => (across ? [0, i] : [i, 0])
  c.text(...pos(0), 'a', 'node', 'A')
  steps.forEach((s, i) => {
    if (typeof s === 'number') c.line(...pos(i + 1), s, 'light', 'edge', 'A>B')
    else if (typeof s === 'string') c.arrow(...pos(i + 1), s, 'A>B')
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
  assert.equal(validate(gap(c => { route(c); for (let r = 1; r < 4; r++) c.fill(r, 1, 1, 'edge', 'e') }, 2)), null)
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
    for (const [id, r, col] of nodes) c.text(r, col, id, 'node', id)
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
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }); if ('reason' in p) throw new Error(p.reason)
  const routes = routeGraph(p); if ('reason' in routes) throw new Error(routes.reason)
  return drawGraph(p, routes, 80)
}
// QA's repro: the ┼ under B holds B→D straight down, E's self-loop straight across, and B→E turning inside it.
test('A5.mutation-tests: a crossing that hides a third edge turning inside it fails crossing-ambiguous', () => {
  const c = createCanvas(8, 8, 80, () => true)
  c.text(0, 3, 'B', 'node', 'B')
  c.text(6, 3, 'D', 'node', 'D')
  c.text(3, 7, 'E', 'node', 'E')
  for (let r = 1; r <= 4; r++) c.line(r, 3, 5, 'light', 'edge', 'B>D')
  c.arrow(5, 3, '▼', 'B>D')
  for (let r = 4; r <= 6; r++) {
    c.line(r, 7, 5, 'light', 'edge', 'E>E')
    c.line(r, 0, 5, 'light', 'edge', 'E>E')
  }
  c.line(7, 7, 9, 'light', 'edge', 'E>E')
  for (let col = 1; col <= 6; col++) c.line(7, col, 10, 'light', 'edge', 'E>E')
  c.line(7, 0, 3, 'light', 'edge', 'E>E')
  c.line(3, 0, 6, 'light', 'edge', 'E>E')
  for (let col = 1; col <= 5; col++) c.line(3, col, 10, 'light', 'edge', 'E>E')
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
  assert.equal(validate(d)?.reason, 'crossing-ambiguous', text(d).join('\n'))
})
// A hand-drawn grid: nodes [id, row, col, owners?] drawn as their id; marks [edge, row, col, a line's dirs or a head glyph];
// edges 'id from to head?'. Any two owners may merge a line or arrow cell, so only the validator judges a meeting.
type Mark = [string, number, number, number | string]
const v = (o: string, c: number, r0: number, r1: number): Mark[] => Array.from({ length: r1 - r0 + 1 }, (_, i) => [o, r0 + i, c, 5])
const h = (o: string, r: number, c0: number, c1: number): Mark[] => Array.from({ length: c1 - c0 + 1 }, (_, i) => [o, r, c0 + i, 10])
function sketch(rows: number, cols: number, nodes: [string, number, number, string[]?][], marks: Mark[], edges: string[]): Drawing {
  const c = createCanvas(rows, cols, cols, () => true)
  for (const [id, r, col, owners] of nodes) c.text(r, col, id, 'node', owners ?? id)
  for (const [o, r, col, x] of marks) { if (typeof x === 'number') c.line(r, col, x, 'light', 'edge', o); else c.arrow(r, col, x, o) }
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
test('A5.mutation-tests: unrelated edges overlapping on one axis, or any turn inside their crossing, fail crossing-ambiguous', () => {
  // N→B and member row M→K drawn down one column as one line: each runs straight, but on the same axis.
  assert.equal(validate(sketch(7, 1, [['N', 0, 0], ['M', 1, 0, ['M', 'N']], ['K', 5, 0, ['K', 'B']], ['B', 6, 0]],
    [...v('e0', 0, 2, 3), ['e0', 4, 0, '▼'], ...v('e1', 0, 2, 3), ['e1', 4, 0, '▼']], ['e0 N B ▼', 'e1 M K ▼']))?.reason, 'crossing-ambiguous')
  // B→D crosses X→Y straight, and B→Y, related to both, turns inside their ┼ onto X→Y's run.
  assert.equal(validate(sketch(6, 8, [['B', 0, 3], ['D', 5, 3], ['X', 2, 0], ['Y', 2, 7]],
    [...v('e0', 3, 1, 3), ['e0', 4, 3, '▼'], ['e1', 1, 3, 5], ['e1', 2, 3, 3], ...h('e1', 2, 4, 5), ['e1', 2, 6, '►'], ...h('e2', 2, 1, 5), ['e2', 2, 6, '►']],
    ['e0 B D ▼', 'e1 B Y ►', 'e2 X Y ►']))?.reason, 'crossing-ambiguous')
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
// A plain ┼ whose cell does not say which dirs each edge drew there, as a hand-built cell may not, fails closed.
test('A5.mutation-tests: a crossing cell without per-owner dirs fails crossing-ambiguous', () => {
  const d = sketch(7, 7, [['A', 0, 3], ['B', 6, 3], ['C', 3, 0], ['D', 3, 6]],
    [...v('e0', 3, 1, 4), ['e0', 5, 3, '▼'], ...h('e1', 3, 1, 4), ['e1', 3, 5, '►']], ['e0 A B ▼', 'e1 C D ►'])
  assert.equal(validate(d), null)
  delete d.cells[3]![3]!.segs
  assert.equal(validate(d)?.reason, 'crossing-ambiguous')
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
    assert.equal(verdict(`flowchart TB\n${src}`), null, src)
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
// P<-->Q (e0) down column 0, and Q→R (e1) leaving Q's side to run up e0's line from ├ to ├ before it turns off to R: Q's
// bare end reaches P's ▲, real only as e0 drawn back from Q, and R's ▲, real as e1.
test('merge-ambiguous: a two-headed edge counts both ways, so a bare end merged into its line may lead to either node', () => {
  assert.equal(validate(marked(9, 3, [['P', 0, 0], ['R', 0, 2], ['Q', 8, 0]], [['e0', 1, 0, '▲'], ...v('e0', 0, 2, 6), ['e0', 7, 0, '▼'],
    ['e1', 8, 1, 9], ...v('e1', 1, 6, 7), ['e1', 5, 1, 12], ['e1', 5, 0, 3], ['e1', 4, 0, 5], ['e1', 3, 0, 6], ['e1', 3, 1, 10],
    ['e1', 3, 2, 9], ['e1', 2, 2, 5], ['e1', 1, 2, '▲']], ['e0 P Q Q▼ P▲', 'e1 Q R R▲'])), null)
})
