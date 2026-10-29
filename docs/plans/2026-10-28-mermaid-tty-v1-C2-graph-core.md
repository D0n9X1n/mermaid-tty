# mermaid-tty v1 C — tasks T49–T53 (graph extensions, member rows, the graph ladder)

**Depends on:** the index (§4 interfaces, §5 shared rules), C1 (T45, T46), and A's T17, T18 and T19. C3 (state, class, ER) builds on these tasks.
**Conventions:** as in C1. Every change is additive: a graph with none of the new fields draws exactly as before, so A's flowchart goldens never change. T53 runs them to prove it.

### T49: Graph model and sizes
**Group** G1 · **Deps** — · **Covers** spec C rule 2 (member rows, never border-only rows), the index §4 model fields
**Files:** modify `core/graph/model.ts`, `core/graph/sizes.ts`. Test: `tests/core/graph-c-model_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { nodeSize } from '../../core/graph/sizes.ts'; import type { GNode, NodeRow } from '../../core/graph/model.ts'
const N = (rows: NodeRow[], extra: Partial<GNode> = {}): GNode => ({ id: 'n', shape: 'rect', role: 'node', rows, order: 0, ...extra })
test('A3: a mark is one cell; a bar spans across the flow', () => {
  assert.deepEqual(nodeSize(N([], { mark: 'start' }), null), { rows: 1, cols: 1 })
  assert.deepEqual(nodeSize(N([], { mark: 'bar', span: 5 }), null), { rows: 1, cols: 5 })
  assert.deepEqual(nodeSize(N([], { mark: 'bar', span: 5 }), null, true), { rows: 5, cols: 1 })
})
test('A3: fixed member rows keep their width under wrapAt; the header still wraps; columns add their gaps', () => {
  assert.deepEqual(nodeSize(N([{ text: 'Duck Billed', role: 'node', align: 'center' },
    { text: '+String beakColor', role: 'label', align: 'left', id: 'n.m0', fixed: true },
    { text: 'more', role: 'label', align: 'left', id: 'n.m0', fixed: true, indent: 1, join: ' ' }]), 8), { rows: 4, cols: 21 })
  assert.deepEqual(nodeSize(N([{ text: 'CAR', role: 'node', align: 'center' }, { text: 'string id', role: 'label', align: 'left', fixed: true,
    cols: [{ text: 'string', role: 'label', id: 'n.a0.type', width: 6 }, { text: 'id', role: 'label', id: 'n.a0.name', width: 5 }] }]), null), { rows: 2, cols: 16 })
})
```
- [ ] **Run** `node --test tests/core/graph-c-model_test.ts` → FAIL: `Expected values to be strictly deep-equal` (an empty mark sizes as `{ rows: 0, cols: 4 }`).
- [ ] **Implement:**
  - **`model.ts`:** add `Mark`, `Col`, `Note`, the `NodeRow` fields `fixed`, `indent`, `join`, `cols` and `key` (a key row, T51), the `GNode` fields `mark`, `span` and `note`, the `End` values `triangle`, `diamond` and `odiamond`, the `GEdge` fields `tailLabel`, `headLabel`, `endRole` and `labelKey`, `Note.key`, `Col.key`, and `GCluster.frameless`, exactly as in index §4. All are optional.
  - **`nodeSize(n, wrapAt, across = false)`:**
    - A mark `start`, `end` or `choice` is `{ rows: 1, cols: 1 }`. A `bar` is `{ rows: 1, cols: span }`, or `{ rows: span, cols: 1 }` when `across`, so layered's `ext()` always gives it `cross = span`.
    - A `fixed` row, or a row with `cols`, is one piece and never wraps. Its width is `indent + width(text)`, or `indent + Σ col.width + (cols − 1)`.
    - Every other row wraps as before. `cols` is the widest piece + 2 + the caps.
  - **Notes** do not change `nodeSize`: layered adds their margin (T51). `layered.ts` still calls `nodeSize(n, wrapAt)`, and T51 passes `across`.
