import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'; import { validate, type Expect } from '../../core/validate.ts'
// [ A ] at row 0 and [ B ] at row 4; edge e0 down column 2, its tail mark at row 1; the end labels at column 3, rows tl and hl.
function edge(mark: string, tl: number, hl: number): Drawing {
  const c = createCanvas(5, 10, 10)
  for (const [r, id] of [[0, 'A'], [4, 'B']] as const) { c.cap(r, 0, '[', 'node', id); c.text(r, 2, id, 'node', id); c.cap(r, 4, ']', 'node', id) }
  c.arrow(1, 2, mark, 'e0'); c.line(2, 2, 5, 'light', 'edge', 'e0'); c.line(3, 2, 5, 'light', 'edge', 'e0')
  c.text(tl, 3, '1', 'label', 'e0:tail'); c.text(hl, 3, '0..*', 'label', 'e0:head')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'A' }, { owner: 'B', text: 'B' }, { owner: 'e0:tail', text: '1' }, { owner: 'e0:head', text: '0..*' }],
    edges: [{ id: 'e0', from: 'A', to: 'B', ends: [{ node: 'A', glyph: mark }],
      endLabels: [{ node: 'A', owner: 'e0:tail' }, { node: 'B', owner: 'e0:head' }] }],
    edgeLabels: [{ owner: 'e0:tail', edge: 'e0' }, { owner: 'e0:head', edge: 'e0' }], frames: [] })
}
test("A5.mutation-tests: an end label sits at its own end, strictly; a C triangle must point at its node under A's end rule", () => {
  assert.equal(validate(edge('△', 1, 3)), null)
  assert.deepEqual(validate(edge('△', 3, 1)), { reason: 'end-label' })     // the cardinalities swapped
  assert.deepEqual(validate(edge('△', 2, 3)), { reason: 'end-label' })     // the tail label as near the other end
  assert.ok(['edge-disconnected', 'end-misplaced'].includes(validate(edge('▽', 1, 3))?.reason ?? ''))   // ▽ points away from A
})
// a, then e0's three cells, its one mark g at cell k (1 or 3) for node n, then b: across row 1 (h) or down column 0 (v).
function mark(g: string, k: number, n: string, h: boolean): Drawing {
  const c = createCanvas(5, 5, 5), at = (i: number) => (h ? [1, i] : [i, 0]) as [number, number]
  c.text(...at(0), 'a', 'node', 'A'); c.text(...at(4), 'b', 'node', 'B')
  for (let i = 1; i < 4; i++) { if (i === k) c.arrow(...at(i), g, 'e0'); else c.line(...at(i), h ? 10 : 5, 'light', 'edge', 'e0') }
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }],
    edges: [{ id: 'e0', from: 'A', to: 'B', ends: [{ node: n, glyph: g }] }], edgeLabels: [], frames: [] })
}
test('A5.mutation-tests: each C triangle beside its node points at it; beside the other node, pointing away, it fails end-misplaced', () => {
  for (const [g, k, n, h] of [['△', 1, 'A', false], ['▽', 3, 'B', false], ['◁', 1, 'A', true], ['▷', 3, 'B', true]] as const) {
    assert.equal(validate(mark(g, k, n, h)), null, g)
    assert.deepEqual(validate(mark(g, 4 - k, n === 'A' ? 'B' : 'A', h)), { reason: 'end-misplaced' }, g)
  }
})
// a at (1,0) and b at (1,7); e0 along row 1 between them; e0:tail's text t from (0, j), for A; e0:head's '*' at (2, 6), for B.
function span(t: string, j: number): Drawing {
  const c = createCanvas(3, 8, 8); c.text(1, 0, 'a', 'node', 'A'); c.text(1, 7, 'b', 'node', 'B')
  for (let i = 1; i < 7; i++) c.line(1, i, 10, 'light', 'edge', 'e0')
  c.text(0, j, t, 'label', 'e0:tail'); c.text(2, 6, '*', 'label', 'e0:head')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'e0:tail', text: t }, { owner: 'e0:head', text: '*' }],
    edges: [{ id: 'e0', from: 'A', to: 'B', ends: [], endLabels: [{ node: 'A', owner: 'e0:tail' }, { node: 'B', owner: 'e0:head' }] }],
    edgeLabels: [{ owner: 'e0:tail', edge: 'e0' }, { owner: 'e0:head', edge: 'e0' }], frames: [] })
}
test('A5.mutation-tests: an end label comes within 1 of its own terminal, and as a whole is strictly nearer it than the other', () => {
  assert.equal(validate(span('1', 0)), null)
  assert.deepEqual(validate(span('1', 3)), { reason: 'end-label' })         // two from its terminal, though the nearer one
  assert.deepEqual(validate(span('zero..*', 0)), { reason: 'end-label' })   // it spans the edge: as near B's terminal as A's
})
// QA's repro: a at (0,5); e0 to b at (6,1) and e1 to c at (6,9) share a stem down column 5 to row 3, then branch. '1' at (1,4)
// is e0's end label at A and '*' at (1,6) e1's, or, swapped, the other way round. A tail is a fan-out, ▼ at b and c; a head
// the reversed fan-in, one ▲ at a that both own.
function fan(end: 'tail' | 'head', swap: boolean): Drawing {
  const c = createCanvas(7, 11, 11, () => true), out = end === 'tail', [l, r] = swap ? ['e1', 'e0'] : ['e0', 'e1']
  c.text(0, 5, 'a', 'node', 'A'); c.text(6, 1, 'b', 'node', 'B'); c.text(6, 9, 'c', 'node', 'C')
  for (const [e, k, s] of [['e0', 1, -1], ['e1', 9, 1]] as const) {
    if (out) c.line(1, 5, 5, 'light', 'edge', e); else c.arrow(1, 5, '▲', e)
    c.line(2, 5, 5, 'light', 'edge', e); c.line(3, 5, s < 0 ? 9 : 3, 'light', 'edge', e)
    for (let i = 5 + s; i !== k; i += s) c.line(3, i, 10, 'light', 'edge', e)
    c.line(3, k, s < 0 ? 6 : 12, 'light', 'edge', e); c.line(4, k, 5, 'light', 'edge', e)
    if (out) c.arrow(5, k, '▼', e); else c.line(5, k, 5, 'light', 'edge', e)
  }
  c.text(1, 4, '1', 'label', `${l}:${end}`); c.text(1, 6, '*', 'label', `${r}:${end}`)
  const rel = (id: string, n: string) => ({ id, from: out ? 'A' : n, to: out ? n : 'A', ends: [{ node: out ? n : 'A', glyph: out ? '▼' : '▲' }],
    endLabels: [{ node: 'A', owner: `${id}:${end}` }] })
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'C', text: 'c' }, { owner: `${l}:${end}`, text: '1' },
    { owner: `${r}:${end}`, text: '*' }], edges: [rel('e0', 'B'), rel('e1', 'C')],
    edgeLabels: [{ owner: `e0:${end}`, edge: 'e0' }, { owner: `e1:${end}`, edge: 'e1' }], frames: [] })
}
test('A5.mutation-tests: an end label on a stem two edges share names neither: a fan-out or a reversed fan-in fails, either way round', () => {
  for (const end of ['tail', 'head'] as const) for (const swap of [false, true]) assert.deepEqual(validate(fan(end, swap)), { reason: 'end-label' }, `${end} ${swap}`)
})
// [ A ] over [ B ], joined by parallel edges e0 down column 3 and e1 down column 5; e0's tail label '1' at (1, j), for A.
function parallel(j: number): Drawing {
  const c = createCanvas(5, 9, 9); c.text(0, 2, '[ A ]', 'node', 'A'); c.text(4, 2, '[ B ]', 'node', 'B'); c.text(1, j, '1', 'label', 'e0:tail')
  for (const [e, k] of [['e0', 3], ['e1', 5]] as const) { c.line(1, k, 5, 'light', 'edge', e); c.line(2, k, 5, 'light', 'edge', e); c.arrow(3, k, '▼', e) }
  return c.toDrawing({ labels: [{ owner: 'A', text: '[ A ]' }, { owner: 'B', text: '[ B ]' }, { owner: 'e0:tail', text: '1' }],
    edges: [{ id: 'e0', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }], endLabels: [{ node: 'A', owner: 'e0:tail' }] },
      { id: 'e1', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [{ owner: 'e0:tail', edge: 'e0' }], frames: [] })
}
test("A5.mutation-tests: an end label between parallel stems is as near the other edge and fails; on its own stem's outer side it passes", () => {
  assert.deepEqual(validate(parallel(4)), { reason: 'end-label' }); assert.equal(validate(parallel(2)), null)
})
const bar = (cells: string, eighths: number, extra: Partial<Expect> = {}): Drawing => { const c = createCanvas(1, 8, 8); c.cap(0, 0, cells, 's1', 'x0')
  return c.toDrawing({ labels: [], edges: [], edgeLabels: [], frames: [], bars: [{ owner: 'x0', eighths, axis: 'h' }], ...extra }) }
