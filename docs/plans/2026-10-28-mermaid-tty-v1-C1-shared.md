# mermaid-tty v1 C — tasks T40–T48 (gate, source config, glyphs, chart helpers, the C harness)

**Depends on:** the index `…-C-diagram-types.md` (§4 interfaces, §5 shared rules, §7 groups) and A's T12, T19, T20. C2–C6 build on these tasks.
**Conventions:** as in A2, with two additions:
- a test title starts with the acceptance ID it serves (index §2);
- `git commit -m` shows the subject only; every commit ends with A2's trailer.
- In a layout, `heading(title)` is short for `heading(title, 'title', 'title', cols)`, skipped when the title is null.

### T40: Tier gate, `Step`, Tier 1 stubs, registration
**Group** G1 · **Deps** T12, T19 · **Covers** spec C Tiers and Registry, index §9, A5.errors (disabled keywords), B1 (the README table's source)
**Files:**
- **Modify:**
  - `core/registry.ts`;
  - `core/fit.ts` (`Step`);
  - `core/render.ts` (registers `TIER1_MODULES`);
  - `tests/core/fit_test.ts` and `tests/core/render_test.ts`.
- **Create:**
  - `core/diagrams/stub.ts` and `core/diagrams/all.ts`;
  - `core/diagrams/<type>/layout.ts` for each of the 11 Tier 1 types, each holding `export const <name> = stub('<type>')`.
- **Test:** `tests/core/registry-tiers_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readdirSync, readFileSync } from 'node:fs'
import { ENABLED, TIER1, TIER2, TIER2_PASSED, KEYWORDS, lookup, supportTable } from '../../core/registry.ts'
import { explain } from '../../core/render.ts'; import { TIER1_MODULES } from '../../core/diagrams/all.ts'
import { parseRecord } from '../../scripts/check-review-hashes.ts'
const kws = (t: string) => Object.keys(KEYWORDS).filter(k => KEYWORDS[k] === t)
test('A5.errors: ENABLED is A, Tier 1 and the passed Tier 2 types; every other Tier 2 keyword is disabled', () => {
  assert.deepEqual([...ENABLED], ['flowchart', 'sequence', ...TIER1, ...TIER2_PASSED])
  assert.deepEqual([...TIER1].sort(), ['class', 'er', 'gantt', 'gitGraph', 'journey', 'mindmap', 'pie', 'quadrant', 'state', 'timeline', 'xychart'])
  assert.deepEqual([...TIER2].sort(), ['architecture', 'block', 'c4', 'kanban', 'packet', 'radar', 'requirement', 'sankey', 'treemap', 'zenuml'])
  for (const t of TIER2.filter(t => !TIER2_PASSED.includes(t))) for (const k of kws(t)) assert.deepEqual(lookup(k), { reason: `disabled:${t}` }, k)
  assert.deepEqual(explain('radar-beta\naxis A', { columns: 80 }), { reason: 'disabled:radar' })
})
test('A5.errors: a Tier 2 type is enabled only with a vr-C-<type> pass record', () => {
  const passed = readdirSync('docs/reviews').filter(f => f.endsWith('.md')).map(f => parseRecord(f, readFileSync(`docs/reviews/${f}`, 'utf8')))
    .flatMap(r => ('scope' in r && r.verdict === 'pass' ? [r.scope] : []))
  for (const t of TIER2_PASSED) assert.ok(passed.includes(`vr-C-${t}`), t)
  assert.equal(TIER2_PASSED.every(t => ENABLED.has(t)), true)
})
test('A5.errors: every Tier 1 keyword resolves to its registered module', () => {
  assert.equal(TIER1_MODULES.length, 11); assert.ok(TIER1_MODULES.every(m => TIER1.includes(m.type)))
  for (const m of TIER1_MODULES) for (const k of kws(m.type)) assert.equal(lookup(k), m, k)
})
test('B1: supportTable lists each ENABLED type with its header keywords', () => {
  const t = supportTable().split('\n')
  assert.deepEqual(t.slice(0, 4), ['| Type | Header keywords |', '|---|---|', '| `flowchart` | `flowchart`, `graph` |', '| `sequence` | `sequenceDiagram` |'])
  assert.ok(t.includes('| `state` | `stateDiagram`, `stateDiagram-v2` |') && t.includes('| `xychart` | `xychart-beta`, `xychart` |'))
  assert.equal(t.length, 2 + ENABLED.size)
})
```
- [ ] **Run** `node --test tests/core/registry-tiers_test.ts` → FAIL: `SyntaxError: The requested module '../../core/registry.ts' does not provide an export named 'TIER1'`.
- [ ] **Implement:**
  - **`registry.ts`:**
    - `TIER1` and `TIER2` as in index §4, and `TIER2_PASSED = []`.
    - `ENABLED = new Set(['flowchart', 'sequence', ...TIER1, ...TIER2_PASSED])`.
    - `supportTable()` gives the two header rows, then one row per `ENABLED` type, listing its non-null keywords in `KEYWORDS` order.
  - **`fit.ts`:** widen `Step` as in §4.
  - **`stub.ts`:** `stub(type)` returns a module whose `parse` and `layout` fail `unimplemented:<type>` and whose `steps` is `[]`.
  - **Each `<type>/layout.ts`:** exports `state`, `classDiagram`, `er`, `gantt`, `pie`, `xychart`, `quadrant`, `journey`, `mindmap`, `gitGraph` or `timeline` as `stub(…)`. The type's module task replaces the file.
  - **`all.ts`:** imports the 11 modules and exports `TIER1_MODULES: readonly DiagramModule<any>[]`.
  - **`render.ts`:** `for (const m of TIER1_MODULES) register(m)`, next to A's registrations.
  - **A's tests:** A's tests used `pie` as the disabled example, and pie is now Tier 1. Use `radar-beta` (`disabled:radar`) instead:
    - in `fit_test.ts`: lines 15–17, the sweep at 86–87 (a Tier 1 keyword now expects `unregistered:<type>`), and the stubs at 92–116;
    - in `render_test.ts`: the "unsupported types return null" source becomes `radar-beta\naxis A`.

    Their titles keep their IDs.
- [ ] **Done when:** `node --test tests/core/registry-tiers_test.ts tests/core/fit_test.ts tests/core/render_test.ts` passes.
- [ ] **Commit:** `git commit -m "Gate Tier 2 types and register Tier 1 stubs"`

### T41: Source config keys
**Group** G1 · **Deps** — · **Covers** matrix common rule 3 (honored config keys), index §5.1
**Files:**
- **Modify:** `core/source.ts`, and `tests/core/source_test.ts`, where every `Source` literal gains `config: {}`.
- **Test:** `tests/core/source-config_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readSource, type Source } from '../../core/source.ts'
const cfg = (fm: string) => (readSource(`---\n${fm}\n---\ngitGraph\ncommit`) as Source).config
test('A5: frontmatter config scalars become dotted keys; other keys are ignored', () => {
  assert.deepEqual(cfg('title: Log\nconfig:\n  theme: dark\n  gitGraph:\n    mainBranchName: "trunk"\n    mainBranchOrder: 2\ndisplayMode: compact'),
    { theme: 'dark', 'gitGraph.mainBranchName': 'trunk', 'gitGraph.mainBranchOrder': '2' })
  assert.deepEqual(cfg('config:\n  mindmap:\n    colorBy: depth\n  timeline:\n    disableMulticolor: true'),
    { 'mindmap.colorBy': 'depth', 'timeline.disableMulticolor': 'true' })
  assert.deepEqual(cfg('config:\n  pie:\n    textPosition: 0.5\n  themeVariables:\n    - a'), { 'pie.textPosition': '0.5' })
  assert.deepEqual((readSource('pie\n"a" : 1') as Source).config, {})
})
test('A5.errors: a tab in frontmatter indentation falls back', () =>
  assert.deepEqual(readSource('---\nconfig:\n\tmindmap:\n---\nmindmap\nA'), { reason: 'frontmatter' }))
```
- [ ] **Run** `node --test tests/core/source-config_test.ts` → FAIL: `Expected values to be strictly deep-equal` (`config` is `undefined`).
- [ ] **Implement:**
  - **The block:** the unindented line `config:` opens it, and the next unindented line ends it.
  - **Each line** that matches `^( *)([^\s:#-][^:]*):\s*(.*)$`: pop the stack entries whose indent is not less than this line's. With a value, set `config[[...keys, key].join('.')]` to the value with one matching `"`/`'` pair removed, as `title:` does. Without a value, push `[indent, key]`.
  - **Skipped:** a `- ` list line.
  - **Tabs:** a tab in any frontmatter line's leading whitespace fails `frontmatter`, as YAML does.
  - **Default:** `config` is `{}` when there is no frontmatter. The top-level `title:` rule is unchanged.
- [ ] **Done when:** `node --test tests/core/source-config_test.ts tests/core/source_test.ts` passes.
- [ ] **Commit:** `git commit -m "Read frontmatter config keys as dotted paths"`

### T42: C's glyphs
**Group** G1 · **Deps** — · **Covers** matrix common rule 12, A8.platforms
**Files:**
- **Modify:** `core/glyphs.ts`, and `tests/core/glyphs_test.ts`: `RULE_12` adds the 32 glyphs below, and the size becomes 262. Its "named by a section" check passes as is: each glyph appears in the matrix text, as checked when this plan was written.
- **Test:** `tests/core/glyphs-c_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { GLYPHS, isAllowed } from '../../core/glyphs.ts'; import { width } from '../../core/width.ts'
const C = [...'▏▎▍▌▋▊▉█▁▂▃▄▅▆▇✓▸◆■○△□⊗◎·«»↑↓▷◁▽']
test("A8.platforms: C's section glyphs are allowed, one cell wide, and none has the Emoji property", () => {
  assert.equal(C.length, 32)
  for (const g of C) { assert.ok(isAllowed(g), g); assert.equal(width(g), 1, g); assert.ok(!/\p{Emoji}/u.test(g), g) }
  assert.equal(GLYPHS.size, 262)
})
```
- [ ] **Run** `node --test tests/core/glyphs-c_test.ts` → FAIL: `AssertionError [ERR_ASSERTION]: ▏`.
- [ ] **Implement:** add to `GLYPHS`, with a comment per section:
  - the bars `▏▎▍▌▋▊▉█▁▂▃▄▅▆▇` (spec C rule 5);
  - gantt `✓▸◆·`;
  - xychart markers `■○△□`; `●◆▲◇` are already in the set or above;
  - class `▷◁▽` and `△` (triangle ends) and `«»` (annotations);
  - gitGraph `⊗◎`; `■` is already listed;
  - quadrant `↑↓`.
- [ ] **Done when:** `node --test tests/core/glyphs-c_test.ts tests/core/glyphs_test.ts` passes.
- [ ] **Commit:** `git commit -m "Allow the glyphs C's sections name"`

### T43: Exact decimals
**Group** G1 · **Deps** — · **Covers** matrix common rule 8 (exact arithmetic, half up), spec C rule 5 (finite domain)
**Files:** create `core/charts/decimal.ts`. Test: `tests/core/decimal_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseDec, dec, add, sub, mul, div, cmp, floor, ceil, roundHalfUp, toExact, toFixed, type Dec } from '../../core/charts/decimal.ts'
const D = (s: string) => parseDec(s) as Dec
test('A4: decimals parse exactly; malformed numbers are null', () => {
  for (const s of ['1', '-0.34', '+1.3', '.6', '2.4', '0']) assert.notEqual(parseDec(s), null, s)
  for (const s of ['1.', '1e3', 'NaN', '0x10', '', '-', '1.2.3']) assert.equal(parseDec(s), null, s)
  assert.equal(cmp(add(D('0.1'), D('0.2')), D('0.3')), 0); assert.equal(div(D('1'), dec(0)), null)
})
test('A4: rounding is half up; exact and fixed printing', () => {
  assert.deepEqual([roundHalfUp(D('367.5')), roundHalfUp(D('24.5')), roundHalfUp(D('-2.5')), floor(D('-0.5')), ceil(D('2.4'))], [368, 25, -2, -1, 3])
  assert.equal(toExact(D('-.34')), '-0.34'); assert.equal(toExact(div(add(D('-.34'), D('2.4')), dec(2))!), '1.03')
  assert.equal(toExact(sub(D('11000'), D('4000'))), '7000'); assert.equal(toExact(div(dec(1), dec(3))!), null)
  assert.equal(toFixed(mul(div(D('386'), D('486'))!, dec(100)), 1), '79.4')
  assert.deepEqual([toFixed(D('93.75'), 1), toFixed(D('6.25'), 1), toFixed(dec(100), 1)], ['93.8', '6.3', '100.0'])
})
```
- [ ] **Run** `node --test tests/core/decimal_test.ts` → FAIL: `Cannot find module …/core/charts/decimal.ts`.
- [ ] **Implement:**
  - **`Dec`** is `{ n, d }` with `d > 0n`, reduced by its gcd. `dec(i)` is `{ n: BigInt(i), d: 1n }`.
  - **`parseDec`** matches `/^[+-]?(\d+(\.\d+)?|\.\d+)$/`; k digits after the point give `d = 10^k`.
  - **Arithmetic:** `add`, `sub` and `mul` are exact. `div` returns null for a zero divisor. `cmp` cross-multiplies.
  - **Rounding:** `floor` and `ceil` use BigInt division, corrected toward −∞ and +∞. `roundHalfUp(a) = floor(a + ½)`. They return `Number`s, since callers keep them small.
  - **`toExact`** returns null unless `d`'s only prime factors are 2 and 5. Otherwise it prints the shortest decimal, with a leading `0` and a sign.
  - **`toFixed(a, p)`** prints `roundHalfUp(a·10^p)` with `p` decimals.
- [ ] **Done when:** `node --test tests/core/decimal_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add exact decimal arithmetic for chart numbers"`

