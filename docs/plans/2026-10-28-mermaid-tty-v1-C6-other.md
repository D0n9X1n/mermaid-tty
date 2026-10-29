# mermaid-tty v1 C — tasks T76–T85 (mindmap, gitGraph, timeline, the visual gate)

**Depends on:** the index (§4, §5), C1 (T40, T41, T45, T48), and A's T30–T32 for the visual gate. Conventions are as in C4. These three types draw rows directly on one canvas per part. Their connectors and glyphs are `cap` cells (index §5), so the edge and tangle checks pass over them.

### T76: Mindmap parse
**Group** G2 · **Deps** T41 · **Covers** matrix mindmap subset (one root, nesting, seven shapes, quoted text, `<br>`, `colorBy`, `:::class`), mindmap-reject-01…05
**Files:** create `core/diagrams/mindmap/parse.ts`.
- **Model:** `Mindmap = { title, colorBy: 'branch' | 'depth', root: MNode }` and `MNode = { k: number, shape: Shape, lines: string[], children: MNode[] }`, where `k` is the source index, used for owners.
- **Test:** `tests/core/mindmap-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseMindmap } from '../../core/diagrams/mindmap/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseMindmap(s)) as any }
const flat = (n: any, d = 0): any[] => [[d, n.shape, n.lines.join('|')], ...n.children.flatMap((c: any) => flat(c, d + 1))]
test('A5: one root; nesting by indentation; every shape; ids optional; quoted text; <br> lines', () => {
  const m = P(['mindmap', 'root((Center))', '  sq[Square]', '    r(Rounded)', '  b))Bang((', '  c)Cloud(', '  h{{Hex}}', '  [No id]', '  q["quoted (text)"]', '  plain', '  two<br/>lines'].join('\n'))
  assert.deepEqual(flat(m.root), [[0, 'circle', 'Center'], [1, 'rect', 'Square'], [2, 'round', 'Rounded'], [1, 'bang', 'Bang'], [1, 'cloud', 'Cloud'],
    [1, 'hexagon', 'Hex'], [1, 'rect', 'No id'], [1, 'rect', 'quoted (text)'], [1, 'plain', 'plain'], [1, 'plain', 'two|lines']])
})
test('A5: a parent is the nearest earlier node with less indentation; colorBy; :::class ignored; frontmatter title', () => {
  const m = P(['---', 'title: Ideas', 'config:', '  mindmap:', '    colorBy: depth', '---', 'mindmap', 'Root', '      A', '   B', '     C', '  D', ':::urgent'].join('\n'))
  assert.deepEqual(flat(m.root).map(([d, , t]) => [d, t]), [[0, 'Root'], [1, 'A'], [1, 'B'], [2, 'C'], [1, 'D']])
  assert.deepEqual([m.title, m.colorBy], ['Ideas', 'depth'])
})
test('A5.errors: an icon, a second root, mismatched delimiters, a markdown string and a header alone fall back', () => {
  for (const [src, why] of [['mindmap\nRoot\n  A\n  ::icon(fa fa-book)', 'syntax:4'], ['mindmap\nRoot\nOther', 'root:3'], ['mindmap\nRoot\n  id[Square)', 'syntax:3'],
    ['mindmap\nRoot\n  "`**bold**`"', 'markdown:3'], ['mindmap', 'empty']] as const) assert.deepEqual(P(src), { reason: why }, src)
})
```
- [ ] **Run** `node --test tests/core/mindmap-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/mindmap/parse.ts`.
- [ ] **Implement:**
  - **Header:** `mindmap` alone; any text after it fails `header` (common rule 2).
  - **Nesting:**
    - A node's indent is its count of leading spaces and tabs. The first node is the root.
    - A later node whose indent is not more than the root's fails `root:<n>`.
    - A node's parent is the nearest earlier node with a smaller indent.
  - **Shapes:**
    - `id[t]` rect, `id(t)` round, `id((t))` circle, `id))t((` bang, `id)t(` cloud, `id{{t}}` hexagon. Each may drop its id; bare text is `plain`.
    - Openers are tried longest first. A closer that does not pair with its opener fails `syntax:<n>`.
  - **Text:**
    - `"…"` keeps punctuation; `` "`…`" `` fails `markdown:<n>`.
    - `<br>`, `<br/>` and `<br />` break lines (`labelLines`); any other HTML fails `syntax:<n>`. The text also goes through `unsupported()`.
  - **Annotations:** `::icon(…)` fails `syntax:<n>`. A `:::name` suffix or line is ignored.
  - **Config:** `colorBy` is `'depth'` when `src.config['mindmap.colorBy'] === 'depth'`, else `'branch'`. `title` is `src.title`.
- [ ] **Done when:** `node --test tests/core/mindmap-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse mindmaps"`

### T77: Mindmap module
**Group** G3 · **Deps** T40, T45, T76 · **Covers** matrix mindmap text design (root leftmost, `─┬─`/`├─`/`└─` on a `│` trunk, caps, branch colors) and ladder; A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/mindmap/layout.ts` (export `mindmap`). Test: `tests/core/mindmap-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (body: string, columns: number) => explain(`mindmap\n${body}`, { columns, theme: 'mono' }) as any
test("A3: the root is leftmost; the first child shares its parent's row; the rest hang off a │ trunk", () =>
  assert.deepEqual(text(X('Root\n  A\n    B\n    C', 80).drawing), [' Root ─── A ─┬─ B', ' '.repeat(13) + '└─ C']))
