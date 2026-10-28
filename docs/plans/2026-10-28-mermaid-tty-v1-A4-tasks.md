# mermaid-tty v1 A — tasks T24–T39 (sequence layout and fixtures, gates, corpus, visual review, e2e, parity, type check)

**Depends on:** the main plan (§3 platforms, §6, §9 check commands, §10 review record, §13–§14) and A2–A3 (T0–T23). The e2e tasks T33–T37 build on the coordinator's spike recipe (F11) and resolve E1–E7.
**Conventions:** as in A2. Only `scripts/e2e/` imports packages (node-pty, @xterm/headless); its package-using tests are named `*.e2etest.ts`, so neither `node --test` on a fresh clone nor `check.sh` loads them.
**Stable names (plan B depends on them):** `scripts/e2e/run.ts` with `--installed CONFIG_DIR` and `--claude-version V`; `scripts/e2e/package-lock.json`; `scripts/render-gallery.ts OUT_DIR`; `scripts/check-review-hashes.ts` with the §10 record; the `Palette` type in `core/themes.ts`.

### T24: Sequence layout, draw and registry
**Group** P7 · **Deps** T10, T19 (it also edits `registry.ts`), T23 · **Covers** A2, A4.fit-ladder (sequence steps), sequence-ok-12…39 drawing (-39 the title row)
**Files:** create `core/diagrams/sequence/layout.ts`; modify `core/registry.ts` (`MODULES.sequence = sequence`). Test: `tests/core/sequence-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { sequence } from '../../core/diagrams/sequence/layout.ts'; import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'; import { validate } from '../../core/validate.ts'
import { lookup } from '../../core/registry.ts'; import { text } from './graph-fixture.ts'
const L = (t: string) => sequence.layout(parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any, 'natural', 80) as any
test('A2: base design: caps, lifelines, solid and dotted, self-message, activation, note', () => {
  const d = L('actor U as User\nparticipant S as Server\nU->>+S: req\nS-->>-U: res\nS->>S: self\nNote over U,S: both')
  assert.equal(validate(d), null); const t = text(d).join('\n')
  for (const s of ['([ User ])', '[ Server ]', '─►', '◄┄', '─┐', '◄┘', '┃', 'both']) assert.ok(t.includes(s), s)
})
test('A2: frames and autonumber', () => {
  const d = L('autonumber 10 5\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend'); assert.equal(validate(d), null)
  const t = text(d).join('\n'); for (const s of ['alt [ok]', '[no]', '10. a', '15. b']) assert.ok(t.includes(s), s)
})
test('A2: the registry resolves sequenceDiagram', () => assert.equal((lookup('sequenceDiagram') as any).type, 'sequence'))
test('A2: a title statement draws a bold title row', () => { const d = L('title Checkout\nA->>B: x'); assert.equal(validate(d), null); assert.match(text(d)[0]!, /Checkout/) })
```
- [ ] **Run** `node --test tests/core/sequence-layout_test.ts` → FAIL: `Cannot find module …/sequence/layout.ts`.
- [ ] **Implement:**
  - **Module (`sequence: DiagramModule<Seq>`):** `parse` = `parseSequence`; `steps` = natural, tight, wrap; `layout` follows the §7 sequence rules. `pad` is 4 or 2; the wrap step tries labels and notes at 24…8 and returns the first drawing `validate` accepts.
  - **Header:** pills use rect caps for `participant` and stadium caps for `actor`, role `node`, owner = id.
  - **Title:** `Seq.title` (frontmatter or a `title` statement) is a bold row 0, role `title`, owner `title`.
  - **Messages:**
    - Each message has a label row (role `label`, owner `m${i}:label`; with autonumber, `${n}. ${text}`) and a line row (`line`, light or dotted, owner `m${i}`).
    - Ends: `►`/`◄` for arrow, `x` for cross, `)` for async, nothing for open.
    - A self-message is `─┐` then `◄┘`.
  - **Notes:** rows of role `note` with plain caps, owner `n${i}`.
  - **Frames:**
    - `frame()` titled `${type} [${cond}]`, owner `f${i}`.
    - Each further section adds a `┄` divider row carrying `[${cond}]` (owner `f${i}.${k}`).
    - `rect` is an untitled frame with role `note`; `box` is a titled frame around its columns, from above the header.
  - **Draw order:** frames, then lifelines (`│`, `┃` in active spans, owner = participant), then lines, arrows, text and caps (they replace lifeline cells).
  - **Create and destroy:** a created participant's pill sits on its creating message's row, and its lifeline starts below. A destroyed participant's lifeline ends at its destroying message.
  - **Expect:** every participant, message, note, frame title, section condition, box label and the title. Edges are `{ id: m${i}, from, to, heads }`, and edge labels pair `m${i}:label` with `m${i}`.
- [ ] **Done when:** `node --test tests/core/sequence-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Lay out and draw sequence diagrams; register the type"`