test('A5.mutation-tests: a bar draws exactly its eighths; zero draws nothing, and only zero; no stray bar cell', () => {
  assert.equal(validate(bar('██▌', 20)), null); assert.equal(validate(bar('', 0)), null)
  for (const [cells, e] of [['██▌', 21], ['█', 0], ['▌█', 12], ['', 20]] as const) assert.deepEqual(validate(bar(cells, e)), { reason: 'bar' }, cells)
  assert.deepEqual(validate(bar('██▌', 20, { bars: [] })), { reason: 'bar-stray' })
})
const vbar = (lanes: readonly (readonly string[])[], eighths: number): Drawing => { const c = createCanvas(3, 4, 4)
  lanes.forEach((cells, k) => cells.forEach((g, r) => { if (g) c.cap(r, k, g, 's1', 'x0.b0') }))
  return c.toDrawing({ labels: [], edges: [], edgeLabels: [], frames: [], bars: [{ owner: 'x0.b0', eighths, axis: 'v', lanes: 2 }] }) }
test('A5.mutation-tests: a positive bar with its cells deleted, a lane missing, short or shifted fails; nothing passes vacuously', () => {
  assert.equal(validate(vbar([['▄', '█'], ['▄', '█']], 12)), null)                 // two lanes, each █ then ▄ bottom up: 8 + 4
  for (const lanes of [[['', ''], ['', '']], [['▄', '█'], ['', '']], [['▄', '█'], ['▂', '█']]]) assert.deepEqual(validate(vbar(lanes, 12)), { reason: 'bar' }, String(lanes))
  assert.equal(validate(vbar([['', '▄', '█'], ['', '▄', '█']], 12)), null)
  assert.deepEqual(validate(vbar([['', '▄', '█'], ['▄', '█', '']], 12)), { reason: 'bar' })   // one lane shifted up a row: both runs still sum to 12
})
// Bar cells are caps in a bar glyph: a status cap, a padding space or a milestone ◆ that the bar's owner draws is none.
test('A5.mutation-tests: only bar glyphs make a bar; a split lane, lanes apart, a partial mid-run or of the other axis, or no lane fails', () => {
  assert.equal(validate(bar('!██▌ ', 20)), null); assert.equal(validate(bar('◆', 0)), null)
  // ██▄ ends in a v partial, so as an h bar it reads as neither 16 nor 20; ▌▌ has a partial before its end, though 4 + 8 is 12.
  for (const [cells, e] of [['█ █', 16], ['██▄', 16], ['██▄', 20], ['▌▌', 12]] as const) assert.deepEqual(validate(bar(cells, e)), { reason: 'bar' }, `${cells} ${e}`)
  assert.deepEqual(validate(vbar([['▄', '█'], ['', ''], ['▄', '█']], 12)), { reason: 'bar' })   // its two lanes two columns apart
  assert.deepEqual(validate(bar('', 20, { bars: [{ owner: 'x0', eighths: 20, axis: 'h', lanes: 0 }] })), { reason: 'bar' })   // no lane
})
// Eighths 1 to 15 as this test's own tables draw them: full cells, then the partial, left to right (h) or bottom up (v). Each
// partial must read as its own eighth, so moving any partial within core's tables fails.
test('A5.mutation-tests: every bar partial reads its own eighth, 1 to 15 on either axis', () => {
  const H = [...'▏▎▍▌▋▊▉'], V = [...'▁▂▃▄▅▆▇']
  for (let e = 1; e < 16; e++) {
    const full = Math.floor(e / 8), p = e % 8
    assert.equal(validate(bar('█'.repeat(full) + (p ? H[p - 1]! : ''), e)), null, `h ${e}`)
    const lane = [...(p ? [V[p - 1]!] : []), ...Array<string>(full).fill('█')]   // top to bottom
    assert.equal(validate(vbar([lane, lane], e)), null, `v ${e}`)
  }
})
const member = (owners: string[]): Drawing => { const c = createCanvas(1, 6, 6); c.text(0, 0, '+name', 'label', owners)
  return c.toDrawing({ labels: [{ owner: owners[0]!, text: '+name' }], edges: [], edgeLabels: [], frames: [], members: [{ id: 'U.m0', parent: 'U' }] }) }