### T44: Scale and bars
**Group** G2 · **Deps** T42, T43 · **Covers** spec C rule 5 (bars, zero), matrix common rule 8, pie-ok-01 and -03 numbers
**Files:** create `core/charts/scale.ts`, `core/charts/bars.ts`. Test: `tests/core/bars_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { eighths, cellOf, rowAt, percent } from '../../core/charts/scale.ts'; import { hbar, vbar } from '../../core/charts/bars.ts'
import { parseDec, dec, sub, type Dec } from '../../core/charts/decimal.ts'
const D = (s: string) => parseDec(s) as Dec
test('A4: eighths are round(8·v/M·W), half up (pie-ok-01, pie-ok-03)', () => {
  assert.deepEqual(['386', '85', '15'].map(v => eighths(D(v), D('486'), 60)), [381, 84, 15])
  assert.deepEqual(['386', '85', '15'].map(v => eighths(D(v), D('486'), 45)), [286, 63, 11])
  assert.deepEqual(['15', '1'].map(v => eighths(D(v), D('16'), 49)), [368, 25])
})
test('A4: cells floor, unclamped; rows ceil with a floor of 1 (xychart-ok-03); percentages half up', () => {
  assert.deepEqual([cellOf(dec(10), dec(30), 60), cellOf(dec(10), dec(30), 55), cellOf(dec(30), dec(30), 35)], [20, 18, 35])
  const y0 = D('-0.34'), m = sub(D('2.4'), y0)
  assert.deepEqual(['+1.3', '.6', '2.4', '-.34'].map(v => rowAt(sub(D(v), y0), m, 8)), [5, 3, 8, 1])
  assert.deepEqual([percent(D('386'), D('486')), percent(D('1'), D('16')), percent(dec(1), dec(1))], ['79.4%', '6.3%', '100.0%'])
})
test('A4: horizontal and vertical eighth-block runs; zero draws nothing', () => {
  assert.deepEqual([hbar(381), hbar(84), hbar(15), hbar(0)], ['█'.repeat(47) + '▋', '█'.repeat(10) + '▌', '█▉', ''])
  assert.deepEqual(vbar(13, 8), [' ', ' ', ' ', ' ', ' ', ' ', '▅', '█']); assert.deepEqual(vbar(64, 8), Array(8).fill('█'))
})
```
- [ ] **Run** `node --test tests/core/bars_test.ts` → FAIL: `Cannot find module …/core/charts/scale.ts`.
- [ ] **Implement:**
  - **Scale:** `eighths = roundHalfUp(8·w·v/m)`; `cellOf = floor(w·v/m)`; `rowAt = max(1, ceil(h·v/m))`; `percent = toFixed(100·v/total, 1) + '%'`.
  - **`m > 0`** is the caller's duty: each layout fails `domain` before scaling (pie's Σ; gantt and xychart `M = 0`).
  - **`hbar(e)`:** `⌊e/8⌋` × `█`, then `▏▎▍▌▋▊▉`[e mod 8 − 1] when e mod 8 > 0.
  - **`vbar(e, h)`:** from the bottom, `⌊e/8⌋` × `█`, then `▁▂▃▄▅▆▇`[e mod 8 − 1], then blanks up to h cells. It returns the cells top to bottom.
