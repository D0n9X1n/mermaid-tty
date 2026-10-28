# mermaid-tty v1 A — tasks T22–T32 (command, sequence, gates, corpus, visual review)

**Depends on:** the main plan (§3 platforms, §6, §9 check commands, §10 review record, §13–§14) and A2–A3 (T0–T21). A5 (T33–T39) depends on T22–T32 here.
**Conventions:** as in A2.
**Stable names (plan B depends on them):** `scripts/e2e/run.ts` with `--installed CONFIG_DIR` and `--claude-version V`; `scripts/e2e/package-lock.json`; `scripts/render-gallery.ts OUT_DIR`; `scripts/check-review-hashes.ts` with the §10 record; the `Palette` type in `core/themes.ts`.

### T22: `/mermaid-tty source|diagram`
**Group** P8 · **Deps** T21 (F10 spike code) · **Covers** A6.command, R6 (source view in `$.state`)
**Files:** create `tests/hooks/command.test.tsx`; modify `hooks/mode.ts`, `hooks/register.tsx`, `tests/hooks/mode_test.ts`. T0 already created `types/mermaid-tty.d.ts` and set plugin.json's `"types"`.
- [ ] **Failing tests:**
```tsx
// mode_test.ts (append)
test('A6.command: arguments and replies', () => {
  assert.deepEqual(parseModeArgs(' source '), { set: 'source' }); assert.deepEqual(parseModeArgs(''), { report: true }); assert.ok('error' in parseModeArgs('svg'))
  assert.equal(modeReply('source', true), 'mermaid-tty: showing diagrams as source'); assert.equal(modeReply('diagram', false), 'mermaid-tty mode: diagram')
})
// command.test.tsx — $.command.run takes CommandRunArgs { command, args } (types :1817)
import { test, expect } from 'claude-code/testing'
const FC = '```mermaid\nflowchart TD\nA --> B\n```\n', RUN = ($: any, args: string) => $.command.run({ command: 'mermaid-tty', args })
test('A6.command: source passes replies through; diagram draws again; bare reports', async ($, on) => {
  const logs: string[] = []; on('ui.log', async (_$: any, e: any) => { logs.push(e.text); return { value: undefined } })
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => { const { Text } = $.ui.resolve(e); return <Text>{e.props.text}</Text> })
  const ui = await $.ui.mount({ plugin: 'mermaid-tty', surface: 'terminal', component: 'AssistantMessage', props: { text: FC, isFirstOfReply: true }, viewport: { columns: 80, rows: 24 } })
  expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
  await RUN($, 'source'); expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined(); expect(await ui.find({ type: 'Text', text: 'flowchart TD' })).toBeDefined()
  expect(JSON.stringify([await RUN($, ''), logs])).toContain('mode: source')
  await RUN($, 'diagram'); expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
})
```
- [ ] **Run** `node --test tests/hooks/mode_test.ts` → FAIL: `parseModeArgs is not a function`.
- [ ] **Implement:**
  - **`mode.ts`:** `parseModeArgs(a)`. A trimmed `''` gives `{ report: true }`; `source` or `diagram` gives `{ set }`; anything else gives `{ error: 'usage: /mermaid-tty [source|diagram]' }`. `modeReply(m, changed)` returns, when changed, `mermaid-tty: showing diagrams as source` or `mermaid-tty: drawing diagrams`; otherwise `mermaid-tty mode: ${m}`.
  - **`types/mermaid-tty.d.ts`** (from T0) stays `PluginState['mermaid-tty']: { source: boolean }`, or S6's fallback key `mermaidTty` if T0 needed it.
  - **`register.tsx`:** the F10 spike code, renamed (`source: true` shows the source):
```tsx
  const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const, mode = async ($: any): Promise<Mode> => ((await $.state.get(SOURCE)).value === true ? 'source' : 'diagram')
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mermaid-tty', description: 'Show Mermaid diagrams as source or diagram: /mermaid-tty [source|diagram]' })
    return next(e)
  })
  on('command.run', { command: 'mermaid-tty' }, async ($, e) => {
    const a = parseModeArgs(String(e.args ?? '')), cur = await mode($)
    if ('error' in a) return { text: a.error }
    if ('report' in a) return { text: modeReply(cur, false) }
    await $.state.set(SOURCE, a.set === 'source'); $.ui.invalidate('ui.render'); return { text: modeReply(a.set, a.set !== cur) }
  })
```
- [ ] **Done when:**
  - `node --test tests/hooks/mode_test.ts` and `claude plugin test .` pass.
  - `claude plugin validate .` reports `declares state: …`.