### T25: Sequence fixtures and goldens
**Group** P8 · **Deps** T20, T24 · **Covers** A2, A4.fit-ladder (sequence), every sequence-ok and sequence-reject fixture
**Files:** create `fixtures/sequence/sequence-{ok-01…39,reject-01…08}.mmd` and `goldens/sequence/*.golden`; modify `tests/golden/golden_test.ts`, adding `'sequence-ok-27': 'natural', 'sequence-ok-28': 'tight', 'sequence-ok-29': 'wrap'` to `LADDER`.
- [ ] **Failing test:** T20's harness already loops over `fixtures/sequence`, so adding the fixtures makes it fail.
- [ ] **Run** `node --test tests/golden/golden_test.ts` → FAIL: `ENOENT …/goldens/sequence/sequence-ok-01.golden`.
- [ ] **Fixtures** (each starts `sequenceDiagram`; size -27…29 and reject-04 with `node scripts/explain.ts FILE 60`; the docs examples are copied from `sequenceDiagram.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01…03 | `participant B`, `participant A`, `A->>B: hi`; `actor U`, `actor V`, `U->>V: hi`; `participant A as Alice`, `actor B as Bob`, `A->>B: hi` |
| ok-04…11, -36, -37 | `A ⟨arrow⟩ B: msg`, one each: `->>`, `-->>`, `->`, `-->`, `-x`, `--x`, `-)`, `--)`, `<<->>`, `<<-->>` |
| ok-12, -13, -31 | `A->>A: self`; `A->>+B: a`, `A->>+B: b`, `B-->>-A: c`, `B-->>-A: d`; the same span written with `activate B` and `deactivate B` lines |
| ok-14…17 | `A->>B: hi`, then `Note left of A: n`, `Note right of A: n`, `Note over A: n` or `Note over A,B: n` |
| ok-18…24 | one frame each around `A->>B: x`: `alt ok`/`else no`, `opt maybe`, `loop every 1s`, `par a`/`and b`, `critical c`/`option o`, `break stop`; -24 is an `alt` holding a `loop` |
| ok-25, -32 | bare `autonumber` with 3 messages; `autonumber 10 5` with 3 messages (10, 15, 20) |
| ok-26, -30 | `participant 用户`, `participant 服务`, `用户->>服务: 读取配置`, `Note over 服务: 完成`; `participant A as Same`, `participant B as Same`, `A->>B: x` |
| ok-27…29 | -27: natural is exactly 60 wide; -28: natural 61–70 and tight fits; -29: one long label, tight > 60 and wrap fits |
| ok-33…35 | the docs `rect rgb(…)` example with a note and a nested `rect`; the docs `box Purple Alice & John … end` and `box Another Group … end`; the docs create/destroy example |
| ok-38 | `actor U`, `participant S`, `U->>+S: req`, `S-->>-U: res`, `S->>S: log`, `Note over U,S: done` |
| ok-39 | `title Checkout`, then `A->>B: pay` |
| reject-01…07 | `A->>: hi`; `loop x` with no `end`; `A->>B: 👨‍👩‍👧`; a message row whose narrowest layout is 61; `create participant C` then `A->>B: x`; `destroy B`, `A-xB: bye`, `A->>B: again`; `A->>C: hi`, then `box G` holding A and B |
| reject-08 | `title A`, `title B`, `A->>B: x` (a second title) |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/golden_test.ts` writes the goldens. After reading each one, plain `node --test tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add sequence fixtures and goldens"`