test('A3: each shape shows its own caps; a <br> label takes one row per line', () => {
  const t = text(X('root((C))\n  a[S]\n  b(R)\n  c))B((\n  d)L(\n  e{{H}}\n  f<br/>g', 80).drawing), i = t.findIndex(l => l.endsWith(' f'))
  for (const p of ['(( C ))', '[ S ]', '( R )', ')) B ((', ') L (', '{{ H }}']) assert.ok(t.join('\n').includes(p), p)
  assert.ok(t[i + 1]!.endsWith(' g'))
})
test('A4.fit-ladder: narrowing takes natural, compact, wrapped labels, the outline, then fallback, in that order', () => {
  const T = 'Root\n  Bigger node\n    Leaf\n  A\n    Long leaf name', seq = Array.from({ length: 55 }, (_, i) => X(T, 60 - i).step ?? 'fallback')
  assert.deepEqual(seq.filter((s, i) => s !== seq[i - 1]), ['natural', 'compact', 'wrap', 'outline', 'fallback'])
  assert.deepEqual(text(X(T, 23).drawing), [' Root', '├─ Bigger node', '│  └─ Leaf', '└─ A', '   └─ Long leaf name'])
})
```
- [ ] **Run** `node --test tests/core/mindmap-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Steps:** `['natural', 'compact', 'wrap', 'outline']`.
  - **Rows:**
    - A node takes one row per label line. A subtree takes the larger of its own rows and the sum of its children's subtrees.
    - Children stack in source order, the first on its parent's first row.
  - **Connectors** (caps, owned by `m<k>:link` for the edge into node k):
    - one child: `───`;
    - several: `─┬─` to the first, then `├─`/`└─` on a `│` trunk under the `┬`.
  - **The tree steps:**
    - `natural`: each depth is one column, as wide as its widest pill; connectors stretch with `─` to the next column.
    - `compact`: each child group starts right after its parent's pill.
    - `wrap`: compact, with labels wrapped at 24, 20, 16, 12 and 8; the first width that validates wins.
  - **`outline`:**
    - The root, then each node on its own row, prefixed by `│  ` or `   ` per ancestor below the root, then `├─` or `└─`. A continuation line takes `│ ` or two blanks in place of `├─`/`└─`.
    - It tries unwrapped first, then 24…8.
  - **Width:** a word wider than its field, or a row wider than `cols`, fails `too-wide`.
  - **Pills:** `CAPS[shape]` with a pad cell each side. The text is owned by `m<k>`, and so are the caps and the fill.
  - **Colors:**
    - The root takes the `node` role, filled in color themes.
    - Under `colorBy: 'branch'`, each top-level branch takes the next series color, `s1`, `s2`, …, for its pills and connectors. Under `'depth'`, depth d takes `s<((d − 1) mod 8) + 1>`.
    - A connector takes its child's ink.
  - **Title:** `heading(title)` is stacked above.
- [ ] **Done when:** `node --test tests/core/mindmap-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw mindmaps as trees, with a compact form and an outline"`