- [ ] **Commit:** `git commit -m "Add /mermaid-tty source|diagram, kept in \$.state"`

### T23: Sequence parse
**Group** P3 · **Deps** T7, T9 · **Covers** A2, sequence-ok-01…25, -30…37, -39 (`title`), sequence-reject-01, -02, -03, -05, -06, -07, -08
**Files:** create `core/diagrams/sequence/parse.ts` (`parseSequence(src): Seq | Fail`; `Seq` = `{ title, participants: {id, kind, label}[], boxes: {label, ids}[], autonumber: {start, step} | null, items: Item[] }`, where an `Item` is a `msg` `{from, to, line, tail, head, text, activate, deactivate}`, a `note` `{side, ids, text}`, a `frame` `{type, sections: {cond, items}[]}`, or a `create`/`destroy`/`activate`/`deactivate` with an `id`). Test: `tests/core/sequence-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
const P = (t: string) => parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any
test('A2: participants, actors and aliases keep declaration order', () => assert.deepEqual(
  P('participant B\nactor A as Alice\nB->>C: hi').participants.map((p: any) => [p.id, p.kind, p.label]),
  [['B', 'participant', 'B'], ['A', 'actor', 'Alice'], ['C', 'participant', 'C']]))
test('A2: ten arrows; activations, notes, frames, autonumber, create, destroy', () => {
  const A = ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)', '<<->>', '<<-->>']
  assert.deepEqual(A.map(a => { const m = P(`A${a}B: t`).items[0]; return `${m.line} ${m.tail} ${m.head}` }), ['solid none arrow', 'dotted none arrow',
    'solid none open', 'dotted none open', 'solid none cross', 'dotted none cross', 'solid none async', 'dotted none async', 'solid arrow arrow', 'dotted arrow arrow'])
  const s = P('autonumber 10 5\nA->>+B: x\nB-->>-A: y\nNote over A,B: n\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend\ncreate participant C\nA->>C: c\ndestroy C\nA-xC: bye')
  assert.deepEqual([s.autonumber, s.items.map((i: any) => i.kind)], [{ start: 10, step: 5 }, ['msg', 'msg', 'note', 'frame', 'create', 'msg', 'destroy', 'msg']])
  assert.deepEqual([s.items[0].activate, s.items[1].deactivate, s.items[3].sections.map((x: any) => x.cond)], [true, true, ['ok', 'no']]); assert.equal(P('title Checkout\nA->>B: x').title, 'Checkout')
})
test('A5.errors: malformed, order, box and ZWJ rejections', () => {
  assert.match((parseSequence(readSource('---\ntitle: A\n---\nsequenceDiagram\ntitle B\nA->>B: x') as Source) as any).reason, /^title/)  // frontmatter title + statement
  for (const [t, r] of [['A->>: hi', /^syntax:2/], ['loop x\nA->>B: y', /^unclosed-frame/], ['create participant C\nA->>B: x', /^create/],
    ['destroy B\nA-xB: bye\nA->>B: again', /^destroyed/], ['A->>C: hi\nbox G\nparticipant A\nparticipant B\nend', /^box-split/],
    ['title A\ntitle B\nA->>B: x', /^title/],
    ['A->>B: 👨‍👩', /^unsupported-char/]] as const) assert.match(P(t).reason, r, t)
})
```
- [ ] **Run** `node --test tests/core/sequence-parse_test.ts` → FAIL: `Cannot find module …/sequence/parse.ts`.
- [ ] **Implement** (keywords are case-sensitive; ids match `[\p{L}\p{N}_.]+`):
  - **Participants:** `participant|actor ID( as LABEL)?`. Participants are implicit on first mention; columns follow declaration order.
  - **Messages:** `ID ARROW [+-]?ID: text`. ARROW is tried longest first: `<<-->>`, `<<->>`, `-->>`, `->>`, `--x`, `-x`, `--)`, `-)`, `-->`, `->`. `+` activates the target; `-` deactivates the sender.
  - **Frames:**
    - `alt|opt|loop|par|critical|break [cond]` pushes a frame. `else`, `and` and `option` add a section to the matching top frame (`alt`, `par`, `critical`).
    - `rect <color>` pushes an untitled frame.
    - `box [color] [label]` holds only `participant` and `actor` lines. A leading CSS color is dropped from the label: one of the 148 CSS names, `transparent`, `#hex`, `rgb()`/`rgba()` or `hsl()`/`hsla()`.
    - `end` pops. An unpopped frame fails `unclosed-frame`.
  - **Other statements:**
    - `Note (left of|right of|over) A[,B]: text`.
    - `autonumber [start [step]]`, defaulting to 1 1.
    - `activate X` and `deactivate X`.
    - `title <text>` sets `Seq.title`; a second title, or one after a frontmatter title, fails `title`. `accTitle` and `accDescr` are ignored; anything else, including `link` and half arrows, fails `syntax:<n>`.
  - **Order rules:**
    - After `create … X`, the next message must target X, else fail `create`.
    - After `destroy X`, the next message must have X at one end, else `destroy`; any later mention of X fails `destroyed`.
    - Box members must be contiguous in column order, else `box-split`.
    - Labels go through `labelLines` and `unsupported()`.
