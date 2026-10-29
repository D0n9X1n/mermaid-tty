# mermaid-tty v1 C — tasks T63–T70 (pie, journey, gantt)

**Depends on:** the index (§4, §5), C1 (T40, T43–T48). Charts draw their parts on their own canvases and join them with `stack` (index §6). Owners follow index §5: an item `<k>`, its value `.v`, its percentage `.p`, its timing `.t`.
**Conventions:** as in C1. A layout test renders through `explain` under mono and reads rows with `text()`. `bar(e, w)` is `hbar(e)` padded to `w` cells, written out in each test so the expected rows are literal.

### T63: Pie parse and module
**Group** G3 · **Deps** T40, T44, T45, T86 · **Covers** matrix pie (subset, text design, numbers, ladder), spec C rules 5 and 7 (pie sorts by value), pie-reject-01…05
**Files:** create `core/diagrams/pie/parse.ts` (`Pie = { title: string | null; slices: { label, raw, value: Dec, order }[] }`); replace T40's stub in `core/diagrams/pie/layout.ts` (export `pie`). Test: `tests/core/pie-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (src: string, columns: number) => explain(src, { columns, theme: 'mono' }) as any
const bar = (e: number, w: number) => ('█'.repeat(Math.floor(e / 8)) + (e % 8 ? '▏▎▍▌▋▊▉'[e % 8 - 1] : '')).padEnd(w)
test('A4: label, bar, value, percentage; sorted by value, largest first; bars are round(8·v/Σv·W) eighths', () => {
  const r = X('pie title Pets adopted by volunteers\n"Rats" : 15\n"Dogs" : 386\n"Cats" : 85', 80); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), ['Pets adopted by volunteers', `Dogs ${bar(381, 60)} 386 79.4%`, `Cats ${bar(84, 60)}  85 17.5%`, `Rats ${bar(15, 60)}  15  3.1%`])
  assert.deepEqual(text(X('pie\n"A" : 15\n"B" : 1', 60).drawing), [`A ${bar(368, 49)} 15 93.8%`, `B ${bar(25, 49)}  1  6.3%`])
})
test('A4.fit-ladder: natural while W ≥ 10; then W = 10 with wrapped labels; then fallback', () => {
  const S = 'pie\n"Dogs and cats" : 3\n"Rats" : 1'
  assert.deepEqual([32, 31, 23, 22].map(c => X(S, c).step ?? 'fallback'), ['natural', 'wrap', 'wrap', 'fallback'])
  assert.deepEqual(text(X(S, 31).drawing), [`Dogs and ${bar(60, 10)} 3 75.0%`, 'cats', `Rats     ${bar(20, 10)} 1 25.0%`])
})
test('A5: showData and a title on the header line; single-quoted labels; decimal values', () => {
  const t = text(X("pie showData title Fruit\n'Apples' : 2.5\n\"Pears\" : 1.25", 80).drawing)
  assert.equal(t[0], 'Fruit'); assert.match(t[1]!, /^Apples .* 2\.5 66\.7%$/); assert.match(t[2]!, /^Pears  .* 1\.25 33\.3%$/)
})
test('A5.errors: zero, negative, repeated, unquoted, backslash and empty pies fall back', () => {
  for (const [src, why] of [['pie\n"Dogs" : 0', 'domain:2'], ['pie\n"Dogs" : -5', 'domain:2'], ['pie\n"Dogs" : 1\n"Dogs" : 2', 'repeat:3'],
    ['pie\nDogs : 386', 'syntax:2'], ['pie\n"a\\b" : 1', 'syntax:2'], ['pie title Empty', 'empty']] as const) assert.deepEqual(X(src, 80), { reason: why }, src)
})
```
- [ ] **Run** `node --test tests/core/pie-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Parse:**
    - The header is `^pie( showData)?( title (.+))?$`. A statement is `title <text>`, or `"<label>" : <value>` / `'<label>' : <value>`.
    - A value token is `[+-]?\d+(\.\d+)?`. One that is not positive and in the matrix's form (`[1-9][0-9]*` or `[0-9]+\.[0-9]+`) fails `domain:<n>`; any other token fails `syntax:<n>`.
    - A repeated label fails `repeat:<n>`, and a backslash in a label `syntax:<n>`. A second title (header, statement or frontmatter) fails `repeat:<n>`; no slices fails `empty`.
    - `accTitle` and `accDescr` are ignored, as is pie config.
  - **Layout** (index §5 ladder):
    - **Rows:** `heading(title, 'title', 'title', cols)`, then one row per slice. Slices sort by value, descending; ties keep source order.
    - **A row:** the label (role `label`, owner `s<k>`) padded to N; the `hbar(eighths(v, Σv, W))` caps (ink `s<(k mod 8) + 1>` for source index k, owner `s<k>`); the value as written, right-aligned to V (role `value`, owner `s<k>.v`); and `percent(v, Σv)`, right-aligned to P (owner `s<k>.p`).
    - **Contract (T86):** `expect.bars` lists `{ owner: 's<k>', eighths, axis: 'h' }` for every slice, so a wrong or partial bar fails `validate`.
    - **`natural`:** `W = min(60, cols − N − V − P − 3)`; it fails `too-wide` below 10.
    - **`wrap`:** W = 10, and labels wrap to `cols − V − P − 13`. N is then the widest wrapped piece, and the bar sits on the label's first row.
