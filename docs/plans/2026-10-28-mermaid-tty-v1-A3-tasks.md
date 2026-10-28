# mermaid-tty v1 A — tasks T12–T21 (fit ladder, registry, flowchart, hook)

**Depends on:** the main plan (§6 interfaces, §7 algorithms, §9 checks) and A2 (T0–T11). A4 (T22–T32) and A5 (T33–T39) depend on T19–T21 here.
**Conventions:** as in A2. Graph tests build their inputs with `tests/core/graph-fixture.ts`: `g(dir, edges, labels?)` returns a `Graph`, nodes in first-seen order. Its name does not end in `_test`, so no runner loads it as a test.

### T12: Fit ladder and registry
**Group** P5 · **Deps** T7, T11 · **Covers** A4.fit-ladder (runner), A1 and flowchart-reject-05 (`flowchart-elk`), matrix rule 1, C's `ENABLED`
**Files:** create `core/fit.ts`, `core/registry.ts`. Test: `tests/core/fit_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createCanvas } from '../../core/canvas.ts'
import { fitLadder } from '../../core/fit.ts'; import { lookup, ENABLED, KEYWORDS } from '../../core/registry.ts'
const fake = { type: 'flowchart', parse: (s: unknown) => s, steps: () => ['natural', 'tight'],
  layout: (_m: unknown, step: string, cols: number) => {
    const t = 'x'.repeat(step === 'natural' ? 11 : 9), c = createCanvas(1, 12, cols); c.text(0, 0, t, 'node', 'A')
    return c.toDrawing({ labels: [{ owner: 'A', text: t }], edges: [], edgeLabels: [] }) } }
test('A4.fit-ladder: the first fitting step is taken; none fits → Fail', () => {
  assert.equal((fitLadder(fake as never, {}, 10) as { step: string }).step, 'tight')
  assert.ok('reason' in fitLadder(fake as never, {}, 4))
})
test('A1: registry keywords; ENABLED is exactly A', () => {
  assert.deepEqual([...ENABLED].sort(), ['flowchart', 'sequence'])
  assert.equal(KEYWORDS['graph'], 'flowchart'); assert.equal(KEYWORDS['stateDiagram-v2'], 'state'); assert.equal(KEYWORDS['flowchart-elk'], null)
  assert.deepEqual(lookup('flowchart-elk TD'), { reason: 'fallback:flowchart-elk' }); assert.deepEqual(lookup('pie title x'), { reason: 'disabled:pie' })
  assert.deepEqual(lookup('Flowchart TD'), { reason: 'unknown-type' })
})
```
- [ ] **Run** `node --test tests/core/fit_test.ts` → FAIL: `Cannot find module …/core/fit.ts`.
- [ ] **Implement:**
  - **`fitLadder`:** for each `mod.steps(model)`, run `layout`. Skip a `Fail`, and skip a drawing that `validate` rejects, remembering its reason. Return `{ step, drawing }` for the first that passes; otherwise the last reason, or `fail('too-wide')` when no step ran.
  - **`KEYWORDS`** (matrix headers):

    | Keyword(s) | Type |
    |---|---|
    | flowchart graph | flowchart |
    | flowchart-elk | null |
    | sequenceDiagram | sequence |
    | stateDiagram stateDiagram-v2 | state |
    | classDiagram classDiagram-v2 | class |
    | erDiagram | er |
    | requirementDiagram | requirement |
    | requirement | null |
    | C4Context C4Container C4Component C4Dynamic C4Deployment | c4 |
    | architecture-beta | architecture |
    | gantt pie journey mindmap gitGraph timeline kanban zenuml | each its own type |
    | xychart-beta xychart | xychart |
    | quadrantChart | quadrant |
    | sankey-beta sankey | sankey |
    | radar-beta | radar |
    | treemap-beta treemap | treemap |
    | block-beta block | block |
    | packet-beta packet | packet |
  - **`MODULES: Partial<Record<DiagramType, DiagramModule>>`** starts empty; T19 and T24 import their modules here.
  - **`lookup(h)`:** take the first whitespace token, dropping a trailing `:`.
    - `!Object.hasOwn(KEYWORDS, kw)` → `unknown-type` (headers are case-sensitive).
    - `null` → `fallback:<kw>`.
    - A type not in `ENABLED` → `disabled:<type>`; a type with no module → `unregistered:<type>`.
    - Otherwise, the module.
- [ ] **Done when:** `node --test tests/core/fit_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the fit ladder runner and the diagram registry"`

