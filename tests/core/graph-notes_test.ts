import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { routeGraph, type Route } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { withNotes } from '../../core/graph/notes.ts'; import { validate } from '../../core/validate.ts'
import { g, text } from './graph-fixture.ts'
import { parseState } from '../../core/diagrams/state/parse.ts'; import { readSource } from '../../core/source.ts'
const D = (gr: ReturnType<typeof g>) => { const p = layoutGraph(withNotes(gr), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed; return drawGraph(p, routeGraph(p) as Route[], 80) }
test('A3: a TB note sits beside its state, joined by ┄; an LR note becomes a note node and a dotted, headless edge', () => {
  const tb = g('TB', ['A>B']); tb.nodes[0]!.note = { id: 'A:note', text: 'memo', side: 'left' }
  const d = D(tb); assert.equal(validate(d), null); assert.match(text(d).join('\n'), /memo ┄┄\[ A \]/)
  assert.ok(d.expect.labels.some(l => l.owner === 'A:note' && l.text === 'memo'))
  const lr = g('LR', ['A>B']); lr.nodes[0]!.note = { id: 'A:note', text: 'memo', side: 'left' }
  const w = withNotes(lr); assert.deepEqual(w.nodes.map(n => n.id), ['A', 'B', 'A:note']); assert.equal(w.nodes[0]!.note, undefined)
  assert.deepEqual(w.edges.map(e => [e.from, e.to, e.style, e.tail, e.head]), [['A', 'B', 'solid', 'none', 'arrow'], ['A:note', 'A', 'dotted', 'none', 'none']])
  assert.equal(validate(D(lr)), null)
})
test('A3: a note in an LR composite under a TB root becomes a note node inside it; the composite stays sealed and LR', () => {
  const gr = g('TB', ['a>b']); gr.clusters = [{ id: 'S', title: 'S', dir: 'LR', nodes: ['a', 'b'], clusters: [] }]
  gr.nodes[0]!.note = { id: 'a:note', text: 'memo', side: 'right' }
  const w = withNotes(gr)
const  link = w.edges.at(-1)!; assert.deepEqual(w.clusters[0]!.nodes, ['a', 'b', 'a:note']); assert.deepEqual([link.from, link.to], ['a', 'a:note'])
  const d = D(gr)
const  t = text(d)
const  col = (s: string) => t.find(l => l.includes(s))!.indexOf(s)
  assert.equal(validate(d), null); assert.ok(col('[ b ]') > col('[ a ]') + 4, t.join('\n'))   // drawn TB, b would sit under a
})
test('A5.mutation-tests: a keyed edge label routes through its one-cell key box, not its text footprint', () => {
  const gr = g('TB', ['A>B|one<br>two']); gr.edges[0]!.labelKey = 'a'
  assert.deepEqual(validate(D(gr)), { reason: 'key-stray' })   // connected; the key is stray only because no legend lists it here
})
test("A3: a note withNotes turns into a node keeps its key as the node's one key row", () => {
  const lr = g('LR', ['A>B']); lr.nodes[0]!.note = { id: 'A:note', text: 'memo', side: 'left', key: 'a' }
  assert.deepEqual((withNotes(lr) as any).nodes[2].rows, [{ text: 'a', role: 'note', align: 'left', key: true }])
  const d = D(lr); assert.ok(d.cells.flat().some(c => c?.kind === 'key' && c.ch === 'a' && c.owners[0] === 'A:note')); assert.deepEqual(validate(d), { reason: 'key-stray' })
})
test('A3: frameless regions stack inside one frame, split by a dashed row; they draw no frame of their own', () => {
  const gr = g('TB', ['a>b', 'c>d'])
  gr.edges.push({ id: 'S:chain0', from: 'r1', to: 'r2', style: 'invisible', tail: 'none', head: 'none', label: null, minlen: 1, order: 2 })
  gr.clusters = [{ id: 'S', title: 'Active', dir: null, nodes: [], clusters: ['r1', 'r2'] },
    { id: 'r1', title: null, dir: null, nodes: ['a', 'b'], clusters: [], frameless: true }, { id: 'r2', title: null, dir: null, nodes: ['c', 'd'], clusters: [], frameless: true }]
  const d = D(gr)
const  t = text(d); assert.equal(validate(d), null)
  assert.ok(t.some(l => /^│ *┄+ *│$/.test(l.trim())), t.join('\n'))
  assert.ok(!d.cells.flat().some(c => c?.kind === 'frame' && (c.owners[0] === 'r1' || c.owners[0] === 'r2')))
  assert.deepEqual(d.expect.frames, ['S'])                     // A's frame contract: a frameless region lists no frame
})
test('A3: a region divider is owned by its parent, as `${parent}:div<k>`, not by either region', () => {
  const gr = g('TB', ['a>b', 'c>d'])
  gr.edges.push({ id: 'S:chain0', from: 'r1', to: 'r2', style: 'invisible', tail: 'none', head: 'none', label: null, minlen: 1, order: 2 })
  gr.clusters = [{ id: 'S', title: 'Active', dir: null, nodes: [], clusters: ['r1', 'r2'] },
    { id: 'r1', title: null, dir: null, nodes: ['a', 'b'], clusters: [], frameless: true }, { id: 'r2', title: null, dir: null, nodes: ['c', 'd'], clusters: [], frameless: true }]
  const div = D(gr).cells.flat().filter(c => c?.ch === '┄')
  assert.ok(div.length > 0 && div.every(c => c!.kind === 'cap' && c!.role === 'frame' && c!.owners[0] === 'S:div0'))
})
test("A3: a mark's note draws beside its glyph and is listed, on either side, so a dropped note fails", () => {
  for (const side of ['left', 'right'] as const) {
    const gr = g('TB', ['A>B']); Object.assign(gr.nodes[0]!, { mark: 'choice', rows: [], note: { id: 'A:note', text: 'memo', side } })
    const d = D(gr)
const  t = text(d).join('\n'); assert.equal(validate(d), null, side)
    assert.match(t, side === 'left' ? /memo ┄┄◇/ : /◇┄┄ memo/, side); assert.deepEqual(d.expect.labels.filter(l => l.owner === 'A:note'), [{ owner: 'A:note', text: 'memo' }], side)
  }
  const s = readSource('stateDiagram-v2\nstate ch <<choice>>\n[*] --> ch\nch --> B\nnote right of ch : memo')
const  m = parseState(s as any) as any
  const d = D(m.graph); assert.equal(validate(d), null); assert.match(text(d).join('\n'), /◇┄┄ memo/)
})
test('A3: any note text not drawn is still listed, so validate fails closed: a lost note box, mark or not', () => {
  for (const mark of [undefined, 'choice'] as const) {
    const gr = g('TB', ['A>B']); Object.assign(gr.nodes[0]!, { ...(mark ? { mark, rows: [] } : {}), note: { id: 'A:note', text: 'memo', side: 'right' } })
    const p = layoutGraph(withNotes(gr), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed; (p.notes as Map<string, unknown>).delete('A:note')
    assert.deepEqual(validate(drawGraph(p, routeGraph(p) as Route[], 80)), { reason: 'label-missing' }, String(mark))
  }
})
test('A3: an LR or RL note node left-aligns its lines', () => {
  for (const dir of ['LR', 'RL'] as const) { for (const side of ['left', 'right'] as const) {
    const gr = g(dir, ['A>B']); gr.nodes[0]!.note = { id: 'A:note', text: 'memo<br>longer', side }
    const d = D(gr)
const  t = text(d)
const  col = (s: string) => t.find(l => l.includes(s))!.indexOf(s)
    assert.equal(validate(d), null, `${dir} ${side}`); assert.equal(col('memo'), col('longer'), `${dir} ${side}\n${t.join('\n')}`)
  } }
})
test('A3: side-by-side frameless regions split by a ┆ column, its parent\'s caps, inside its border', () => {
  const gr = g('LR', ['a>b', 'c>d'])
  gr.edges.push({ id: 'S:chain0', from: 'r1', to: 'r2', style: 'invisible', tail: 'none', head: 'none', label: null, minlen: 1, order: 2 })
  gr.clusters = [{ id: 'S', title: 'Active', dir: null, nodes: [], clusters: ['r1', 'r2'] },
    { id: 'r1', title: null, dir: null, nodes: ['a', 'b'], clusters: [], frameless: true }, { id: 'r2', title: null, dir: null, nodes: ['c', 'd'], clusters: [], frameless: true }]
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
const  d = drawGraph(p, routeGraph(p) as Route[], 80, x => x)
const  f = p.frames.get('S')!
  assert.equal(validate(d), null); assert.ok(!d.cells.flat().some(c => c?.ch === '┄'))
  const div = d.cells.flatMap((row, r) => row.flatMap((c, k) => (c?.ch === '┆' ? [{ r, k, c }] : [])))
  assert.deepEqual(div.map(x => x.r), Array.from({ length: f.rows - 2 }, (_, i) => f.row + 1 + i))   // the inner height, one column
  assert.ok(new Set(div.map(x => x.k)).size === 1 && div.every(({ c }) => c.kind === 'cap' && c.role === 'frame' && c.owners.join() === 'S:div0'))
})
test('A3: a TB or BT note wraps at wrapAt, its lines flush under one another, listed as one label', () => {
  for (const dir of ['TB', 'BT'] as const) {
    const gr = g(dir, ['A>B']); gr.nodes[0]!.note = { id: 'A:note', text: 'one two three', side: 'right' }
    const p = layoutGraph(withNotes(gr), { rankGap: 3, nodeGap: 4, wrapAt: 7 }) as Placed
const  d = drawGraph(p, routeGraph(p) as Route[], 80, x => x)
    const t = text(d)
const  at = (s: string) => { const r = t.findIndex(l => l.includes(s)); return [r, t[r]!.indexOf(s)] }
    assert.equal(validate(d), null, dir); assert.deepEqual(at('three'), [at('one two')[0]! + 1, at('one two')[1]], `${dir}\n${t.join('\n')}`)
    assert.deepEqual(d.expect.labels.find(l => l.owner === 'A:note'), { owner: 'A:note', text: 'one two three' }, dir)
  }
})
test('A3: a keyed TB or BT note draws its key beside its pill, joined by ┄┄, and lists no label', () => {
  for (const dir of ['TB', 'BT'] as const) {
    const gr = g(dir, ['A>B']); gr.nodes[0]!.note = { id: 'A:note', text: 'memo', side: 'left', key: 'a' }
    const d = D(gr)
const  t = text(d).join('\n'); assert.deepEqual(validate(d), { reason: 'key-stray' }, dir)
    assert.match(t, /a ┄┄\[ A \]/, dir); assert.doesNotMatch(t, /memo/, dir); assert.ok(!d.expect.labels.some(l => l.owner === 'A:note'), dir)
    assert.ok(d.cells.flat().some(c => c?.kind === 'key' && c.ch === 'a' && c.owners.join() === 'A:note'), dir)
  }
})
test('V6: side-by-side LR regions draw each edge straight inside the composite, at natural, never through its border', async () => {
  const { explain } = await import('../../core/render.ts')
  const r: any = explain('stateDiagram-v2\ndirection LR\nstate P {\n  A --> B\n  --\n  C --> D\n}\n[*] --> P', { columns: 80, theme: 'mono' })
  const t = text(r.drawing).join('\n'); assert.equal(r.step, 'natural', t); assert.equal(validate(r.drawing), null, t)
  assert.match(t, /\( A \)─+►\( B \)/, t); assert.match(t, /\( C \)─+►\( D \)/, t)
})