- [ ] **Done when:** `node --test tests/core/bars_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add eighth-cell scales and bar glyph runs"`

### T45: Sheet: `heading` and `stack`
**Group** G1 · **Deps** — · **Covers** matrix common rules 3 and 6 (title and header rows wrap at `columns`), A5.mutation-tests
**Files:** create `core/charts/sheet.ts`. Test: `tests/core/sheet_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { heading, stack } from '../../core/charts/sheet.ts'; import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'; import { text } from './graph-fixture.ts'
const part = (owner: string, s: string): Drawing => { const c = createCanvas(1, 10, 10); c.text(0, 0, s, 'label', owner)
  return c.toDrawing({ labels: [{ owner, text: s }], edges: [], edgeLabels: [] }) }
test('A4: a title wraps at columns; stack keeps the parts in order and validates', () => {
  const h = heading('Release plan for Q3', 'title', 'title', 10) as Drawing
  assert.deepEqual(text(h), ['Release', 'plan for', 'Q3']); assert.ok(h.cells[0]!.every(c => c === null || c.role === 'title'))
  const d = stack([h, part('a', 'x'), part('b', 'y')], 10)
  assert.deepEqual(text(d), ['Release', 'plan for', 'Q3', 'x', 'y']); assert.equal(validate(d), null); assert.equal(d.columns, 10)
  assert.deepEqual(heading('Supercalifragilistic', 'title', 'title', 10), { reason: 'word-too-wide' })
})
test('A5.mutation-tests: one owner drawn in two stacked parts is a duplicate', () =>
  assert.deepEqual(validate(stack([part('a', 'x'), part('a', 'x')], 10)), { reason: 'label-dup' }))
```
- [ ] **Run** `node --test tests/core/sheet_test.ts` → FAIL: `Cannot find module …/core/charts/sheet.ts`.
- [ ] **Implement:**
  - **`heading`:** wrap each `labelLines(text)` line at `columns`; a null wrap fails `word-too-wide`. Draw one row per piece, in `ink`, owned by `owner`.
    - The first piece of the first line has no join. A later piece carries its wrap join, and the first piece of line k > 0 carries `'\n'`.
    - `expect` is `{ labels: [{ owner, text }], edges: [], edgeLabels: [] }`. The `title` role is drawn bold (A's `toRows`).
  - **`stack`:**
    - Concatenate the parts' rows, padding each row with `null` to the widest part.
    - Shift each part's conflicts by its row offset, and concatenate the parts' `labels`, `edges` and `edgeLabels`.
    - `columns` is the argument, so `fitLadder`'s check holds, and `validate` catches an overlong row.
- [ ] **Done when:** `node --test tests/core/sheet_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add chart headings and part stacking"`

### T46: Legend
**Group** G2 · **Deps** T45 · **Covers** matrix common rule 7 (keys, wrapping, all or none), spec C rules 4 and 6, A5.mutation-tests
**Files:** create `core/charts/legend.ts`. Test: `tests/core/legend_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { fieldKey, pointKey, legendRows, type LegendRow } from '../../core/charts/legend.ts'
import { validate } from '../../core/validate.ts'; import type { Drawing } from '../../core/canvas.ts'; import { text } from './graph-fixture.ts'
const row = (key: string, owner: string, s: string): LegendRow => ({ key, keyInk: 'label', owner, parts: [{ text: s, ink: 'value', owner }] })
test('A4: field keys a…z, aa…; point keys 1…; a row wraps under its text', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(fieldKey), ['a', 'z', 'aa', 'ab', 'zz', 'aaa']); assert.deepEqual([0, 9, 11].map(pointKey), ['1', '10', '12'])
  const d = legendRows([row('a', 't1.t:legend', '2024-01-01 · 10d'), row('aa', 't2.t:legend', 'one two')], 16) as Drawing
  assert.deepEqual(text(d), ['a 2024-01-01 ·', '  10d', 'aa one two']); assert.equal(validate(d), null)
  assert.equal(d.cells[0]![0]!.kind, 'cap'); assert.equal(d.cells[0]![2]!.kind, 'text')
  assert.deepEqual(legendRows([row('a', 'x', 'Supercalifragilistic')], 16), { reason: 'word-too-wide' })
})
test('A5.mutation-tests: a legend owner drawn in two rows is a duplicate', () =>
  assert.deepEqual(validate(legendRows([row('a', 'n1:legend', 'memo'), row('b', 'n1:legend', 'memo')], 20) as Drawing), { reason: 'label-dup' }))
```
- [ ] **Run** `node --test tests/core/legend_test.ts` → FAIL: `Cannot find module …/core/charts/legend.ts`.
- [ ] **Implement:**
  - **Keys:** `fieldKey(i)` is bijective base 26: `i < 26 ? letter(i) : fieldKey(⌊i/26⌋ − 1) + letter(i mod 26)`. `pointKey(i)` is `String(i + 1)`.
  - **`legendRows`**, for each row:
    - Draw the key as caps in `keyInk`, owned by `row.owner`. The text starts at `start = width(key) + 1`.
    - The parts' words pack greedily into `columns − start` cells, with one space between parts. Continuation rows indent to `start`.
    - A word wider than the field fails `word-too-wide`.
    - Each part's first piece has no join, so it starts its own instance; a continuation carries its wrap join.
    - An `owner: null` part is drawn as caps.
    - `expect` lists one `{ owner, text }` per owned part of each row.
  - **`withLegend(d, rows, columns)`:** `rows.length ? stack([d, legendRows(…)], columns) : d`, passing a Fail through.
- [ ] **Done when:** `node --test tests/core/legend_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add field and point keys and wrapped legend rows"`

### T47: Axis
**Group** G1 · **Deps** — · **Covers** gantt and horizontal xychart axes (matrix), spec C rule 6 (nothing collides)
**Files:** create `core/charts/axis.ts`. Test: `tests/core/axis_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { axisRows } from '../../core/charts/axis.ts'; import { validate } from '../../core/validate.ts'; import { text } from './graph-fixture.ts'
const rule = (left: number, w: number, at: number[]) => ' '.repeat(left) + [...Array(w)].map((_, i) => (at.includes(i) ? '┬' : '─')).join('')
const L = (cell: number, label: string, align: 'left' | 'right' = 'left') => ({ cell, label, align })
test('A4: ticks sit at their cells; a label that leaves the field, or meets the previous one, drops with its tick', () => {
  const g = axisRows(25, 30, [L(0, '2024-01-01'), L(14, '2024-01-15'), L(28, '2024-01-29')], 55, 'axis')
  assert.deepEqual(text(g), [rule(25, 30, [0, 14]), ' '.repeat(25) + '2024-01-01    2024-01-15']); assert.equal(validate(g), null)
  assert.deepEqual(text(axisRows(6, 10, [L(0, '0'), L(9, '100', 'right')], 40, 'axis')), [rule(6, 10, [0, 9]), ' '.repeat(6) + '0      100'])
  assert.deepEqual(text(axisRows(0, 20, [L(0, '08:00'), L(3, '09:00'), L(6, '10:00')], 20, 'axis')), [rule(0, 20, [0, 6]), '08:00 10:00'])
})
```
- [ ] **Run** `node --test tests/core/axis_test.ts` → FAIL: `Cannot find module …/core/charts/axis.ts`.
- [ ] **Implement:**
  - **Which ticks stay**, in order: a left label spans `[cell, cell + width − 1]` and a right label `[cell − width + 1, cell]`. A tick stays when its span lies in `[0, w − 1]` and starts at least 2 cells after the last kept label's end.
  - **Row 0:** `─` caps from `left` to `left + w − 1`, with `┬` at each kept tick, in the `frame` role, owned by `owner`.
  - **Row 1:** each kept label as text in the `value` role, owned by `${owner}.t<i>`, where i is the tick's input index.
  - **Expect:** `labels` lists the kept labels. The drawing is `columns` wide.
- [ ] **Done when:** `node --test tests/core/axis_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the chart tick rule and its labels"`

### T48: C golden harness
**Group** G2 · **Deps** T20, T40, T42 · **Covers** spec C Test strategy (fixtures at 60/80/120, rejections, fit −1/0/+1, no border-only rows), matrix common rule 11, A4, A4.fit-ladder, A5.errors, A3
**Files:**
- **Create:** `tests/golden/c-lib.ts` (index §4) and `tests/golden/c-golden_test.ts`.
- **Modify:**
  - `tests/golden/golden-lib.ts`: export `roleCode(cell)`, adding `V` for a `value` text cell and `v` for any other `value` cell;
  - `docs/reviews/required.json`: `vr-A` becomes `["goldens/flowchart/**", "goldens/sequence/**", "core/themes.ts"]`, so C's goldens never reopen A's review.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'; import { explain } from '../../core/render.ts'; import { createCanvas } from '../../core/canvas.ts'
import { goldenOf, widest, roleCode } from './golden-lib.ts'; import { TIER1_DIRS, expectLines, fx, borderRows, coverageOf } from './c-lib.ts'
const W = [60, 80, 120], X = (s: string, w: number) => explain(s, { columns: w, theme: 'mono' }) as any
for (const type of TIER1_DIRS) for (const f of existsSync(`fixtures/${type}`) ? readdirSync(`fixtures/${type}`).sort() : []) {
  const id = f.replace(/\.mmd$/, ''), src = fx(id), lines = expectLines(src)
  if (id.includes('-reject-')) test(`A5.errors: ${id} falls back`, () => {
    for (const e of lines.length ? lines : W.map(cols => ({ cols, step: 'fallback' as const }))) {
      const r = X(src, e.cols); if (e.step === 'fallback') assert.ok('reason' in r, `${id}@${e.cols}`); else assert.equal(r.step, e.step, `${id}@${e.cols}`) }
  })
  else {
    test(`A4: ${id} renders, validates and matches its golden at 60/80/120, with no border-only rows`, () => {
      const g = goldenOf(W.map(w => { const r = X(src, w); assert.ok(!('reason' in r), `${id}@${w} ${r.reason}`)
        assert.deepEqual(borderRows(r.drawing), [], `${id}@${w}`); return [w, r.drawing] as const }))
      const p = join('goldens', type, `${id}.golden`)
      if (process.env.UPDATE_GOLDEN === '1') { mkdirSync(join('goldens', type), { recursive: true }); writeFileSync(p, g) }
      assert.equal(g, readFileSync(p, 'utf8'))
    })
    if (lines.length) test(`A4.fit-ladder: ${id} takes its expected step at each width`, () => {
      for (const e of lines) { const r = X(src, e.cols)
        if (e.step === 'fallback') { assert.ok('reason' in r, `${id}@${e.cols}`); continue }
        assert.equal(r.step, e.step, `${id}@${e.cols}`); if (e.widest !== undefined) assert.equal(widest(r.drawing), e.widest, `${id}@${e.cols}`) }
    })
  }
}
test('A4.fit-ladder: expect lines parse', () => assert.deepEqual(expectLines('pie\n%% expect 60 natural widest 60\n%% expect 59 wrap\n%% expect 58 fallback\n"a" : 1'),
  [{ cols: 60, step: 'natural', widest: 60 }, { cols: 59, step: 'wrap' }, { cols: 58, step: 'fallback' }]))
test('A3: borderRows flags an item row with caps and no text; glyph-only owners pass', () => {
  const c = createCanvas(2, 6, 6); c.cap(0, 0, '[', 'node', 'A'); c.text(0, 2, 'x', 'node', 'A'); c.cap(1, 0, '[', 'node', 'A'); c.cap(1, 3, '●', 'node', 'S')
  assert.deepEqual(borderRows(c.toDrawing({ labels: [{ owner: 'A', text: 'x' }], edges: [], edgeLabels: [] })), ['A@1'])
})
test('A5: coverageOf finds cited-but-missing and ok-but-uncited fixtures', () =>
  assert.deepEqual(coverageOf('## Coverage\n| pie | x | pie-ok-01, pie-reject-09 |', 'pie', ['pie-ok-01', 'pie-ok-02', 'pie-reject-01']), ['missing pie-reject-09', 'uncited pie-ok-02']))
test("VR.reviewers: vr-A covers only A's goldens and the themes", () => assert.deepEqual(JSON.parse(readFileSync('docs/reviews/required.json', 'utf8'))['vr-A'],
  ['goldens/flowchart/**', 'goldens/sequence/**', 'core/themes.ts']))
test('A4: a value cell has role code V (text) or v (drawn)', () => assert.deepEqual([roleCode({ ch: '1', role: 'value', kind: 'text', owners: ['x'], dirs: 0 }),
  roleCode({ ch: '┬', role: 'value', kind: 'cap', owners: ['x'], dirs: 0 })], ['V', 'v']))
```
- [ ] **Run** `node --test tests/golden/c-golden_test.ts` → FAIL: `Cannot find module …/tests/golden/c-lib.ts`.
- [ ] **Implement `c-lib.ts`:**
  - **`TIER1_DIRS`:** the 11 fixture folders; each is also its Coverage type name.
  - **`expectLines`** reads `^%% expect (\d+) (\w+)(?: widest (\d+))?$`, omitting `widest` when it is absent.
  - **`fx(id)`** reads `fixtures/<id less -(ok|reject)-NN>/<id>.mmd`.
  - **`borderRows(d)`:** for each owner named in any text or `cont` cell's owners, every row holding that owner's `cap` or `fill` cell must hold one of its text cells. Owners with no text, such as marks, bars, connectors and `pt:` keys, pass.
  - **`coverageOf`:** the ids cited on `| <type> |` rows after `## Coverage`. It returns `missing <id>` for each cited id not in `fixtures`, then `uncited <id>` for each `-ok-` fixture that is never cited, each sorted.
  - **`spanOf`:** the first span whose text matches.
  - **`hrun` and `vrun`:** sum the eighths of consecutive `▏…█` caps rightward from `(row, col)`, or of `▁…█` caps upward from row `base − 1`.
- [ ] **Done when:** `node --test tests/golden/c-golden_test.ts tests/golden/golden_test.ts` passes. With no C fixtures yet, only the self-tests run, and A's goldens are unchanged.
- [ ] **Commit:** `git commit -m "Add the C golden harness and narrow vr-A to A's goldens"`

**Every fixture task (T56–T84)** follows the same pattern:
- Add its `.mmd` files, with `%% expect` lines on the ladder and boundary fixtures.
- Run `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts`, then read every new golden at 60/80/120, against the tangle rules and the matrix's text design.
- Add `tests/golden/<type>_test.ts` with its coverage, numbers and spans tests.