### T13: Flowchart parse — header, nodes, shapes, labels
**Group** P3 · **Deps** T4, T7, T9 · **Covers** A1, flowchart-ok-01…22, -49 (bare header), flowchart-reject-01, -03
**Files:** create `core/diagrams/flowchart/parse.ts` (`parseFlowchart(src: Source): Graph | Fail`). Test: `tests/core/flowchart-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
const P = (t: string) => parseFlowchart(readSource(t) as Source) as any
test('A1: headers and directions', () => {
  for (const [d, w] of [['TD', 'TB'], ['TB', 'TB'], ['BT', 'BT'], ['LR', 'LR'], ['RL', 'RL']]) assert.equal(P(`flowchart ${d}\nA`).dir, w)
  assert.equal(P('graph LR\nA').dir, 'LR'); assert.equal(P('flowchart\nA').dir, 'TB'); assert.equal(P('graph\nA').dir, 'TB')
})
test('A1: every bracket shape, @{shape}, quoted and <br/> labels', () => {
  const S: [string, string][] = [['A[x]', 'rect'], ['A(x)', 'round'], ['A([x])', 'stadium'], ['A[[x]]', 'subroutine'], ['A[(x)]', 'cylinder'],
    ['A((x))', 'circle'], ['A{x}', 'diamond'], ['A{{x}}', 'hexagon'], ['A[/x/]', 'leanR'], ['A[\\x\\]', 'leanL'], ['A[/x\\]', 'trap'],
    ['A[\\x/]', 'trapInv'], ['A>x]', 'asym'], ['A(((x)))', 'dcircle'], ['A@{ shape: cyl, label: "x" }', 'cylinder'], ['A@{ shape: zzz }', 'rect']]
  for (const [src, shape] of S) assert.equal(P(`flowchart TD\n${src}`).nodes[0].shape, shape, src)
  assert.equal(P('flowchart TD\nA["a, b: (c)!"]').nodes[0].rows[0].text, 'a, b: (c)!')
  assert.deepEqual(P('flowchart TD\nA[one<br/>two<br>three]').nodes[0].rows.map((r: any) => r.text), ['one', 'two', 'three'])
  assert.equal(P('flowchart TD\nA{ok?}').nodes[0].role, 'decision')
})
test('A5.errors: malformed node; ZWJ label', () => {
  assert.match(P('flowchart TD\nA[open --> B').reason, /^syntax:2/)
  assert.equal(P('flowchart TD\nA[👨‍👩]').reason, 'unsupported-char U+200D')
})
```
- [ ] **Run** `node --test tests/core/flowchart-parse_test.ts` → FAIL: `Cannot find module …/flowchart/parse.ts`.
- [ ] **Implement:**
  - **Header:** `^(flowchart|graph)( (TD|TB|BT|LR|RL))?$`, with TD mapped to TB; a bare header is TB, as in Mermaid (`flowchart-ok-49`).
  - **Statements:** split at `;` outside quotes.
  - **Node tokens:** the id regex from §7. Openers are tried longest first; each takes the first matching closer outside `"…"`, which decides between `[/ /]`/`[/ \]` and `[\ \]`/`[\ /]`. For `@{…}`, `key: value` pairs, with `shape` going through `shapeFromName` and `label` read; other keys are ignored.
  - **Labels:** strip the quotes. `` "`…`" `` fails `markdown-string`; `#…;` fails `entity`. Split rows with `labelLines`. `unsupported(text)` fails `unsupported-char U+XXXX`.
  - **Nodes:** declared in order of first mention; a later shape or label wins. Diamonds take role `decision`; every other shape takes `node`.
  - **Leftovers:** any text left on a statement fails `syntax:<n>` (source line n).
- [ ] **Done when:** `node --test tests/core/flowchart-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse flowchart headers, node shapes and labels"`

### T14: Flowchart parse — links, chains, `&`, edge IDs, `~~~`
**Group** P4 · **Deps** T13 · **Covers** A1, flowchart-ok-23…33, -46, -47
**Files:** modify `core/diagrams/flowchart/parse.ts`. Test: `tests/core/flowchart-edges_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
const E = (l: string) => (parseFlowchart(readSource(`flowchart TD\n${l}`) as Source) as any).edges
const k = (e: any) => [e.style, e.tail, e.head, e.label].join(' ')
test('A1: edge kinds, ends and labels', () => {
  for (const [src, want] of [['A-->B', 'solid none arrow '], ['A-.->B', 'dotted none arrow '], ['A==>B', 'thick none arrow '],
    ['A<-->B', 'solid arrow arrow '], ['A--oB', 'solid none circle '], ['A--xB', 'solid none cross '], ['A---B', 'solid none none '],
    ['A~~~B', 'invisible none none '], ['A-->|yes|B', 'solid none arrow yes'], ['A-- yes -->B', 'solid none arrow yes'],
    ['A-. maybe .->B', 'dotted none arrow maybe'], ['A== big ==>B', 'thick none arrow big']] as const)
    assert.equal(k(E(src)[0]), want, src)
})
test('A1: chains, & fan-out and fan-in, minlen, edge IDs', () => {
  assert.deepEqual(E('A --> B --> C').map((e: any) => e.from + e.to), ['AB', 'BC'])
  assert.deepEqual(E('A & B --> C & D').map((e: any) => e.from + e.to), ['AC', 'AD', 'BC', 'BD'])
  assert.equal(E('A ----> B')[0].minlen, 3); assert.equal(E('A e1@--> B')[0].id, 'e1')
})
```
- [ ] **Run** `node --test tests/core/flowchart-edges_test.ts` → FAIL: `expected 'solid none arrow '` (no edges are parsed yet).
- [ ] **Implement:**
  - **Link forms:**
    - `(<|o|x)?(-{2,}|={2,}|-\.+-)(>|o|x)?`, optionally preceded by `id@`.
    - The text forms `-- t -->`, `== t ==>` and `-. t .->`, with the same closers and o/x ends.
    - `~~~` (invisible).
  - **After a link:** an optional `|label|`. Style: `-` is solid, `=` thick, `.` dotted, `~` invisible. Ends: `<`/`>` are arrow, `o` circle, `x` cross; none is `none`.
  - **minlen:** 1 + the extra length over the form's base: 2 for `-->` and `==>`, 3 for `---` and `===`, one dot for the dotted forms.
  - **Groups and chains:** a statement `G0 L1 G1 L2 G2 …` (`Gi` is `N (& N)*`) yields, for each link `Li`, the cross product `G(i-1) × Gi` in source order. `order` counts up across the diagram.
  - **IDs and labels:** the default id is `L_<from>_<to>_<n>`. Edge labels pass `unsupported()`.
- [ ] **Done when:** `node --test tests/core/flowchart-edges_test.ts tests/core/flowchart-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse flowchart links, chains, & groups and edge IDs"`