- [ ] **Done when:** `node --test tests/core/sequence-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse the sequence subset with order and box rules"`

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
| reject-08 | frontmatter `title: A`, then `sequenceDiagram`, `title B`, `A->>B: x` (a frontmatter title plus a `title` statement) |

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
  for (const s of ["import x from 'node:fs'", "import y from 'lodash'", 'process.env.X', 'const t = `a ${process.env.X} b`', "require('a')", 'Buffer.from(s)', 'window.x',
    'document.x', 'eval(s)', 'new Function(s)', "await import('./a.ts')", "import { w } from './width'"]) assert.notDeepEqual(scanSource(s), [], s)
  for (const s of ["import type { Register } from 'claude-code'", "import { width } from './width.ts'", '// process.env', "const s = 'require(x)'", 'const t = `process.env is ${n} here`'])
    assert.deepEqual(scanSource(s), [], s)
  assert.deepEqual(scanRepo('.'), [])
})
test('A8.platforms: .gitattributes keeps text files LF', () => assert.match(readFileSync('.gitattributes', 'utf8'), /^\* text=auto eol=lf$/m))
```
- [ ] **Run** `node --test tests/scripts/portable_test.ts` → FAIL: `Cannot find module …/check-portable.ts`.
- [ ] **Implement:**
  - **`scanSource(code)`:** blank out comments, the contents of string literals and the literal text of template literals. Keep the code inside each `${…}` (tracking brace depth, so `${process.env.X}` is still scanned) and the specifiers of `import … from '…'` and `import '…'`. Then flag:
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
**Files:** create `scripts/check-review-hashes.ts` and `docs/reviews/required.json`. Test: `tests/scripts/review-hashes_test.ts`.
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
test('VR.passes: every required scope needs a passing record for each of its paths', () =>
  assert.deepEqual(requirePass([parseRecord('x.md', REC) as any], { 'vr-A': ['goldens/a.golden', 'core/themes.ts'], beauty: ['README.md'] }), ['vr-A: core/themes.ts', 'beauty: README.md']))
```
- [ ] **Run** `node --test tests/scripts/review-hashes_test.ts` → FAIL: `Cannot find module …/check-review-hashes.ts`.
- [ ] **Implement:**
  - **`parseRecord(path, text)`:** the front matter between the `---` lines has exactly the keys `scope` (a slug: `vr-A`, `vr-C-<type>`, `beauty`, `translation`, …), `verdict` (`pass` or `fail`), `date` (`YYYY-MM-DD`) and `reviewers` (`[…]`). The `## Files` table rows are `| path | 64 lowercase hex |`. It returns `{ path, scope, verdict, date, reviewers, files }`, or `{ error }`.
  - **`checkRecords(records, read)`:** `read(p)` returns the bytes or `null`. For each file it reports `<path>: missing`, or `<path>: recorded <a> actual <b>` when the SHA-256 of the raw bytes differs (`.gitattributes` keeps them LF on every OS).
  - **`requirePass(records, required)`:** `required` maps a scope to its paths. It returns `<scope>: <path>` for every path that no record of that scope with `verdict: pass` lists.
  - **CLI:**
    - It parses every `docs/reviews/*.md`; with no folder or no records, integrity passes vacuously.
    - `--require-pass` reads `docs/reviews/required.json` (scope → path globs; A seeds `{"vr-A": ["goldens/**", "core/themes.ts"]}`, and B adds `beauty` and `translation`) and fails on every `requirePass` result. CI always passes this flag (PM, 2026-10-28), so CI stays red until each verdict is recorded: the merge gate.
    - `--table <paths…>` prints Files rows, walking directories.
    - It exits 1 on any problem or parse error.
- [ ] **Done when:** the test passes; `node scripts/check-review-hashes.ts` exits 0; and `node scripts/check-review-hashes.ts --require-pass` exits 1, listing `vr-A: …`, until the PM records the verdict (the merge gate).
- [ ] **Commit:** `git commit -m "Add the review verdict hash check"`
