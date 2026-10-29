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
  - **`model.ts`:** add `Mark`, `Col`, `Note`, the `NodeRow` fields `fixed`, `indent`, `join` and `cols`, the `GNode` fields `mark`, `span` and `note`, the `End` values `triangle`, `diamond` and `odiamond`, the `GEdge` fields `tailLabel`, `headLabel` and `endRole`, and `GCluster.frameless`, exactly as in index §4. All are optional.
  - **`nodeSize(n, wrapAt, across = false)`:**
    - A mark `start`, `end` or `choice` is `{ rows: 1, cols: 1 }`. A `bar` is `{ rows: 1, cols: span }`, or `{ rows: span, cols: 1 }` when `across`, so layered's `ext()` always gives it `cross = span`.
    - A `fixed` row, or a row with `cols`, is one piece and never wraps. Its width is `indent + width(text)`, or `indent + Σ col.width + (cols − 1)`.
    - Every other row wraps as before. `cols` is the widest piece + 2 + the caps.
  - **Notes** do not change `nodeSize`: layered adds their margin (T51). `layered.ts` still calls `nodeSize(n, wrapAt)`, and T51 passes `across`.
- [ ] **Done when:** `node --test tests/core/graph-c-model_test.ts tests/core/layered_test.ts` passes.
- [ ] **Commit:** `git commit -m "Extend the graph model with marks, member columns, notes and class ends"`