### T15: Flowchart parse — subgraphs, `direction`, ignored directives
**Group** P5 · **Deps** T14 · **Covers** A1, flowchart-ok-34…39, -47, -48, flowchart-reject-02, matrix common rule 4
**Files:** modify `core/diagrams/flowchart/parse.ts`. Test: `tests/core/flowchart-subgraph_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
const P = (t: string) => parseFlowchart(readSource(`flowchart TD\n${t}`) as Source) as any
test('A1: nested, titled subgraphs with direction', () => {
  const g = P('subgraph outer [Outer box]\n  direction LR\n  A --> B\n  subgraph inner\n    C\n  end\nend\nB --> C')
  assert.deepEqual(g.clusters.map((c: any) => [c.id, c.title, c.dir, c.nodes, c.clusters]),
    [['outer', 'Outer box', 'LR', ['A', 'B'], ['inner']], ['inner', 'inner', null, ['C'], []]])
})
test('A1: styling and accessibility directives are parsed and ignored', () => {
  const g = P('A:::hot --> B\nclassDef hot fill:#f00\nclass A hot\nstyle B fill:#0f0\nlinkStyle 0 stroke:#00f\nclick A "https://x"\n' +
    'accTitle: T\naccDescr { multi\nline }\nA e1@--> C\ne1@{ animate: true }')
  assert.deepEqual([g.nodes.map((n: any) => n.id), g.edges.length], [['A', 'B', 'C'], 2])
})
test('A5.errors: subgraph with no end', () => assert.equal(P('subgraph s\nA').reason, 'unclosed-subgraph'))
```
- [ ] **Run** `node --test tests/core/flowchart-subgraph_test.ts` → FAIL: `syntax:2` (`subgraph` is not parsed yet).
- [ ] **Implement:**
  - **Subgraph forms:** `subgraph id`, `id [t]`, `id ["t"]`, and `"t"` (where the id is the title). They push onto a stack and `end` pops; anything still open at the end of input fails `unclosed-subgraph`.
  - **`direction X`:** only inside a subgraph, where it sets `dir` (TD becomes TB). Anywhere else it fails `syntax:<n>`.
  - **Membership:** a node belongs to the innermost subgraph whose block mentions it. When several do, the first to close wins, as in Mermaid's flowDb.
  - **Ignored:** lines starting `classDef `, `class `, `style `, `linkStyle `, `click `, `accTitle:` or `accDescr:`; an `accDescr {…}` block across lines; a `:::name` suffix; and `id@{…}` for a known edge id. A node id that equals a cluster id and carries no shape or label is an edge end on that cluster: layout accepts it only for a sealed cluster, else `cluster-edge`. `Graph.title` is `src.title`.
- [ ] **Done when:** all three `tests/core/flowchart-*_test.ts` files pass.
- [ ] **Commit:** `git commit -m "Parse flowchart subgraphs, direction and ignored directives"`

### T16: Graph model and layered layout
**Group** P3 · **Deps** T2, T9 (T4, T5 type-only) · **Covers** A1 (placement), A3 (rows per line), the C hand-off (§6 model)
**Files:** create `core/graph/model.ts` (types from §6), `core/graph/layered.ts`, `tests/core/graph-fixture.ts`. Test: `tests/core/layered_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { g } from './graph-fixture.ts'
const S = { rankGap: 3, nodeGap: 4, wrapAt: null }, L = (...a: Parameters<typeof g>) => layoutGraph(g(...a), S) as Placed
const hit = (a: any, b: any) => a.row < b.row + b.rows && b.row < a.row + a.rows && a.col < b.col + b.cols && b.col < a.col + a.cols
test('A1: TB ranks go down, LR ranks go right, cycles lay out', () => {
  const t = L('TB', ['A>B', 'B>C']); assert.ok(t.boxes.get('A')!.row < t.boxes.get('B')!.row && t.boxes.get('B')!.row < t.boxes.get('C')!.row)
  const l = L('LR', ['A>B']); assert.ok(l.boxes.get('A')!.col < l.boxes.get('B')!.col)
  const c = L('TB', ['A>B', 'B>C', 'C>A']); assert.ok(c.boxes.get('A')!.row < c.boxes.get('C')!.row)
})
test('A1: no boxes overlap; an edge label has a rank of its own; cluster strips keep outsiders out', () => {
  const p = L('TB', ['A>B', 'A>C', 'A>D', 'B>E', 'C>E', 'D>E|done']), bs = [...p.boxes.values()]
  bs.forEach((x, i) => bs.slice(i + 1).forEach(y => assert.ok(!hit(x, y))))
  const lab = p.boxes.get('e5:label')!; assert.ok(p.boxes.get('D')!.row < lab.row && lab.row < p.boxes.get('E')!.row)
  const x = g('TB', ['A>B', 'X>B']); x.clusters.push({ id: 's', title: 'S', dir: null, nodes: ['A', 'B'], clusters: [] })
  const q = layoutGraph(x, S) as Placed, f = q.frames.get('s')!
  assert.ok(hit(f, q.boxes.get('A')) && hit(f, q.boxes.get('B')) && !hit(f, q.boxes.get('X')))
})
```
- [ ] **Fixture** (`graph-fixture.ts`): `g(dir, ['A>B', 'A=>C', 'A.>D', 'D>E|label'], { B: 'one<br/>two' })` returns a `Graph`. Nodes come in first-seen order, `rect`, with `rows` from the label split at `<br/>`. Edge `i` has id `e${i}`, head `arrow`, minlen 1 and the given label; `>` is solid, `=>` thick, `.>` dotted. It also exports `text(d)`: the drawing's rows as strings (`cont` → '', `null` → ' ', trailing spaces trimmed).
- [ ] **Run** `node --test tests/core/layered_test.ts` → FAIL: `Cannot find module …/core/graph/layered.ts`.
- [ ] **Implement** §7 steps 1–8:
  - **Box sizes:** a node box is `max(width(row piece)) + 2 + width(capL) + width(capR)` wide, with one row per piece after `wrap(row, wrapAt)` (null → fail `word-too-wide`). An edge label box `${edge}:label` is `width(label) + 2` wide, one row per piece. Dummies `${edge}#${k}` are 1×1.
  - **Frames:** one per cluster, each the size of its strip.
  - **Failures and determinism:** `cluster-edge` for an edge on an open cluster; ties keep source order, so the same input always gives the same `Placed`.