test("A5.mutation-tests: a member row is owned by exactly its own id and its parent's, and every drawn member row is listed", () => {
  assert.equal(validate(member(['U.m0', 'U'])), null)
  for (const o of [['U.m0', 'V'], ['U.m0'], ['W.m0', 'U']]) assert.deepEqual(validate(member(o)), { reason: 'member' }, o.join())
  assert.deepEqual(validate({ ...member(['U.m0', 'U']), expect: { ...member(['U.m0', 'U']).expect, members: [] } }), { reason: 'member-unlisted' })   // its entry omitted
})
// U.m0 wrapped to two rows: '+name' owned by [U.m0, U], then 'int' owned by o.
const wrapped = (o: string[]): Drawing => { const c = createCanvas(2, 6, 6); c.text(0, 0, '+name', 'label', ['U.m0', 'U']); c.text(1, 0, 'int', 'label', o, ' ')
  return c.toDrawing({ labels: [{ owner: 'U.m0', text: '+name int' }], edges: [], edgeLabels: [], frames: [], members: [{ id: 'U.m0', parent: 'U' }] }) }
test('A5.mutation-tests: a listed member draws a cell, and every cell it leads, not just one, is owned by exactly [id, parent]', () => {
  assert.equal(validate(wrapped(['U.m0', 'U'])), null)
  assert.deepEqual(validate(wrapped(['U.m0'])), { reason: 'member' })                      // its second row drawn without its parent
  for (const o of [['V'], ['U.m0', 'U', 'V']]) assert.deepEqual(validate(member(o)), { reason: 'member' }, o.join())   // no cell of its own; a third owner
})
// a, then e0 down column 0, its label x mid-edge owned by ['e0:label', second], then ▼ and b.
function labelled(second: string, members?: Expect['members']): Drawing {
  const c = createCanvas(5, 1, 5); c.text(0, 0, 'a', 'node', 'A'); c.line(1, 0, 5, 'light', 'edge', 'e0')
  c.text(2, 0, 'x', 'label', ['e0:label', second]); c.arrow(3, 0, '▼', 'e0'); c.text(4, 0, 'b', 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, { owner: 'e0:label', text: 'x' }], frames: [],
    edges: [{ id: 'e0', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [{ owner: 'e0:label', edge: 'e0' }], ...(members ? { members } : {}) })
}
test('A5.mutation-tests: with members set, text with two distinct owners, the second no edge of expect.edges, is a listed member', () => {
  assert.equal(validate(labelled('e0', [])), null); assert.deepEqual(validate(labelled('e1', [])), { reason: 'member-unlisted' })   // e1 is no listed edge
  const relist = (d: Drawing, members?: Expect['members']): Drawing => ({ ...d, expect: { ...d.expect, members } })
  assert.equal(validate(relist(member(['U', 'U']), [])), null); assert.deepEqual(validate(relist(member(['U', 'V']), [])), { reason: 'member-unlisted' })
  assert.equal(validate(relist(member(['U.m0', 'U']), undefined)), null)                    // members unset, as in every A drawing: no row is checked
})