### T50: Route and draw: marks, member columns, class ends, end labels
**Group** G2 · **Deps** T17, T18, T49 · **Covers** state marks (`●`, `◉`, `◇`, the fork bar), class ends (matrix class text design), ER and class cardinality beside its end, ER column alignment, rule 12 glyphs
**Files:** modify `core/graph/route.ts`, `core/graph/draw.ts`. Test: `tests/core/graph-c-draw_test.ts`.
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
})
test('A3: member columns align; a column cell is owned by its own id, then the node', () => {
  const gr = g('TB', ['C>D']), cols = (k: number, type: string, name: string) => [{ text: type, role: 'label', id: `C.a${k}.type`, width: 6 },
    { text: name, role: 'label', id: `C.a${k}.name`, width: 5 }] as NodeRow['cols']
  gr.nodes[0]!.rows = [{ text: 'CAR', role: 'node', align: 'center' }, { text: 'string id', role: 'label', align: 'left', fixed: true, cols: cols(0, 'string', 'id') },
    { text: 'int seats', role: 'label', align: 'left', fixed: true, cols: cols(1, 'int', 'seats') }]
  const d = D(gr), t = text(d); assert.equal(validate(d), null)
  const r1 = t.find(l => l.includes('string id'))!, r2 = t.find(l => l.includes('int    seats'))!; assert.equal(r1.indexOf(' id'), r2.indexOf(' seats'))
  assert.ok(d.cells.flat().some(c => c?.kind === 'text' && c.ch === 's' && c.owners[0] === 'C.a1.name' && c.owners.includes('C')))
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
  - **`expect.edges` heads:** each end's glyph, tail first.
- [ ] **Done when:** `node --test tests/core/graph-c-draw_test.ts tests/core/draw_test.ts tests/core/route_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw marks, member columns, class ends and end labels"`

### T51: Side notes, frameless regions, dividers
**Group** G3 · **Deps** T50 · **Covers** state notes (matrix: dim, borderless, a `┄` connector), state regions (stacked, split by `┄` rows, `┆` in LR/RL), class `note for`, index §5.10
**Files:** create `core/graph/notes.ts`; modify `core/graph/layered.ts`, `core/graph/draw.ts`. Test: `tests/core/graph-notes_test.ts`.
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
test('A3: frameless regions stack inside one frame, split by a dashed row; they draw no frame of their own', () => {
  const gr = g('TB', ['a>b', 'c>d'])
  gr.edges.push({ id: 'S:chain0', from: 'r1', to: 'r2', style: 'invisible', tail: 'none', head: 'none', label: null, minlen: 1, order: 2 })
  gr.clusters = [{ id: 'S', title: 'Active', dir: null, nodes: [], clusters: ['r1', 'r2'] },
    { id: 'r1', title: null, dir: null, nodes: ['a', 'b'], clusters: [], frameless: true }, { id: 'r2', title: null, dir: null, nodes: ['c', 'd'], clusters: [], frameless: true }]
  const d = D(gr), t = text(d); assert.equal(validate(d), null)
  assert.ok(t.some(l => /^│ *┄+ *│$/.test(l.trim())), t.join('\n'))
  assert.ok(!d.cells.flat().some(c => c?.kind === 'frame' && (c.owners[0] === 'r1' || c.owners[0] === 'r2')))
})
```
- [ ] **Run** `node --test tests/core/graph-notes_test.ts` → FAIL: `Cannot find module …/core/graph/notes.ts`.
- [ ] **Implement:**
  - **`withNotes(g)`:**
    - TB and BT: `g` is returned unchanged.
    - LR and RL: each noted node gets a note node `{ id: note.id, shape: 'plain', role: 'note', rows: labelLines(text)` as left-aligned `note` rows`, order: nodes.length + k }` and an edge `{ id: `${note.id}:link`, style: 'dotted', tail: 'none', head: 'none', label: null, minlen: 1 }`.
    - The edge runs note → node for `left` in LR and for `right` in RL, and node → note otherwise. The node loses its `note`.
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
    - A frameless cluster draws no frame.
    - Between two consecutive frameless children of one cluster, draw a divider of `cap` cells in the `frame` role, owned by `${parent}:div<k>`. It is `┄` across the parent's inner width on the gap's middle row (TB/BT), or `┆` down the gap's middle column (LR/RL).
    - Caps are not lines, so the tangle and edge checks ignore dividers.
- [ ] **Done when:** `node --test tests/core/graph-notes_test.ts tests/core/graph-c-draw_test.ts tests/core/layered_test.ts` passes.
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
**Group** G4 · **Deps** T19, T46, T51 · **Covers** the state/class/ER ladder (index §5), A4.fit-ladder, DRY (flowchart's loop moves here)
**Files:** create `core/graph/ladder.ts`; modify `core/diagrams/flowchart/layout.ts`. Test: `tests/core/ladder_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { graphSteps, drawAt, type Build } from '../../core/graph/ladder.ts'; import { validate } from '../../core/validate.ts'
import type { Drawing } from '../../core/canvas.ts'; import { g, text } from './graph-fixture.ts'
const build: Build = ({ dir, keyed }) => {
  const gr = g(dir, ['A>B|uses', 'B>C']); if (!keyed) return { graph: gr, legend: [] }
  gr.edges[0]!.label = 'a'
  return { graph: gr, legend: [{ key: 'a', keyInk: 'label', owner: 'e0:label:legend', parts: [{ text: 'uses', ink: 'label', owner: 'e0:label:legend' }] }] }
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
})
```
- [ ] **Run** `node --test tests/core/ladder_test.ts` → FAIL: `Cannot find module …/core/graph/ladder.ts`.
- [ ] **Implement:**
  - **`graphSteps(dir, keyable)`:** `['natural', 'tight', 'wrap']`, plus `'lrToTd'` for LR and RL, plus `'keyed'` when keyable.
  - **`drawAt`:**
    - **Spacing:** `natural` uses A's natural row and every other step the tight row (plan A §7), each for the direction drawn.
    - **Direction:** `lrToTd` and `keyed` draw LR as TB and RL as BT; the other steps keep `dir`.
    - **wrapAt tries:** `[null]` for natural and tight; `[24, 20, 16, 12, 8]` for wrap; `[null, 24, 20, 16, 12, 8]` for lrToTd and keyed. Only `keyed` builds with `keyed: true`.
    - **Each try:** `build` → `withNotes` → `layoutGraph` → `routeGraph` → `drawGraph(…, columns)` → `stack([heading(title), d], columns)` when there is a title → `withLegend(…, legend, columns)`.
    - It returns the first drawing that `validate` accepts, else the last Fail.
  - **Flowchart:** `steps = g => graphSteps(g.dir, false)`, and `layout = (g, step, cols) => drawAt(({ dir }) => ({ graph: { ...g, dir }, legend: [] }), g.dir, step, cols, null)`. Flowchart keeps its title inside the graph, where T18 draws it, so its goldens do not change.
- [ ] **Done when:** `node --test tests/core/ladder_test.ts tests/golden/golden_test.ts` passes, and `git diff --stat goldens/` is empty.
- [ ] **Commit:** `git commit -m "Move the graph ladder into graph/ladder.ts and run flowchart on it"`