- [ ] **Done when:** `node --test tests/core/layered_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the shared graph model and the layered layout"`

### T17: Orthogonal router
**Group** P4 · **Deps** T16 · **Covers** A1 (edges), flowchart-ok-50…52 (bends, crossings), VR.tangled (shared stems only between related edges; heads never on junctions)
**Files:** create `core/graph/route.ts`. Test: `tests/core/route_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { routeGraph, type Route } from '../../core/graph/route.ts'
import { g } from './graph-fixture.ts'
const R = (dir: 'TB' | 'LR', e: string[]) => routeGraph(layoutGraph(g(dir, e), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed) as Route[]
const linked = (r: Route) => r.cells.every((c, i) => !i || Math.abs(c.r - r.cells[i - 1]!.r) + Math.abs(c.c - r.cells[i - 1]!.c) === 1)
const at = (r: Route) => new Set(r.cells.map(c => `${c.r},${c.c}`))
test('A1: routes are 4-connected and end in one allowed head', () => {
  for (const r of R('TB', ['A>B', 'A>C', 'B>D', 'C>D'])) { assert.ok(linked(r), r.edge); assert.deepEqual(r.ends.map(e => e.ch), ['▼']) }
  assert.deepEqual(R('LR', ['A>B'])[0]!.ends.map(e => e.ch), ['►'])
})
test('A1: a fan-out shares its stem; unrelated routes share no cell', () => {
  const [ab, ac, de] = R('TB', ['A>B', 'A>C', 'D>E']).map(at)
  assert.ok([...ab!].some(k => ac!.has(k))); assert.ok(![...de!].some(k => ab!.has(k) || ac!.has(k)))
})
test('A1: bends have corners; each head follows a straight cell; crossings are perpendicular', () => {
  const rs = R('TB', ['A>B', 'A>C']); assert.ok(rs.some(r => r.cells.some(c => [3, 6, 9, 12].includes(c.dirs))))
  for (const r of rs) assert.ok([5, 10].includes(r.cells[r.cells.length - 1]!.dirs), r.edge)
  const [, ad, bc] = R('TB', ['A>C', 'A=>D', 'B>C', 'B>D']), dirOf = (r: Route, k: string) => r.cells.find(c => `${c.r},${c.c}` === k)!.dirs
  const shared = [...at(ad!)].filter(k => at(bc!).has(k)); assert.ok(shared.length > 0)
  for (const k of shared) assert.equal(dirOf(ad!, k) + dirOf(bc!, k), 15)
})
```
- [ ] **Run** `node --test tests/core/route_test.ts` → FAIL: `Cannot find module …/core/graph/route.ts`.
- [ ] **Implement** the §7 router:
  - **Cells:** each route runs from the cell next to the source face to the cell before its head, in order, with `dirs` set from its neighbours. The cells next to a node point at it.
  - **Ends:** an `arrow` end is `▼▲►◄`, by the side it enters; `circle` is `o`; `cross` is `x`. A `tail` end goes at the start.
  - **Ports:** one per group of edges with the same face, style and end. Edges in a group share the stem up to their split; other ports spread across the face, nudged so that no top pin shares a column with a bottom pin in that channel when the face is wide enough.
  - **Tracks:** left-edge assignment per channel under vertical constraints. A cycle fails `route-conflict`. Each gap ends with one straight in-stem row before the head row, so a head never sits on a junction or crossing.
- [ ] **Done when:** `node --test tests/core/route_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the orthogonal channel router"`