- [ ] **Done when:** `node --test tests/core/pie-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse and draw pie charts as sorted bars"`

### T64: Pie fixtures and goldens
**Group** G4 · **Deps** T48, T63 · **Covers** every pie-ok and pie-reject fixture, and their numbers; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/pie/pie-{ok-01…10,reject-01…06}.mmd` and `goldens/pie/*.golden`. Test: `tests/golden/pie_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, hrun, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/pie').map(f => f.replace('.mmd', ''))
const bars = (id: string, w: number, n: number) => { const d = (explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing
  return d.cells.map((_: unknown, r: number) => hrun(d, r, n + 1)).filter((e: number) => e > 0) }   // the field starts after the N-cell label and a space
test('A5: every pie coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'pie', ids), []))
test('A4: the matrix bar eighths of pie-ok-01, -02 and -03', () => {
  assert.deepEqual([120, 80, 60].map(w => bars('pie-ok-01', w, 4)), [[381, 84, 15], [381, 84, 15], [286, 63, 11]])
  assert.deepEqual([120, 80].map(w => bars('pie-ok-02', w, 9)), [[222, 191, 44, 22], [215, 185, 43, 21]])
  assert.deepEqual([120, 80, 60].map(w => bars('pie-ok-03', w, 1)), [[450, 30], [450, 30], [368, 25]])
})
test('A7: bars take series colors by source order, so sorting keeps them; values carry the value role', () => {
  const r = renderMermaid(fx('pie-ok-02'), { columns: 80, theme: 'nord' })!, n = THEMES.nord, barOf = (i: number) => r[i]!.find(x => x.text.startsWith('█'))?.color
  assert.deepEqual([barOf(1), barOf(2)], [n.series.s2, n.series.s1]); assert.equal(spanOf(r, /^50\.05$/)?.color, n.roles.value)
})
```
- [ ] **Run** `node --test tests/golden/pie_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/pie'`.
- [ ] **Fixtures** (docs examples are copied from `pie.md` at `1fb78698`; expect lines go after any frontmatter):

| IDs | Content |
|---|---|
| ok-01, -02 | the docs Pets example: `pie title Pets adopted by volunteers`, `"Dogs" : 386`, `"Cats" : 85`, `"Rats" : 15`; the docs `showData` example as frontmatter `config:` (`pie: textPosition: 0.5`, `themeVariables: pieOuterStrokeWidth: "5px"`), then `pie showData`, `title Key elements in Product X`, `"Calcium" : 42.96`, `"Potassium" : 50.05`, `"Magnesium" : 10.01`, `"Iron" :  5` |
| ok-03, -04 | `pie`, `"A" : 15`, `"B" : 1`; `pie`, `'Apples' : 2.5`, `"Pears" : 2.5`, `"Plums" : 0.75` (equal values keep source order) |
| ok-05, -06 | `pie showData title Snacks`, `%% a comment`, `"Chips" : 3`, `"Nuts" : 1`; `pie`, `title Solo`, `"Only" : 7` (one slice fills the field: 100.0%) |
| ok-07 | `pie title 宠物`, `"狗" : 386`, `"猫" : 85`, `"鼠" : 15` |
| ok-08 | `%% expect 60 natural widest 60`, `%% expect 59 wrap`, `pie`, a 41-cell label of several words `: 1`, `"b" : 1` (N + W + V + P + 3 = 41 + 10 + 1 + 5 + 3) |
| ok-09, -10 | `%% expect 60 wrap`, `pie`, a 52-cell label of several words `: 1`, `"b" : 1`; ok-01's body plus `accTitle: Pets` |
| reject-01…03 | `pie`, `"Dogs" : 0`; `pie`, `"Dogs" : -5`; `pie`, `"Dogs" : 386`, `"Dogs" : 85` |
| reject-04…06 | `pie`, `Dogs : 386`; `pie title Empty` (no slices); `%% expect 60 fallback`, `%% expect 120 natural`, `pie`, a one-word 50-letter label `: 1` |
| reject-07 | `pie`, `"a\b" : 1` (a backslash in a label) |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/pie/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/pie_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add pie fixtures and goldens"`

### T65: Journey parse and module
**Group** G3 · **Deps** T40, T44, T45, T86 · **Covers** matrix journey (subset, text design, numbers, ladder), journey-reject-01…07
**Files:** create `core/diagrams/journey/parse.ts` (`Journey = { title, groups: { name: string | null; tasks: { name, score: Dec, raw, actors: string[] }[] }[] }`); replace T40's stub in `core/diagrams/journey/layout.ts` (export `journey`). Test: `tests/core/journey-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (src: string, columns: number) => explain(src, { columns, theme: 'mono' }) as any
const DAY = 'journey\ntitle My working day\nsection Go to work\nMake tea: 5: Me\nGo upstairs: 3: Me\nDo work: 1: Me, Cat'
test('A4: the matrix sketch: a 10-cell bar of round(16·s) eighths, the score, two spaces, the actors', () => {
  const r = X(DAY, 80); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), ['My working day', 'Go to work', '  Make tea    ██████████ 5  Me', '  Go upstairs ██████     3  Me', '  Do work     ██         1  Me, Cat'])
  const t = text(X('journey\nsection S\nA: 2.5: Me\nB: 4.75: Me', 80).drawing)
  assert.deepEqual(t.slice(1), ['  A ' + '█████'.padEnd(10) + ' ' + ' 2.5  Me', '  B ' + '█████████▌' + ' ' + '4.75  Me'])
})
test('A4.fit-ladder: natural; actor lists wrap after commas; one actor per row with wrapped names; then fallback', () => {
  assert.deepEqual([35, 34, 31, 30, 28, 27].map(c => X(DAY, c).step ?? 'fallback'), ['natural', 'wrap', 'wrap', 'oneActor', 'oneActor', 'fallback'])
  assert.equal(text(X(DAY, 31).drawing).at(-1), ' '.repeat(28) + 'Cat')
})
test('A5.errors: a bad score, a missing or repeated actor, # or ;, and : in a section fall back', () => {
  for (const [body, why] of [['Make tea: 6: Me', 'domain:3'], ['Make tea: high: Me', 'domain:3'], ['Make tea: 5', 'syntax:3'], ['Do work: 1: Me, Me', 'repeat:3'],
    ['Fix #12: 3: Me', 'syntax:3'], ['Plan; review: 3: Me', 'syntax:3']] as const) assert.deepEqual(X(`journey\nsection S\n${body}`, 80), { reason: why }, body)
  assert.deepEqual(X('journey\nsection Morning: early\nA: 1: Me', 80), { reason: 'syntax:2' })
})
```
- [ ] **Run** `node --test tests/core/journey-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Parse:**
    - The header is `journey`. Statements are `title <text>`; `section <text>` with no `:`; and a task `<name>: <score>: <actor>[, <actor>…]`, with exactly two `:`, everything trimmed.
    - A score must be a `parseDec` number from 1 to 5, else `domain:<n>`.
    - Actors split at `,`: an empty actor or a missing actor list fails `syntax:<n>`, and a repeat within one task fails `repeat:<n>`.
    - A `#` or `;` outside an ignored `accTitle`/`accDescr` line fails `syntax:<n>`.
    - Tasks before the first section form a group with no name.
  - **Layout:**
    - **Rows:** `heading(title)`. Each named group has a header row in its series ink (owner `sec<k>`); the series follow §5.3.
    - **A task row,** indented 2:
      - the name (label, owner `t<i>`) padded to N;
      - `hbar(eighths(score, dec(5), 10))`, padded to 10 cells, as caps in the group's ink (owner `t<i>`);
      - the score as written, right-aligned to S (value, owner `t<i>.v`);
      - two spaces, then the actors (label, owners `t<i>.a<k>`), with each `, ` separator drawn as caps.
    - **Contract (T86):** `expect.bars` lists `{ owner: 't<i>', eighths, axis: 'h' }` for every task.
    - **Steps** (index §5): `natural` when `N + S + A + 16 ≤ cols`. `wrap`: actor lists wrap after commas to `cols − N − S − 16`. `oneActor`: one actor per row, with names wrapped to `cols − S − a − 16`. The bar and the score sit on the task's first row. A piece wider than its field fails `too-wide`.
- [ ] **Done when:** `node --test tests/core/journey-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse and draw user journeys"`

### T66: Journey fixtures and goldens
**Group** G4 · **Deps** T48, T65 · **Covers** every journey-ok and journey-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/journey/journey-{ok-01…08,reject-01…08}.mmd` and `goldens/journey/*.golden`. Test: `tests/golden/journey_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, hrun, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/journey').map(f => f.replace('.mmd', ''))
const bars = (id: string, col: number) => { const d = (explain(fx(id), { columns: 80, theme: 'mono' }) as any).drawing
  return d.cells.map((_: unknown, r: number) => hrun(d, r, col)).filter((e: number) => e > 0) }   // the bar field starts at 2 + N + 1
test('A5: every journey coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'journey', ids), []))
test('A4: journey-ok-01 fills 80, 48 and 16 eighths (N = 13, "Go downstairs"); journey-ok-02 fills 40 and 76', () => {
  assert.deepEqual(bars('journey-ok-01', 16), [80, 48, 16, 80, 80]); assert.deepEqual(bars('journey-ok-02', 4), [40, 76])
})
test('A7: a section and its bars share a series color; scores carry the value role', () => {
  const r = renderMermaid(fx('journey-ok-01'), { columns: 80, theme: 'nord' })!, n = THEMES.nord
  assert.deepEqual([spanOf(r, /^Go to work$/)?.color, spanOf(r, /^Go home$/)?.color], [n.series.s1, n.series.s2])
  assert.equal(r[2]!.find(x => x.text.startsWith('█'))?.color, n.series.s1); assert.equal(spanOf(r, /^3$/)?.color, n.roles.value)
})
```
- [ ] **Run** `node --test tests/golden/journey_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/journey'`.
- [ ] **Fixtures** (the docs example is copied from `userJourney.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | the docs example (`title My working day`; `section Go to work`: Make tea 5, Go upstairs 3, Do work 1 `Me, Cat`; `section Go home`: Go downstairs 5, Sit down 5); `journey`, `section Scores`, `A: 2.5: Me`, `B: 4.75: Me` |
| ok-03, -04 | `journey`, `%% a comment`, `title Morning`, `Wake up: 3: Me` (before any section), `section Commute`, `Drive: 2: Me, Dog`; `journey`, `title 我的一天`, `section 上班`, `泡茶: 5: 我`, `工作: 1: 我, 猫` |
| ok-05 | `%% expect 60 natural widest 60`, `%% expect 59 wrap`, `journey`, `section S`, `Water the garden: 4: Margaret, Benjamin, Charles` (N + S + A + 16 = 16 + 1 + 27 + 16) |
| ok-06 | `%% expect 60 oneActor`, `journey`, `section S`, `Review the quarterly plan: 4: Me, Supercalifragilisticexpialidocious` (wrap's field is 18 < 34; one actor per row with names wrapped to 9 cells is 60 wide) |
| ok-07, -08 | `journey`, `section A`, `Plan: 3: Me`, `Plan: 4: Me`, `section B`, `Ship: 5: Me`; ok-01's body plus `accDescr: My day` |
| reject-01…04 | `journey`, `section S`, then `Make tea: 6: Me`; `Make tea: high: Me`; `Make tea: 5`; `Do work: 1: Me, Me` |
| reject-05…08 | the same with `Fix #12: 3: Me`; `Plan; review: 3: Me`; `journey`, `section Morning: early`, `A: 1: Me`; `%% expect 60 fallback`, `%% expect 120 natural`, `journey`, `section S`, a one-word 50-letter task name `: 3: Me` |
| reject-09, -10 | `journey`, `section S`, then: `A: 3:` (an empty actor list); `A: 3: Me: Cat` (extra colons) |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/journey/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/journey_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add journey fixtures and goldens"`

### T67: Gantt time
**Group** G2 · **Deps** T43 · **Covers** matrix gantt `dateFormat` and `axisFormat` tokens, durations, naive time, tick steps; gantt-reject-02, -03, -09, -10, -11, -18, -26
**Files:** create `core/diagrams/gantt/time.ts` (index §4; `DateFmt` and `AxisFmt` are its token lists). Test: `tests/core/gantt-time_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseDateFormat, parseDate, parseAxisFormat, formatAxis, parseDuration, tickStep } from '../../core/diagrams/gantt/time.ts'
const F = (f: string) => parseDateFormat(f) as any, A = (f: string, dated = true) => parseAxisFormat(f, dated) as any, D = 86_400_000, MIN = 60_000
test('A4: dates are naive UTC and match dateFormat exactly; one-letter tokens take no leading zero', () => {
  assert.equal(parseDate('2024-01-01', F('YYYY-MM-DD')), Date.UTC(2024, 0, 1)); assert.equal(parseDate('2014-1-1', F('YYYY-MM-DD')), null)
  assert.equal(parseDate('20/7/2017 9:5:3', F('D/M/YYYY H:m:s')), Date.UTC(2017, 6, 20, 9, 5, 3)); assert.equal(parseDate('2024-02-30', F('YYYY-MM-DD')), null)
  assert.equal(parseDate('17:49', F('HH:mm')), Date.UTC(1970, 0, 1, 17, 49))
  assert.equal(parseDate('2024-03-01T08:00:00.500', F('YYYY-MM-DDTHH:mm:ss.SSS')), Date.UTC(2024, 2, 1, 8, 0, 0, 500))
  assert.deepEqual([F('X'), F('YYYY-MM')], [{ reason: 'format-token' }, { reason: 'format-ymd' }])
})
test('A4: axis tokens print fixed widths and English names; a date-free dateFormat allows only %H %M %S %L', () => {
  const t = Date.UTC(2024, 0, 1, 8, 5, 9, 7)
  assert.deepEqual([formatAxis(t, A('%Y-%m-%d')), formatAxis(t, A('%y/%j %H:%M:%S.%L')), formatAxis(t, A('%a %e %b'))], ['2024-01-01', '24/001 08:05:09.007', 'Mon  1 Jan'])
  assert.deepEqual([A('%s'), A('%Y-%m-%d', false)], [{ reason: 'axis-format' }, { reason: 'axis-format' }])
})
test('A4: durations are whole ms; M, y, junk, a fractional d or w, and fractions of a ms are null; tick steps follow the matrix', () => {
  assert.deepEqual(['500ms', '30s', '2m', '1.5h', '2d', '1w', '0d'].map(parseDuration), [500, 30_000, 2 * MIN, 5_400_000, 2 * D, 7 * D, 0])
  for (const s of ['1M', '1y', '3dX', '1.0001ms', 'd', '1.5', '1.5d', '0.5w']) assert.equal(parseDuration(s), null, s)
  assert.deepEqual([tickStep(30 * D, 60, 10), tickStep(30 * D, 35, 10), tickStep(23 * MIN, 60, 5), tickStep(510 * MIN, 43, 5), tickStep(1e6 * D, 10, 10)],
    [7 * D, 14 * D, 5 * MIN, 3 * 3_600_000, null])
})
```
- [ ] **Run** `node --test tests/core/gantt-time_test.ts` → FAIL: `Cannot find module …/core/diagrams/gantt/time.ts`.
- [ ] **Implement:**
  - **`parseDateFormat`:**
    - Tokens are read longest first: `YYYY SSS MM DD HH mm ss M D H m s`. The literals are `- / . : T` and space; any other character fails `format-token`.
    - Year, month and day are all present or all absent, else `format-ymd`.
  - **`parseDate`:**
    - An anchored pattern: `YYYY` is 4 digits, a two-letter token 2 digits, `SSS` 3 digits, and a one-letter token `0|[1-9]\d?`.
    - `Date.UTC`, with absent fields from 1970-01-01 00:00. A field out of range, or a date that does not round-trip (02-30), is null.
  - **`parseAxisFormat`:**
    - The tokens are `%Y %y %m %d %e %H %M %S %L %j %b %a`; other text is literal. Any other `%` fails `axis-format`.
    - With `dated` false, only `%H %M %S %L` are allowed.
  - **`formatAxis`** uses UTC getters, so every token has a fixed width: `%e` space-padded, `%j` and `%L` 3 digits, `%b` and `%a` English.
  - **`parseDuration`** matches `^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$` and computes with `Dec`. It is null unless the result is a whole number of ms, and null for a fractional `d` or `w`, which Mermaid's Day.js rounds to whole days (matrix amendment, fix cycle 1).
  - **`tickStep(m, w, l)`** returns the first matrix `STEPS` entry, in ms, with `cellOf(dec(step), dec(m), w) ≥ l + 1`, computed exactly, else null.
- [ ] **Done when:** `node --test tests/core/gantt-time_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add gantt date formats, durations and tick steps"`

### T68: Gantt parse and resolve
**Group** G3 · **Deps** T67 · **Covers** matrix gantt subset and resolution rules (`after`, `until`, forward ids, milestones, the previous task); gantt-reject-01…09, -11, -12, -15…17
**Files:** create `core/diagrams/gantt/parse.ts`.
- **Model:** `Gantt = { title, dated: boolean, axis: AxisFmt, sections: string[], tasks: { name, section, tags, start, end, timing, line }[] }`.
- `section` is −1 for tasks before the first section. `start` and `end` are naive UTC ms.
- **Test:** `tests/core/gantt-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseGantt } from '../../core/diagrams/gantt/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (body: string) => { const s = readSource(`gantt\n${body}`); return ('reason' in s ? s : parseGantt(s)) as any }
const U = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
test('A5: starts and ends resolve from the previous end, after, a date or a duration; milestones; timings as written', () => {
  const g = P(['title Release', 'section Build', 'Spec :crit, done, s, 2024-01-01, 10d', 'Code :active, after s, 20d', 'Ship :milestone, 2024-01-31, 0d', 'Wrap :2d'].join('\n'))
  assert.deepEqual(g.tasks.map((t: any) => [t.name, t.start, t.end, t.timing, t.tags]), [['Spec', U(2024, 1, 1), U(2024, 1, 11), '2024-01-01 · 10d', ['crit', 'done']],
    ['Code', U(2024, 1, 11), U(2024, 1, 31), 'after s · 20d', ['active']], ['Ship', U(2024, 1, 31), U(2024, 1, 31), '2024-01-31 · 0d', ['milestone']],
    ['Wrap', U(2024, 1, 31), U(2024, 2, 2), '2d', []]])
  assert.deepEqual([g.title, g.sections, g.tasks[0].section], ['Release', ['Build'], 0])
})
test('A5: after takes the latest end; until the earliest start; an id may be defined later', () => {
  const g = P(['apple :a, 2017-07-20, 1w', 'banana :b, 2017-07-23, 1d', 'cherry :c, after b a, 1d', 'kiwi :d, 2017-07-20, until b c',
    'x :2017-08-01, until y', 'y :y, 2017-08-05, 1d'].join('\n')), T = (n: string) => g.tasks.find((t: any) => t.name === n)
  assert.deepEqual([T('cherry').start, T('cherry').end, T('kiwi').end, T('x').end], [U(2017, 7, 27), U(2017, 7, 28), U(2017, 7, 23), U(2017, 8, 5)])
})
test('A5.errors: unsupported statements and bad dates, durations, ids, references and names fall back', () => {
  for (const [body, why] of [['A :2024-01-01, 1d\nexcludes weekends', 'syntax:3'], ['A :2024-01-01, 3dX', 'syntax:2'], ['A :2014-1-1, 1d', 'date:2'],
    ['A :a1, 2024-01-01, 1d\nB :a1, 2024-01-02, 1d', 'repeat:3'], ['A :a1, after zz, 1d', 'ref:2'], ['A :a, after b, 1d\nB :b, after a, 1d', 'cycle'],
    ['A :2024-01-05, 2024-01-01', 'order:2'], ['A :5d', 'start:2'], ['A :2024-01-01, 1M', 'syntax:2'], ['A :vert, 2024-01-02, 0d', 'syntax:2'],
    ['A :2024-01-01, 1d\nCall vendor :2d', 'syntax:3'], ['A :2024-01-01, 1d\n5% bonus :2d', 'syntax:3'], ['A :2024-01-01, 1d\n2024-01-01 kickoff :1d', 'syntax:3']] as const)
    assert.deepEqual(P(body), { reason: why }, body)
  assert.deepEqual(P('dateFormat HH:mm\nA :17:49, 2m'), { reason: 'axis-format' })
})
```
- [ ] **Run** `node --test tests/core/gantt-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/gantt/parse.ts`.
- [ ] **Implement:**
  - **Statements:**
    - Read: `title`, `section`, `dateFormat` (default `YYYY-MM-DD`), `axisFormat` and `todayMarker off`.
    - Ignored: `click`, `accTitle` and `accDescr`; frontmatter `displayMode` is never read.
    - Any other keyword (`excludes`, `includes`, `weekday`, `weekend`, `tickInterval`, `topAxis`, `inclusiveEndDates`, another `todayMarker`) fails `syntax:<n>`.
  - **A task** is `<name> :<items>`, split at the first `:`. The name fails `syntax:<n>` when `%` is its first or second character, when it starts with `\d{4}-\d{2}-\d{2}`, or when its first word is `call` in any case.
  - **Items** split at `,` and are trimmed.
    - Leading tags are `done`, `active`, `crit` and `milestone`; `vert` fails `syntax`. More than 3 items after the tags fails `syntax`.
    - One item is the end; two are start and end; three are id, start and end.
    - An id matches `[A-Za-z0-9_-]+`; a repeated id fails `repeat:<n>`.
  - **Start:** a date or `after <id>…`. With none, it is the previous task's end in source order.
  - **End:** `until <id>…`, a duration or a date; anything else fails `syntax:<n>`.
  - **Resolve** with a memoized DFS:
    - a cycle fails `cycle`; an unknown id `ref:<n>`; a first task with no start `start:<n>`;
    - a start that is neither `after` nor a matching date fails `date:<n>`; an end before its start `order:<n>`.
    - `after` takes the latest end of its ids, and `until` the earliest start.
  - **Timing:** the written start and end items, trimmed and joined by ` · `; just the end when there is no start item.
  - **Axis:** `dated` comes from the dateFormat. `parseAxisFormat(axisFormat ?? '%Y-%m-%d', dated)` passes its Fail through.
- [ ] **Done when:** `node --test tests/core/gantt-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse gantt charts and resolve task times"`

### T69: Gantt module
**Group** G4 · **Deps** T40, T44, T46, T47, T68, T86 · **Covers** matrix gantt text design, numbers and ladder (timings in place; keyed; wrapped names), gantt-reject-13, -14
**Files:** replace T40's stub in `core/diagrams/gantt/layout.ts` (export `gantt`). Test: `tests/core/gantt-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (body: string, columns: number) => explain(`gantt\n${body}`, { columns, theme: 'mono' }) as any
const SKETCH = 'title Release\nsection Build\nSpec :crit, done, s, 2024-01-01, 10d\nCode :active, after s, 20d\nShip :milestone, 2024-01-31, 0d'
const rule = (left: number, w: number, at: number[]) => ' '.repeat(left) + [...Array(w)].map((_, i) => (at.includes(i) ? '┬' : '─')).join('')
test('A4: the matrix sketch at W = 30: status, name, timing and bar; ◆ at its milestone; the tick rule and labels', () => {
  const r = X(SKETCH, 55); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), ['Release', 'Build', '!✓ Spec 2024-01-01 · 10d ' + '█'.repeat(10), ' ▸ Code after s · 20d' + ' '.repeat(14) + '█'.repeat(20),
    '   Ship 2024-01-31 · 0d' + ' '.repeat(31) + '◆', rule(25, 30, [0, 14]), ' '.repeat(25) + '2024-01-01    2024-01-15'])
})
test('A4.fit-ladder: at 40 the timings move into a keyed legend (W = 30)', () => {
  const r = X(SKETCH, 40); assert.equal(r.step, 'keyed')
  assert.deepEqual(text(r.drawing), ['Release', 'Build', '!✓ Spec a ' + '█'.repeat(10), ' ▸ Code b ' + ' '.repeat(10) + '█'.repeat(20), '   Ship c ' + ' '.repeat(29) + '◆',
    rule(10, 30, [0, 14]), ' '.repeat(10) + '2024-01-01    2024-01-15', 'a 2024-01-01 · 10d', 'b after s · 20d', 'c 2024-01-31 · 0d'])
})
test('A5.errors: a lone 0d milestone has M = 0 and falls back', () => assert.deepEqual(X('M :milestone, 2024-01-01, 0d', 80), { reason: 'domain' }))
```
- [ ] **Run** `node --test tests/core/gantt-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **The module:** `parse = parseGantt`; `steps = () => ['natural', 'keyed', 'keyedWrap']`.
  - **Scale:** `t0` is the earliest start and `t1` the latest end; `M = t1 − t0`, and `M = 0` fails `domain`. All math is `Dec` over ms (T44's `cellOf` and `eighths`).
  - **Widths:** N is the widest name, T the widest timing, and `K = width(fieldKey(tasks − 1))`.
    - `natural`: `W = min(60, cols − N − T − 5)`.
    - `keyed`: `W = min(60, cols − N − 5 − K)`.
    - `keyedWrap`: W = 20, and names wrap to `cols − 25 − K`.
    - A W below 20, or a word wider than its field, fails `too-wide`.
  - **Rows:**
    - `heading(title)`.
    - A header row per section, in its series ink (§5.3; owner `sec<k>`).
    - **Task rows:**
      - **Status:** cell 0 is `!` for `crit`; cell 1 is `✓` for `done`, else `▸` for `active`.
      - **Name:** label, owner `t<i>`, padded to N.
      - **Timing:** the timing (value, owner `t<i>.t`) padded to T, or its key `fieldKey(i)` (label role, same owner).
      - **Field:** `hbar(eighths(end − start, M, W))` from cell `cellOf(start − t0, M, W)`. A milestone draws `◆` at `min(W − 1, cellOf(mid − t0, M, W))`, where `mid = (start + end)/2`.
      - **Contract (T86):** the bar is owned by `t<i>`, and `expect.bars` lists `{ owner: 't<i>', eighths, axis: 'h' }` per task. A `0d` task or a milestone lists 0: a `◆` is a mark, not a bar.
    - The status, bar and `◆` caps are owned by `t<i>`. Their ink is `arrow` for crit, else `note` for done, else `decision` for active, else the section's series (index §5.2).
    - Keys and bars sit on the name's first row.
  - **Axis:**
    - `L` is the width of `formatAxis(t0)`, and `step = tickStep(M, W, L)`.
    - Ticks sit at `k·step ≤ M`, in cells `cellOf(k·step, M, W)`, labelled `formatAxis(t0 + k·step)`. With no step, only `t0` is labelled.
    - `axisRows(N + T + 5 or N + 5 + K, W, ticks, cols, 'axis')`.
  - **Legend:** at the keyed steps, `withLegend` gets one row per task: `{ key: fieldKey(i), keyInk: 'label', item: 't<i>.t', cls: 'timing', parts: [{ text: timing, ink: 'value', owner: 't<i>.t' }] }`. The timing column draws the key with `cv.key`, owned by `t<i>.t`, and `keyable` lists every task's timing (T87).
- [ ] **Done when:** `node --test tests/core/gantt-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw gantt charts with timings, bars, ticks and a keyed legend"`

### T70: Gantt fixtures and goldens
**Group** G5 · **Deps** T48, T69 · **Covers** every gantt-ok and gantt-reject fixture and the matrix's bar, `◆` and tick numbers; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/gantt/gantt-{ok-01…16,reject-01…17}.mmd` and `goldens/gantt/*.golden`. Test: `tests/golden/gantt_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { coverageOf, fx, hrun } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/gantt').map(f => f.replace('.mmd', ''))
const X = (id: string, w: number) => (explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing
const ticks = (line: string, f: number) => [...line].flatMap((c, i) => (c === '┬' ? [i - f] : []))
test('A5: every gantt coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'gantt', ids), []))
test('A4: gantt-ok-02 at 120, 80 and 60: bar eighths, ◆ and tick cells (the field starts at cell 25)', () => {
  for (const [w, spec, code, at, dia, tk] of [[120, 160, 320, 20, 59, [0, 14, 28, 42]], [80, 147, 293, 18, 54, [0, 12, 25, 38]], [60, 93, 187, 11, 34, [0, 16]]] as const) {
    const d = X('gantt-ok-02', w), t = text(d)
    assert.deepEqual([hrun(d, 2, 25), hrun(d, 3, 25 + at), t[4]!.indexOf('◆') - 25, ticks(t[5]!, 25)], [spec, code, dia, [...tk]], `@${w}`)
  }
})
test('A4: gantt-ok-04 at 120: ◆ at cells 2 and 54; Task A from cell 5, 209 eighths; 5-minute ticks (the field starts at 32)', () => {
  const d = X('gantt-ok-04', 120), t = text(d), row = (s: string) => t.findIndex(l => l.includes(s))
  assert.deepEqual([t[row('Initial milestone')]!.indexOf('◆') - 32, t[row('Final milestone')]!.indexOf('◆') - 32, hrun(d, row('Task A'), 37)], [2, 54, 209])
  assert.deepEqual(ticks(t.find(l => l.includes('┬'))!, 32), [0, 13, 26, 39, 52])
})
test('A4: gantt-ok-15 at 60 keys its timings (W = 43): bars, ticks and legend rows (the field starts at 17)', () => {
  const d = X('gantt-ok-15', 60), t = text(d)
  assert.deepEqual([hrun(d, 0, 17), hrun(d, 1, 34), hrun(d, 2, 52)], [142, 142, 61]); assert.deepEqual(ticks(t[3]!, 17), [0, 15, 30])
  assert.deepEqual(t.slice(-3), ['a 2024-03-01 08:00 · 2024-03-01 11:30', 'b after l · 2024-03-01 15:00', 'c after d · 90m'])
})
test('A4: gantt-ok-16 keys 27 tasks a…z, aa (K = 2); every task row is exactly 42 cells', () => {
  const t = text(X('gantt-ok-16', 42)).filter(l => /^ {3}t\d\d /.test(l))
  assert.equal(t.length, 27); assert.ok(t.every(l => l.length === 42)); assert.match(t[26]!, /^ {3}t27 aa /)
})
test('A7: crit, done and active bars take the arrow, note and decision roles; other bars their series', () => {
  const r = renderMermaid(fx('gantt-ok-06'), { columns: 80, theme: 'nord' })!, n = THEMES.nord
  const ink = (name: string, g: string) => r.find(row => row.some(s => s.text.includes(name)))!.find(s => s.text.includes(g))?.color
  assert.deepEqual([ink('Both', '█'), ink('Gate', '◆'), ink('Doing', '█'), ink('Plain', '█')], [n.roles.note, n.roles.arrow, n.roles.decision, n.series.s1])
})
```
- [ ] **Run** `node --test tests/golden/gantt_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/gantt'`.
- [ ] **Fixtures** (each body follows `gantt`; expect lines go after any frontmatter; docs examples are copied from `gantt.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01 | the docs' first example: `title A Gantt Diagram`, `dateFormat YYYY-MM-DD`, `section Section`, `A task :a1, 2014-01-01, 30d`, `Another task :after a1, 20d`, `section Another`, `Task in Another :2014-01-12, 12d`, `another task :24d` |
| ok-02, -03 | the sketch: `title Release`, `section Build`, `Spec :crit, done, s, 2024-01-01, 10d`, `Code :active, after s, 20d`, `Ship :milestone, 2024-01-31, 0d`; the docs' `after b a` / `until b c` example (`apple :a, 2017-07-20, 1w`, `banana :crit, b, 2017-07-23, 1d`, `cherry :active, c, after b a, 1d`, `kiwi :d, 2017-07-20, until b c`) |
| ok-04 | the docs' milestone example: `dateFormat HH:mm`, `axisFormat %H:%M`, `Initial milestone :milestone, m1, 17:49, 2m`, `Task A :10m`, `Task B :5m`, `Final milestone :milestone, m2, 18:08, 4m` |
| ok-05 | `%% expect 120 natural`, `%% expect 80 keyed`, `%% expect 60 keyedWrap`, then the docs' syntax example without its `excludes` line and its `%%` notes: 4 sections, 17 tasks, a forward `until isadded` |
| ok-06, -07 | `Both :active, done, 2024-01-01, 3d`, `Gate :crit, milestone, 2024-01-04, 2d`, `Doing :active, 2024-01-02, 2d`, `Plain :2024-01-03, 1d`; `Tick :2024-01-01, 500ms`, `Wait :30s`, `Cook :1.5h`, `Mark :0d`, `section Later`, `Ship :1d` |
| ok-08, -09 | `dateFormat YYYY-MM-DDTHH:mm:ss.SSS`, `axisFormat %y/%j %H:%M:%S.%L`, `Run :r, 2024-03-01T08:00:00.000, 2024-03-01T09:30:00.500`, `Rest :after r, 30m`; `dateFormat D/M/YYYY H:m:s`, `axisFormat %a %e %b`, `Plan :p, 1/7/2024 9:0:0, 3/7/2024 17:30:0`, `Build :after p, 2d` |
| ok-10, -11 | frontmatter `title: Plan` and `config:` / `gantt:` / `displayMode: compact`, then `todayMarker off`, `%% a comment`, `A :2024-01-01, 2d`, `B :1d`; `title 项目计划`, `section 设计`, `需求分析 :2024-01-01, 3d`, `编码 :5d` |
| ok-12, -13 | `%% expect 60 natural widest 60`, `%% expect 59 keyed`, `Ship the release v1 :2024-01-01, 10d` (19 + 16 + 20 + 5 = 60); `%% expect 60 keyedWrap`, `Review the quarterly release plan with the team :2024-01-01, 3d` (the name wraps to 34 cells) |
| ok-14, -15 | ok-01's body plus `click a1 href "https://example.com"`; `%% expect 120 natural`, `%% expect 80 natural`, `%% expect 60 keyed`, `dateFormat YYYY-MM-DD HH:mm`, `axisFormat %H:%M`, `Load trucks :l, 2024-03-01 08:00, 2024-03-01 11:30`, `Drive :d, after l, 2024-03-01 15:00`, `Unload :after d, 90m` |
| ok-16 | `%% expect 42 keyed`, then 27 tasks `t01`…`t27`, each `:2024-01-01, 1d` |
| reject-01…05 | `A :2024-01-01, 1d`, `excludes weekends`; `A :2024-01-01, 3dX`; `A :2014-1-1, 1d`; `A :a1, 2024-01-01, 1d`, `B :a1, 2024-01-02, 1d`; `A :a1, after zz, 1d` |
| reject-06…09 | `A :a, after b, 1d`, `B :b, after a, 1d`; `A :2024-01-05, 2024-01-01`; `A :5d`; `A :2024-01-01, 1M` |
| reject-10…13 | the docs' bar-chart example (`dateFormat X`, `axisFormat %s`); `dateFormat HH:mm`, `A :17:49, 2m` (the default `axisFormat`); the docs' `vert` example; `M :milestone, 2024-01-01, 0d` |
| reject-14…17 | `%% expect 60 fallback`, `%% expect 120 natural`, a one-word 40-letter name `:2024-01-01, 3d`; then `A :2024-01-01, 1d` followed by `Call vendor :2d`, by `5% bonus :2d`, or by `2024-01-01 kickoff :1d` |
| reject-18…22 | `gantt`, `dateFormat YYYY-MM-DD`, `A :a1, 2024-01-01, 3d`, then: `Rest :1.5d`; `includes 2024-01-06`; `weekday monday`; `weekend friday`; `tickInterval 1week` |
| reject-23…27 | the same chart, then: `topAxis`; `inclusiveEndDates`; `todayMarker stroke-width:5px`; `B :1y`; `B :crit, b1, 2024-01-04, 3d, 4d` |

Size ok-12, -13 and -15 with `node scripts/explain.ts FILE 60`.
- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/gantt/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/gantt_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add gantt fixtures and goldens"`