- [ ] **Done when:** `node --test tests/core/graph-c-model_test.ts tests/core/layered_test.ts` passes.
- [ ] **Commit:** `git commit -m "Extend the graph model with marks, member columns, notes and class ends"`

### T50: Route and draw: marks, member columns, class ends, end labels
**Group** G2 · **Deps** T17, T18, T49, T86 · **Covers** fix-cycle findings 2, 5 and 8; cycle-2 B1, B2, B6; state marks (`●`, `◉`, `◇`, the fork bar), class ends (matrix class text design), ER and class cardinality beside its end, ER column alignment, rule 12 glyphs
**Files:** modify `core/graph/route.ts`, `core/graph/draw.ts`, `core/graph/chains.ts`, `core/graph/layered.ts`. Test: `tests/core/graph-c-draw_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { routeGraph, type Route } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { validate } from '../../core/validate.ts'; import { g, text } from './graph-fixture.ts'
import type { NodeRow } from '../../core/graph/model.ts'
const D = (gr: ReturnType<typeof g>) => { const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed; return drawGraph(p, routeGraph(p) as Route[], 80) }
test('A3: marks draw one glyph and no label; class ends and cardinality draw at their ends', () => {
  const gr = g('TB', ['S>A', 'A>B', 'A>C', 'B>E'])            // nodes S A B C E; edges e0…e3
  Object.assign(gr.nodes[0]!, { mark: 'start', rows: [] }); Object.assign(gr.nodes[4]!, { mark: 'end', rows: [] })
  Object.assign(gr.edges[1]!, { tail: 'triangle', head: 'none' }); Object.assign(gr.edges[2]!, { tail: 'diamond', head: 'none', headLabel: '0..*' })
  const d = D(gr), t = text(d).join('\n'); assert.equal(validate(d), null)
  assert.deepEqual([...t].filter(c => '●◉'.includes(c)), ['●', '◉']); assert.match(t, /△/); assert.match(t, /◆/); assert.match(t, /0\.\.\*/)
  assert.deepEqual([d.expect.edges[1]!.ends, d.expect.edges[2]!.ends], [[{ node: 'A', glyph: '△' }], [{ node: 'A', glyph: '◆' }]])   // A's per-end marks
  assert.deepEqual(d.expect.edges[2]!.endLabels, [{ node: 'C', owner: 'e2:head' }])
})
test('A3: member columns align; a column cell is owned by its own id, then the node; every drawn column and fixed row is listed', () => {
  const gr = g('TB', ['C>D']), cols = (k: number, type: string, name: string, note: string) => [{ text: type, role: 'label', id: `C.a${k}.type`, width: 6 },
    { text: name, role: 'label', id: `C.a${k}.name`, width: 5 }, { text: note, role: 'note', id: `C.a${k}.note`, width: 2 }] as NodeRow['cols']
  gr.nodes[0]!.rows = [{ text: 'CAR', role: 'node', align: 'center' }, { text: 'string id pk', role: 'label', align: 'left', fixed: true, cols: cols(0, 'string', 'id', 'pk') },
    { text: 'int seats', role: 'label', align: 'left', fixed: true, cols: cols(1, 'int', 'seats', '') }]
  gr.nodes[1]!.rows = [{ text: '«service»', role: 'node', align: 'center', id: 'D.annot' }, { text: 'D', role: 'node', align: 'center' }, ...['+run()', '+eat()'].map((text, k) => ({ text, role: 'label', align: 'left', fixed: true, id: `D.m${k}` }) as NodeRow)]
  const d = D(gr), t = text(d); assert.equal(validate(d), null)
  const r1 = t.find(l => l.includes('string id'))!, r2 = t.find(l => l.includes('int    seats'))!; assert.equal(r1.indexOf(' id'), r2.indexOf(' seats'))
  assert.ok(d.cells.flat().some(c => c?.kind === 'text' && c.ch === 's' && c.owners[0] === 'C.a1.name' && c.owners.includes('C')))
  assert.deepEqual(d.expect.members, [...['a0.type', 'a0.name', 'a0.note', 'a1.type', 'a1.name'].map(k => ({ id: `C.${k}`, parent: 'C' })),
    { id: 'D.annot', parent: 'D' }, { id: 'D.m0', parent: 'D' }, { id: 'D.m1', parent: 'D' }])   // a1's blank note draws no cell, so it is not listed; every row with an id is, «annot» included
})
test('A4: an end label gets room beside its end, and a reversed edge lists its true ends', () => {
  const one = g('TB', ['A>B']); Object.assign(one.edges[0]!, { head: 'none', headLabel: '0..*' })
  const d = D(one); assert.equal(d.conflicts.length, 0); assert.equal(validate(d), null); assert.match(text(d).join('\n'), /0\.\.\*/)
  for (const dir of ['TB', 'BT', 'LR', 'RL'] as const) {   // a back edge can leave A on row 0 or column 0; its label must still fit
    const cyc = g(dir, ['A>B', 'B>A']); Object.assign(cyc.edges[1]!, { tail: 'diamond', head: 'none', headLabel: '0..*' })
    const c = D(cyc); assert.equal(c.conflicts.length, 0, dir); assert.equal(validate(c), null, dir)
    assert.deepEqual([c.expect.edges[1]!.ends, c.expect.edges[1]!.endLabels], [[{ node: 'B', glyph: '◆' }], [{ node: 'A', owner: 'e1:head' }]], dir)
  }
})
```
- [ ] **Run** `node --test tests/core/graph-c-draw_test.ts` → FAIL: `Expected values to be strictly deep-equal` with `{ reason: 'edge-disconnected' }`: an empty mark draws nothing yet, so no route touches it.
- [ ] **Implement:**
  - **`route.ts` end glyphs:**
    - `arrow` is A's `▲►▼◄`; `circle` is `o`; `cross` is `x`.
    - `triangle` points into the node it touches: `▽` entering from above, `△` from below, `◁` from the right, `▷` from the left. A tail end at the source points into the source, so a tail below its node is `△`.
    - `diamond` is `◆` and `odiamond` is `◇`, on any side.
    - Ends keep A's rule: one straight cell before each end, so none sits on a junction.
    - An end with a label (`tailLabel`/`headLabel`) gets its own port, keyed by its edge, so two cardinalities never share a stem.
  - **`draw.ts` marks:** a `cap` owned by the node.
    - `start` is `●` and `end` is `◉`, in the `node` role; `choice` is `◇`, in the `decision` role.
    - A `bar` is a run of `━` across a 1-row box, or `┃` down a 1-column box, in the `node` role.
    - A mark adds nothing to `expect.labels`.
  - **`draw.ts` fixed rows:**
    - A fixed row's text starts at `box.col + width(capL) + 1 + (indent ?? 0)`, left-aligned, and carries its `join`.
    - A row with `cols` draws each column at its offset: the previous columns' widths plus one gap each. The column's owners are `[col.id, node.id]`. A blank column draws nothing.
    - `expect.labels` gets one entry per text owner.
    - A fixed row's `fill` cells take the row's role (`label`), so in a color theme only header rows are filled. Header rows keep A's behaviour, so flowchart goldens do not change.
  - **`draw.ts` end labels:**
    - `tailLabel` sits beside the route's first cell, and `headLabel` beside the cell before its end: right of a vertical run, above a horizontal one.
    - Each is in `endRole ?? 'label'`, owned by `${edge}:tail` or `${edge}:head`, and listed in both `expect.labels` and `expect.edgeLabels`, so the label adjacency rule holds.
    - Two labels that need one cell are a canvas Conflict, so the ladder moves on, as the matrix requires.
    - **Room (finding 8; cycle 2: every direction):** `chains.ts` gives an edge with an end label `minlen ≥ 2`, so its two ends never share a gap row. `layered.ts` widens the gap beside an end-labelled port by the widest end label + 1 cells, so a label rarely meets a neighbour.
    - Before it creates the canvas, `draw.ts` computes each end label's box beside its terminal from the routes. The canvas grows on any side a box overruns; a top or left overrun shifts the whole graph down or right, below the title row. So no label is out of bounds in any direction, even beside a node a back edge leaves on row 0. A box that meets another cell is a Conflict, and the ladder moves on.
    - **Reversed edges:** `chains.ts` swaps `tailLabel` and `headLabel` with `tail` and `head`. `draw.ts` names each label by its true end: on a `reversed` edge, the drawn tail's label is `${edge}:head`.
  - **`expect` contracts:**
    - Each end mark is listed on A's per-end-mark contract, `ends: { node, glyph }[]`, at its true node, as A's draw lists arrows; `end-misplaced` checks it. Each end label is listed in T86's `endLabels` as `{ node, owner }`, its owner named by the true end.
    - Each `cols` column, and each row with an `id` (a `fixed` member row, a class's `«annot»` row `<class>.annot`, any other), that draws a cell is listed in `expect.members` as `{ id, parent: node.id }`, in drawing order: node by node, row by row, column by column. A blank value draws no cell and is not listed (cycle 2). `members` is set whenever the graph draws a column or a row with an `id`, so T86's `member-unlisted` catches an omitted one (B6).
  - **`expect.edges` heads:** each end's glyph, tail first.
- [ ] **Done when:**
  - `node --test tests/core/graph-c-draw_test.ts tests/core/draw_test.ts tests/core/route_test.ts tests/core/validate-c_test.ts` passes;
  - `node scripts/check.ts A4` passes, with A's goldens unchanged.
- [ ] **Commit:** `git commit -m "Draw marks, member columns, class ends and end labels"`

### T51: Side notes, frameless regions, dividers
**Group** G3 · **Deps** T50, T87 · **Covers** fix-cycle finding 9; cycle-2 B4 and B5 (keyed text); state notes (matrix: dim, borderless, a `┄` connector), state regions (stacked, split by `┄` rows, `┆` in LR/RL), class `note for`, index §5.10
**Files:** create `core/graph/notes.ts`; modify `core/graph/layered.ts`, `core/graph/draw.ts`, `core/graph/chains.ts`, `core/graph/route.ts`. Test: `tests/core/graph-notes_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { routeGraph, type Route } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { withNotes } from '../../core/graph/notes.ts'; import { validate } from '../../core/validate.ts'
import { g, text } from './graph-fixture.ts'
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
  const w = withNotes(gr), link = w.edges.at(-1)!; assert.deepEqual(w.clusters[0]!.nodes, ['a', 'b', 'a:note']); assert.deepEqual([link.from, link.to], ['a', 'a:note'])
  const d = D(gr), t = text(d), col = (s: string) => t.find(l => l.includes(s))!.indexOf(s)
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
  const d = D(gr), t = text(d); assert.equal(validate(d), null)
  assert.ok(t.some(l => /^│ *┄+ *│$/.test(l.trim())), t.join('\n'))
  assert.ok(!d.cells.flat().some(c => c?.kind === 'frame' && (c.owners[0] === 'r1' || c.owners[0] === 'r2')))
  assert.deepEqual(d.expect.frames, ['S'])                     // A's frame contract: a frameless region lists no frame
})
```
- [ ] **Run** `node --test tests/core/graph-notes_test.ts` → FAIL: `Cannot find module …/core/graph/notes.ts`.
- [ ] **Implement:**
  - **`withNotes(g)`:**
    - It is pure. Each noted node's effective direction is the `dir` of its nearest sealed ancestor cluster that has one, else `g.dir`. Sealed is A's rule (`clusterTree`), computed before notes are added.
    - Effective TB and BT: the node keeps its `note`, which layered places beside it.
    - Effective LR and RL: the node gets a note node `{ id: note.id, shape: 'plain', role: 'note', rows: labelLines(text)` as left-aligned `note` rows`, order: nodes.length + k }` and an edge `{ id: `${note.id}:link`, style: 'dotted', tail: 'none', head: 'none', label: null, minlen: 1 }`.
    - The edge runs note → node for `left` in LR and for `right` in RL, and node → note otherwise. The node loses its `note`, and the note node joins the innermost cluster that lists the node. So the link never crosses a border, and a sealed composite stays sealed (finding 9).
  - **`layered.ts` notes (TB, BT):**
    - A noted node's unit grows on its note's side by `noteW + 3` cells: the widest note line, one space and `┄┄`. Note lines wrap at `wrapAt`, like labels.
    - Its main extent is the larger of its rows and its note's lines.
    - `boxes` keeps only the pill, so the router never sees the note. `Placed` gains `notes?: ReadonlyMap<string, Box>`, each note's text box.
    - `nodeSize` now gets `across`.
  - **`layered.ts` frameless clusters:** a frameless sealed cluster has no border, no pad and no title row. Its box is still recorded in `frames`, for the drawer.
  - **`draw.ts` notes:**
    - Each note line is `text` in the `note` role, owned by `note.id`, with no caps and no fill.
    - The first line joins the pill by ` ┄┄` caps (`note` role), owned by `${note.id}:link`, mirrored for `right`.
    - `expect.labels` gets `{ owner: note.id, text: labelLines(text).join('\n') }`.
  - **`draw.ts` regions:**
    - A frameless cluster draws no frame and is not listed in A's `expect.frames`; its parent is. A divider stays inside the parent's border, so `frame-broken` holds.
    - Between two consecutive frameless children of one cluster, draw a divider of `cap` cells in the `frame` role, owned by `${parent}:div<k>`. It is `┄` across the parent's inner width on the gap's middle row (TB/BT), or `┆` down the gap's middle column (LR/RL).
    - Caps are not lines, so the tangle and edge checks ignore dividers.
  - **Keyed text (moved from T50; cycle 2):**
    - An edge with `labelKey` draws `cv.key` where its label goes, owned by `[${edge}:label, edge]`. `chains.ts` sizes its label item by the key, and A's `labelInk()` (`route.ts`) takes the routing footprint and waypoint from that key box, never from the replaced text, so the route meets the key (B5).
    - A note with `key` draws it in the note's place, and a column with `key` in the column's place, each owned like the text it replaces. That text is not in `expect.labels`, since its legend row lists it.
    - A keyed note that `withNotes` turns into a node keeps its key: the node gets one `{ text: key, role: 'note', align: 'left', key: true }` row, which `draw.ts` draws with `cv.key`, owned by the note id. A class note node (T58) is keyed the same way (B4).
- [ ] **Done when:** `node --test tests/core/graph-notes_test.ts tests/core/graph-c-draw_test.ts tests/core/layered_test.ts tests/core/route_test.ts` passes, and `node scripts/check.ts A4` passes with A's goldens unchanged, since `route.ts` changed.
- [ ] **Commit:** `git commit -m "Place side notes and draw frameless regions with dividers"`

### T52: Member rows
**Group** G2 · **Deps** T49 · **Covers** spec C rule 2 (member rows), matrix class (attributes before methods; continuation rows indented one cell), matrix ER (aligned columns; only comments wrap)
**Files:** create `core/graph/members.ts`. Test: `tests/core/members_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { classRows, erRows } from '../../core/graph/members.ts'; import type { NodeRow } from '../../core/graph/model.ts'
test('A3: class members: attributes, then methods, each in source order; a wrapped member continues indented one cell', () => {
  const rows = classRows('Duck', [{ text: '+swim()', method: true }, { text: '+String beakColor', method: false }, { text: '+quack() : bool', method: true }], 10) as NodeRow[]
  assert.deepEqual(rows.map(r => [r.text, r.id, r.indent ?? 0, r.join ?? null]),
    [['+String', 'Duck.m1', 0, null], ['beakColor', 'Duck.m1', 1, ' '], ['+swim()', 'Duck.m0', 0, null], ['+quack()', 'Duck.m2', 0, null], [': bool', 'Duck.m2', 1, ' ']])
  assert.ok(rows.every(r => r.fixed && r.align === 'left' && r.role === 'label'))
  assert.deepEqual(classRows('X', [{ text: 'averyveryverylongname', method: false }], 10), { reason: 'word-too-wide' })
})
test('A3: ER columns align; only the comment wraps; a column blank in every row is dropped', () => {
  const rows = erRows('CAR', [{ type: 'string', name: 'registrationNumber', keys: 'PK', comment: 'The unique number' }, { type: 'int', name: 'seats', keys: '', comment: '' }], 12) as NodeRow[]
  assert.deepEqual(rows.map(r => r.cols!.map(c => c.text)), [['string', 'registrationNumber', 'PK', 'The unique'], ['', '', '', 'number'], ['int', 'seats', '', '']])
  assert.deepEqual(rows[0]!.cols!.map(c => [c.width, c.role]), [[6, 'label'], [18, 'label'], [2, 'label'], [10, 'note']])
  assert.deepEqual(rows[1]!.cols!.map(c => c.id), ['CAR.a0.type', 'CAR.a0.name', 'CAR.a0.keys', 'CAR.a0.comment']); assert.equal(rows[1]!.cols![3]!.join, ' ')
  assert.deepEqual(erRows('E', [{ type: 'int', name: 'n', keys: '', comment: '' }], null), [{ text: 'int n', role: 'label', align: 'left', fixed: true,
    cols: [{ text: 'int', role: 'label', id: 'E.a0.type', width: 3 }, { text: 'n', role: 'label', id: 'E.a0.name', width: 1 }] }])
})
```
- [ ] **Run** `node --test tests/core/members_test.ts` → FAIL: `Cannot find module …/core/graph/members.ts`.
- [ ] **Implement:**
  - **`classRows`:**
    - Attributes first, then methods, each in source order. Member k, its source index, has id `${id}.m<k>`.
    - With `wrapAt`, the text wraps at `wrapAt − 1`, so an indented continuation still fits; a null wrap fails `word-too-wide`.
    - A first piece is `{ text, role: 'label', align: 'left', id, fixed: true }`. A continuation adds `indent: 1` and its piece's `join`.
  - **`erRows`:**
    - Type, name and keys are each as wide as their widest text. They never wrap.
    - The comment wraps at `wrapAt` (not at all when null), and its width is its widest piece.
    - A column that is blank in every attribute is dropped.
    - Attribute k's columns are `${id}.a<k>.type`, `.name`, `.keys` and `.comment`, with roles label, label, label and note.
    - A continuation row has blank type, name and keys and the next comment piece, with its join.
    - Each row is `{ text, role: 'label', align: 'left', fixed: true, cols }`, where `text` is the padded columns, joined by one space and right-trimmed. No field is set to `undefined`.
- [ ] **Done when:** `node --test tests/core/members_test.ts` passes.
- [ ] **Commit:** `git commit -m "Build class and ER member rows"`

### T53: Graph ladder; flowchart moves onto it
**Group** G4 · **Deps** T19, T46, T51 · **Covers** the state/class/ER ladder (index §5), A4.fit-ladder, DRY (flowchart's loop moves here), fix-cycle findings 1 and 7
**Files:** create `core/graph/ladder.ts`; modify `core/diagrams/flowchart/layout.ts`. Test: `tests/core/ladder_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { graphSteps, drawAt, type Build } from '../../core/graph/ladder.ts'; import { validate } from '../../core/validate.ts'
import type { Drawing } from '../../core/canvas.ts'; import { g, text } from './graph-fixture.ts'
const keyable = [{ item: 'e0:label', cls: 'label' }]
const build: Build = ({ dir, keyed }) => {
  const gr = g(dir, ['A>B|uses', 'B>C']); if (!keyed) return { graph: gr, legend: [], keyable }
  gr.edges[0]!.labelKey = 'a'
  return { graph: gr, legend: [{ key: 'a', keyInk: 'label', item: 'e0:label', cls: 'label', parts: [{ text: 'uses', ink: 'label', owner: 'e0:label' }] }], keyable }
}
test('A4.fit-ladder: graph steps; lrToTd only for LR and RL; keyed last', () => {
  assert.deepEqual(graphSteps('TB', false), ['natural', 'tight', 'wrap'])
  assert.deepEqual(graphSteps('LR', true), ['natural', 'tight', 'wrap', 'lrToTd', 'keyed'])
})
test('A4.fit-ladder: drawAt stacks the title, the graph and the legend; keyed LR is redrawn TB', () => {
  const n = drawAt(build, 'LR', 'natural', 80, 'My graph') as Drawing, k = drawAt(build, 'LR', 'keyed', 80, null) as Drawing
  const at = (s: string) => text(k).findIndex(l => l.includes(s))
  assert.equal(validate(n), null); assert.equal(text(n)[0], 'My graph'); assert.equal(n.columns, 80)
  assert.equal(validate(k), null); assert.ok(at('[ A ]') < at('[ B ]') && at('[ B ]') < at('[ C ]')); assert.equal(text(k).at(-1), 'a uses')
  assert.deepEqual(k.expect.keys, [{ key: 'a', item: 'e0:label', cls: 'label' }])
})
```
- [ ] **Run** `node --test tests/core/ladder_test.ts` → FAIL: `Cannot find module …/core/graph/ladder.ts`.
- [ ] **Implement:**
  - **`graphSteps(dir, keyable)`:** `['natural', 'tight', 'wrap']`, plus `'lrToTd'` for LR and RL, plus `'keyed'` when keyable.
  - **`drawAt`:**
    - **Spacing:** `SPACING` moves here from flowchart's `layout.ts`, which re-exports it, so `flowchart-layout_test.ts` imports it unchanged.
      - `natural`, `tight` and `wrap` use their own rows, exactly as A's flowchart layout does; `lrToTd` and `keyed` use the `wrap` row.
      - Each row is for the direction drawn. `drawAt` maps the step to a row itself, so nothing indexes `SPACING` by a wide `Step`, and T40's guard goes.
    - **Route conflicts (finding 7):** each try lays out at 0, then 2, then 4 extra cells of rank and node gap, as A's Q1 rule does. Only a `route-conflict` retries; any other Fail returns at once.
    - **Direction:** `lrToTd` and `keyed` draw LR as TB and RL as BT; the other steps keep `dir`.
    - **wrapAt tries:** `[null]` for natural and tight; `[24, 20, 16, 12, 8]` for wrap; `[null, 24, 20, 16, 12, 8]` for lrToTd and keyed. Only `keyed` builds with `keyed: true`.
    - **Each try:** `build` → `withNotes` → `layoutGraph` → `routeGraph` → `drawGraph(…, columns)` → `stack([heading(title), d], columns)` when there is a title → `withLegend(…, legend, columns, keyable)`.
    - It returns the first drawing that `validate` accepts, else the last attempt, as A4.fit-ladder pins; `fitLadder` validates it again, so an invalid attempt never reaches the screen.
  - **Flowchart:** `steps = g => graphSteps(g.dir, false)`, and `layout = (g, step, cols) => drawAt(({ dir }) => ({ graph: { ...g, dir }, legend: [], keyable: [] }), g.dir, step, cols, null)`. Flowchart keeps its title inside the graph, where T18 draws it, so its goldens do not change.
- [ ] **Done when:**
  - `node --test tests/core/ladder_test.ts tests/core/flowchart-layout_test.ts tests/golden/golden_test.ts` passes, both Q1 tests included;
  - `node scripts/typecheck.ts` passes;
  - `git diff --stat goldens/` is empty.
- [ ] **Commit:** `git commit -m "Move the graph ladder into graph/ladder.ts and run flowchart on it"`