### T18: Draw a placed, routed graph
**Group** P5 · **Deps** T10, T17 · **Covers** A3 (every shape: one-line, `<br/>` and wrapped labels; caps on every row), A1 (edges, frames, titles), flowchart-ok-50…52 (heavy bends, dashed bends, mixed junctions), C contract (member-row identity)
**Files:** create `core/graph/draw.ts`. Test: `tests/core/draw_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { routeGraph, type Route } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { validate } from '../../core/validate.ts'; import { g, text } from './graph-fixture.ts'
import { CAPS, type Shape } from '../../core/caps.ts'
const D = (gr: ReturnType<typeof g>, wrapAt: number | null = null) => {
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt }) as Placed; return { p, d: drawGraph(p, routeGraph(p) as Route[], 80) }
}
test('A3: one row per label line; no border-only rows', () => {
  const { p, d } = D(g('TB', ['A>B'], { A: 'one', B: 'two<br/>lines' }))
  assert.equal(validate(d), null); assert.equal(p.boxes.get('A')!.rows, 1); assert.equal(p.boxes.get('B')!.rows, 2)
  for (const id of ['A', 'B']) { const b = p.boxes.get(id)!
    for (let r = b.row; r < b.row + b.rows; r++) assert.ok(d.cells[r]!.some(c => c?.kind === 'text' && c.owners.includes(id)), `${id}@${r}`) }
  assert.match(text(d).join('\n'), /\[ one \][\s\S]*▼[\s\S]*\[ +two +\]/)
})
test('A3: a wrapped label takes one row per wrapped line', () => {
  const { p, d } = D(g('TB', ['A>B'], { A: 'alpha beta gamma' }), 8)
  assert.equal(validate(d), null); assert.equal(p.boxes.get('A')!.rows, 3)
})
test('A3: every shape: a one-line label takes 1 row, a <br/> label N rows, a wrapped label one row per wrapped line', () => {
  for (const shape of Object.keys(CAPS) as Shape[]) for (const [label, wrapAt, rows] of [['one', null, 1], ['a<br/>b<br/>c', null, 3], ['alpha beta gamma', 8, 3]] as const) {
    const gr = g('TB', ['A>B'], { A: label }); gr.nodes[0]!.shape = shape
    const { p, d } = D(gr, wrapAt); assert.equal(validate(d), null, `${shape} ${label}`); assert.equal(p.boxes.get('A')!.rows, rows, `${shape} ${label}`)
  }
})
test('A1: thick bends are heavy; dotted bends are dashed with light corners; thick crosses solid with ╂ or ┿', () => {
  const heavy = text(D(g('TB', ['A=>B', 'A=>C'])).d).join('\n'); assert.match(heavy, /[┏┓┗┛]/); assert.match(heavy, /[┳┻┣┫]/)
  const dot = text(D(g('TB', ['A.>B', 'A.>C'])).d).join('\n'); assert.match(dot, /┆/); assert.match(dot, /[┌┐└┘]/); assert.doesNotMatch(dot, /[┏┓┗┛]/)
  assert.match(text(D(g('TB', ['A>C', 'A=>D', 'B>C', 'B>D'])).d).join('\n'), /[╂┿]/)
})
test('A3: a member row is owned by its own id (C contract)', () => {
  const gr = g('TB', ['U>V']); gr.nodes[0]!.rows = [{ text: 'User', role: 'node', align: 'center' }, { text: '+name', role: 'label', align: 'left', id: 'U.name' }]
  const { d } = D(gr); assert.equal(validate(d), null)
  assert.ok(d.cells.flat().some(c => c?.kind === 'text' && c.ch === '+' && c.owners[0] === 'U.name' && c.owners.includes('U')))
})
```
- [ ] **Run** `node --test tests/core/draw_test.ts` → FAIL: `Cannot find module …/core/graph/draw.ts`.
- [ ] **Implement:**
  - **Nodes:** every row of a node box gets `cap` left and right (from `CAPS[shape]`, role color), `fill` pads and the centered piece as `text`. The first piece of label line k > 0 has `join '\n'`; a wrapped continuation has the wrap's join. Caps and fill are owned by the node; a row's text by `[row.id ?? node.id, node.id]` (deduplicated), so `owners[0]` names the label and edges still touch the node.
  - **Clusters and titles:** `frame()` per cluster, titled. The graph title is a bold `text` row 0, role `title`, owner `title`.
  - **Routes:** `line()` per cell, weight by style: solid light; thick heavy, with heavy corners and junctions; dotted `┄`/`┆`, bending with light corners. Light and heavy arms meeting in one cell take `boxGlyph(arms)` (rule 12). `arrow()` per end. Edge labels are `text`, role `label`, owner `${edge}:label`.
  - **`shares(a, b)`:** true when edges a and b share an endpoint, whatever their styles. Their arms then merge cell by cell, so a thick and a solid edge from one node meet in the matching mixed junction (rule 12, `flowchart-ok-51`).
  - **Expect:** every node label, one entry per text owner (rows of one owner joined by `\n`), every edge label (owner `${id}:label`), every cluster title (owner cluster id) and the title. Edges are every non-invisible edge with its original `from` and `to` and `heads` = its end glyphs; `edgeLabels` pairs each label with its edge.
- [ ] **Done when:** `node --test tests/core/draw_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw placed graphs: pills, frames, routes, labels"`

### T19: Flowchart module, render entry, cache, smoke and explain
**Group** P6 · **Deps** T5, T6, T12, T15, T18 · **Covers** A4.fit-ladder (steps), A5.errors (`null`), A7 (spans; series inks for C), A8.cache, A8.no-build (smoke), R5
**Files:** create `core/diagrams/flowchart/layout.ts`, `core/render.ts`, `scripts/smoke.ts`, `scripts/explain.ts`, `fixtures/flowchart/flowchart-ok-01.mmd`; modify `core/registry.ts` (`MODULES.flowchart = flowchart`). Test: `tests/core/render_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { renderMermaid, explain, createRenderer, toRows, type Span } from '../../core/render.ts'; import { THEMES, palette } from '../../core/themes.ts'
import { createCanvas } from '../../core/canvas.ts'
const FC = 'flowchart TD\nA[读取配置文件] --> B{完成?}', O = { columns: 80, theme: 'nord' }
const spans = (rows: Span[][] | null) => rows!.flat()
test('A5.errors: parse errors and unsupported types return null', () => {
  for (const s of ['flowchart TD\nA[open --> B', 'pie title x\n"a": 1', 'flowchart-elk TD\nA', 'Flowchart TD\nA']) assert.equal(renderMermaid(s, O), null, s)
  assert.deepEqual(explain('flowchart TD\nA[👨‍👩]', O), { reason: 'unsupported-char U+200D' })
})
test('A4.fit-ladder: below the minimum width falls back', () => assert.ok('reason' in explain(FC, { columns: 8, theme: 'nord' })))
test('A7: spans carry the palette colors; mono carries none', () => {
  const s = spans(renderMermaid(FC, O)), n = THEMES.nord.roles
  assert.equal(s.find(x => x.text.includes('读取配置文件'))?.backgroundColor, n.node)
  assert.equal(s.find(x => x.text.includes('完成?'))?.backgroundColor, n.decision)
  assert.equal(s.find(x => x.text.includes('▼'))?.color, n.arrow)
  assert.ok(spans(renderMermaid(FC, { columns: 80, theme: 'mono' })).every(x => x.color === undefined && x.backgroundColor === undefined))
})
test('A8.cache: a hit; a miss when any key part changes; LRU eviction at the 65th entry', () => {
  let calls = 0; const r = createRenderer(64, (s, o) => { calls++; return explain(s, o) })
  r.render(FC, O); r.render(FC, O); assert.equal(calls, 1)
  r.render(FC + ' ', O); r.render(FC, { ...O, columns: 81 }); r.render(FC, { ...O, theme: 'mono' }); assert.equal(calls, 4)
  for (let i = 0; i < 64; i++) r.render(`flowchart TD\nN${i}`, O)
  assert.equal(r.size, 64); r.render(FC, O); assert.equal(calls, 69)
})
test('A7: a series-inked cell yields a span with role s3 and the palette series color (C contract)', () => {
  const c = createCanvas(1, 4, 4); c.text(0, 0, 'ab', 's3', 'x')
  const span = toRows(c.toDrawing({ labels: [], edges: [], edgeLabels: [] }), palette('nord'))[0]![0]!
  assert.deepEqual([span.role, span.color], ['s3', THEMES.nord.series.s3])
})
```
- [ ] **Run** `node --test tests/core/render_test.ts` → FAIL: `Cannot find module …/core/render.ts`.
- [ ] **Implement:**
  - **`flowchart: DiagramModule<Graph>`:**
    - `parse` = `parseFlowchart`.
    - `steps(g)` returns `['natural', 'tight', 'wrap']`, plus `'lrToTd'` when `g.dir` is LR or RL.
    - `layout(g, step, cols)` takes the §7 spacing table. For `wrap`, it tries wrapAt 24, 20, 16, 12, 8 and returns the first drawing `validate` accepts. For `lrToTd`, it sets `dir` TB (from LR) or BT (from RL), uses the tight spacing, then tries wrapAt null, 24…8.
    - Each try runs `layoutGraph` → `routeGraph` → `drawGraph`, passing any `Fail` through.
  - **`explain(s, o)`:** `readSource` → `lookup(header)` → `mod.parse` → `fitLadder(mod, model, o.columns)`; the first `Fail` wins.
  - **`renderMermaid`:** `toRows(explain(…).drawing, palette(o.theme))`, or `null` on a `Fail`.
  - **`toRows(d, p)`:** per cell, color = `p.roles[role]`, or `p.series[role]` for a series ink `s1`–`s8` (§6 `Ink`).
    - Node and decision `text`/`fill` cells get `backgroundColor` = the role color and `color` = `p.onFill` when `p.fill`; caps get `color` only.
    - `title` is bold; roles in `p.dim` get `dimColor`.
    - `cont` cells are skipped. Each span carries its cells' `role`, an `Ink` (a role, or a series key `s1`–`s8` kept as is; blank runs have none; the hook strips it). Neighbours with equal role and style merge into one span; trailing blank spans are trimmed; null props are omitted.
  - **`createRenderer(cap = 64, inner = explain)`:** an LRU keyed by `JSON.stringify([s, o.columns, o.theme])` caches `Rows | Fail`. `onMiss(fail)` is called only on a miss.
  - **`smoke.ts`:** renders `fixtures/flowchart/flowchart-ok-01.mmd` (`flowchart TD`, `A[Start] --> B{Ready?}`, `B -->|yes| C([Done])`) at 80 columns under nord. It prints the rows and exits 1 on `null`.
  - **`explain.ts FILE COLS`:** prints `step`, the widest row's width, and the rows, or the reason. T20 sizes fixtures with it.