### T78: Mindmap fixtures and goldens
**Group** G4 · **Deps** T48, T77 · **Covers** every mindmap-ok and mindmap-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/mindmap/mindmap-{ok-01…14,reject-01…06}.mmd` and `goldens/mindmap/*.golden`. Test: `tests/golden/mindmap_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/mindmap').map(f => f.replace('.mmd', ''))
const ink = (id: string, s: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!.flat().find(x => x.text.includes(s))
test('A5: every mindmap coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'mindmap', ids), []))
test('A7: the root fills with the node role; a top-level branch colors its subtree; colorBy: depth colors by depth', () => {
  const n = THEMES.nord
  assert.equal(ink('mindmap-ok-01', 'Root')?.backgroundColor, n.roles.node)
  assert.deepEqual([ink('mindmap-ok-01', 'A')?.color, ink('mindmap-ok-01', 'B')?.color], [n.series.s1, n.series.s1])
  assert.deepEqual([ink('mindmap-ok-13', 'A')?.color, ink('mindmap-ok-13', 'B')?.color], [n.series.s1, n.series.s2])
})
```
- [ ] **Run** `node --test tests/golden/mindmap_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/mindmap'`.
- [ ] **Fixtures** (each body follows `mindmap`; docs examples are copied from `mindmap.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | the docs basic example (`Root`, `A` under it, `B` and `C` under `A`); `root((Center))`, `  sq[Square]`, `  r(Rounded)`, `  c((Circle))`, `  b))Bang((`, `  cl)Cloud(`, `  h{{Hex}}`, `  Plain` (all seven shapes) |
| ok-03, -04 | `Root`, `  [No id]`, `  (Round no id)`, `  q["text with (brackets)"]`; `Root`, `  Parent<br/>two lines`, `    Child one`, `    Child two` |
| ok-05, -06 | the docs "unclear indentation" example; frontmatter `title: Plans`, then `mindmap`, `%% a comment`, a blank line, `Root`, `  A` |
| ok-07, -08 | `Root`, `  Same`, `  Same`; `根`, `  分支一`, `    叶子`, `  分支二` |
| ok-09 | `%% expect 60 natural widest 60`, `%% expect 59 compact`, then a tree whose natural layout is exactly 60 wide and whose compact layout is narrower |
| ok-10…12 | `%% expect 60 compact`, `%% expect 60 wrap`, `%% expect 60 outline`: trees sized so that each step is the first to fit at 60 |
| ok-13, -14 | frontmatter `config:` / `mindmap:` / `colorBy: depth`, then ok-01's body; ok-01's body plus a `:::urgent` line after `B` |
| reject-01…03 | `Root`, `  A`, `  ::icon(fa fa-book)`; `Root`, `Other` (a second root); `Root`, `  id[Square)` |
| reject-04…06 | `Root`, then a child `` "`**bold**`" `` (a markdown string); `mindmap` alone; `%% expect 60 fallback`, `%% expect 80 natural`, a one-word 61-letter root |

Size ok-09…12 with `node scripts/explain.ts FILE 60`.
- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/mindmap/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/mindmap_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add mindmap fixtures and goldens"`

### T79: gitGraph parse
**Group** G2 · **Deps** T41 · **Covers** matrix gitGraph subset (headers, commit, branch, checkout/switch, merge, cherry-pick, order, `mainBranchName`/`Order`) and Mermaid's db errors; gitGraph-reject-01…06
**Files:** create `core/diagrams/gitGraph/parse.ts`.
- **Model:** `GitGraph = { dir: 'LR' | 'TB' | 'BT', title, branches: { name, order }[], events: { kind: 'start' | 'commit' | 'merge' | 'pick', branch, from?, id, msg, tags, type, line }[] }`.
- For a pick, `id` is the source commit's id.
- **Test:** `tests/core/gitGraph-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseGitGraph } from '../../core/diagrams/gitGraph/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseGitGraph(s)) as any }
test('A5: commits, tags, types, branch order, checkout and switch, merge and cherry-pick; attributes in any order', () => {
  const g = P(['gitGraph', 'commit id: "a" tag: "v1" tag: "v1.1"', 'branch dev order: 2', 'commit type: HIGHLIGHT', 'commit "b" id: "b" type: REVERSE', 'checkout main',
    'merge dev tag: "rel" id: "m"', 'branch "feature/x.y"', 'switch feature/x.y', 'commit msg: "bare"', 'cherry-pick id: "b"'].join('\n'))
  assert.deepEqual(g.branches, [{ name: 'main', order: 0 }, { name: 'dev', order: 2 }, { name: 'feature/x.y', order: 0 }])
  assert.deepEqual(g.events.map((e: any) => [e.kind, e.branch, e.id, e.msg, e.tags, e.type]), [['start', 'main', null, null, [], null],
    ['commit', 'main', 'a', null, ['v1', 'v1.1'], 'NORMAL'], ['start', 'dev', null, null, [], null], ['commit', 'dev', null, null, [], 'HIGHLIGHT'],
    ['commit', 'dev', 'b', 'b', [], 'REVERSE'], ['merge', 'main', 'm', null, ['rel'], 'NORMAL'], ['start', 'feature/x.y', null, null, [], null],
    ['commit', 'feature/x.y', null, 'bare', [], 'NORMAL'], ['pick', 'feature/x.y', 'b', null, ['cherry-pick:b'], null]])
})
test('A5: headers gitGraph, gitGraph:, LR:, TB:, BT:; mainBranchName and mainBranchOrder from frontmatter config', () => {
  assert.deepEqual(['gitGraph', 'gitGraph:', 'gitGraph LR:', 'gitGraph TB:', 'gitGraph BT:'].map(h => P(`${h}\ncommit`).dir), ['LR', 'LR', 'LR', 'TB', 'BT'])
  const g = P('---\nconfig:\n  gitGraph:\n    mainBranchName: trunk\n    mainBranchOrder: 2\n---\ngitGraph\ncommit')
  assert.deepEqual([g.branches, g.events[1].branch], [[{ name: 'trunk', order: 2 }], 'trunk'])
})
test('A5.errors: what Mermaid throws on falls back, and so do repeated ids and attributes and an unknown type', () => {
  for (const [body, why] of [['commit\ncheckout nope', 'checkout:3'], ['commit\nbranch develop\ncheckout main\nmerge develop', 'merge:5'],
    ['branch develop\nbranch develop', 'branch:3'], ['commit id: "Boston"\ncommit id: "Boston"', 'repeat:3'], ['commit id: "a" id: "b"', 'repeat:2'],
    ['commit type: BOLD', 'syntax:2'], ['commit\nbranch b\ncommit\ncheckout main\nmerge b id: "m"\nbranch c\ncommit\ncherry-pick id: "m"', 'pick:9']] as const)
    assert.deepEqual(P(`gitGraph\n${body}`), { reason: why }, body)
})
```
- [ ] **Run** `node --test tests/core/gitGraph-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/gitGraph/parse.ts`.
- [ ] **Implement:**
  - **Header:** `^gitGraph(:| (LR|TB|BT):)?$`; a bare header is LR.
  - **Statements:**
    - `commit [id: "x"] [msg: "m" | "m"] [tag: "t"]… [type: NORMAL|REVERSE|HIGHLIGHT]`;
    - `branch <name> [order: N]`; `checkout <name>` and `switch <name>`;
    - `merge <name> [id] [tag]… [type]`; `cherry-pick id: "x" [parent: "p"] [tag]…`;
    - `title`.
    - A name is `\w([-./\w]*[-\w])?` or `"…"`. Attributes go in any order. A repeated attribute other than `tag:` fails `repeat:<n>`; an unknown type or statement fails `syntax:<n>`.
  - **State, as Mermaid's db:**
    - main exists from the start, named `config['gitGraph.mainBranchName'] ?? 'main'`, with order `Number(config['gitGraph.mainBranchOrder'] ?? 0)`.
    - Each branch has a head, null at first. main's `start` event comes first.
  - **Branches:** `branch` fails `branch:<n>` when the branch exists. Otherwise it starts at the current head, is checked out and emits `start`. `checkout`/`switch` of an unknown branch fails `checkout:<n>`.
  - **Merges:** `merge` fails `merge:<n>` for itself, an unknown branch, a branch with no commits, the same head as the current branch, or a current branch with no commits.
  - **Ids:** a reused commit or merge id fails `repeat:<n>`.
  - **Cherry-picks:** `cherry-pick` fails `pick:<n>` for:
    - an unknown id;
    - a source on the current branch;
    - a current branch with no commits;
    - a merge source without a `parent:` that is one of its parents.
    - With no tag, the pick is tagged `cherry-pick:<id>`, plus `|parent:<p>` for a merge, as Mermaid does.
  - **Other:** a second title fails `repeat:<n>`. `accTitle` and `accDescr` are ignored.
- [ ] **Done when:** `node --test tests/core/gitGraph-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse gitGraphs with Mermaid's branch and merge rules"`

### T80: gitGraph module
**Group** G3 · **Deps** T40, T45, T79 · **Covers** matrix gitGraph text design (lanes, forks, merges, `┼` crossings, the label column, `BT`) and ladder; A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/gitGraph/layout.ts` (export `gitGraph`). Test: `tests/core/gitGraph-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (body: string, columns = 80, h = 'gitGraph') => explain(`${h}\n${body}`, { columns, theme: 'mono' }) as any
const LOG = 'commit id: "a"\nbranch dev\ncommit id: "b"\ncheckout main\nmerge dev id: "m"'
test('A3: one row per event; lanes 2 cells apart; main opens with ╷; a fork ├─╮; a merge ◉─┤; one label column; BT flips', () => {
  assert.deepEqual(text(X(LOG).drawing), ['╷   main', '●   a', '├─╮ dev', '│ ● b', '◉─┤ m'])
  assert.deepEqual(text(X(LOG, 80, 'gitGraph BT:').drawing), ['◉─┤ m', '│ ● b', '├─╯ dev', '●   a', '╵   main'])
})
test('A3: a connector that crosses a lane draws ┼', () => {
  const t = text(X('commit\nbranch a\ncommit\ncheckout main\nbranch b\ncommit\ncheckout main\nmerge b').drawing).join('\n')
  assert.match(t, /├─┼─╮ b/); assert.match(t, /◉─┼─┤/)
})
test('A4.fit-ladder: labels wrap at the label column; too many lanes fall back', () => {
  const long = `commit msg: "${'word '.repeat(12).trim()}"`
  assert.deepEqual([X(long, 80).step, X(long, 40).step], ['natural', 'wrap'])
  assert.ok('reason' in X(Array.from({ length: 30 }, (_, i) => `branch b${i}\ncommit\ncheckout main`).join('\n'), 60))
})
```
- [ ] **Run** `node --test tests/core/gitGraph-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Steps:** `['natural', 'wrap']`.
  - **Lanes:** branches stably sorted by `order` (main takes `mainBranchOrder`). Lane i sits at column 2i, and the label column at `2·lanes`.
  - **Rows:** one row per event, top to bottom. `BT` reverses the rows and flips each glyph vertically (`╷`↔`╵`, `╮`↔`╯`, `╭`↔`╰`).
  - **Lane cells** are caps owned by `lane:<name>`, in the lane's ink:
    - main, and any branch whose parent head is empty, opens with `╷`;
    - a branch forks `├─╮` (to the right) or `╭─┤` (to the left) from its parent's head lane, on its start row;
    - a lane runs `│` from its start row to the last row.
  - **Events:**
    - commit `●`, REVERSE `⊗`, HIGHLIGHT `■`; cherry-pick `◎`;
    - merge `◉` (or its `type:` glyph), joined to the merged lane by `─┤` or `├─`, in the merged lane's ink;
    - a connector cell over another lane is `┼`.
  - **Labels**, at the label column:
    - the branch name on its start row, in the lane's ink (owner `b:<name>`);
    - on a commit, `id: msg` (or whichever exists; label role, owner `e<i>`), then each tag as `[t]` (note role, owner `e<i>.t<j>`);
    - on a merge, its id and tags; on a pick, its tags.
  - **`wrap`:** labels wrap to `cols − 2·lanes`. A word wider than that, or a lane wider than `cols`, fails `too-wide`.
  - **Inks:** lane k, in creation order, takes `s<(k mod 8) + 1>`.
  - **Title:** `heading(title)`.
- [ ] **Done when:** `node --test tests/core/gitGraph-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw gitGraphs as lanes with forks, merges and crossings"`

### T81: gitGraph fixtures and goldens
**Group** G4 · **Deps** T48, T80 · **Covers** every gitGraph-ok and gitGraph-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/gitGraph/gitGraph-{ok-01…11,reject-01…07}.mmd` and `goldens/gitGraph/*.golden`. Test: `tests/golden/gitGraph_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/gitGraph').map(f => f.replace('.mmd', ''))
test('A5: every gitGraph coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'gitGraph', ids), []))
test('A7: each lane takes a series color for its glyphs and name; tags take the note role', () => {
  const n = THEMES.nord, R = (id: string) => renderMermaid(fx(id), { columns: 80, theme: 'nord' })!
  assert.deepEqual([spanOf(R('gitGraph-ok-02'), /^main$/)?.color, spanOf(R('gitGraph-ok-02'), /^develop$/)?.color], [n.series.s1, n.series.s2])
  assert.equal(spanOf(R('gitGraph-ok-01'), /^\[v1\.0\.0\]$/)?.color, n.roles.note)
})
```
- [ ] **Run** `node --test tests/golden/gitGraph_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/gitGraph'`.
- [ ] **Fixtures** (each body follows `gitGraph` unless a header is given; docs examples are copied from `gitgraph.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01 | the docs tags example: `commit`, `commit id: "Normal" tag: "v1.0.0"`, `commit`, `commit id: "Reverse" type: REVERSE tag: "RC_1"`, `commit`, `commit id: "Highlight" type: HIGHLIGHT tag: "8.8.4"`, `commit` |
| ok-02 | the docs branch example (`commit`, `commit`, `branch develop`, `checkout develop`, `commit`, `commit`, `checkout main`, `merge develop`, `commit`, `commit`), with `checkout main` written `switch main` |
| ok-03 | `commit`, `branch a`, `commit`, `checkout main`, `branch b`, `commit`, `checkout main`, `merge b id: "m" tag: "rc" type: HIGHLIGHT` (the merge crosses lane a) |
| ok-04 | adapted from the docs' two cherry-pick examples: `commit id: "ZERO"`, `branch develop`, `commit id: "A"`, `checkout main`, `commit id: "ONE"`, `checkout develop`, `commit id: "B"`, `branch release`, `commit id: "R"`, `checkout main`, `merge develop id: "MERGE"`, `checkout release`, `cherry-pick id: "ONE"`, `cherry-pick id: "MERGE" parent: "B"` |
| ok-05 | adapted from the docs `order:` example: frontmatter `config:` / `gitGraph:` / `mainBranchName: trunk` / `mainBranchOrder: 2`, then `gitGraph`, `commit`, `branch test1 order: 3`, `commit`, `checkout trunk`, `branch test2 order: 1`, `commit`, `checkout trunk`, `commit` (lanes test2, trunk, test1) |
| ok-06 | `gitGraph BT:`, `commit`, `branch dev`, `commit`, `checkout main`, `merge dev`. This fixture draws `BT:`, the header that changes the drawing; T79 pins `gitGraph:`, `LR:` and `TB:` |
| ok-07 | `title Release log`, `%% a comment`, `commit msg: "init"`, `branch "hotfix"`, `commit "fix typo"`, `checkout main`, `branch feature/x.y`, `commit`, `checkout main`, `merge feature/x.y` |
| ok-08, -09 | `branch dev` before main's first commit, `commit`, `checkout main`, `commit`, `merge dev` (no fork, as main's head was empty); `commit id: "初始"`, `branch "功能"`, `commit id: "新功能" tag: "版本1"`, `checkout main`, `merge "功能"` |
| ok-10, -11 | `%% expect 60 natural widest 60`, `%% expect 59 wrap`, `commit msg: "…"` with a 58-cell message of several words (2 + 58 = 60); ok-02's body plus `accTitle: Log` |
| reject-01…04 | `commit`, `checkout nope`; `commit`, `branch develop`, `checkout main`, `merge develop`; `branch develop`, `branch develop`; the docs MetroLine example (commit id `Boston` twice) |
| reject-05…07 | `commit`, `branch b`, `commit`, `checkout main`, `merge b id: "m"`, `branch c`, `commit`, `cherry-pick id: "m"`; `commit type: BOLD`; `%% expect 60 fallback`, `%% expect 80 natural`, then 30 × (`branch b<i>`, `commit`, `checkout main`): 31 lanes put the label column at 62 |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/gitGraph/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/gitGraph_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add gitGraph fixtures and goldens"`

### T82: Timeline parse
**Group** G2 · **Deps** T41 · **Covers** matrix timeline subset (headers, `title`, `section`, periods, `: ` splitting, continuation lines, `<br>`, `disableMulticolor`); timeline-reject-01…06
**Files:** create `core/diagrams/timeline/parse.ts`.
- **Model:** `Timeline = { dir: 'LR' | 'TD', title, multicolor: boolean, sections: { name: string | null, periods: { text, events: string[] }[] }[] }`.
- **Test:** `tests/core/timeline-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseTimeline } from '../../core/diagrams/timeline/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseTimeline(s)) as any }
const shape = (t: any) => t.sections.map((s: any) => [s.name, s.periods.map((p: any) => [p.text, p.events])])
test('A5: ": " splits a period from its events and "10:30" does not; continuation lines; sections; <br> kept', () => {
  const t = P(['timeline', 'title History', 'section Early<br>days', '2002 : LinkedIn', '2004 : Facebook : Google', '     : Meeting at 10:30', 'section Later', '2005', '2006 : YouTube'].join('\n'))
  assert.deepEqual([t.dir, t.title, t.multicolor], ['LR', 'History', true])
  assert.deepEqual(shape(t), [['Early<br>days', [['2002', ['LinkedIn']], ['2004', ['Facebook', 'Google', 'Meeting at 10:30']]]], ['Later', [['2005', []], ['2006', ['YouTube']]]]])
})
test('A5: no sections; TD; disableMulticolor from frontmatter config; repeated period text', () => {
  const t = P('---\nconfig:\n  timeline:\n    disableMulticolor: true\n---\ntimeline TD\n2002 : LinkedIn\n2002 : again')
  assert.deepEqual([t.dir, t.multicolor, shape(t)], ['TD', false, [[null, [['2002', ['LinkedIn']], ['2002', ['again']]]]]])
})
test('A5.errors: an event before any period, a period before the first section, a repeated section, ":" with no space, # and a second title fall back', () => {
  for (const [body, why] of [[': lonely', 'syntax:2'], ['2001 : a\nsection A\n2002 : b', 'section:2'], ['section A\n2001 : a\nsection A\n2002 : b', 'repeat:4'],
    ['2002 :LinkedIn', 'syntax:2'], ['C# 1.0 : released', 'syntax:2'], ['title A\ntitle B\n2002 : x', 'repeat:3']] as const)
    assert.deepEqual(P(`timeline\n${body}`), { reason: why }, body)
})
```
- [ ] **Run** `node --test tests/core/timeline-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/timeline/parse.ts`.
- [ ] **Implement:**
  - **Header:** `^timeline( (LR|TD))?$`; a bare header is LR (index §5.8).
  - **Statements:**
    - `title <text>`;
    - `section <text>`, with no `:`;
    - a period line, `<period>[ : <event>]…`, split at `: ` (a colon and then a space), every part trimmed, so `10:30` never splits;
    - a line that starts with `:`, which adds its events to the last period.
  - **Fails:**
    - `syntax:<n>` for an event line before any period, a period containing `:`, any `#` (Mermaid's lexer starts a comment there), or HTML other than `<br>`;
    - `section:<n>` for a period before the first `section`, when a section follows (Mermaid drops it), at that period's line;
    - `repeat:<n>` for a repeated section name, or a second title from a statement or the frontmatter.
  - **Without sections**, all periods sit in one section whose name is null.
  - **Text:** `<br>` is kept in the text; the layout splits it with `labelLines`. Everything goes through `unsupported()`.
  - **Config:** `multicolor = src.config['timeline.disableMulticolor'] !== 'true'`. `accTitle` and `accDescr` are ignored.
- [ ] **Done when:** `node --test tests/core/timeline-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse timelines"`

### T83: Timeline module
**Group** G3 · **Deps** T40, T45, T82 · **Covers** matrix timeline text design (LR columns, the axis, TD) and ladder (gap 2, gap 1, wrapped labels, TD); A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/timeline/layout.ts` (export `timeline`). Test: `tests/core/timeline-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (src: string, columns = 80) => explain(src, { columns, theme: 'mono' }) as any
const SOCIAL = 'timeline\n2002 : LinkedIn\n2004 : Facebook : Google'
test('A3: LR: one column per period: its pill, an axis with ● at each column, then its events in source order', () => {
  const r = X(SOCIAL); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [' 2002' + ' '.repeat(8) + '2004', '●' + '─'.repeat(11) + '●' + '─'.repeat(9), ' LinkedIn    Facebook', ' '.repeat(13) + 'Google'])
})
test('A3: TD: a left axis: ● and the period on one row, then │ and its indented events', () =>
  assert.deepEqual(text(X(SOCIAL.replace('timeline', 'timeline TD')).drawing), ['● 2002', '│   LinkedIn', '● 2004', '│   Facebook', '│   Google']))
test('A4.fit-ladder: gap 2, then gap 1; a word wider than every capped column skips wrap, so TD; then fallback', () =>
  assert.deepEqual([22, 21, 20, 12, 11].map(c => X(SOCIAL, c).step ?? 'fallback'), ['natural', 'tight', 'lrToTd', 'lrToTd', 'fallback']))
```
- [ ] **Run** `node --test tests/core/timeline-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Steps:** LR and a bare header: `['natural', 'tight', 'wrap', 'lrToTd']`; TD: `['natural', 'wrap']`.
  - **LR columns:**
    - Each period is a column as wide as its widest pill; a pill is plain, its text with a pad cell on each side. A section name wider than its periods' span widens its last column.
    - The gap between columns is 2 for `natural` and 1 for `tight` and `wrap`.
    - `wrap` caps every column at the largest w with `n·w + (n − 1) ≤ cols` and wraps pills to `w − 2`. A word wider than that fails `too-wide`, and the ladder goes on.
  - **LR rows:**
    - `heading(title)`, then the section names, each spanning its periods' columns, then the period pills.
    - An axis row: `─` across every column, with `●` at each column's start.
    - Then the events: a column's k-th event line sits on event row k, left-aligned in its column.
  - **TD rows,** also used by `lrToTd`:
    - A section name gets its own row before its first period.
    - `●` and the period pill share a row; then each event gets its own row(s): `│`, two blank cells, its pill.
    - It draws unwrapped first; then period text wraps to `cols − 2` and event text to `cols − 4`. A word wider fails `too-wide`.
  - **Width:** rows are measured as `validate` measures them, so trailing blanks do not count.
  - **Inks:**
    - Each section, or each period when there are no sections, takes the next series color for its name, pills, dots and events. With `multicolor` false, all take `s1`.
    - The axis takes the `edge` role. Pills are not filled.
  - **Owners:** a period `p<k>`, an event `p<k>.e<j>`, a section `sec<k>`, a dot `p<k>:mark`, the axis `axis`.
- [ ] **Done when:** `node --test tests/core/timeline-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw timelines as columns on an axis, or down a left axis"`

### T84: Timeline fixtures and goldens
**Group** G4 · **Deps** T48, T83 · **Covers** every timeline-ok and timeline-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/timeline/timeline-{ok-01…13,reject-01…07}.mmd` and `goldens/timeline/*.golden`. Test: `tests/golden/timeline_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/timeline').map(f => f.replace('.mmd', ''))
test('A5: every timeline coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'timeline', ids), []))
test('A7: without sections each period takes the next series color; disableMulticolor keeps them all on s1', () => {
  const n = THEMES.nord, ink = (id: string, y: string) => spanOf(renderMermaid(fx(id), { columns: 120, theme: 'nord' })!, new RegExp(`^ ?${y} ?$`))?.color
  assert.deepEqual([ink('timeline-ok-01', '2002'), ink('timeline-ok-01', '2004')], [n.series.s1, n.series.s2])
  assert.deepEqual([ink('timeline-ok-08', '2002'), ink('timeline-ok-08', '2004')], [n.series.s1, n.series.s1])
})
```
- [ ] **Run** `node --test tests/golden/timeline_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/timeline'`.
- [ ] **Fixtures** (each body follows `timeline` unless a header is given; docs examples are copied from `timeline.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | the docs social media example (`title History of Social Media Platform`, `2002 : LinkedIn`, `2004 : Facebook` with the continuation `: Google`, `2005 : YouTube`, `2006 : Twitter`); `2004 : Facebook : Google`, `2005 : Meeting at 10:30` |
| ok-03, -04 | the docs Industrial Revolution example (two sections, four periods); `section Stone Age<br>7600 BC`, `7600 BC<br>approx. : Britain's oldest known house<br>was built in Orkney` |
| ok-05, -06 | `2001`, `2002 : a`, `2002 : b` (a period without events; two periods with the same text); `timeline TD`, `2002 : LinkedIn`, `2004 : Facebook : Google` |
| ok-07, -08 | frontmatter `title: Milestones`, then `timeline LR`, `%% a comment`, `2002 : LinkedIn`, `2004 : Facebook`; frontmatter `config:` / `timeline:` / `disableMulticolor: true`, then ok-01's body |
| ok-09 | `title 社交媒体`, `2002 : 领英`, `2004 : 脸书 : 谷歌` |
| ok-10 | `%% expect 60 natural widest 60`, `%% expect 59 tight`, then `2001 : Planning`, `2002 : Research`, `2003 : Building`, `2004 : Testing`, `2005 : Shipping it` (pills 10 + 10 + 10 + 9 + 13 = 52, plus four gaps of 2) |
| ok-11, -12 | `%% expect 60 wrap`, `2001 : the first long event of several short words`, `2002 : ` the same event (each pill 45 cells; two columns need 92); `%% expect 60 lrToTd`, `2001 : Construction`, `2002 : Introduction`, `2003 : Announcement`, `2004 : Distribution`, `2005 : Construction` (wrap caps a column at 11, narrower than a 12-letter word) |
| ok-13 | ok-01's body plus `accTitle: History` |
| reject-01…04 | `: lonely`; `2001 : a`, `section A`, `2002 : b`; `section Bronze Age`, `2001 : a`, `section Bronze Age`, `2002 : b`; `2002 :LinkedIn` |
| reject-05…07 | `C# 1.0 : released`; `title A`, `title B`, `2002 : x`; `%% expect 60 fallback`, `%% expect 80 natural`, `2002 : ` + a one-word 61-letter event (a 63-cell pill) |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/timeline/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/timeline_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add timeline fixtures and goldens"`

### T85: Visual gate: gallery, tangle, review scopes, README table, stubs gone
**Group** G7 · **Deps** T30, T31, T32 and every fixture task (T56, T59, T62, T64, T66, T70, T73, T75, T78, T81, T84) · **Covers** spec C Visual gate (a gallery from the goldens, as PNG through B's SVG pipeline, at 80, at 60 and with CJK; the PM's review and a cross-family review per type), spec C Registry (the README table), VR.gallery, VR.tangled, VR.reviewers, VR.passes, B1
**Files:**
- **Modify:** `scripts/render-gallery.ts` (T30), `scripts/check-tangle.ts` (T31), `docs/reviews/required.json`, and the "Supported diagrams" section of `README.md`.
- **Delete:** `core/diagrams/stub.ts`.
- **Test:** `tests/scripts/gallery-c_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'; import { tmpdir } from 'node:os'; import { join } from 'node:path'
import { gallery } from '../../scripts/render-gallery.ts'; import { TIER1, supportTable } from '../../core/registry.ts'; import { explain } from '../../core/render.ts'
test('VR.gallery: every Tier 1 ok fixture at 80 and 60, a CJK sheet per type, the palette sheet; every glyph at col × cell', () => {
  const out = mkdtempSync(join(tmpdir(), 'mtty-galc-'))
  try {
    assert.deepEqual(gallery(out).problems, []); const files = new Set(readdirSync(out))
    for (const t of TIER1) for (const f of readdirSync(`fixtures/${t}`).sort().filter(f => f.includes('-ok-')))
      for (const w of [80, 60]) assert.ok(files.has(f.replace('.mmd', `@${w}.svg`)), `${f}@${w}`)
    for (const t of TIER1) assert.ok(files.has(`cjk-${t}.svg`), `cjk-${t}`)
    assert.ok(files.has('palettes.svg'))
  } finally { rmSync(out, { recursive: true, force: true }) }
})
test('VR.tangled: check-tangle passes over every Tier 1 type and reports each', () => {
  const r = spawnSync(process.execPath, ['scripts/check-tangle.ts'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr); for (const t of TIER1) assert.match(r.stdout, new RegExp(`^${t}: \\d+ ok$`, 'm'), t)
})
test('VR.reviewers: each Tier 1 type has its own review scope over its goldens and the themes', () => {
  const req = JSON.parse(readFileSync('docs/reviews/required.json', 'utf8'))
  for (const t of TIER1) assert.deepEqual(req[`vr-C-${t}`], [`goldens/${t}/**`, 'core/themes.ts'], t)
})
test('B1: the README support table is supportTable()', () => assert.ok(readFileSync('README.md', 'utf8').includes(supportTable())))
test('A4: no Tier 1 module is a stub: each ok-01 fixture renders', () => {
  for (const t of TIER1) assert.ok(!('reason' in explain(readFileSync(`fixtures/${t}/${t}-ok-01.mmd`, 'utf8'), { columns: 120 })), t)
})
```
- [ ] **Run** `node --test tests/scripts/gallery-c_test.ts` → FAIL: `AssertionError [ERR_ASSERTION]: state-ok-01.mmd@80` (A's gallery walks flowchart and sequence only).
- [ ] **Implement:**
  - **`render-gallery.ts`** (it extends T30; T30's own outputs stay):
    - It walks every `fixtures/<type>/` except `corpus`. Each Tier 1 ok fixture gets `<id>@80.svg` and `<id>@60.svg`, under nord.
    - It adds `cjk-<type>.svg` per Tier 1 type: that type's fixtures whose source holds Han, Kana or Hangul, stacked at 80 and 60. A's `cjk.svg` stays.
    - `palettes.svg` adds each Tier 1 type's first ok fixture under all six themes.
    - Every SVG goes through B's `toSvg` in `scripts/lib/svg.ts`, and the self-check uses its `misplaced`. So the gallery and the README assets share one serializer; if T30 built `rowsToSvg`, it becomes a thin wrapper over `toSvg`.
    - Spans map to `Styled` with their colors; a ThemeKey resolves through T30's `DARK_KEYS`. `--png` runs `rsvg-convert`, as in T30.
  - **`check-tangle.ts`** (extends T31): it walks the same folders at 60, 80 and 120 and prints one `<type>: <n> ok` line per type. It still exits 1 on any hit.
  - **`required.json`:** add `"vr-C-<type>": ["goldens/<type>/**", "core/themes.ts"]` for the 11 types. CI stays red until each verdict is recorded, as for `vr-A` (PM, 2026-10-28).
  - **`README.md`:** the "Supported diagrams" table is `supportTable()`'s output. B owns the page, and C supplies these rows (B3 waits on C for them).
  - **`stub.ts`:** delete it; no `layout.ts` imports it any more.
  - **The review of each type** (by people, as in plan A §14):
    1. Run `node scripts/render-gallery.ts out/gallery --png`.
    2. The PM checks the type's PNGs at 80 and 60, and its CJK sheet, for color and legibility.
    3. A cross-family reviewer reads its goldens' text and role rows against the tangle rules and the matrix's text design.
    4. They record `docs/reviews/<date>-vr-C-<type>.md`, with the Files rows that `node scripts/check-review-hashes.ts --table goldens/<type> core/themes.ts` prints.
- [ ] **Done when:** `node --test tests/scripts/gallery-c_test.ts` passes and `node scripts/render-gallery.ts out/gallery` exits 0. The merge gate, `node scripts/check-review-hashes.ts --require-pass`, passes once the 11 records exist.
- [ ] **Commit:** `git commit -m "Gate the Tier 1 types: gallery, tangle, review scopes and the README table"`
