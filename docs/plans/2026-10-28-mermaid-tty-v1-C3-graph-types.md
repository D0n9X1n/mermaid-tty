# mermaid-tty v1 C — tasks T54–T62 (state, class, ER)

**Depends on:** the index (§4, §5), C1 (T40, T46, T48) and C2 (T49–T53). Each type has three tasks: parse, its module, and its fixtures with their goldens.
**Conventions:** as in C1. A parse test builds its input with `P(body)`, which puts the header in front, so the body's first line is source line 2. Parse failures carry the source line: `syntax:<n>`, `repeat:<n>`, `scope:<n>`.

### T54: State parse
**Group** G2 · **Deps** T49 · **Covers** matrix state subset, state-ok-01…16, -23…25 (the model), state-reject-01…10, spec C rules 1 and 8; parse fails for a floating note and for a description on a choice, fork or join (state-reject-07…10)
**Files:** create `core/diagrams/state/parse.ts` (`StateModel = { graph: Graph; title: string | null }`). Test: `tests/core/state-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseState } from '../../core/diagrams/state/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (body: string) => { const s = readSource(`stateDiagram-v2\n${body}`); return ('reason' in s ? s : parseState(s)) as any }
test('A5: states, descriptions, transitions, marks, a composite and a note make one graph', () => {
  const m = P(['[*] --> s1', 's1 : First state', 'state "Second" as s2', 's1 --> s2 : go', 's2 --> C', 'state C {', '  [*] --> c1', '  c1 --> [*]', '}',
    'state ch <<choice>>', 's2 --> ch', 'ch --> [*]', 'note left of s1 : remember'].join('\n')), g = m.graph
  assert.deepEqual(g.nodes.map((n: any) => [n.id, n.mark ?? n.rows[0].text]), [['start:root', 'start'], ['s1', 'First state'], ['s2', 'Second'],
    ['start:C', 'start'], ['c1', 'c1'], ['end:C', 'end'], ['ch', 'choice'], ['end:root', 'end']])
  assert.deepEqual(g.edges.map((e: any) => [e.from, e.to, e.label]), [['start:root', 's1', null], ['s1', 's2', 'go'], ['s2', 'C', null],
    ['start:C', 'c1', null], ['c1', 'end:C', null], ['s2', 'ch', null], ['ch', 'end:root', null]])
  assert.deepEqual(g.clusters, [{ id: 'C', title: 'C', dir: null, nodes: ['start:C', 'c1', 'end:C'], clusters: [] }])
  assert.deepEqual(g.nodes[1].note, { id: 's1:note', text: 'remember', side: 'left' }); assert.equal(g.nodes[1].shape, 'round')
})
test('A5: regions are frameless clusters chained in order; direction; a multi-line note; ignored lines', () => {
  const g = P(['direction LR', 'state A {', '  [*] --> a1', '  --', '  [*] --> a2', '}', 'state f <<fork>>', 'state j [[join]]', 'A --> f', 'f --> j',
    'note right of a1', '  line one', '  line two', 'end note', 'hide empty description', 'scale 350 width', 'classDef bad fill:#f00', 'click a1 href "x"'].join('\n')).graph
  assert.equal(g.dir, 'LR')
  assert.deepEqual(g.clusters.map((c: any) => [c.id, c.nodes, c.clusters, c.frameless ?? false]),
    [['A', [], ['A:r0', 'A:r1'], false], ['A:r0', ['start:A:r0', 'a1'], [], true], ['A:r1', ['start:A:r1', 'a2'], [], true]])
  assert.deepEqual(g.edges.filter((e: any) => e.style === 'invisible').map((e: any) => [e.from, e.to]), [['A:r0', 'A:r1']])
  assert.deepEqual(g.nodes.filter((n: any) => n.mark === 'bar').map((n: any) => [n.id, n.span]), [['f', 3], ['j', 3]])
  assert.equal(g.nodes.find((n: any) => n.id === 'a1').note.text, 'line one<br>line two')
})
test('A5.errors: unsupported, malformed and repeated statements fall back with their line', () => {
  for (const [body, why] of [['s1 --> s2\nstate s9', 'syntax:3'], ['state Two Words {\n}', 'syntax:2'], ['state A {\ns1 --> s2', 'syntax:2'],
    ['s1 : one\ns1 : two', 'repeat:3'], ['note left of s1 : a\nnote right of s1 : b', 'repeat:3'], ['state A {\nx --> y\n}\nstate B {\nx --> z\n}', 'scope:6'],
    ['note "floating" as N', 'syntax:2'], ['state c <<choice>>\nc : label', 'mark-label:3']] as const) assert.deepEqual(P(body), { reason: why }, body)
})
```
- [ ] **Run** `node --test tests/core/state-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/state/parse.ts`.
- [ ] **Implement:**
  - **Header:** `stateDiagram` or `stateDiagram-v2`. Ids match `[\p{L}\p{N}_-]+`.
  - **Two passes:** the first finds every composite (`state X {`, `state "d" as X {`), so an earlier `s2 --> C` ends on C's frame.
  - **States:** a round, `node`-role node, in order of first mention. Its rows are the description's `labelLines`, or else the id.
  - **Marks:** `[*]` is `start:<scope>` on the left of `-->` and `end:<scope>` on the right; a scope is `root`, a composite, or a region. `<<choice>>`/`[[choice]]` is `{ mark: 'choice', role: 'decision' }`. Fork and join are `{ mark: 'bar' }` with `span = max(3, 2·max(in, out) − 1)`, counted after all edges.
  - **Transitions:** edge `t<k>`: solid, no tail, an arrow head, the label or null, `minlen` 1.
  - **Composites and regions:**
    - A composite is a cluster titled with its description or id, with its own `direction`.
    - `--` splits a body into frameless clusters `X:r<k>`, chained by invisible edges `X:chain<k>`.
    - Each region has its own `[*]`, as in Mermaid. Id uniqueness is per composite body (the matrix's scope).
  - **Notes:** a one-line note, or lines up to `end note`, sets `note = { id: '<id>:note', text: lines joined by '<br>', side }`.
  - **Ignored:** `hide empty description`, `scale N width`, `classDef`, `class`, `style`, `click`, `accTitle`, `accDescr` and `:::name`.
  - **Fails:**
    - `syntax:<n>` for a bare `state X`, a floating note, a multi-word id, or an unclosed `{` (at its line);
    - `repeat:<n>` for a second description or note;
    - `scope:<n>` for an id reused in another scope;
    - `mark-label:<n>` for a description on a mark;
    - `unsupported-char U+XXXX` from `unsupported()`.
  - **Title:** the model's `title` is `src.title`, and `graph.title` is null.
- [ ] **Done when:** `node --test tests/core/state-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse state diagrams into the graph model"`

### T55: State module
**Group** G5 · **Deps** T40, T53, T54 · **Covers** matrix state text design and ladder, state-ok-05…22 drawing, A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/state/layout.ts` (same export, `state`, so `all.ts` needs no edit). Test: `tests/core/state-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { state } from '../../core/diagrams/state/layout.ts'
import { parseState } from '../../core/diagrams/state/parse.ts'; import { readSource, type Source } from '../../core/source.ts'; import { text } from './graph-fixture.ts'
const X = (body: string, columns = 80) => explain(`stateDiagram-v2\n${body}`, { columns, theme: 'mono' }) as any
const count = (t: string, g: string) => [...t].filter(c => c === g).length
test('A3: states are round pills; each scope draws one ● and one ◉; a composite is a titled frame', () => {
  const r = X(['[*] --> Still', 'Still --> Moving', 'Moving --> [*]', 'state Moving {', '  [*] --> Fast', '  Fast --> [*]', '}'].join('\n')), t = text(r.drawing).join('\n')
  assert.equal(r.step, 'natural'); assert.match(t, /\( Still \)/); assert.match(t, /┌─Moving─*┐/)
  assert.deepEqual([count(t, '●'), count(t, '◉')], [2, 2])
})
test('A3: a choice is ◇; fork and join bars are ━ in TB and ┃ in LR', () => {
  const fj = (dir: string) => text(X([`direction ${dir}`, 'state f <<fork>>', 'state j <<join>>', '[*] --> f', 'f --> a', 'f --> b', 'a --> j', 'b --> j', 'j --> [*]'].join('\n')).drawing).join('\n')
  assert.match(fj('TB'), /━━━/); assert.match(fj('LR'), /┃/); assert.doesNotMatch(fj('LR'), /━/)
  assert.match(text(X('state c <<choice>>\n[*] --> c\nc --> a : yes\nc --> b : no').drawing).join('\n'), /◇/)
})
test('A4.fit-ladder: the state ladder; notes too wide for their slot become keys a, b with a legend', () => {
  assert.deepEqual(state.steps(parseState(readSource('stateDiagram-v2\ndirection LR\nA --> B') as Source) as never), ['natural', 'tight', 'wrap', 'lrToTd', 'keyed'])
  const W = 'Supercalifragilisticexpialidocious', r = X(`A --> B\nnote left of A : ${W}\nnote right of B : ${W}`, 40)
  assert.equal(r.step, 'keyed'); assert.deepEqual(text(r.drawing).slice(-2), [`a ${W}`, `b ${W}`])
})
```
- [ ] **Run** `node --test tests/core/state-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')`, since the stub's parse fails `unimplemented:state`.
- [ ] **Implement:**
  - **The module:** `parse = parseState`; `steps = m => graphSteps(m.graph.dir, true)`; `layout = (m, step, cols) => drawAt(o => build(m, o), m.graph.dir, step, cols, m.title)`.
  - **`build(m, { dir, keyed })`:** the graph with `dir`.
    - Keyed: each note, in source order, gets `fieldKey(k)` as its text. Its legend row is `{ key, keyInk: 'note', item: '<note id>', cls: 'note', parts: [{ text: its lines joined by ' ', ink: 'note', owner: '<note id>' }] }`. The note's `key` draws in place, or, for a note `withNotes` turns into a node, as that node's key row (T51); `keyable` lists every note (T87).
    - Unkeyed: notes as written; `legend: []`. Notes wrap at `wrapAt` in layered (T51).
  - **Roles** (matrix): states `node`; `●`, `◉` and bars `node`; `◇` `decision`; composites `frame`; transition labels `label`, on their own rank (A's layout); notes `note`.
- [ ] **Done when:** `node --test tests/core/state-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Lay out state diagrams on the graph ladder"`

### T56: State fixtures and goldens
**Group** G6 · **Deps** T48, T55 · **Covers** every state-ok and state-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/state/state-{ok-01…25,reject-01…06}.mmd` and `goldens/state/*.golden`. Test: `tests/golden/state_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { coverageOf, fx, spanOf } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/state').map(f => f.replace('.mmd', ''))
test('A5: every state coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'state', ids), []))
test('A4: state-ok-05 shares one ● and one ◉ among its [*]', () => {
  const t = [...text((explain(fx('state-ok-05'), { columns: 80, theme: 'mono' }) as any).drawing).join('')]
  assert.deepEqual([t.filter(c => c === '●').length, t.filter(c => c === '◉').length], [1, 1])
})
test('A7: states, choices, notes and frames carry their nord roles', () => {
  const n = THEMES.nord.roles, R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(R('state-ok-03'), /Second/)?.backgroundColor, n.node); assert.equal(spanOf(R('state-ok-08'), /◇/)?.color, n.decision)
  assert.equal(spanOf(R('state-ok-12'), /remember/)?.color, n.note); assert.equal(spanOf(R('state-ok-06'), /┌─Moving/)?.color, n.frame)
})
```
- [ ] **Run** `node --test tests/golden/state_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/state'`.
- [ ] **Fixtures** (each body follows `stateDiagram-v2` unless noted; docs examples are copied from `stateDiagram.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | frontmatter `title: Simple sample`, then the docs "Simple sample" (`[*] --> Still`, `Still --> [*]`, `Still --> Moving`, `Moving --> Still`, `Moving --> Crash`, `Crash --> [*]`); -02 is the same body under `stateDiagram`, with no title |
| ok-03, -04 | `s1` (a bare line), `s2 : Second`, `state "Third state" as s3`, `s1 --> s2`, `s2 --> s3`; `[*] --> s1`, `s1 --> s2 : A transition`, `s2 --> [*] : done` |
| ok-05, -06 | `[*] --> a`, `[*] --> b`, `a --> [*]`, `b --> [*]`; `[*] --> Still`, `Still --> Moving`, `state Moving {`, `[*] --> Slow`, `Slow --> Fast`, `Fast --> [*]`, `}`, `Moving --> [*]` |
| ok-07 | `[*] --> First`, `state "First level" as First {`, `[*] --> Second`, `state Second {`, `[*] --> Third`, `state Third {`, `[*] --> third`, `third --> [*]`, then `}` three times |
| ok-08 | the docs choice example: `state if_state <<choice>>`, `[*] --> IsPositive`, `IsPositive --> if_state`, `if_state --> False : if n < 0`, `if_state --> True : if n >= 0` |
| ok-09, -10, -11 | the docs fork example (`fork_state`, `State2`, `State3`, `join_state`, `State4`); -10 is the same with `direction LR` first; -11 is `state c [[choice]]`, `state f [[fork]]`, `state j [[join]]`, `[*] --> c`, `c --> f : go`, `c --> [*] : stop`, `f --> a`, `f --> b`, `a --> j`, `b --> j`, `j --> [*]` |
| ok-12, -13 | `[*] --> s1`, `s1 --> s2`, `note left of s1 : remember`, `note right of s2 : check`; `s1 --> s2`, `note right of s2`, `first line`, `second line`, `end note` |
| ok-14, -15 | the docs concurrency example (`Active` with NumLock, CapsLock and ScrollLock regions split by `--`); `direction LR`, `[*] --> A`, `A --> B`, `state B {`, `direction LR`, `[*] --> b1`, `b1 --> b2`, `}` |
| ok-16, -17 | `%% a comment`, `hide empty description`, `scale 350 width`, `[*] --> s1`, `s1 --> [*]`; `[*] --> 待机`, `待机 --> 运行 : 启动`, `运行 --> [*]`, `note right of 运行 : 中文备注` |
| ok-18 | `%% expect 61 natural`, `%% expect 60 natural widest 60`, `%% expect 59 tight`, then an LR chain whose natural layout is exactly 60 wide |
| ok-19, -20 | `%% expect 60 tight` and an LR chain whose natural width is 61–70; `%% expect 60 wrap` and a TB fan-out from `[*]` to 3 states with two-word descriptions, tight > 60 |
| ok-21, -22 | `%% expect 60 lrToTd` and an LR chain of 6 one-word states of 8+ letters; `%% expect 60 keyed`, `A --> B`, `note left of A : ` + a one-word 56-letter note (64 cells in place; the legend row is 58) |
| ok-23, -24, -25 | `[*] --> a`, `a : Same`, `b : Same`, `a --> b`; ok-04's body plus `classDef bad fill:#f00` and `class s1 bad`; ok-04's body plus `click s1 href "https://example.com"` |
| reject-01…03 | `[*] --> s1`, `s1 --> [*]`, `state s9`; `state Two Words {`, `a --> b`, `}`; `state A {`, `a --> b` with no `}` |
| reject-04…06 | `s1 : one`, `s1 : two`; `s1 --> s2`, `note left of s1 : a`, `note right of s1 : b`; `state A {`, `x --> y`, `}`, `state B {`, `x --> z`, `}` |
| reject-07…10 | valid prefix, then: `note "memo" as N1`; `state c <<choice>>`, `c : pick`; `state f <<fork>>`, `f : split`; `state j <<join>>`, `j : merge` |

Size ok-18…22 with `node scripts/explain.ts FILE 60`. The reject fixtures carry no expect lines, so they fall back at 60, 80 and 120.
- [ ] **Done when:**
  - `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/state/`.
  - Each golden at 60/80/120 has been read against the tangle rules and the matrix text design.
  - `node --test tests/golden/c-golden_test.ts tests/golden/state_test.ts tests/golden/golden_test.ts` passes. The last runs A's glyph scan over every golden, C's included.
- [ ] **Commit:** `git commit -m "Add state fixtures and goldens"`

### T57: Class parse
**Group** G3 · **Deps** T52 · **Covers** matrix class subset, class-ok-01…23 and -29…31 (the model), class-reject-01…09, spec C rules 1 and 8; parse fails for a nested namespace and a generic with a comma (class-reject-08, -09)
**Files:** create `core/diagrams/class/parse.ts`.
- **Model:** `ClassModel = { dir, title, classes: { id, label, annot, members: Member[], order }[], relations: { id, from, to, tail, head, line: 'solid' | 'dotted', label, tailLabel, headLabel, order }[], notes: { id, for, text, order }[], namespaces: { id, label, classes, notes }[] }`.
- **Test:** `tests/core/class-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseClass } from '../../core/diagrams/class/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (body: string) => { const s = readSource(`classDiagram\n${body}`); return ('reason' in s ? s : parseClass(s)) as any }
test('A5: classes, labels, generics, annotations and members, as Mermaid shows them', () => {
  const m = P(['class Animal', 'class Square~Shape~', '<<interface>> Shape', 'class Duck["Mallard"] {', '  <<service>>', '  +String beakColor', '  +quack(int x) bool$', '}',
    'Duck : -List~List~int~~ eggs', 'Duck : +swim()*', 'class `A b`'].join('\n'))
  assert.deepEqual(m.classes.map((c: any) => [c.id, c.label, c.annot]), [['Animal', 'Animal', null], ['Square', 'Square<Shape>', null],
    ['Shape', 'Shape', 'interface'], ['Duck', 'Mallard', 'service'], ['A b', 'A b', null]])
  assert.deepEqual(m.classes[3].members, [{ text: '+String beakColor', method: false }, { text: '+quack(int x) : bool$', method: true },
    { text: '-List<List<int>> eggs', method: false }, { text: '+swim()*', method: true }])
})
test('A5: relations, cardinality, notes, a namespace and direction', () => {
  const m = P(['Animal <|-- Duck', 'Duck *-- Egg', 'Lake o-- Duck', 'Duck --> Food : eats', 'Duck ..|> Swimmer', 'A "1" --> "*" B : has', 'A <|--|> B', 'A .. B',
    'note "General"', 'note for Duck "can fly\\nand swim"', 'namespace Pond["Water"] {', '  class Frog', '  note for Frog "ribbit"', '}', 'direction RL'].join('\n'))
  assert.deepEqual(m.relations.map((r: any) => [r.from, r.to, r.tail, r.head, r.line, r.label, r.tailLabel, r.headLabel]), [
    ['Animal', 'Duck', 'triangle', 'none', 'solid', null, null, null], ['Duck', 'Egg', 'diamond', 'none', 'solid', null, null, null],
    ['Lake', 'Duck', 'odiamond', 'none', 'solid', null, null, null], ['Duck', 'Food', 'none', 'arrow', 'solid', 'eats', null, null],
    ['Duck', 'Swimmer', 'none', 'triangle', 'dotted', null, null, null], ['A', 'B', 'none', 'arrow', 'solid', 'has', '1', '*'],
    ['A', 'B', 'triangle', 'triangle', 'solid', null, null, null], ['A', 'B', 'none', 'none', 'dotted', null, null, null]])
  assert.deepEqual(m.notes.map((n: any) => [n.id, n.for, n.text]), [['note0', null, 'General'], ['note1', 'Duck', 'can fly<br>and swim'], ['note2', 'Frog', 'ribbit']])
  assert.deepEqual(m.namespaces, [{ id: 'Pond', label: 'Water', classes: ['Frog'], notes: ['note2'] }]); assert.equal(m.dir, 'RL')
})
test('A5: style, classDef, cssClass, :::name, click, link and callback are parsed and ignored', () =>
  assert.deepEqual(P('class A\nstyle A fill:#f9f\nclassDef hot fill:#f00\ncssClass "A" hot\nclass A:::hot\nclick A href "x"\nlink A "x"\ncallback A "cb"')
    .classes.map((c: any) => c.id), ['A']))
test('A5.errors: unsupported, malformed and repeated statements fall back with their line', () => {
  for (const [body, why] of [['class A\nA --() bar', 'syntax:3'], ['class X\nnamespace A.B {\nclass C\n}', 'syntax:3'], ['class A\nA', 'syntax:3'],
    ['class A {\n+x', 'syntax:2'], ['<<interface>> A\n<<service>> A', 'repeat:3'], ['class A["x"]\nclass A["y"]', 'repeat:3'],
    ['class Box~int~\nclass Box~str~', 'repeat:3']] as const) assert.deepEqual(P(body), { reason: why }, body)
})
```
- [ ] **Run** `node --test tests/core/class-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/class/parse.ts`.
- [ ] **Implement:**
  - **Header:** `classDiagram` or `classDiagram-v2`. Ids are `[\p{L}\p{N}_-]+`, or a backtick name.
  - **Classes:**
    - `class X`, `class X["l"]`, `` class `X y` ``, `class X~T~` and `class X <<a>>`; `{ … }` holds members and `<<a>>` lines. `<<a>> X` annotates.
    - A class is created at first mention, a relation included.
  - **Members:**
    - A line inside `{ }`, or `X : member`.
    - It is a method when it has `(…)`. A method's text is `vis name(params) : ret`, with the return type after `)` and `$`/`*` kept last.
    - `~T~` becomes `<T>`, nesting included; a generic containing `,` fails `syntax`.
  - **Relations:** `X ["c"] <l><line><r> ["c"] Y [: label]`.
    - The left end `<|`, `*`, `o` or `<` gives `tail` triangle, diamond, odiamond or arrow; the right end `|>`, `*`, `o` or `>` gives the same for `head`.
    - `--` is solid and `..` dotted.
    - The cardinality strings become `tailLabel` and `headLabel`.
  - **Notes:** `note "t"` and `note for X "t"`, ids `note<k>`; `\n` and `<br>` become `<br>`.
  - **Namespaces:** `namespace N { … }` and `namespace N["l"] { … }` hold classes and notes.
  - **Ignored:** `direction` (it sets `dir`), `style`, `classDef`, `cssClass`, `:::name`, `click`, `link`, `callback`, `accTitle` and `accDescr`.
  - **Fails:**
    - `syntax:<n>` for a lollipop `()`, a nested or dotted namespace, a bare `X` line, or an unclosed `{` (at its line);
    - `repeat:<n>` for a second annotation, another label, or another generic.
- [ ] **Done when:** `node --test tests/core/class-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse class diagrams"`

### T58: Class module
**Group** G5 · **Deps** T40, T53, T57 · **Covers** matrix class text design and ladder, class-ok-01…28 drawing, A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/class/layout.ts` (export `classDiagram`). Test: `tests/core/class-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'; import { validate } from '../../core/validate.ts'
const X = (body: string, columns = 80) => explain(`classDiagram\n${body}`, { columns, theme: 'mono' }) as any
test('A3: a class pill shows «annot», its name, then attributes before methods, with no divider row', () => {
  const t = text(X('class Duck {\n  <<service>>\n  +swim()\n  +String beakColor\n}').drawing), at = (s: string) => t.findIndex(l => l.includes(s))
  assert.deepEqual([at('«service»') + 1, at(' Duck ') + 1, at('+String beakColor') + 1], [at(' Duck '), at('+String beakColor'), at('+swim()')])
  assert.ok(t.slice(at('«service»'), at('+swim()') + 1).every(l => /\[.*\]/.test(l)))
  const duck = X('class Duck {\n  <<service>>\n  +String beakColor\n  +swim()\n}').drawing   // an annotated class with members validates
  assert.equal(validate(duck), null); assert.deepEqual(duck.expect.members.map((m: any) => m.id), ['Duck.annot', 'Duck.m0', 'Duck.m1'])
})
test('A3: ends face their class: △ inheritance, ◆ composition, ◇ aggregation, ▽ a dashed realization', () => {
  const t = text(X('Animal <|-- Duck\nDuck *-- Egg\nLake o-- Duck\nDuck ..|> Swimmer').drawing).join('\n')
  for (const g of ['△', '◆', '◇', '▽', '┆']) assert.ok(t.includes(g), g)
})
test('A4.fit-ladder: at keyed, relation labels and notes share one key sequence, in source order', () => {
  const W = 'Supercalifragilisticexpialidocious', r = X(`direction LR\nA --> B : uses\nnote for B "${W}"`, 40)
  assert.equal(r.step, 'keyed'); assert.deepEqual(text(r.drawing).slice(-2), ['a uses', `b ${W}`])
  assert.ok(r.drawing.cells.flat().some((c: any) => c?.kind === 'key' && c.ch === 'b' && c.owners[0] === 'note0' && !c.legend))   // the class note node draws its key (B4)
})
```
- [ ] **Run** `node --test tests/core/class-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **The module:** `parse = parseClass`; `steps = m => graphSteps(m.dir, true)`; `layout = (m, step, cols) => drawAt(o => build(m, o), m.dir, step, cols, m.title)`.
  - **`build`:**
    - **Classes:** each is a `rect` node in the `node` role. Its rows are a centered `«annot»` row (owner `${id}.annot`) when it has one, then the centered label, then `classRows(id, members, wrapAt)`; a Fail passes through.
    - **Notes:** each is a `plain` node in the `note` role, id `note<k>`, with left-aligned `note` rows. A `note for X` note adds the edge `{ id: '<note>:link', from: note, to: X, style: 'dotted', tail: 'none', head: 'none', label: null, minlen: 1 }`.
    - **Relations:** each is an edge `r<k>` with its style, ends, label, `tailLabel` and `headLabel` (role `label`), `minlen` 1.
    - **Namespaces:** each is a cluster titled with its label.
    - **Keyed:** relation labels and notes, in source order, take `fieldKey(k)`. Their legend rows' items are `r<k>:label` (`cls: 'label'`) and `note<k>` (`cls: 'note'`), in the `label` and `note` inks, each owned by its item. A label sets `labelKey`, and a note node's rows become one `key: true` row holding its key (T51), and `keyable` lists every label and note, so each class is keyed all or none (T87).
  - **Color:** member rows are in the `label` role and are not filled (T50), so in a color theme only the header rows are.
- [ ] **Done when:** `node --test tests/core/class-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Lay out class diagrams on the graph ladder"`

### T59: Class fixtures and goldens
**Group** G6 · **Deps** T48, T58 · **Covers** every class-ok and class-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/class/class-{ok-01…31,reject-01…07}.mmd` and `goldens/class/*.golden`. Test: `tests/golden/class_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { coverageOf, fx, spanOf } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/class').map(f => f.replace('.mmd', ''))
test('A5: every class coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'class', ids), []))
test('A4: class-ok-04 lists attributes before methods, each in source order', () => {
  const t = text((explain(fx('class-ok-04'), { columns: 80, theme: 'mono' }) as any).drawing), at = (s: string) => t.findIndex(l => l.includes(s))
  const i = ['+String name', '+int age', '+run()', '+eat()'].map(at); assert.ok(i.every(k => k >= 0), i.join())   // each found, then in order
  assert.deepEqual(i, [...i].sort((a, b) => a - b)); assert.equal(new Set(i).size, 4)
})
test('A7: headers fill with the node role; members, cardinality and notes carry their roles', () => {
  const n = THEMES.nord.roles, R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(R('class-ok-04'), /^ *Person *$/)?.backgroundColor, n.node); assert.equal(spanOf(R('class-ok-04'), /\+int age/)?.color, n.label)
  assert.equal(spanOf(R('class-ok-19'), /1\.\.\*/)?.color, n.label); assert.equal(spanOf(R('class-ok-20'), /General note/)?.color, n.note)
})
```
- [ ] **Run** `node --test tests/golden/class_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/class'`.
- [ ] **Fixtures** (each body follows `classDiagram` unless noted; docs examples are copied from `classDiagram.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | frontmatter `title: Animal example`, then the docs "Animal example": its two notes, its three `<\|--` relations and the members of Animal, Duck, Fish and Zebra. -02 is the same body under `classDiagram-v2`, with no title |
| ok-03, -04 | `class A`, `class B["Bank Account"]`, `` class `Animal Class!` ``, `C --> D`; `class Person {`, `+run()`, `+String name`, `}`, `Person : +eat()`, `Person : +int age` |
| ok-05, -06 | `class Account {`, `+String owner`, `-int balance`, `#bool frozen`, `~int id`, `+deposit(int amount) bool`, `+count() int$`, `+validate()*`, `}`; `class Square~Shape~ {`, `-List~List~int~~ position`, `+setPoints(List~int~ points)`, `}` |
| ok-07 | `class Shape <<interface>>`, `<<service>> Bank`, `class Duck {`, `<<entity>>`, `+swim()`, `}` |
| ok-08…15 | one relation each: `A <\|-- B`, `A *-- B`, `A o-- B`, `A --> B`, `A -- B`, `A ..> B`, `A ..\|> B`, `A .. B` |
| ok-16, -17, -18 | `A --\|> B`, `C --* D`, `E --o F`; `A <\|--\|> B`; `A --> B : uses`, `C ..> D : depends` |
| ok-19, -20 | `Customer "1" --> Ticket`, `Student "1" --> "1..*" Course`; `class Duck`, `class Fish`, `note "General note"`, `note for Duck "can fly<br>can swim"`, `note for Fish "can dive\nand eat"` |
| ok-21 | `namespace Shapes {`, `class Triangle`, `note for Triangle "three sides"`, `}`, `namespace Base["Base types"] {`, `class Shape`, `note "abstract"`, `}` |
| ok-22, -23 | `direction RL`, `%% comment`, `A --> B`, `%% another`, `B --> C`; `class 用户 {`, `+String 名字`, `+登录()`, `}`, `用户 --> 订单 : 下单` |
| ok-24 | `%% expect 61 natural`, `%% expect 60 natural widest 60`, `%% expect 59 tight`, then an LR chain whose natural layout is exactly 60 wide |
| ok-25, -26 | `%% expect 60 tight` and an LR chain whose natural width is 61–70; `%% expect 60 wrap`, `class Order {`, `+addItem(String name, int count, bool flag, String note) void`, `}` (a 67-cell pill) |
| ok-27, -28 | `%% expect 60 lrToTd` and an LR chain of 6 classes of 8+ letters; `%% expect 60 keyed`, then `A --> B : ` and `A --> C : `, each followed by a one-word 30-letter label (two label nodes on one rank need 68 cells) |
| ok-29, -30, -31 | `class A["Same"]`, `class B["Same"]`, `A --> B`; ok-12's body plus `click A href "https://example.com"`, `link B "https://example.com"`, `callback A "cb"`; ok-12's body plus `style A fill:#f9f`, `classDef hot fill:#f00`, `cssClass "A" hot`, `class B:::hot` |
| reject-01…04 | `class A`, `A --() bar`; `class X`, `namespace A.B {`, `class C`, `}`; `class A`, `A`; `class A {`, `+x` with no `}` |
| reject-05…07 | `<<interface>> A`, `<<service>> A`; `class A["x"]`, `class A["y"]`; `class Box~int~`, `class Box~str~` |
| reject-08, -09 | valid prefix, then: `namespace A {`, `namespace B {`, `class C`, `}`, `}`; `class Box~K,V~` |

Size ok-24…28 with `node scripts/explain.ts FILE 60`.
- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/class/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/class_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add class fixtures and goldens"`

### T60: ER parse
**Group** G3 · **Deps** T52 · **Covers** matrix ER subset, er-ok-01…17 and -23, -24 (the model), er-reject-01…13, spec C rules 1 and 8; parse fails for `~…~` and backtick attribute words, Markdown in aliases and relation labels, and backtick names (er-reject-09…13)
**Files:** create `core/diagrams/er/parse.ts`.
- **Model:** `ErModel = { dir, title, entities: { id, label, attrs: Attr[], order }[], relations: { id, from, to, left, right, line, label, order }[], subgraphs: { id, title, dir, entities, subgraphs }[], keyable: { owner, text }[] }`.
- `keyable` lists the non-empty comments (owner `<entity>.a<k>.comment`) and relation labels (owner `r<k>:label`), in source order.
- **Test:** `tests/core/er-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseEr } from '../../core/diagrams/er/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (body: string) => { const s = readSource(`erDiagram\n${body}`); return ('reason' in s ? s : parseEr(s)) as any }
test('A5: entities, aliases, attribute blocks, cardinalities, word forms and labels', () => {
  const m = P(['CUSTOMER ||--o{ ORDER : places', 'p[Person] {', '  string name PK "the name"', '  int age', '}', 'a["Customer Account"]', 'p {', '  string id UK, FK', '}',
    'ORDER }|..|{ LINE-ITEM : "is in"', 'p |o--|| a : ""', 'p 1 to zero or more ORDER : owns', 'a many(0) optionally to 0+ ORDER : may', '"NAMED DRIVER"'].join('\n'))
  assert.deepEqual(m.entities.map((e: any) => [e.id, e.label]), [['CUSTOMER', 'CUSTOMER'], ['ORDER', 'ORDER'], ['p', 'Person'], ['a', 'Customer Account'],
    ['LINE-ITEM', 'LINE-ITEM'], ['NAMED DRIVER', 'NAMED DRIVER']])
  assert.deepEqual(m.entities[2].attrs, [{ type: 'string', name: 'name', keys: 'PK', comment: 'the name' }, { type: 'int', name: 'age', keys: '', comment: '' },
    { type: 'string', name: 'id', keys: 'UK, FK', comment: '' }])
  assert.deepEqual(m.relations.map((r: any) => [r.from, r.to, r.left, r.right, r.line, r.label]), [['CUSTOMER', 'ORDER', '1', '0..*', 'solid', 'places'],
    ['ORDER', 'LINE-ITEM', '1..*', '1..*', 'dotted', 'is in'], ['p', 'a', '0..1', '1', 'solid', ''], ['p', 'ORDER', '1', '0..*', 'solid', 'owns'],
    ['a', 'ORDER', '0..*', '0..*', 'dotted', 'may']])
})
test('A5: subgraphs nest, take a direction and a title, and can be relation ends', () => {
  const m = P(['subgraph outer [Sales domain]', '  direction LR', '  CUSTOMER ||--o{ ORDER : places', '  subgraph inner', '    INVOICE', '  end', 'end', 'outer ||--|| BILLING : bills'].join('\n'))
  assert.deepEqual(m.subgraphs, [{ id: 'outer', title: 'Sales domain', dir: 'LR', entities: ['CUSTOMER', 'ORDER'], subgraphs: ['inner'] },
    { id: 'inner', title: null, dir: null, entities: ['INVOICE'], subgraphs: [] }])
  assert.deepEqual([m.relations.at(-1).from, m.relations.at(-1).to], ['outer', 'BILLING'])
})
test('A5.errors: unsupported, malformed and repeated statements fall back with their line', () => {
  for (const [body, why] of [['A ||--|| B : x\nA u--|| B : x', 'syntax:3'], ['A ||--|| B : x\n"This **is** _Markdown_"', 'markdown:3'], ['A ||--o{ B', 'syntax:2'],
    ['CAR {\nstring id', 'syntax:2'], ['p[Person]\np[Human]', 'repeat:3'], ['subgraph s1\nCAR\nend\nsubgraph s2\nCAR\nend', 'repeat:6'],
    ['Sales\nsubgraph Sales\nX\nend', 'repeat:3']] as const) assert.deepEqual(P(body), { reason: why }, body)
  assert.deepEqual(P('A ||--o{ B : x %% note'), { reason: 'directive' })
})
```
- [ ] **Run** `node --test tests/core/er-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/er/parse.ts`.
- [ ] **Implement:**
  - **Header:** `erDiagram`. Names are `[\p{L}\p{N}_-]+` or `"…"`, with an optional alias `e[A]` or `e["A"]` and an optional `{ … }` block.
  - **Blocks:** a second block for an entity appends to it.
  - **Attributes:** one per line, `type name [PK|FK|UK[, …]] ["comment"]`.
    - The type may end in `?` and may hold `(…)` or `[]`.
    - The name may start with `*`.
    - Keys print joined by `, `.
  - **Relations:** `A <left><line><right> B : label`.
    - The label is a word, `"words"` or `""`; with no `:` the line fails `syntax`.
    - The line is solid for `--` and `to`; dotted for `..`, `.-`, `-.` and `optionally to`.
    - The ends print as in the matrix table: `0..1`, `1`, `0..*`, `1..*`, word forms included.
  - **Subgraphs:** `subgraph id`, `"id"` or `id [title]`, up to `end`. They nest and take `direction`. A relation may name a subgraph id after its `end`.
  - **Ignored:** `style`, `classDef`, `class`, `:::name`, `click`, `accTitle` and `accDescr`.
  - **Fails:**
    - `syntax:<n>` for the `u` marker, a `~…~` or backtick attribute word, a missing label, or an unclosed block (at its line);
    - `markdown:<n>` for `*`, a backtick, or `_` at either end of a word in a name, alias or label;
    - `repeat:<n>` for a second alias, an entity in two subgraphs, or an id used for both an entity and a subgraph.
- [ ] **Done when:** `node --test tests/core/er-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse ER diagrams"`

### T61: ER module
**Group** G5 · **Deps** T40, T53, T60 · **Covers** matrix ER text design and ladder, er-ok-01…22 drawing, A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/er/layout.ts` (export `er`). Test: `tests/core/er-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (body: string, columns = 80) => explain(`erDiagram\n${body}`, { columns, theme: 'mono' }) as any
const ends = (d: any) => { const L = new Map(d.expect.labels.map((l: any) => [l.owner, l.text])); return ['r0:tail', 'r0:head', 'r1:tail', 'r1:head'].map(o => L.get(o)) }
test('A3: an entity pill with aligned attribute rows; cardinality at each end; a dashed non-identifying line', () => {
  const r = X(['CAR ||--o{ DRIVER : "is driven by"', 'CAR {', '  string registrationNumber PK "the plate"', '  int seats', '}', 'DRIVER |o..|| LICENSE : may'].join('\n'))
  const t = text(r.drawing), reg = t.find(l => l.includes('registrationNumber'))!, seats = t.find(l => l.includes('seats'))!
  assert.match(reg, /string registrationNumber PK the plate/); assert.equal(reg.indexOf('registrationNumber'), seats.indexOf('seats'))
  assert.deepEqual(r.drawing.expect.members.filter((m: any) => m.id.startsWith('CAR.a1.')).map((m: any) => m.id), ['CAR.a1.type', 'CAR.a1.name'])   // seats has no key or comment cell, so none is listed (B2)
  assert.deepEqual(ends(r.drawing), ['1', '0..*', '0..1', '1']); assert.match(t.join('\n'), /┆/); assert.match(t.join('\n'), /is driven by/)
})
test('A4.fit-ladder: at keyed, comments and relation labels share one key sequence; cardinality is never keyed', () => {
  const W = 'Supercalifragilisticexpialidocious', r = X(`direction LR\nCAR {\n  string id PK "${W}"\n}\nCAR ||--o{ DRIVER : owns`, 40)
  assert.equal(r.step, 'keyed'); assert.deepEqual(text(r.drawing).slice(-2), [`a ${W}`, 'b owns']); assert.deepEqual(ends(r.drawing).slice(0, 2), ['1', '0..*'])
})
```
- [ ] **Run** `node --test tests/core/er-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'expect')` (the stub).
- [ ] **Implement:**
  - **The module:** `parse = parseEr`; `steps = m => graphSteps(m.dir, true)`; `layout = (m, step, cols) => drawAt(o => build(m, o), m.dir, step, cols, m.title)`.
  - **`build`:**
    - **Entities:** each is a `rect` node in the `node` role. Its rows are the centered label, then `erRows(id, attrs, wrapAt)`.
    - **Relations:** each is an edge `r<k>`, solid or dotted, with tail and head `none`, label `''` → null, `tailLabel = left`, `headLabel = right` and `endRole: 'arrow'` (the matrix: cardinality replaces the crow's foot).
    - **Subgraphs:** each is a cluster `{ id, title: title ?? id, dir, nodes: entities, clusters: subgraphs }`.
  - **Keyed:** each `keyable` item, in order, gets `fieldKey(k)` in place: the comment column's text, or the edge label. Its legend row's item is `<owner>` itself (`cls` `comment` or `label`), in the `note` ink for a comment and the `label` ink for a label. The column sets `key` and the label `labelKey` (T51); `keyable` lists them all (T87). A keyed comment's in-place key is owned by `[<column id>, <entity>]`, a listed member; its legend key and text by `[<column id>]` alone, which T86 and T87 accept (B3). Cardinality is never keyed.
- [ ] **Done when:** `node --test tests/core/er-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Lay out ER diagrams on the graph ladder"`

### T62: ER fixtures and goldens
**Group** G6 · **Deps** T48, T61 · **Covers** every er-ok and er-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/er/er-{ok-01…24,reject-01…08}.mmd` and `goldens/er/*.golden`. Test: `tests/golden/er_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/er').map(f => f.replace('.mmd', ''))
test('A5: every er coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'er', ids), []))
test('A4: er-ok-06…09 print each cardinality pair at its two ends', () => {
  for (const [id, pair] of [['er-ok-06', ['0..1', '0..1']], ['er-ok-07', ['1', '1']], ['er-ok-08', ['0..*', '0..*']], ['er-ok-09', ['1..*', '1..*']]] as const) {
    const L = new Map((explain(fx(id), { columns: 80, theme: 'mono' }) as any).drawing.expect.labels.map((l: any) => [l.owner, l.text]))
    assert.deepEqual([L.get('r0:tail'), L.get('r0:head')], pair, id)
  }
})
test('A7: entity headers fill with the node role; comments carry note; cardinality carries arrow', () => {
  const n = THEMES.nord.roles, r = renderMermaid(fx('er-ok-04'), { columns: 80, theme: 'nord' })!
  assert.equal(spanOf(r, /^ *CAR *$/)?.backgroundColor, n.node); assert.equal(spanOf(r, /the plate/)?.color, n.note)
  assert.equal(spanOf(r, /^0\.\.\*$/)?.color, n.arrow)
})
```
- [ ] **Run** `node --test tests/golden/er_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/er'`.
- [ ] **Fixtures** (each body follows `erDiagram`; docs examples are copied from `entityRelationshipDiagram.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | frontmatter `title: Orders`, then the docs CUSTOMER/ORDER/LINE-ITEM example; `CAR`, `"Plate Number"`, `数据表` (no relations) |
| ok-03, -04 | `p[Person]`, `a["Customer Account"]`, `p \|\|--o{ a : owns`; `CAR \|\|--o{ DRIVER : has`, `CAR {`, `string registrationNumber PK "the plate"`, `string ownerId PK, FK`, `string vin UK`, `string? make`, `string(99) model`, `string[] tags`, `int *id`, `}` |
| ok-05 | `CAR {`, `string id`, `}`, `CAR {`, `int seats`, `}`, `ROAD {`, `}`, `CAR }o--\|\| ROAD : drives` |
| ok-06…09 | `A \|o--o\| B : x`; `A \|\|--\|\| B : x`; `A }o--o{ B : x`; `A }\|--\|{ B : x` |
| ok-10 | `A 1 to zero or more B : a`, `C many(0) optionally to 0+ D : b`, `E only one to one or many F : c` |
| ok-11, -12 | `A \|\|--o{ B : solid`, `C \|\|..o{ D : dots`, `E \|\|.-o{ F : mixed`, `G \|\|-.o{ H : mixed2`; `A \|\|--o{ B : word`, `C \|\|--o{ D : "quoted words"`, `E \|\|--o{ F : ""` |
| ok-13, -14 | `direction LR`, `A \|\|--o{ B : x`, `B \|\|--\|\| C : y`; `subgraph sales`, `ORDER`, `end`, `subgraph "Customer Domain"`, `CUSTOMER`, `end`, `subgraph billing [Billing team]`, `subgraph inner`, `INVOICE`, `end`, `end` |
| ok-15 | `subgraph billing [Billing]`, `direction LR`, `INVOICE \|\|--o{ LINE : has`, `end`, `CUSTOMER \|\|--o{ billing : pays`, `billing \|\|--\|\| LEDGER : posts` (billing stays sealed) |
| ok-16, -17 | `%% comment`, `A \|\|--o{ B : x`, `%% another`, `B \|\|--\|\| C : y`; `客户 \|\|--o{ 订单 : 下单`, `订单 {`, `string 编号 PK "唯一编号"`, `}` |
| ok-18 | `%% expect 61 natural`, `%% expect 60 natural widest 60`, `%% expect 59 tight`, then an LR chain whose natural layout is exactly 60 wide |
| ok-19, -20 | `%% expect 60 tight` and an LR chain whose natural width is 61–70; `%% expect 60 wrap`, `ORDER {`, `string id PK "a comment of several words that is longer than the row allows"`, `}` |
| ok-21, -22 | `%% expect 60 lrToTd` and an LR chain of 6 entities of 8+ letters; `%% expect 60 keyed`, then `A \|\|--o{ B : ` and `A \|\|--o{ C : `, each with a one-word 30-letter label |
| ok-23, -24 | `p[Same]`, `q[Same]`, `p \|\|--o{ q : x`; ok-01's body plus `style CUSTOMER fill:#f9f` |
| reject-01…04 | `A \|\|--\|\| B : x`, `A u--\|\| B : x`; `A \|\|--\|\| B : x`, `"This **is** _Markdown_"`; `A \|\|--o{ B : x %% note`; `A \|\|--o{ B` |
| reject-05…08 | `CAR {`, `string id` with no `}`; `p[Person]`, `p[Human]`; `subgraph s1`, `CAR`, `end`, `subgraph s2`, `CAR`, `end`; `Sales`, `subgraph Sales`, `X`, `end` |
| reject-09…13 | valid prefix, then: `CAR {`, `List~string~ tags`, `}`; `CAR {`, `` string `id` ``, `}`; `p["**Person**"]`; `A \|\|--o{ B : "_owns_"`; `` `CAR` `` |

Size ok-18…22 with `node scripts/explain.ts FILE 60`.
- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/er/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/er_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add ER fixtures and goldens"`