- [ ] **Done when:** `node --test tests/core/render_test.ts` passes and `node scripts/smoke.ts` prints the diagram.
- [ ] **Commit:** `git commit -m "Add the flowchart module, render entry, cache and smoke script"`

### T20: Flowchart fixtures, goldens and the glyph scan
**Group** P7 · **Deps** T3, T19 · **Covers** A1, A3, A4.fit-ladder, A8.platforms (glyph scan), every flowchart-ok and flowchart-reject fixture
**Files:** create `fixtures/flowchart/flowchart-{ok-01…52,reject-01…05}.mmd`, `goldens/flowchart/*.golden`, `tests/golden/golden-lib.ts`. Test: `tests/golden/golden_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'; import { explain } from '../../core/render.ts'; import { goldenOf, goldenGlyphs, widest } from './golden-lib.ts'
const W = [60, 80, 120], EDGE = new Set(['flowchart-reject-04', 'sequence-reject-04']), X = (s: string, w: number) => explain(s, { columns: w, theme: 'mono' }) as any
const LADDER: Record<string, string> = { 'flowchart-ok-41': 'natural', 'flowchart-ok-42': 'tight', 'flowchart-ok-43': 'wrap', 'flowchart-ok-44': 'lrToTd' }
const src = (id: string) => readFileSync(join('fixtures', id.split('-')[0]!, `${id}.mmd`), 'utf8')
for (const type of ['flowchart', 'sequence']) for (const f of existsSync(`fixtures/${type}`) ? readdirSync(`fixtures/${type}`) : []) {
  const id = f.replace(/\.mmd$/, ''), A = type === 'flowchart' ? 'A1' : 'A2'
  if (id.includes('-reject-')) test(`${A}: ${id} falls back`, () => {
    for (const w of EDGE.has(id) ? [60] : W) assert.ok('reason' in X(src(id), w), `${id}@${w}`)
    if (EDGE.has(id)) assert.ok(!('reason' in X(src(id), 61)))
  })
  else test(`${A}: ${id} renders, validates and matches its golden at 60/80/120`, () => {
    const g = goldenOf(W.map(w => { const r = X(src(id), w); assert.ok(!('reason' in r), `${id}@${w} ${r.reason}`); return [w, r.drawing] as const }))
    const p = join('goldens', type, `${id}.golden`); if (process.env.UPDATE_GOLDEN === '1') writeFileSync(p, g); assert.equal(g, readFileSync(p, 'utf8'))
  })
}
for (const [id, step] of Object.entries(LADDER)) test(`A4.fit-ladder: ${id} first fits at ${step}`, () => {
  const r = X(src(id), 60); assert.equal(r.step, step); if (step === 'natural') assert.equal(widest(r.drawing), 60)
})
test('A3: shape fixtures draw each one-line label in exactly one row', () => {
  for (let i = 7; i <= 18; i++) { const id = `flowchart-ok-${String(i).padStart(2, '0')}`, d = X(src(id), 80).drawing
    for (const { owner } of d.expect.labels) assert.equal(d.cells.filter((row: any[]) => row.some(c => c?.kind === 'text' && c.owners.includes(owner))).length, 1, `${id} ${owner}`) }
})
test('A8.platforms: every drawn glyph in every golden is allow-listed', () => assert.deepEqual(goldenGlyphs('goldens'), []))
test('A1: weight glyphs in flowchart-ok-50…52', () => {
  for (const [id, re] of [['flowchart-ok-50', /[┏┓┗┛]/], ['flowchart-ok-51', /[╂┿]/], ['flowchart-ok-52', /┆/]] as const)
    assert.match(readFileSync(join('goldens', 'flowchart', `${id}.golden`), 'utf8'), re, id)
})
```
- [ ] **Run** `node --test tests/golden/golden_test.ts` → FAIL: `ENOENT …/goldens/flowchart/flowchart-ok-01.golden`.
- [ ] **Implement `golden-lib.ts`:**
  - **`goldenOf(runs)`:** for each width, `@<w>` and the text rows (`cont` → '', `null` → ' '), then `@<w> roles` and one role row per cell (§4 codes: uppercase for `text`, lowercase otherwise, `~` for `cont`). Rows are right-trimmed; the file ends in LF.
  - **`goldenGlyphs(dir)`:** walk `goldens/`, pair each text row with its role row by column (advancing by `width(ch)`), and return `file:line ch` for every lowercase-coded cell whose glyph is not in `GLYPHS`.
  - **`widest(d)`:** the widest trimmed row by `width`.
