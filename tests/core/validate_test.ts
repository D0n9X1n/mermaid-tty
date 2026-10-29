import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'
import { labelLines } from '../../core/text.ts'; import type { Piece } from '../../core/text.ts'
function two(t1 = 'a', t2 = 'b'): Drawing {
  const c = createCanvas(4, 8, 8); c.text(0, 2, t1, 'node', 'A'); c.line(1, 2, 5, 'light', 'edge', 'A>B'); c.arrow(2, 2, '▼', 'A>B'); c.text(3, 2, t2, 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: t1 }, { owner: 'B', text: t2 }], edges: [{ id: 'A>B', from: 'A', to: 'B', heads: ['▼'] }], edgeLabels: [] })
}
const cut = (d: Drawing, r: number, c: number) => { d.cells[r]![c] = null; return d }
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
  return c.toDrawing({ labels: [{ owner: 'n1', text: expected }], edges: [], edgeLabels: [] })
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
  assert.equal(validate(c.toDrawing({ labels: [{ owner: 'n1', text: 'a' }, { owner: 'n9', text: 'x' }], edges: [], edgeLabels: [] })), null)
  assert.equal(validate(c.toDrawing({ labels: [{ owner: 'n1', text: 'a' }], edges: [], edgeLabels: [] }))?.reason, 'label-dup')
})
// Node N: header row n, then member row m, whose cells list N after their own id N.m. The edge touches only the member row.
test('A5.mutation-tests: a member row owns its own text, and an edge reaches its node through it', () => {
  const c = createCanvas(5, 1, 1); c.text(0, 0, 'n', 'node', 'N'); c.text(1, 0, 'm', 'node', ['N.m', 'N'])
  c.line(2, 0, 5, 'light', 'edge', 'N>B'); c.arrow(3, 0, '▼', 'N>B'); c.text(4, 0, 'b', 'node', 'B')
  const d = c.toDrawing({ labels: [{ owner: 'N', text: 'n' }, { owner: 'N.m', text: 'm' }, { owner: 'B', text: 'b' }], edges: [{ id: 'N>B', from: 'N', to: 'B', heads: ['▼'] }], edgeLabels: [] })
  assert.equal(validate(d), null)
})