### T26: Matrix coverage rows
**Group** P9 · **Deps** T25 · **Covers** matrix common rule 11, A1, A2
**Files:** Test: `tests/golden/coverage_test.ts` (a test-only task).
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, existsSync, readdirSync } from 'node:fs'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')
const rows = (t: string) => M.slice(M.indexOf('## Coverage')).split('\n').filter(l => l.startsWith(`| ${t} |`))
for (const [t, A] of [['flowchart', 'A1'], ['sequence', 'A2']] as const) test(`${A}: every coverage row cites existing fixtures; every ok fixture is cited`, () => {
  const cited = new Set(rows(t).flatMap(l => l.match(new RegExp(`${t}-(ok|reject)-\\d+`, 'g')) ?? [])); assert.ok(rows(t).length > 0)
  for (const id of cited) assert.ok(existsSync(`fixtures/${t}/${id}.mmd`), id)
  for (const f of readdirSync(`fixtures/${t}`)) if (f.includes('-ok-')) assert.ok(cited.has(f.replace('.mmd', '')), f)
})
```
- [ ] **Run:** move `fixtures/sequence/sequence-ok-38.mmd` aside and run `node --test tests/golden/coverage_test.ts` → FAIL: `sequence-ok-38`. Move it back.
- [ ] **Implement:** no code. A failure names a fixture to add or rename. The matrix is never edited; a wrong row goes to the PM.
- [ ] **Done when:** `node --test tests/golden/coverage_test.ts` passes.
- [ ] **Commit:** `git commit -m "Check matrix coverage rows against fixtures"`

### T27: Portability, platforms and the fresh clone
**Group** P8 · **Deps** T1, T19 · **Covers** A8.portability, A8.platforms (`.gitattributes`), A8.no-build, S2
**Files:** create `scripts/check-portable.ts`, `scripts/fresh-clone.ts`; modify `scripts/lib/claude.ts` (an optional `cwd`). Test: `tests/scripts/portable_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { scanSource, scanRepo } from '../../scripts/check-portable.ts'
test('A8.portability: forbidden tokens and imports are found; comments and strings are not', () => {
  for (const s of ["import x from 'node:fs'", "import y from 'lodash'", 'process.env.X', "require('a')", 'Buffer.from(s)', 'window.x',
    'document.x', 'eval(s)', 'new Function(s)', "await import('./a.ts')", "import { w } from './width'"]) assert.notDeepEqual(scanSource(s), [], s)
  for (const s of ["import type { Register } from 'claude-code'", "import { width } from './width.ts'", '// process.env', "const s = 'require(x)'"])
    assert.deepEqual(scanSource(s), [], s)
  assert.deepEqual(scanRepo('.'), [])
})
test('A8.platforms: .gitattributes keeps text files LF', () => assert.match(readFileSync('.gitattributes', 'utf8'), /^\* text=auto eol=lf$/m))
```
- [ ] **Run** `node --test tests/scripts/portable_test.ts` → FAIL: `Cannot find module …/check-portable.ts`.
- [ ] **Implement:**
  - **`scanSource(code)`:** blank out comments and the contents of string and template literals, keeping the specifiers of `import … from '…'` and `import '…'`. Then flag:
    - an import specifier that is not `./…` or `../…` (a type-only `claude-code` import is allowed), or that does not end `.ts`/`.tsx`;
    - `\bprocess\b`, `\brequire\s*\(`, `\bBuffer\b`, `\bdocument\b`, `\bwindow\b`, `\beval\s*\(`, `\bnew\s+Function\b` and `\bimport\s*\(`.
  - **`scanRepo(root)`:** walk `core/` and `hooks/` (`.ts`, `.tsx`), report problems as `file:line token`, and report a `dependencies` key in `package.json`. `main` prints them and exits 1.
  - **`fresh-clone.ts`:**
    - Create `dir = mkdtempSync(join(tmpdir(), 'mtty-clone-'))`, `git clone --quiet <root> dir`, then `git -C dir checkout --quiet <git rev-parse HEAD>`.
    - With `cwd: dir`, run bare `node --test`, `node --test <the walked *_test.ts list>`, `claude plugin test .` and `node scripts/smoke.ts`. Any non-zero exit makes the script exit 1.
    - Print whether bare `node --test` ran more than 0 tests (this closes S2). Remove `dir` in `finally`.
- [ ] **Done when:** `node --test tests/scripts/portable_test.ts`, `node scripts/check-portable.ts` and `node scripts/fresh-clone.ts` exit 0 on a committed tree.
- [ ] **Commit:** `git commit -m "Add portability, LF and fresh-clone checks"`

### T28: Benchmark
**Group** P9 · **Deps** T25 · **Covers** A8.benchmark, R3
**Files:** create `scripts/bench.ts`. Test: `tests/scripts/bench_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { percentile, ceiling } from '../../scripts/bench.ts'
test('A8.benchmark: nearest-rank percentiles; ceiling 50 ms on the Mac and 200 ms in CI', () => {
  const xs = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]; assert.equal(percentile(xs, 50), 5); assert.equal(percentile(xs, 90), 9)
  assert.equal(ceiling({}), 50); assert.equal(ceiling({ CI: 'true' }), 200); assert.equal(ceiling({ BENCH_P90_MS: '80' }), 80)
})
```
- [ ] **Run** `node --test tests/scripts/bench_test.ts` → FAIL: `Cannot find module …/scripts/bench.ts`.
- [ ] **Implement:**
  - **`percentile(xs, p)`** sorts a copy and returns `s[max(0, ceil(p / 100 · n) − 1)]`. **`ceiling(env)`** returns `Number(env.BENCH_P90_MS ?? (env.CI ? 200 : 50))`.
  - **CLI `bench.ts DIR… [--private DIR]`:**
    - It collects every `.mmd` under the DIRs whose name lacks `-reject-` (rejects fail fast and would lower p90), plus the closed mermaid fences of `--private` `.md` files.
    - Each diagram is timed with `performance.now()` over 20 cold `explain(src, { columns: 80, theme: 'default' })` calls (no renderer cache).
    - It prints n, p50, p90, `os.cpus()[0].model`, `process.version` and `process.platform`, and exits 1 when p90 > `ceiling(process.env)`.
- [ ] **Done when:** the test passes and `node scripts/bench.ts fixtures` prints p90 ≤ 50 ms on the dev Mac.
- [ ] **Commit:** `git commit -m "Add the cold-render benchmark with Mac and CI ceilings"`

### T29: Synthetic corpus and the corpus gate
**Group** P9 · **Deps** T8, T25 · **Covers** A10, R1 and R2 trigger counts
**Files:** create `scripts/gen-corpus.ts`, `scripts/corpus-gate.ts` and the generated, committed `fixtures/corpus/corpus-001…100.mmd`. Test: `tests/scripts/corpus_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { gate } from '../../scripts/corpus-gate.ts'
const C = readdirSync('fixtures/corpus').map(f => readFileSync(`fixtures/corpus/${f}`, 'utf8'))
const share = (re: RegExp) => C.filter(s => re.test(s)).length / C.length
test("A10: at least 90 synthetic blocks with the owner's feature mix", () => {
  assert.ok(C.length >= 90); assert.ok(share(/^(---[\s\S]*?---\n)?(flowchart|graph)\b/) >= 0.92); assert.ok(share(/^sequenceDiagram/m) >= 0.08)
  for (const [re, min] of [[/[[({]"/, 0.76], [/-->\|| -- /, 0.47], [/\p{Script=Han}/u, 0.47], [/<br\/?>/, 0.33], [/^---\n/, 0.07], [/^\s*subgraph /m, 0.1]] as const)
    assert.ok(share(re) >= min, String(re))
  assert.ok(C.filter(s => /^sequenceDiagram/m.test(s) && /^\s*title /m.test(s)).length >= 3)
})
test('A10: every block renders and validates at 80 and 120 columns', () => assert.deepEqual(gate('fixtures/corpus').failed, []))
```
- [ ] **Run** `node --test tests/scripts/corpus_test.ts` → FAIL: `ENOENT …/fixtures/corpus`.
- [ ] **Implement:**
  - **The mix minima** are the owner's shares (PM, 2026-10-28): flowchart/graph 92%, sequence 8%, quoted labels 76%, edge labels 47%, CJK 47%, `<br/>` 33%, frontmatter 7%, and `title` in 2 of 7 sequence diagrams (so ≥ 3 of 8). Subgraphs (3.4% in the owner's corpus) are over-represented at ≥ 10% on purpose, for the tangle and gallery checks.
  - **`gen-corpus.ts [--check]`:**
    - A seeded PRNG (mulberry32, seed 20261028) writes 100 blocks.
    - 92 are flowcharts: `flowchart` or `graph` (a few bare), TD or LR, 3–9 nodes, T20 shapes, thick and dotted edges, quoted labels, both edge-label forms, CJK words from a fixed list, `<br/>`, nested and border-crossing subgraphs in at least 10, and frontmatter titles on at least 7.
    - 8 are sequence diagrams: 2–4 participants, 3–8 messages, a note and one frame; 3 have a `title` statement.
    - The output is byte-stable. `--check` exits 1 when regenerating would change a file.
  - **`corpus-gate.ts DIR [--private DIR2]`:**
    - It exports `gate(dir): { total: number; failed: string[] }`. Each `.mmd` is one block; each `.md` contributes its closed mermaid fences (`splitFences`).
    - Every block runs through `explain` at 80 and 120 columns.
    - A failure is reported as `<index>@<cols> <reason>`, never as source text or a path.
    - The CLI prints counts and exits 1 on any failure. `--private` runs the same gate on the Mac's private blocks and prints counts only.
- [ ] **Done when:** the test passes, `node scripts/gen-corpus.ts --check` exits 0, and `node scripts/corpus-gate.ts fixtures/corpus` exits 0. A failing block is a renderer bug to fix, never a block to drop; R1 and R2 count these failures.
- [ ] **Commit:** `git commit -m "Add the synthetic corpus and the corpus gate"`

### T30: SVG cells and the review gallery
**Group** P9 · **Deps** T25 · **Covers** VR.gallery, VR.in-ci (self-check), D3
**Files:** create `scripts/render-svg.ts`, `scripts/render-gallery.ts`; modify `.gitignore` (add `out/`). Test: `tests/scripts/gallery_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'; import { join } from 'node:path'
import { rowsToSvg, glyphXs } from '../../scripts/render-svg.ts'; import { gallery } from '../../scripts/render-gallery.ts'
test('VR.gallery: each glyph sits at col × cell width; a W/F char takes two cells', () =>
  assert.deepEqual(glyphXs(rowsToSvg([[{ text: '中a' }], [{ text: '─►', color: '#88C0D0' }]], { cellW: 10, cellH: 20 })),
    [['中', 0], ['a', 20], ['─', 0], ['►', 10]]))
test('VR.gallery: every golden at 80 and 60, the CJK sheet, the palette sheet and an index', () => {
  const out = mkdtempSync(join(tmpdir(), 'mtty-gal-'))
  try {
    assert.deepEqual(gallery(out).problems, []); const files = readdirSync(out)
    for (const id of ['flowchart-ok-01', 'sequence-ok-38']) for (const w of [80, 60]) assert.ok(files.includes(`${id}@${w}.svg`), `${id}@${w}`)
    for (const f of ['cjk.svg', 'palettes.svg', 'index.html']) assert.ok(files.includes(f), f)
  } finally { rmSync(out, { recursive: true, force: true }) }
})
```
- [ ] **Run** `node --test tests/scripts/gallery_test.ts` → FAIL: `Cannot find module …/render-svg.ts`.
- [ ] **Implement:**
  - **`rowsToSvg(rows, { cellW = 10, cellH = 20 })`:**
    - One `<text x y>` per non-space glyph, at `x = col × cellW`; `col` advances by `width(ch)`.
    - A `<rect>` per background run.
    - A ThemeKey color resolves through `DARK_KEYS`, a fixed preview of CC's dark theme: hex for suggestion, warning, inactive, claude, text, permission, subtle, success, inverseText, error, merged and planMode.
    - Font `ui-monospace, Menlo, Consolas, monospace`. **`glyphXs(svg)`** returns `[ch, x]` pairs in document order.
  - **`gallery(out)`:**
    - For every non-reject fixture in `fixtures/{flowchart,sequence}`: `${id}@80.svg` and `${id}@60.svg`, rendered through `renderMermaid` under nord.
    - `cjk.svg` stacks flowchart-ok-40 and sequence-ok-26 at 80 and 60. `palettes.svg` stacks flowchart-ok-40 and sequence-ok-38 under all 6 themes.
    - `index.html` links everything.
    - **Self-check:** in every file, each `glyphXs` x equals its column × cellW. Returns `{ problems }`.
  - **CLI `render-gallery.ts OUT_DIR [--png]`:** writes the gallery and exits 1 on problems. With `--png`, it runs `rsvg-convert` per SVG when that tool is on PATH, or prints that it is missing (PNGs are review-only; CI uploads the SVGs).
- [ ] **Done when:** the test passes and `node scripts/render-gallery.ts out/gallery` exits 0.
- [ ] **Commit:** `git commit -m "Add the SVG cell renderer and the review gallery"`

### T31: Tangle check
**Group** P9 · **Deps** T25 · **Covers** VR.tangled, VR.in-ci, the R1 trigger count
**Files:** create `scripts/lib/tangle.ts` (independent of `core/validate.ts`) and `scripts/check-tangle.ts`. Test: `tests/scripts/tangle_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { explain } from '../../core/render.ts'; import { tangles } from '../../scripts/lib/tangle.ts'
const fresh = () => (explain(readFileSync('fixtures/flowchart/flowchart-ok-30.mmd', 'utf8'), { columns: 80, theme: 'mono' }) as any).drawing
const find = (d: any, p: (c: any) => boolean) => { for (const [r, row] of d.cells.entries()) for (const [c, x] of row.entries()) if (x && p(x)) return [r, c]; throw new Error('none') }
test('VR.tangled: a clean golden has no tangle; each rule catches its break', () => {
  assert.deepEqual(tangles(fresh()), [])
  const t = fresh(), [r, c] = find(t, x => x.kind === 'fill' && x.owners.includes('A'))
  t.cells[r][c] = { ch: '│', role: 'edge', kind: 'line', owners: ['Z>Y'], dirs: 5 }; assert.ok(tangles(t).includes('through-node'))
  const s = fresh(), [r2, c2] = find(s, x => x.kind === 'line'); s.cells[r2][c2] = { ...s.cells[r2][c2], owners: [...s.cells[r2][c2].owners, 'Z>Y'] }
  assert.ok(tangles(s).includes('shared-segment'))
  const h = fresh(); for (const row of h.cells) row.forEach((x: any, i: number) => { if (x?.kind === 'arrow') row[i] = null })
  assert.ok(tangles(h).includes('ambiguous-head'))
  const l = fresh(); l.expect = { ...l.expect, edgeLabels: l.expect.edgeLabels.map((e: any) => ({ ...e, edge: 'nope' })) }
  assert.ok(tangles(l).includes('label-detached'))
})
```
- [ ] **Run** `node --test tests/scripts/tangle_test.ts` → FAIL: `Cannot find module …/lib/tangle.ts`.
- [ ] **Implement** `tangles(d): string[]` (the four review rules; the codes are unique):
  - **`through-node`:** a `line` or `arrow` cell whose two opposite neighbours (left and right, or up and down) belong to one node (an owner in `expect.labels` that is not an edge label).
  - **`shared-segment`:** a `line` cell with two owners that share no endpoint (from `expect.edges`; an unknown id has none), unless the cell is a crossing (`dirs` 15 built from 5 and 10).
  - **`ambiguous-head`:** an edge with `heads` but no `arrow` cell of its own, or an arrow cell whose neighbour behind it is a junction (3 or more directions); a corner, as in a self-message's `◄┘`, is fine.
  - **`label-detached`:** an edge label with no cell within Chebyshev distance 1 of a `line` or `arrow` cell of its edge.
  - **CLI `check-tangle.ts [--private DIR]`:** runs `tangles` on every ok fixture at 60, 80 and 120 columns (golden_test proves these drawings equal the goldens). It prints `id@cols rule` and exits 1 on any hit. `--private` counts tangled private blocks (the R1 trigger) and prints no source.
- [ ] **Done when:** the test passes and `node scripts/check-tangle.ts` exits 0.
- [ ] **Commit:** `git commit -m "Add the independent tangle check over every golden"`

### T32: Review verdict hashes
**Group** P2 · **Deps** T1 · **Covers** VR.reviewers, VR.passes, the §10 record format (a B dependency)
**Files:** create `scripts/check-review-hashes.ts`. Test: `tests/scripts/review-hashes_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'
import { parseRecord, checkRecords, requirePass } from '../../scripts/check-review-hashes.ts'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const REC = `---\nscope: vr-A\nverdict: pass\ndate: 2026-11-02\nreviewers: [PM, cross-family:gpt-6]\n---\n## Files\n| path | sha256 |\n|---|---|\n| goldens/a.golden | ${sha('A')} |\n## Notes\n- ok\n`
test('VR.reviewers: records parse; hashes match; a changed or missing file fails', () => {
  const r = parseRecord('docs/reviews/x.md', REC) as any; assert.deepEqual(r.files, [{ path: 'goldens/a.golden', sha256: sha('A') }])
  assert.deepEqual(checkRecords([r], p => (p === 'goldens/a.golden' ? 'A' : null)), [])
  assert.match(checkRecords([r], () => 'B')[0]!, /goldens\/a\.golden: recorded \w+ actual \w+/)
  assert.match(checkRecords([r], () => null)[0]!, /missing/)
  assert.ok('error' in (parseRecord('y.md', REC.replace('verdict: pass', 'verdict: maybe')) as object))
})
test('VR.passes: every golden and core/themes.ts needs a passing vr-A record', () =>
  assert.deepEqual(requirePass([parseRecord('x.md', REC) as any], ['goldens/a.golden', 'core/themes.ts']), ['core/themes.ts']))
```
- [ ] **Run** `node --test tests/scripts/review-hashes_test.ts` → FAIL: `Cannot find module …/check-review-hashes.ts`.
- [ ] **Implement:**
  - **`parseRecord(path, text)`:** the front matter between the `---` lines has exactly the keys `scope` (a slug: `vr-A`, `vr-C-<type>`, `beauty`, `translation`, …), `verdict` (`pass` or `fail`), `date` (`YYYY-MM-DD`) and `reviewers` (`[…]`). The `## Files` table rows are `| path | 64 lowercase hex |`. It returns `{ path, scope, verdict, date, reviewers, files }`, or `{ error }`.
  - **`checkRecords(records, read)`:** `read(p)` returns the bytes or `null`. For each file it reports `<path>: missing`, or `<path>: recorded <a> actual <b>` when the SHA-256 of the raw bytes differs (`.gitattributes` keeps them LF on every OS).
  - **`requirePass(records, paths)`:** returns the paths that no `scope: vr-A`, `verdict: pass` record lists.
  - **CLI:**
    - It parses every `docs/reviews/*.md`; with no folder or no records, integrity passes vacuously.
    - `--require-pass` adds `requirePass` over every `goldens/**` file and `core/themes.ts`.
    - `--table <paths…>` prints Files rows, walking directories.
    - It exits 1 on any problem or parse error.
- [ ] **Done when:** the test passes and `node scripts/check-review-hashes.ts` exits 0.
- [ ] **Commit:** `git commit -m "Add the review verdict hash check"`

### T33: E2E package and the mock Messages API
**Group** P2 · **Deps** T0 · **Covers** A9.harness (mock and reply), F11, E7
**Files:** create `scripts/e2e/package.json`, `scripts/e2e/package-lock.json`, `scripts/e2e/CLAUDE_VERSION`, `scripts/e2e/reply.ts`, `scripts/e2e/mock.ts`. Test: `tests/scripts/e2e-mock_test.ts` (node built-ins only, so it runs in the main suite).
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { startMock } from '../../scripts/e2e/mock.ts'; import { REPLY, REPLY_LEAD } from '../../scripts/e2e/reply.ts'
const text = (sse: string) => [...sse.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`)).join('')
test('A9.harness: the mock streams REPLY to every concurrent POST /v1/messages; other paths 404', async () => {
  const m = await startMock()
  try {
    const post = () => fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [] }) }).then(r => r.text())
    for (const s of await Promise.all([post(), post()])) { assert.equal(text(s), REPLY); assert.match(s, /event: message_stop/) }
    assert.equal(text(await fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'lead' }] }) }).then(r => r.text())), REPLY_LEAD)
    assert.equal((await fetch(`${m.url}/v1/other`)).status, 404)
  } finally { await m.stop() }
})
test('A9.harness: REPLY has prose, a CJK flowchart, a sequence, an unsupported diagram and an unclosed fence', () => {
  for (const s of ['读取配置文件', 'sequenceDiagram', 'flowchart-elk TD']) assert.ok(REPLY.includes(s), s)
  assert.match(REPLY, /`{3}mermaid\nflowchart TD\nA --> B\n?$/)
})
```
- [ ] **Run** `node --test tests/scripts/e2e-mock_test.ts` → FAIL: `Cannot find module …/e2e/mock.ts`.
- [ ] **Implement:**
  - **`package.json`:** `{"name":"mermaid-tty-e2e","private":true,"type":"module"}`. In `scripts/e2e/`, run `npm install --save-exact node-pty @xterm/headless` and commit the lockfile. If node-pty's prebuilds fail on a runner (E7), use `@homebridge/node-pty-prebuilt-multiarch`.
  - **`CLAUDE_VERSION`:** `2.1.308`.
  - **`reply.ts`:** `export const REPLY` holds, in order:
    1. The prose `Here is the config flow:`, then a fence holding `flowchart LR`, `A[读取配置文件] -->|成功| B{完成?}` and `B --> C([结束])`.
    2. The prose `And the handshake:`, then a fence holding `sequenceDiagram`, `participant U as User`, `U->>S: ping` and `S-->>U: pong`.
    3. The prose `This one stays source:`, then a fence holding `flowchart-elk TD` and `X --> Y`.
    4. The prose `Unclosed:`, then an unclosed fence holding `flowchart TD` and `A --> B`.
    - `REPLY_LEAD` (D5): a fence holding `flowchart TD` and `S[开始] --> E[结束]`, then the prose `After the diagram.`
  - **`mock.ts`:** `startMock(): Promise<{ url: string; stop(): Promise<void> }>`, listening on `127.0.0.1:0`.
    - Every `POST /v1/messages` (the main turn and the side request, F11) answers REPLY, or REPLY_LEAD when the last user message contains `lead`.
    - With `stream: true` it sends SSE: `message_start`, `content_block_start`, one `content_block_delta` (`text_delta`) per 64 chars, `content_block_stop`, `message_delta` (`stop_reason: end_turn`) and `message_stop`. Otherwise it sends one JSON message.
    - Other paths return 404, and `server.on('connect', (_r, s) => s.destroy())` refuses CONNECT.
- [ ] **Done when:** `node --test tests/scripts/e2e-mock_test.ts` passes and `npm ci --prefix scripts/e2e` installs.
- [ ] **Commit:** `git commit -m "Add the e2e package and the mock Messages API"`

### T34: Session env, PTY driver and screen reader
**Group** P3 · **Deps** T33 · **Covers** A9.harness (driver, screen), E1, E2, E3, E4
**Files:** create `scripts/e2e/env.ts` (no packages), `scripts/e2e/screen.ts`, `scripts/e2e/driver.ts`. Tests: `tests/scripts/e2e-env_test.ts` (main suite) and `scripts/e2e/screen.e2etest.ts` (e2e job only).
- [ ] **Failing tests:**
```ts
// tests/scripts/e2e-env_test.ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { sessionEnv, seedConfig, seedSettings } from '../../scripts/e2e/env.ts'
const E = (o: object) => sessionEnv({ home: '/h', config: '/h/.cfg', mockUrl: 'http://127.0.0.1:9', platform: 'darwin', color: 'truecolor', driver: 'pty', path: '/bin', ...o })
test('A9.harness: a clean session env from the recipe; no inherited secrets', () => {
  const e = E({}); assert.deepEqual([e.HOME, e.CLAUDE_CONFIG_DIR, e.ANTHROPIC_API_KEY, e.ANTHROPIC_BASE_URL, e.COLORTERM, e.DISABLE_AUTOUPDATER, e.TMUX],
    ['/h', '/h/.cfg', 'dummy', 'http://127.0.0.1:9', 'truecolor', '1', undefined])
  assert.equal(E({ color: '256' }).TMUX, 'e2e'); assert.equal(E({ driver: 'tmux' }).CLAUDE_CODE_TMUX_TRUECOLOR, '1')
  assert.equal(E({ driver: 'tmux', color: '256' }).CLAUDE_CODE_TMUX_TRUECOLOR, undefined)
  const c = JSON.parse(seedConfig('/private/tmp/w', 'dummy', 'darwin'))
  assert.deepEqual([c.hasCompletedOnboarding, c.customApiKeyResponses.approved, c.projects['/private/tmp/w'].hasTrustDialogAccepted], [true, ['dummy'], true])
  assert.deepEqual(Object.keys(JSON.parse(seedSettings('nord')).pluginConfigs).sort(), ['mermaid-tty', 'mermaid-tty@inline', 'mermaid-tty@mermaid-tty'])
})
// scripts/e2e/screen.e2etest.ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createScreen } from './screen.ts'
test('A9.harness: the screen reader keeps truecolor, 256 colors, widths and OSC 52', async () => {
  const s = createScreen(20, 3); await s.write('\x1b[38;2;236;239;244m\x1b[48;2;94;129;172m读a\x1b[0m \x1b[38;5;110mb\x1b[0m\x1b]52;c;aGk=\x07')
  const r = s.cells()[0]!
  assert.deepEqual([r[0]!.ch, r[0]!.width, r[0]!.fg, r[0]!.bg], ['读', 2, { mode: 'rgb', value: 0xeceff4 }, { mode: 'rgb', value: 0x5e81ac }])
  assert.deepEqual([r[2]!.ch, r[4]!.fg], ['a', { mode: 'p256', value: 110 }]); assert.equal(s.clipboard(), 'hi')
})
```
- [ ] **Run** `node --test tests/scripts/e2e-env_test.ts` → FAIL: `Cannot find module …/e2e/env.ts`.
- [ ] **Implement:**
  - **`sessionEnv`:** builds the env from nothing (F11), with no inherited variables:
    - always: HOME, USER=e2e, PATH, TERM=xterm-256color, `CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY=dummy`, `ANTHROPIC_BASE_URL`, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_TELEMETRY` and `DISABLE_AUTOUPDATER`, each `1`;
    - not on win32: `SHELL=/bin/bash`. Locale: `LANG` and `LC_ALL` are `C.UTF-8` on Linux and `en_US.UTF-8` on macOS;
    - win32: `USERPROFILE`, plus `APPDATA` and `LOCALAPPDATA` under home, and `SystemRoot`, `ComSpec` and `PATHEXT` copied from the parent;
    - by color mode: truecolor sets `COLORTERM=truecolor`, plus `CLAUDE_CODE_TMUX_TRUECOLOR=1` under tmux. 256 omits both, and the pty driver also sets `TMUX=e2e`, which gives the clamp (E3).
  - **Seed files:** `seedConfig(realCwd, key, platform)` is the F11 `.claude.json`, with key `key.trim().slice(-20)`; on win32 it adds the `/`-separated project key (E2). `seedSettings(theme)` writes `settings.json` with `pluginConfigs` under all three keys (E4), each `{ "options": { "theme": … } }`.
  - **`createScreen(cols, rows)`:** wraps `@xterm/headless` `Terminal` (`allowProposedApi`).
    - `write` resolves in the write callback.
    - `cells()` reads `buffer.active` lines as `{ ch, width, fg, bg }`, each color `{ mode: 'default' | 'p16' | 'p256' | 'rgb', value }`. Colors come from the cells, never from the byte stream (ConPTY re-encodes them).
    - `text()` returns the screen text. `clipboard()` returns the decoded OSC 52 payload from `parser.registerOscHandler(52, …)`.
  - **`startSession({ driver, argv, cwd, env })`:** a 100×40 session with `type(text)`, `key('enter' | 'ctrl-o' | 'escape')` (sends `\r`, `\x0f`, `\x1b`), `waitFor(re, ms)`, `cells()`, `text()`, `clipboard()` and `stop()`.
    - **pty:** node-pty `spawn` with `name: 'xterm-256color'` feeds `createScreen`. On win32 it runs the `.cmd` shim through `cmd.exe /d /s /c` (E2).
    - **tmux:** `env -i` with the recipe's variables, then `tmux -L mtty-<pid> -f /dev/null new-session -d -s mtty-e2e -x 100 -y 40`, with `window-size manual` and `default-size 100x40`. Each read feeds `capture-pane -p -e` into a fresh screen. This is the E1 fallback on Linux and macOS.
    - `waitFor` polls every 100 ms; on timeout it throws with the last screen text.
- [ ] **Done when:** `node --test tests/scripts/e2e-env_test.ts` passes, then `npm ci --prefix scripts/e2e && node --test scripts/e2e/screen.e2etest.ts` passes.
- [ ] **Commit:** `git commit -m "Add the e2e session env, PTY and tmux drivers, and the screen reader"`

### T35: E2E scenarios: themes, 256 colors, source view
**Group** P9 · **Deps** T22, T25, T34 · **Covers** A9.harness, A6.in-claude-code, A3 (mono has no color), A7 (on screen), D5 (lead), the runtime proof
**Files:** create `scripts/e2e/assert.ts` (type-only import of `Cell`) and `scripts/e2e/run.ts`. Test: `tests/scripts/e2e-assert_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { checkDiagramScreen } from '../../scripts/e2e/assert.ts'
const D = { mode: 'default', value: 0 }, rgb = (v: number) => ({ mode: 'rgb', value: v })
const row = (s: string, bg: object = D) => [...s].map(ch => ({ ch, width: 1, fg: D, bg }))
const screen = (bg: object) => [row('Here is the config flow:'), row('( 读取配置文件 )', bg)]
const E = { labels: ['读取配置文件'], prose: ['Here is the config flow:'] }
test('A9.harness: row colors are checked per theme: truecolor, 256 or none', () => {
  assert.deepEqual(checkDiagramScreen(screen(rgb(0x88c0d0)) as never, { ...E, color: 'truecolor', nodeBg: 0x88c0d0 }), [])
  assert.match(checkDiagramScreen(screen(D) as never, { ...E, color: 'truecolor' })[0]!, /读取配置文件: expected truecolor/)
  assert.match(checkDiagramScreen(screen(rgb(0x88c0d0)) as never, { ...E, color: 'none' })[0]!, /读取配置文件: expected no color/)
  assert.deepEqual(checkDiagramScreen(screen({ mode: 'p256', value: 110 }) as never, { ...E, color: '256' }), [])
})
```
- [ ] **Run** `node --test tests/scripts/e2e-assert_test.ts` → FAIL: `Cannot find module …/e2e/assert.ts`.
- [ ] **Implement:**
  - **`checkDiagramScreen(cells, { labels, prose, color, nodeBg? })`** finds, for each label, the row whose joined `ch` contains it; with none, it reports `<label>: not drawn`. Then, by color mode:
    - **truecolor:** some cell has an `rgb` fg or bg; when `nodeBg` is given, some cell's bg equals it. Else `<label>: expected truecolor`.
    - **256:** some cell is `p256` and none is `rgb`.
    - **none (mono, A3):** every cell is `default`.
  - **Prose:** each prose line appears exactly once in the screen text; else `<line>: prose`.
  - **`run.ts` flags:**
    - `--claude-version V`, default `scripts/e2e/CLAUDE_VERSION`.
    - `--installed CONFIG_DIR` (T37).
    - `--theme default|nord|dracula|gruvbox|solarized|mono|all`, default `all`.
    - `--color truecolor|256`; by default, truecolor for each theme plus one 256 run under nord.
    - `--driver pty|tmux`, default `pty`.
    - `--scenario harness|source-view|stored|lead|all`, default `all`.
    - `--keep`.
  - **Each run:**
    1. Install CC once per version: `npm install --prefix <tmpdir>/mtty-cc-<V> @anthropic-ai/claude-code@<V>`; the binary is `node_modules/.bin/claude` (`.cmd` on win32).
    2. Create mkdtemp home, config and cwd (realpath), and start the mock. Write `seedConfig` to `$CONFIG/.claude.json` and `seedSettings(theme)` to `$CONFIG/settings.json`.
    3. `startSession` with `[claude, '--plugin-dir', repoRoot]`. Wait for `❯` (15 s), type `Show the diagrams`, press enter, wait for `Unclosed:` (30 s), then settle 500 ms.
  - **harness:**
    - Run `checkDiagramScreen` with the labels `读取配置文件`, `完成?`, `结束`, `User` and `ping`, and REPLY's four prose lines.
    - Color mode: `none` for mono, `256` for the 256 run, otherwise `truecolor`, with `nodeBg` = the palette's `roles.node` for a curated theme.
    - The screen shows `flowchart-elk TD` and `X --> Y` (unsupported) and `A --> B` (unclosed) as source. It does not show `A[读取配置文件] -->|成功| B{完成?}` (that one is drawn).
  - **source-view:**
    - Type `/mermaid-tty source` and wait for `flowchart LR`. The screen now holds `A[读取配置文件] -->|成功| B{完成?}` and `U->>S: ping`, and no drawn rows.
    - Press ctrl-o: the detailed view shows the same source. Press ctrl-o again.
    - `/mermaid-tty diagram` brings the drawn rows back, on the messages already on screen too.
  - **lead (D5):** type `lead`, press enter and wait for `After the diagram.`. No screen row between the prompt line and the first diagram row may hold only the reply bullet. If one does, the empty prose drew an extra row: T21 drops the empty `next()` (no bullet) and re-pins its hook test (R6).
  - **Report:** one line per run, `PASS|FAIL <os> <theme> <color> <scenario>`, plus the problems; exit 1 on any FAIL. `--keep` keeps the temp dirs, writes `screen.ansi` (the pty stream, or `capture-pane -e`), and prints the tmux attach command.
- [ ] **Done when:**
  - `node --test tests/scripts/e2e-assert_test.ts` passes.
  - `npm ci --prefix scripts/e2e && node scripts/e2e/run.ts` passes on the Mac.
  - `--driver tmux --theme nord --keep` gives the PM's runtime proof (main §14).
- [ ] **Commit:** `git commit -m "Add the e2e scenarios: themes, 256 colors, source view"`

### T36: Stored transcript and `/copy`
**Group** P10 · **Deps** T35 · **Covers** A9.stored, R6 (the stored reply keeps the exact source; `/copy` copies it), E5, E6
**Files:** create `scripts/e2e/stored.ts` (no packages; it imports the pure `hooks/fences.ts`); modify `scripts/e2e/run.ts` (`--scenario stored`). Test: `tests/scripts/e2e-stored_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { findReply, fenceBody, clipboardStubs } from '../../scripts/e2e/stored.ts'; import { REPLY } from '../../scripts/e2e/reply.ts'
const line = (text: string) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
test('A9.stored: the transcript holds the reply byte for byte; /copy gets the exact fence body', () => {
  assert.equal(findReply([line('hi'), line(REPLY)].join('\n'), REPLY), true); assert.equal(findReply(line(REPLY.replace('读取', '读')), REPLY), false)
  assert.equal(fenceBody(REPLY), 'flowchart LR\nA[读取配置文件] -->|成功| B{完成?}\nB --> C([结束])')
  assert.deepEqual(Object.keys(clipboardStubs('linux', '/t/c.txt')).sort(), ['wl-copy', 'xclip', 'xsel'])
  assert.deepEqual([Object.keys(clipboardStubs('darwin', '/t/c.txt')), Object.keys(clipboardStubs('win32', 'C:\\t\\c.txt'))], [['pbcopy'], ['clip.cmd']])
})
```
- [ ] **Run** `node --test tests/scripts/e2e-stored_test.ts` → FAIL: `Cannot find module …/e2e/stored.ts`.
- [ ] **Implement:**
  - **`stored.ts`:**
    - `findReply(jsonl, reply)` is true when some line parses with `message.content` whose text blocks, joined, equal `reply` exactly.
    - `fenceBody(reply)` is the body of the first closed mermaid fence (`splitFences`).
    - `clipboardStubs(platform, out)` returns `{ name: script }`. POSIX stubs are `#!/bin/sh\ncat > '<out>'\n`: `pbcopy` on darwin, and `wl-copy`, `xclip` and `xsel` on linux. On win32, `clip.cmd` is `@powershell -NoProfile -Command "[Console]::In.ReadToEnd() | Set-Content -NoNewline -Encoding utf8 '<out>'"`.
  - **`run.ts --scenario stored`:**
    1. Write the stubs, executable, to `<tmp>/bin`, first on the session PATH.
    2. After the harness reply, require `findReply` over every `$CLAUDE_CONFIG_DIR/projects/**/*.jsonl`.
    3. Type `/copy` and press enter. If a code-block picker appears, choose the entry showing `flowchart LR` (E6).
    4. Within 5 s, the stub's file or the OSC 52 payload (`clipboard()`) must equal `fenceBody(REPLY)`, with one trailing newline allowed.
    5. Print `stored: ran on <os> via <stub|osc52>`, or `stored: not run on <os>: <reason>` when that OS's clipboard command cannot be stubbed (E5).
- [ ] **Done when:** the test passes and `node scripts/e2e/run.ts --scenario stored` passes on the Mac.
- [ ] **Commit:** `git commit -m "Check the stored transcript and /copy in e2e"`

### T37: The installed copy
**Group** P11 · **Deps** T36 · **Covers** A9.release, R4. B owns per-version selection (`scripts/lib/cc-versions.ts`) and runs `run.ts --claude-version V` for each new version.
**Files:** modify `scripts/e2e/env.ts` (`mergeJson`) and `scripts/e2e/run.ts` (`--installed CONFIG_DIR`). Test: append to `tests/scripts/e2e-env_test.ts`.
- [ ] **Failing test:**
```ts
// tests/scripts/e2e-env_test.ts: add mergeJson to the env.ts import
test('A9.release: seeding an installed config adds keys and never drops one', () => {
  const m = JSON.parse(mergeJson('{"theme":"dark","pluginConfigs":{"x":{"options":{}}}}', seedSettings('nord')))
  assert.equal(m.theme, 'dark'); assert.ok(m.pluginConfigs.x && m.pluginConfigs['mermaid-tty'])
})
```
- [ ] **Run** `node --test tests/scripts/e2e-env_test.ts` → FAIL: `does not provide an export named 'mergeJson'`.
- [ ] **Implement:** `mergeJson(existing, seed)` deep-merges objects: the seed wins on a scalar clash, and no existing key is dropped. `run.ts --installed CONFIG_DIR` uses that dir as `CLAUDE_CONFIG_DIR`. B's release.yml has already run `claude plugin marketplace add D0n9X1n/mermaid-tty` and `claude plugin install mermaid-tty@mermaid-tty` there. It merges `seedConfig` into `.claude.json` and `seedSettings(theme)` into `settings.json`, then starts the session without `--plugin-dir`.
- [ ] **Done when:** the test passes, and in B's release job `node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR"` passes.
- [ ] **Commit:** `git commit -m "Run e2e against the installed copy"`

### T38: Check-ID parity and a green gate
**Group** P12 · **Deps** every task · **Covers** B7 binding (§9), the 48 check IDs, the must-pass gate
**Files:** modify `scripts/check.ts`, only when a row is missing. Never edit the acceptance doc.
- [ ] **Failing test:** `node scripts/check-ids.ts` against the amended acceptance doc → FAIL, listing `missing:` or `extra:` IDs until every A and VR ID has its §9 row.
- [ ] **Implement:**
  - Add or rename `CHECKS` rows until `diffIds` is empty. A owns 31 of the 48 IDs (B2's `IDS48`); B checks the other 17 with `check-ci-coverage.ts` against `ci/coverage.json`.
  - A doc ID with no test behind it is reported to the coordinator as a new task; it is never stubbed.
- [ ] **Done when:** `node scripts/check-ids.ts` and `bash scripts/check.sh` exit 0 on the Mac. B's CI then runs the same `check.sh` on ubuntu, macos and windows.
- [ ] **Commit:** `git commit -m "Close check-ID parity; check.sh green"`

### T39: CI type check (PM decision D2)
**Group** P2 · **Deps** T0 · **Covers** PM decision D2 (a CI step; no acceptance ID)
**Files:** create `scripts/typecheck.ts`, `scripts/TS_VERSION`. Test: `tests/scripts/typecheck_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { tsconfigFor } from '../../scripts/typecheck.ts'
test('typecheck (no check ID): core alone; hooks only when the engine types exist', () => {
  const c = tsconfigFor('/r', false), h = tsconfigFor('/r', true)
  assert.deepEqual(c.include, ['/r/core/**/*.ts']); assert.equal(c.compilerOptions.erasableSyntaxOnly, true)
  assert.deepEqual(h.include, ['/r/core/**/*.ts', '/r/hooks/**/*.ts', '/r/hooks/**/*.tsx', '/r/types/**/*.d.ts'])
  assert.deepEqual(h.compilerOptions.typeRoots, ['/r/.claude-plugin/types'])
})
```
- [ ] **Run** `node --test tests/scripts/typecheck_test.ts` → FAIL: `Cannot find module …/scripts/typecheck.ts`.
- [ ] **Implement:**
  - **`tsconfigFor(root, hooks)`:** `compilerOptions` is `{ target: 'es2023', lib: ['es2023'], module: 'esnext', moduleResolution: 'bundler', strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, verbatimModuleSyntax: true, erasableSyntaxOnly: true, types: [] }`. With `hooks` it adds `jsx: 'react'`, `jsxFactory: 'h'`, `jsxFragmentFactory: 'Fragment'`, `typeRoots: [<root>/.claude-plugin/types]` and `types: ['claude-code']`. `include` lists absolute, `/`-separated globs.
  - **CLI:** `hooks = existsSync('.claude-plugin/types/claude-code')`. It writes the config to `<mkdtempSync(join(tmpdir(), 'mtty-tsc-'))>/tsconfig.json`, runs `npx --yes -p typescript@<TS_VERSION> tsc -p <that file>` with `cwd` = that dir (`shell: true` on win32), exits with its status, and removes the dir in `finally`. Nothing is installed in the repo.
  - **`TS_VERSION`:** the exact version `npm view typescript version` prints when the task runs (≥ 5.8, for `erasableSyntaxOnly`). Bumps are deliberate.
- [ ] **Done when:** the test passes, and `node scripts/typecheck.ts` exits 0 on the Mac with and without `.claude-plugin/types/`. B binds a CI step to it (main §9).
- [ ] **Commit:** `git commit -m "Add the pinned-TypeScript CI type check"`