- [ ] **Fixtures** (each file starts with its header line; size the ladder fixtures with `node scripts/explain.ts FILE 60`):

| IDs | Content |
|---|---|
| ok-01…05, -06 | `flowchart TD`/`TB`/`BT`/`LR`/`RL`, then `graph TD`; each `A[Start] --> B[Next] --> C[End]` |
| ok-07…18 | `A⟨shape⟩ --> B[Next]`, one per matrix line 92; -15 is `A[/x/] --> B[\x\]`, -16 is `A[/x\] --> B[\x/]` |
| ok-19, -20 | `A@{ shape: cyl, label: "DB" } --> B`; `A@{ shape: no-such, label: "X" } --> B` |
| ok-21, -22 | `A["Hello, world: (1/2)!"] --> B`; `A[one<br/>two<br>three] --> B` |
| ok-23…29, -30, -31 | `A -->`, `-.->`, `==>`, `<-->`, `--o`, `--x`, `---` ` B`; `A -->\|yes\| B`; `A -- yes --> B` |
| ok-32, -33 | `A --> B --> C`; `A & B --> C & D` |
| ok-34…36 | nested `outer`/`inner` subgraphs with a crossing edge; `subgraph s1 [Titled]`; a sealed `subgraph s [Inner]` with `direction LR`, `X --> Y`, `end`, then `Start --> s` |
| ok-37, -38, -39, -48 | whole-line `%%` comments; frontmatter `title: My flow`; every T15 ignored directive around `A --> B`; `A:::hot --> B`, `accTitle: T`, `accDescr: D` |
| ok-40, -45, -46, -47 | `A[读取配置文件] -->\|成功\| B{完成?}`; `A[Same] --> B[Same]`; `A ~~~ B` and `A --> C`; `A e1@--> B`, then `e1@{ animate: true }` |
| ok-41…44 | -41: natural is exactly 60 wide. -42: a TD fan-out of 1 → 4, natural 61–70, tight fits. -43: an LR chain of 3 multi-word labels, tight > 60, wrap fits. -44: an LR chain of 6 one-word labels, wrap > 60, TD fits |
| ok-49…52 | `flowchart` (bare header) with `A --> B`; `A ==> B`, `A ==> C` (a thick bend: heavy segments, heavy corners); `A --> C`, `A ==> D`, `B --> C`, `B --> D` (thick crosses solid: `╂` or `┿`); `A -.-> B`, `A -.-> C` (a dashed bend with a light corner) |
| reject-01…05 | `A[open --> B`; `subgraph s` and `A` with no `end`; `A[👨‍👩‍👧] --> B`; an LR chain whose narrowest layout is 61; `flowchart-elk TD` and `A --> B` |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/golden_test.ts` writes the goldens. Read every golden (no tangle per §14 rules), then plain `node --test tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add flowchart fixtures, goldens and the golden glyph scan"`