// Edge A>B from a to b, one cell per step: down column 0, or along row 0 when across. A number is a line's dirs, a string an
// arrow glyph, null an empty cell, and { text, owners } a label cell, whose owners[0] expect lists with its text.
type Step = number | string | null | { text: string; owners: string[] }
function path(steps: readonly Step[], heads: readonly string[], across = false): Drawing {
  const n = steps.length + 2, c = across ? createCanvas(1, n, n) : createCanvas(n, 1, 1), extra: { owner: string; text: string }[] = []
  const pos = (i: number): [number, number] => (across ? [0, i] : [i, 0])
  c.text(...pos(0), 'a', 'node', 'A')
  steps.forEach((s, i) => {
    if (typeof s === 'number') c.line(...pos(i + 1), s, 'light', 'edge', 'A>B')
    else if (typeof s === 'string') c.arrow(...pos(i + 1), s, 'A>B')
    else if (s) { c.text(...pos(i + 1), s.text, 'label', s.owners); extra.push({ owner: s.owners[0]!, text: s.text }) }
  })
  c.text(...pos(n - 1), 'b', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, ...extra], edges: [{ id: 'A>B', from: 'A', to: 'B', heads }], edgeLabels: [] })
}
test('A5.mutation-tests: an edge whose line at from points away from it is disconnected', () => {
  assert.equal(validate(path([5, '▼'], ['▼'])), null)
  assert.equal(validate(path([4, '▼'], ['▼']))?.reason, 'edge-disconnected')
})
test('A5.mutation-tests: an edge whose cells stop short of to is disconnected, with or without a head', () => {
  assert.equal(validate(path([5, 5], [])), null)
  assert.equal(validate(path([5, null], []))?.reason, 'edge-disconnected')
  assert.equal(validate(path([5, null, 5, '▼'], ['▼']))?.reason, 'edge-disconnected')
})
// [5, 4]: the upper line points down, the lower one not up; [1, 5]: the lower line points up, the upper one not down.
test('A5.mutation-tests: two line cells join only where their dirs point at each other', () => {
  assert.equal(validate(path([5, 5, '▼'], ['▼'])), null)
  assert.equal(validate(path([5, 4, '▼'], ['▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path([1, 5, '▼'], ['▼']))?.reason, 'edge-disconnected')
})
// A forks at a ├ that A>B and A>C share: a in row 0, ├┐ in row 1, then ││, ▼▼ and bc.
function fork(): Drawing {
  const c = createCanvas(5, 2, 2, (x, y) => x.split('>')[0] === y.split('>')[0]); c.text(0, 0, 'a', 'node', 'A')
  c.line(1, 0, 5, 'light', 'edge', 'A>B'); c.line(2, 0, 5, 'light', 'edge', 'A>B'); c.arrow(3, 0, '▼', 'A>B')
  c.line(1, 0, 3, 'light', 'edge', 'A>C'); c.line(1, 1, 12, 'light', 'edge', 'A>C'); c.line(2, 1, 5, 'light', 'edge', 'A>C'); c.arrow(3, 1, '▼', 'A>C')
  c.text(4, 0, 'b', 'node', 'B'); c.text(4, 1, 'c', 'node', 'C')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'C', text: 'c' }],
    edges: [{ id: 'A>B', from: 'A', to: 'B', heads: ['▼'] }, { id: 'A>C', from: 'A', to: 'C', heads: ['▼'] }], edgeLabels: [] })
}
test('A5.mutation-tests: an edge passes through a junction cell it shares with a sibling edge, but never walks the sibling cells', () => {
  assert.equal(validate(fork()), null)
  assert.equal(validate(cut(fork(), 2, 0))?.reason, 'edge-disconnected')
})
// An edge label drawn on the path: its cells list the label id A>B:label, then the edge id. Text under any other owner is not
// the edge's label, even when its cells list A>B too.
test("A5.mutation-tests: an edge's own label cell joins any adjacent cell of its edge but starts nothing; text of another owner breaks the edge, even text the edge owns", () => {
  assert.equal(validate(path([5, { text: 'L', owners: ['A>B:label', 'A>B'] }, 5, '▼'], ['▼'])), null)
  assert.equal(validate(path([5, { text: 'L', owners: ['L1'] }, 5, '▼'], ['▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path([5, { text: 'L', owners: ['L1', 'A>B'] }, 5, '▼'], ['▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path([{ text: 'L', owners: ['A>B:label', 'A>B'] }, 5, '▼'], ['▼']))?.reason, 'edge-disconnected')
})
// a, then ─, 成功 (each W character a text cell, then a cont cell), ─, ► and b along row 0: the route enters 成 and leaves
// from 功's cont cell. The label's cells list owners: A>B:label alone, or with A>B.
function through(owners: string[]): Drawing {
  const c = createCanvas(1, 9, 9); c.text(0, 0, 'a', 'node', 'A'); c.line(0, 1, 10, 'light', 'edge', 'A>B'); c.text(0, 2, '成功', 'label', owners)
  c.line(0, 6, 10, 'light', 'edge', 'A>B'); c.arrow(0, 7, '►', 'A>B'); c.text(0, 8, 'b', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: owners[0]!, text: '成功' }],
    edges: [{ id: 'A>B', from: 'A', to: 'B', heads: ['►'] }], edgeLabels: [{ owner: owners[0]!, edge: 'A>B' }] })
}
test("A5.mutation-tests: an edge's own label bridges its route through its cont cells too, whether its cells list the edge or not", () => {
  assert.equal(validate(through(['A>B:label', 'A>B'])), null)
  assert.equal(validate(through(['A>B:label'])), null)
})
// QA's repro: A, then down column 0 an edge e's line, a cell `cell` draws, ▼ and B, on a grid cols wide.
function gap(cell: (c: Canvas) => void, cols = 1): Drawing {
  const c = createCanvas(5, cols, cols); c.text(0, 0, 'A', 'node', 'A'); c.line(1, 0, 5, 'light', 'edge', 'e'); cell(c); c.arrow(3, 0, '▼', 'e'); c.text(4, 0, 'B', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'A' }, { owner: 'B', text: 'B' }], edges: [{ id: 'e', from: 'A', to: 'B', heads: ['▼'] }], edgeLabels: [] })
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
  assert.equal(validate(path(['▲', 5, '▼'], ['▲', '▼'])), null)
  assert.equal(validate(path([5, 5, '▼'], ['▲', '▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['▲', 5, 5], ['▲', '▼']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['●', 5, '●'], ['●', '●'])), null)
  assert.equal(validate(path(['●', 5, 5], ['●', '●']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['▲', 7, 5, '▼'], ['▲', '▼']))?.reason, 'head-on-junction')
  assert.equal(validate(path(['▲', 5, 7, '▼'], ['▲', '▼']))?.reason, 'head-on-junction')
  assert.equal(validate(path(['●', 7, 5, '●'], ['●', '●']))?.reason, 'head-on-junction')
})
// ▲ ► ▼ ◄ must point at the end node they are next to; ● has no point, so it may touch either end on any side.
test('A5.mutation-tests: a directional head points at the end node it is next to', () => {
  assert.equal(validate(path(['▲', 5], ['▲'])), null)
  assert.equal(validate(path([5, '▲'], ['▲']))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['◄', 10], ['◄'], true)), null)
  assert.equal(validate(path([10, '►'], ['►'], true)), null)
  assert.equal(validate(path([10, '◄'], ['◄'], true))?.reason, 'edge-disconnected')
  assert.equal(validate(path(['►', 10], ['►'], true))?.reason, 'edge-disconnected')
})
// a, an empty cell, b, then three empty cells: 3 columns once the trailing spaces drop, the gap between a and b included.
test('A5.mutation-tests: a row is measured as drawn: an empty cell counts as a space, and trailing spaces drop', () => {
  const c = createCanvas(1, 6, 6); c.text(0, 0, 'a', 'label', 'n1'); c.text(0, 2, 'b', 'label', 'n2')
  const d = c.toDrawing({ labels: [{ owner: 'n1', text: 'a' }, { owner: 'n2', text: 'b' }], edges: [], edgeLabels: [] })
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
    edges: [{ id: 'A>B', from: 'A', to: 'B', heads: ['►'] }], edgeLabels: [{ owner: 'L1', edge }] })
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
  assert.equal(validate(path(['▲', 7, 5, 5], ['▲', '▼']))?.reason, 'edge-disconnected')
})