### T21: Hook render path
**Group** P7 · **Deps** T8, T19 · **Covers** A5.errors, A6.hook-tests (incl. CRLF and whitespace-only prose between fences), A7 (all 7 roles under the default mapping and each curated palette), R6 (read-only props kept), `isExpanded` pass-through, D5 (a leading diagram keeps its bullet)
**Files:** create `hooks/mode.ts` (`passThrough`); replace `hooks/register.tsx`; modify `tests/hooks/loader.test.tsx` (register a `ui.render` hook beneath it, since D5's empty prose calls `next()`; expect `toContain('A')`; its `$.command.run` step moves to T22's command test). Tests: `tests/hooks/render.test.tsx`, `tests/hooks/mode_test.ts`.
- [ ] **Failing tests:**
```tsx
import { test, expect } from 'claude-code/testing'; import { THEMES } from '../../core/themes.ts'
const FC = '```mermaid\nflowchart TD\nA[读取] --> B[完成]\n```\n', BAD = '```mermaid\nflowchart TD\nA[👨‍👩]\n```\n'
const mount = ($: any, text: string, surface = 'terminal', extra: object = {}) => $.ui.mount({ plugin: 'mermaid-tty', surface, component: 'AssistantMessage',
  props: { text, isFirstOfReply: true, ...extra }, viewport: { columns: 80, rows: 40 } })
const capture = (on: any) => { const seen: string[] = [], logs: string[] = [], props: any[] = []
  on('ui.log', async (_$: any, e: any) => { logs.push(`${e.to}:${e.text}`); return { value: undefined } })
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => { seen.push(e.props.text); props.push(e.props); const { Text } = $.ui.resolve(e); return <Text>{e.props.text}</Text> })
  return { seen, logs, props } }
test('A6.hook-tests: prose reaches next() unchanged; diagrams render in order', async ($, on) => {
  const c = capture(on), ui = await mount($, `Intro\n${FC}Outro`)
  expect(c.seen).toEqual(['Intro\n', 'Outro']); expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
  c.seen.length = 0; const two = await mount($, FC + FC); expect(c.seen).toEqual(['']); expect(await two.find({ key: 'mermaid-1' })).toBeDefined()  // D5: empty prose
  c.seen.length = 0; await mount($, `P1\r\n\r\n${FC.replace(/\n/g, '\r\n')}\r\nP2`); expect(c.seen).toEqual(['P1\r\n\r\n', '\r\nP2'])
  c.seen.length = 0; await mount($, `${FC}\r\n\r\n${FC}`); expect(c.seen).toEqual(['', '\r\n\r\n'])  // whitespace-only prose between fences reaches next() unchanged
})
test('A6.hook-tests: read-only props pass through; a leading diagram keeps its bullet (D5)', async ($, on) => {
  const c = capture(on); await mount($, `Intro\n${FC}Outro`, 'terminal', { isSummary: true }); expect(c.props.map(p => p.isSummary)).toEqual([true, true])
  c.props.length = 0; await mount($, `${FC}Outro`); expect(c.props.map(p => [p.text, p.isFirstOfReply])).toEqual([['', true], ['Outro', false]])
})
test('A6.hook-tests: an unclosed fence and a non-terminal surface reach next(e) untouched', async ($, on) => {
  const c = capture(on), open = 'x\n```mermaid\nflowchart TD\nA'; await mount($, open); await mount($, `Intro\n${FC}`, 'desktop')
  expect(c.seen).toEqual([open, `Intro\n${FC}`])
})
test('A5.errors: a failed diagram draws the original fence; the reason goes only to the debug log', async ($, on) => {
  const c = capture(on), reply = `Intro\n${BAD}Outro`, ui = await mount($, reply)
  expect(c.seen).toEqual([reply]); expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(JSON.stringify(await ui.drawn()).includes('unsupported')).toBe(false); expect(c.logs).toEqual(['debug:mermaid-tty fallback: unsupported-char U+200D'])
})
const ROLES = 'flowchart TD\nA[读取] -->|yes| B{ok?}\nsubgraph F [Frame]\nC[x]\nend\n', SEQ = 'sequenceDiagram\nA->>B: hi\nNote over A: memo\n'
for (const theme of ['default', 'nord', 'dracula', 'gruvbox', 'solarized'] as const)
  test(`A7: all 7 roles draw in their ${theme} colors`, { options: { theme } }, async ($, on) => {
    capture(on); const ui = await mount($, '```mermaid\n' + ROLES + '```\n\n```mermaid\n' + SEQ + '```\n'), r = THEMES[theme].roles
    const s = (await ui.findAll({ type: 'Text' })).filter(x => x.props.color || x.props.backgroundColor), has = (re: RegExp, k: string, v: unknown) => s.some(x => re.test(x.text) && x.props[k] === v)
    expect([has(/读取/, 'backgroundColor', r.node), has(/ok\?/, 'backgroundColor', r.decision), has(/[│─┌┐└┘┼]/, 'color', r.edge),
      has(/[►◄▲▼]/, 'color', r.arrow), has(/yes/, 'color', r.label), has(/Frame/, 'color', r.frame), has(/memo/, 'color', r.note)]).toEqual([true, true, true, true, true, true, true])
  })
```
  - **`mode_test.ts`:** `test('A6.hook-tests: pass-through rules', …)` asserts `passThrough('desktop', {}, 'diagram')`, `passThrough('terminal', {}, 'source')` and `passThrough('terminal', { isExpanded: true }, 'diagram')` are true, and `passThrough('terminal', {}, 'diagram')` is false.
- [ ] **Run** `claude plugin test .` → FAIL: `expect(received).toEqual(expected)` (the T0 probe never calls `next`).
- [ ] **Implement** `passThrough = (s, p, m) => s !== 'terminal' || m === 'source' || (p as { isExpanded?: unknown }).isExpanded === true`, and:
```tsx
const renderer = createRenderer(64)
export const register: Register = (on, options) => {
  const theme = String(options.theme ?? 'default'), mode = async (_$: unknown): Promise<Mode> => 'diagram'   // T22 reads $.state
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const columns = e.viewport?.columns
    if (columns === undefined || passThrough(e.surface, e.props, await mode($))) return next(e)
    const parts: ({ prose: string } | { rows: Rows })[] = []
    for (const s of splitFences(e.props.text)) {
      const r = s.kind === 'mermaid' ? renderer.render(s.body, { columns, theme }, f => $.ui.log(`mermaid-tty fallback: ${f.reason}`, { to: 'debug' })) : null
      if (r && !('reason' in r)) parts.push({ rows: r })
      else { const last = parts[parts.length - 1]; if (last && 'prose' in last) last.prose += s.text; else parts.push({ prose: s.text }) }
    }
    if (!parts.some(p => 'rows' in p)) return next(e)
    const { Box, Text } = $.ui.resolve(e), kids = []; let first = e.props.isFirstOfReply, n = 0
    for (const p of parts) {
      if ('rows' in p && first) kids.push(await next({ ...e, props: { ...e.props, text: '', isFirstOfReply: true } }))  // D5: keep the bullet
      if ('rows' in p) kids.push(<Box key={`mermaid-${n++}`} flexDirection="column">{p.rows.map(row =>
        <Text wrap="truncate-end">{row.map(({ text, role: _r, ...style }) => <Text {...style}>{text}</Text>)}</Text>)}</Box>)
      else kids.push(await next({ ...e, props: { ...e.props, text: p.prose, isFirstOfReply: first } }))
      first = false
    }
    return <Box flexDirection="column">{kids}</Box>
  })
}
```
- [ ] **Done when:** `claude plugin test .` and `node --test tests/hooks/mode_test.ts` pass.
- [ ] **Commit:** `git commit -m "Draw diagrams in replies; prose and failures go through next()"`
