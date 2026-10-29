# mermaid-tty v1 C — tasks T71–T75 (xychart, quadrant)

**Depends on:** the index (§4, §5), C1 (T40, T43–T48). Conventions are as in C4.

### T71: xychart parse
**Group** G2 · **Deps** T43 · **Covers** matrix xychart subset (headers, orientation, text tokens, numbers, axes, series) and its fallbacks; xychart-reject-01…11, -13…17
**Files:** create `core/diagrams/xychart/parse.ts`.
- **Model:** `Xy = { orientation: 'vertical' | 'horizontal', title, xTitle, categories: string[] | null, yTitle, range: { lo: Num; hi: Num } | null, series: { kind: 'bar' | 'line', name: string | null, values: Num[] }[] }`, where `Num = { raw: string; value: Dec }`.
- **Test:** `tests/core/xychart-parse_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { parseXy } from '../../core/diagrams/xychart/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseXy(s)) as any }
test('A5: headers, orientation, quoted and one-word texts, categories, a range and named series', () => {
  const m = P(['xychart-beta horizontal', 'title "Sales Revenue"', 'x-axis Month [jan, feb, "mar 1"]', 'y-axis "Revenue (in $)" 4000 --> 11000', 'bar [5000, 6000, 7500]',
    'line Trend [5000, 6000, 7500]'].join('\n'))
  assert.deepEqual([m.orientation, m.title, m.xTitle, m.categories, m.yTitle, m.range.lo.raw, m.range.hi.raw],
    ['horizontal', 'Sales Revenue', 'Month', ['jan', 'feb', 'mar 1'], 'Revenue (in $)', '4000', '11000'])
  assert.deepEqual(m.series.map((s: any) => [s.kind, s.name, s.values.map((v: any) => v.raw)]), [['bar', null, ['5000', '6000', '7500']], ['line', 'Trend', ['5000', '6000', '7500']]])
  const s = P('xychart\nline [+1.3, .6, 2.4, -.34]'); assert.deepEqual([s.orientation, s.categories, s.range], ['vertical', null, null])
})
test('A5.errors: point labels, a numeric x range, unquoted-text limits, repeats, lengths, domains and series counts fall back', () => {
  for (const [body, why] of [['line [540 "PaLM", 600]', 'syntax:2'], ['x-axis 0 --> 100', 'syntax:2'], ['title Sales Revenue', 'syntax:2'], ['x-axis Q1 [a, b]\nbar [1, 2]', 'syntax:2'],
    ['x-axis [barley, wheat]\nbar [1, 2]', 'syntax:2'], ['bar [1, 2', 'syntax:2'], ['x-axis [a, a]\nbar [1, 2]', 'repeat:2'], ['x-axis [a]\nx-axis [b]\nbar [1]', 'repeat:3'],
    ['x-axis [a, b, c]\nbar [1, 2]', 'length'], ['y-axis 0 --> 100\nbar [120]', 'domain'], ['bar [2.3, 45, .98, -3.4]', 'domain'], ['y-axis 5 --> 5\nline [5]', 'domain'],
    ['bar [0, 0]', 'domain'], [Array.from({ length: 9 }, () => 'line [1]').join('\n'), 'series']] as const) assert.deepEqual(P(`xychart-beta\n${body}`), { reason: why }, body)
})
```
- [ ] **Run** `node --test tests/core/xychart-parse_test.ts` → FAIL: `Cannot find module …/core/diagrams/xychart/parse.ts`.
- [ ] **Implement:**
  - **Header:** `^(xychart-beta|xychart)( vertical| horizontal)?$`; the default is vertical.
  - **Text:**
    - `"…"`, or one unquoted word of `[A-Za-z0-9&+=*.#_-]+` in which no keyword (bar, line, title, x-axis, y-axis, vertical, horizontal, xychart) begins a run of letters, in any case. Anything else, such as several unquoted words or `barley`, fails `syntax:<n>`.
    - An unquoted axis title with a digit fails `syntax:<n>`.
  - **Numbers:** `n` is `parseDec`.
  - **Statements:**
    - `title`;
    - `x-axis <t>` or `x-axis [<t>] [<t>, …]`;
    - `y-axis <t>` or `y-axis [<t>] <n> --> <n>`;
    - `bar [<t>] [<n>, …]` and `line [<t>] [<n>, …]`.
  - **Syntax fails:** a numeric x range, a point label, a markdown string and an unclosed list each fail `syntax:<n>`.
  - **Repeats:** a second `title`, `x-axis` or `y-axis`, or a repeated category, fails `repeat:<n>`.
  - **Lengths:** each series has one value per category (or per the first series' groups, when there are no categories), else `length`.
  - **Range:** the explicit range, else `y0 = min(0, smallest)` and `y1 = max(0, largest)`. Each of these fails `domain`: a value outside an explicit range; `y0 ≥ y1`; a bar series when `y0 < 0`.
  - **Series:** more than 8 line series or 26 bar series fails `series`.
  - **Ignored:** `accTitle`, `accDescr` and the xychart config.
- [ ] **Done when:** `node --test tests/core/xychart-parse_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse xycharts"`

### T72: xychart module
**Group** G4 · **Deps** T40, T44, T46, T47, T71, T86 · **Covers** matrix xychart text design, numbers and ladder; xychart-ok drawing; A3, A4.fit-ladder
**Files:** replace T40's stub in `core/diagrams/xychart/layout.ts` (export `xychart`). Test: `tests/core/xychart-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (src: string, columns: number) => explain(src, { columns, theme: 'mono' }) as any
const SALES = 'xychart-beta\ntitle Sales\nx-axis [jan, feb, mar]\ny-axis 0 --> 100\nbar [20, 75, 50]\nline [30, 60, 90]'
test('A4: the matrix sketch: an 8-row plot, the axis, the categories, one value row per series', () => {
  const r = X(SALES, 80); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), ['Sales', '100 ┤           ●', '    │', '    │     ██', '    │     ██●', ' 50 ┤     ██  ██', '    │   ● ██  ██', '    │ ▅▅  ██  ██',
    '    │ ██  ██  ██', '  0 └─┬───┬───┬──', '      jan feb mar', 'a      20  75  50', '●      30  60  90'])
})
test('A4: horizontal: one row per category and series; a ─ rule with ┬ at cells 0 and W − 1; y0 left, y1 right', () => {
  const r = X(SALES.replace('xychart-beta', 'xychart-beta horizontal'), 40), t = text(r.drawing); assert.equal(r.step, 'natural')
  assert.deepEqual(t.slice(1, 3), ['jan a ' + '█'.repeat(6) + '▎'.padEnd(25) + ' 20', '    ● ' + '●'.padStart(10).padEnd(31) + ' 30'])
  assert.deepEqual(t.slice(7), [' '.repeat(6) + '┬' + '─'.repeat(29) + '┬', ' '.repeat(6) + '0' + ' '.repeat(27) + '100'])
})
test('A4.fit-ladder: vertical if it fits; else horizontal while W ≥ 10; else W = 10 with wrapped categories; else fallback', () => {
  const L = 'xychart-beta\nx-axis ["far south east", north]\nbar [1, 2]'
  assert.deepEqual([33, 32, 29, 28, 20, 19].map(c => X(L, c).step ?? 'fallback'), ['natural', 'horizontal', 'horizontal', 'wrap', 'wrap', 'fallback'])
})
test('A4: computed bounds print as exact decimals; a point sits in row max(1, ⌈H·(v − y0)/M⌉)', () => {
  const t = text(X('xychart-beta\nline [+1.3, .6, 2.4, -.34]', 80).drawing), row = (c: number) => 8 - t.findIndex(l => l[c] === '●')
  assert.deepEqual([t[0], t[4], t[8]].map(l => l!.trim().split(' ')[0]), ['2.4', '1.03', '-0.34'])
  assert.deepEqual([8, 13, 18, 23].map(row), [5, 3, 8, 1]); assert.equal(t.at(-1), '●       +1.3   .6  2.4 -.34')
})
```
- [ ] **Run** `node --test tests/core/xychart-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Steps:** a vertical header: `['natural', 'horizontal', 'wrap']`; a horizontal header: `['natural', 'wrap']`.
    - `natural` draws the header's orientation: vertical when `G + 1 + n·(c + 1) ≤ cols`; horizontal when `W = min(60, cols − C − V − 4) ≥ 10`.
    - `horizontal` is that horizontal drawing.
    - `wrap` is horizontal with W = 10 and categories wrapped to `cols − V − 14`.
    - Horizontal fails `too-wide` when `y0` and `y1`, with a space, are wider than W.
  - **Scale:** `M = y1 − y0`, with each `v` measured from `y0`, all in `Dec` (T44); H = 8.
  - **Vertical:**
    - `G` is 1 + the widest tick label or `tag name` text.
    - `c` is one width for every group: the largest of the widest category, the widest value and the number of series. This gives xychart-ok-01's 79 cells.
    - A group is a gap cell, then c content cells. Each line series takes 1 cell; the bar series share the rest evenly, rounded down, in source order; leftover cells stay blank at the group's end.
    - A bar is `vbar(eighths(v − y0, M, 8), 8)` in each of its cells. A point is the series' marker, `●◆▲■○◇△□` in source order over the line series, in row `rowAt(v − y0, M, 8)`.
    - **Rows:**
      - `heading(title)`, then the y-axis title;
      - 8 plot rows: `y1`, the midpoint `(y0 + y1)/2` and `y0` sit right-aligned before `┤` at plot rows 8 and 4 and before `└` on the axis row; other rows have `│`;
      - the axis row: `─`, with `┬` under each group's first content cell;
      - the category labels, left-aligned (none without categories), then the x-axis title;
      - one row per series: its tag (`a`, `b`, … for bars; the marker for lines) and name in the gutter, and its values right-aligned in the groups.
  - **Horizontal:**
    - Per category, one row per series: the category (first row only, padded to C), a space, the tag, a space, the field, a space, the value right-aligned to V.
    - The field is `hbar(eighths(v − y0, M, W))`, or the marker at `min(W − 1, cellOf(v − y0, M, W))`.
    - Then `axisRows(C + 3, W, [{ cell: 0, label: y0, align: 'left' }, { cell: W − 1, label: y1, align: 'right' }], cols, 'axis')`.
    - The axis titles swap places. A legend lists the named series as `tag name`.
  - **Printing:** values as written; an explicit bound as written; a computed bound and the midpoint by `toExact`.
  - **Roles:** axes, ticks and rules `frame`; categories, tags and names `label`; tick labels and values `value`; bars and markers `s<k>`, by source order over all series.
  - **Owners:** values `x<k>.v<j>`; plot marks `x<k>:mark`; each bar `x<k>.b<j>`, so two bars of one series never share a run. `expect.bars` lists `{ owner: 'x<k>.b<j>', eighths, axis }` for every bar: axis `v` in a vertical chart, `h` in a horizontal one (T86).
- [ ] **Done when:** `node --test tests/core/xychart-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Draw xycharts vertically and horizontally"`

### T73: xychart fixtures and goldens
**Group** G5 · **Deps** T48, T72 · **Covers** every xychart-ok and xychart-reject fixture and the matrix's eighth-rows and ticks; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/xychart/xychart-{ok-01…11,reject-01…13}.mmd` and `goldens/xychart/*.golden`. Test: `tests/golden/xychart_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { coverageOf, fx, vrun } from './c-lib.ts'; import { widest } from './golden-lib.ts'; import { text } from '../core/graph-fixture.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/xychart').map(f => f.replace('.mmd', ''))
test('A5: every xychart coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'xychart', ids), []))
test('A4: xychart-ok-01: bar eighth-rows; ticks 11000, 7500, 4000; vertical (79 cells) at 80, horizontal at 60', () => {
  const r = explain(fx('xychart-ok-01'), { columns: 80, theme: 'mono' }) as any, t = text(r.drawing), base = t.findIndex(l => l.includes('└'))
  assert.deepEqual([r.step, widest(r.drawing)], ['natural', 79])   // G = 6, c = 5: group g's first bar cell is column 8 + 6g
  assert.deepEqual(Array.from({ length: 12 }, (_, g) => vrun(r.drawing, 8 + 6 * g, base)), [9, 18, 32, 38, 50, 59, 64, 57, 48, 41, 27, 18])
  assert.deepEqual([t[base - 8], t[base - 4], t[base]].map(l => l!.trim().split(' ')[0]), ['11000', '7500', '4000'])
  assert.equal((explain(fx('xychart-ok-01'), { columns: 60, theme: 'mono' }) as any).step, 'horizontal')
})
test('A7: series take s1, s2, s3 in source order over bars and lines; values carry the value role', () => {
  const r = renderMermaid(fx('xychart-ok-06'), { columns: 80, theme: 'nord' })!, n = THEMES.nord, i = r.findIndex(row => row.some(s => s.text.includes('2023')))
  assert.deepEqual([r[i]!.find(s => s.text.startsWith('█'))?.color, r[i + 1]!.find(s => s.text.startsWith('█'))?.color,
    r[i + 2]!.filter(s => s.text.includes('●')).at(-1)?.color], [n.series.s1, n.series.s2, n.series.s3])
  assert.equal(r[i]!.find(s => s.text.trim() === '40')?.color, n.roles.value)
})
```
- [ ] **Run** `node --test tests/golden/xychart_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/xychart'`.
- [ ] **Fixtures** (each body follows `xychart-beta` unless a header is given; docs examples are copied from `xyChart.md` at `1fb78698`, an init directive becoming frontmatter `config:`):

| IDs | Content |
|---|---|
| ok-01, -02 | the docs Sales Revenue example (`x-axis [jan … dec]`, `y-axis "Revenue (in $)" 4000 --> 11000`, a bar and a line); the docs legend example (three named lines) |
| ok-03, -04 | the docs simplest example (`xychart`, `line [+1.3, .6, 2.4, -.34]`); the docs Genres example, its `showDataLabel` config ignored |
| ok-05 | the docs palette example (line, bar, bar, line; quoted axis titles; `plotColorPalette` ignored) |
| ok-06 | `xychart horizontal`, `title Revenue`, `x-axis Quarter [2023, 2024]`, `y-axis 0 --> 100`, `bar Online [40, 55]`, `bar Retail [30, 35]`, `line Target [50, 60]` |
| ok-07, -08 | `xychart vertical`, `x-axis Month`, `y-axis Units`, `bar [0, 4, 7]`; `title "销售额"`, `x-axis ["一月", "二月"]`, `bar "线上" [3, 5]`, `line "目标" [4, 6]` |
| ok-09 | `%% expect 60 natural widest 60`, `%% expect 59 horizontal`, `x-axis [mon1, tue1, wed1, thu1, fri1, sat1, sun1, mon2, tue2, wed2, thu2]`, `y-axis 0 --> 100`, `bar [10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 5]` (4 + 1 + 11 · 5 = 60) |
| ok-10, -11 | `%% expect 60 wrap`, `xychart-beta horizontal`, `x-axis ["a fairly long first category name that wraps twice", short]`, `bar [1, 2]` (a 50-cell category); ok-01's body plus `accTitle: Sales` |
| reject-01…04 | the docs point-label example (`line [540 "PaLM", …]`); 12 categories with an 11-value `bar`; `y-axis 0 --> 100`, `bar [120]`; the docs `bar [2.3, 45, .98, -3.4]` |
| reject-05…08 | `x-axis 0 --> 100`, `bar [1]`; `title Sales Revenue`, `bar [1]`; `x-axis Q1 [a, b]`, `bar [1, 2]`; `x-axis [barley, wheat]`, `bar [1, 2]` |
| reject-09…11 | `bar [1, 2` (unclosed); `x-axis [a, a]`, `bar [1, 2]`; `y-axis 5 --> 5`, `line [5]` |
| reject-12, -13 | `%% expect 60 fallback`, `%% expect 120 natural`, `xychart-beta horizontal`, `x-axis [` + a one-word 50-letter category of `q`s + `]`, `bar [1]` (a vertical header would fit in 56 cells); nine `line [1]` series |
| reject-14…17 | ok-01's body plus: `` title "`**Sales**`" `` (a markdown string); a second `x-axis [a, b]`; then alone, `bar [0, 0]` with no `y-axis` (an all-zero implicit range); 27 `bar [1]` series |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/xychart/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/xychart_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add xychart fixtures and goldens"`

### T74: Quadrant parse and module
**Group** G4 · **Deps** T40, T43, T46 · **Covers** matrix quadrant (subset, text design, numbers, collisions, ladder), quadrant-reject-01…07, -10…15
**Files:** create `core/diagrams/quadrant/parse.ts`.
- **Model:** `Quadrant = { title, x: [string, string | null] | null, y: [string, string | null] | null, quads: (string | null)[], points: { name, x: Num, y: Num }[], fields: { owner, text }[] }`.
- `fields` lists the quadrant and x-axis texts in source order (an axis: left, then right).
- **Also:** replace T40's stub in `core/diagrams/quadrant/layout.ts` (export `quadrant`).
- **Test:** `tests/core/quadrant-layout_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (body: string, columns: number) => explain(`quadrantChart\n${body}`, { columns, theme: 'mono' }) as any
const REACH = ['title Reach', 'x-axis Low --> High', 'y-axis Cold --> Hot', 'quadrant-1 Expand', 'quadrant-2 Promote', 'quadrant-3 Rethink', 'quadrant-4 Improve',
  'A: [0.3, 0.6]', 'B: [0.45, 0.23]', 'C: [0.78, 0.34]'].join('\n')
const H = (l: string, m: string, r: string) => l + '─'.repeat(10) + m + '─'.repeat(10) + r, C = (a: string, b: string) => '│' + a.padEnd(10) + '│' + b.padEnd(10) + '│', E = C('', '')
test('A4: the matrix sketch at q = 10: four quadrants, centered texts, point keys, axis texts and the legend', () => {
  const r = X(REACH, 23); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), ['Reach', '↑ Hot', H('┌', '┬', '┐'), C(' Promote', '  Expand'), E, E, E, C('      1', ''), E, H('├', '┼', '┤'), C(' Rethink', ' Improve'),
    E, C('', '     3'), C('         2', ''), E, E, H('└', '┴', '┘'), ' Low' + ' '.repeat(8) + 'High', '↓ Cold', '1 A (0.3, 0.6)', '2 B (0.45, 0.23)', '3 C (0.78, 0.34)'])
})
test('A4.fit-ladder: a text wider than q keys every quadrant and x-axis text, in source order; q < 8 falls back', () => {
  const r = X(REACH.replace('Promote', 'Promote widely'), 23), t = text(r.drawing); assert.equal(r.step, 'keyed')
  assert.deepEqual([t[3], t[17]], [C('    d', '    c'), ' a' + ' '.repeat(10) + 'b'])
  assert.deepEqual(t.slice(19, 25), ['a Low', 'b High', 'c Expand', 'd Promote widely', 'e Rethink', 'f Improve'])
  assert.deepEqual(X(REACH, 18), { reason: 'too-wide' })
})
test('A4: a point in or next to a key on its row joins that key; every point keeps its own legend row', () =>
  assert.deepEqual(text(X('A: [0.3, 0.6]\nB: [0.3, 0.6]\nC: [0.32, 0.6]\nA: [0.8, 0.2]', 80).drawing).slice(-4),
    ['1 A (0.3, 0.6)', '1 B (0.3, 0.6)', '1 C (0.32, 0.6)', '2 A (0.8, 0.2)']))
test('A5.errors: point styles, bad coordinates, a lone -->, repeats and a keyword-led name fall back', () => {
  for (const [body, why] of [['A: [0.3, 0.6] radius: 12', 'syntax:2'], ['A: [1.2, 0.5]', 'syntax:2'], ['A: [1.0, 0.5]', 'syntax:2'], ['x-axis Low -->', 'syntax:2'],
    ['quadrant-1 A\nquadrant-1 B', 'repeat:3'], ['A: [0.3 0.6]', 'syntax:2'], ['Titled work: [0.3, 0.6]', 'syntax:2']] as const) assert.deepEqual(X(body, 80), { reason: why }, body)
})
```
- [ ] **Run** `node --test tests/core/quadrant-layout_test.ts` → FAIL: `TypeError: Cannot read properties of undefined (reading 'cells')` (the stub).
- [ ] **Implement:**
  - **Parse:**
    - The header is `quadrantChart`. Statements: `title <any text>`; `x-axis <t> [--> <t>]`; `y-axis <t> [--> <t>]`; `quadrant-1`…`4 <t>`; `<t>: [<x>, <y>]`.
    - A coordinate is `0|1|0\.\d+`.
    - A text is `"…"`, or unquoted: letters, digits, spaces, non-ASCII and `!#$%&'*+,./=?\_-`, not starting with `-`. No keyword (title, x-axis, y-axis, quadrant-1…4, classDef, quadrantChart) may begin a run of ASCII letters, in any case.
    - Each of these fails `syntax:<n>`: a point style (`radius:` …), `--> ` with no right text, a markdown string, any other coordinate.
    - A repeated `x-axis`, `y-axis` or `quadrant-N` fails `repeat:<n>`.
    - Ignored: `classDef`, a point's `:::name`, `accTitle`, `accDescr` and config. Point names may repeat.
  - **Layout:**
    - **Size:** `q = min(30, ⌊(cols − 3)/2⌋)`; q < 8 fails `too-wide`.
    - **Steps:** `natural` fails `too-wide` when a quadrant or x-axis text is wider than q. `keyed` draws every such text as its field key, `fieldKey(k)` in `fields` order, owned by the field (§5).
    - **Rows:**
      - `heading(title)`, then `↑ <top>` when there is a top text. The y-axis texts and the title wrap like header rows.
      - The frame, `2q + 3` cells (frame role): each half is a title row, its texts centered with odd space on the right, then 5 point rows. `├…┼…┤` sits between the halves.
      - The x-axis texts at the first cell of their halves; then `↓ <bottom>`.
      - The legend, in the source order of the statements: `key text` for fields, and `key name (x, y)` for points, with coordinates as written.
    - **Points:**
      - A point's column is `min(2q − 1, ⌊2q·x⌋)` and its row `min(9, ⌊10·y⌋)`, counted from the bottom; `Dec` math.
      - A point whose key would sit in, or next to on its row, an existing key's cells joins the lowest such key. Otherwise it takes the next `pointKey`. Keys are drawn after grouping, each once with `cv.key`, rightward from its first point's cell, in `s1`, owned by every point it stands for. Each point's legend row is `{ key, item: 'p<i>', cls: 'point' }`; a keyed field's row has its own owner as `item` and `cls: 'field'`. `keyable` lists every point and every field, so T87 checks each key in place, in the legend, and all or none.
      - A key that would run into the cross or the frame fails `key-collision`.
    - **Frame:** the plot box is a frame, listed in A's `expect.frames`; T48 checks every type's frames.
  - **Roles:** frame and cross `frame`; quadrant, axis and point-name texts and `↑↓` `label`; title `title`; coordinates `value`.
- [ ] **Done when:** `node --test tests/core/quadrant-layout_test.ts` passes.
- [ ] **Commit:** `git commit -m "Parse and draw quadrant charts with point keys"`

### T75: Quadrant fixtures and goldens
**Group** G5 · **Deps** T48, T74 · **Covers** every quadrant-ok and quadrant-reject fixture; A4, A4.fit-ladder, A5.errors, A5 (coverage), A7
**Files:** create `fixtures/quadrant/quadrant-{ok-01…10,reject-01…09}.mmd` and `goldens/quadrant/*.golden`. Test: `tests/golden/quadrant_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { coverageOf, fx, spanOf } from './c-lib.ts'; import { text } from '../core/graph-fixture.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/quadrant').map(f => f.replace('.mmd', ''))
const T = (id: string, w: number) => text((explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing)
test('A5: every quadrant coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'quadrant', ids), []))
test("A4: quadrant-ok-01's key 1 is at column 18, row 6 (q = 30) and at column 16 (q = 28); quadrant-ok-09's legend row wraps at 59", () => {
  for (const [w, col] of [[120, 18], [80, 18], [60, 16]] as const) {
    const t = T('quadrant-ok-01', w), top = t.findIndex(l => l.startsWith('┌'))
    assert.equal(t[top + 5]!.indexOf('1'), 1 + col, `@${w}`)   // row 6 is the 4th point row, under the top half's title row
  }
  assert.equal(T('quadrant-ok-09', 60).filter(l => l.startsWith('1 ')).length, 1); assert.match(T('quadrant-ok-09', 59).at(-1)!, /^ {2}\S/)
})
test('A7: point keys take s1; the frame takes frame; coordinates take value', () => {
  const r = renderMermaid(fx('quadrant-ok-01'), { columns: 80, theme: 'nord' })!, n = THEMES.nord
  assert.deepEqual([spanOf(r, /^1$/)?.color, spanOf(r, /^┌─+┬─+┐$/)?.color, spanOf(r, /^\(0\.3, 0\.6\)$/)?.color], [n.series.s1, n.roles.frame, n.roles.value])
})
```
- [ ] **Run** `node --test tests/golden/quadrant_test.ts` → FAIL: `ENOENT: no such file or directory, scandir 'fixtures/quadrant'`.
- [ ] **Fixtures** (each body follows `quadrantChart`; docs examples are copied from `quadrantChart.md` at `1fb78698`):

| IDs | Content |
|---|---|
| ok-01, -02 | the docs campaign example (title, both axes, four quadrant texts, Campaigns A–F); `x-axis Low --> High`, `y-axis Low --> High`, `P0: [0, 0]`, `P1: [1, 1]`, `Mid: [0.5, 0.5]` (1 clamps to the last cell; 0.5 lies right of and above the cross) |
| ok-03, -04 | frontmatter `title: Priorities`, then `quadrantChart`, `%% a comment`, `x-axis "Effort"`, `y-axis "Value"`, `A: [0.2, 0.7]` (no quadrant texts; no `↑` row); `A: [0.3, 0.6]`, `B: [0.3, 0.6]`, `C: [0.32, 0.6]`, `A: [0.8, 0.2]` |
| ok-05 | 12 points: `P1: [0.05, 0.05]`, `P2: [0.15, 0.15]`, … `P9: [0.85, 0.85]`, `P10: [0.15, 0.85]`, `P11: [0.65, 0.15]`, `P12: [0.95, 0.45]` (keys 10–12 take two cells; no two keys meet) |
| ok-06, -07 | `title 市场分析`, `x-axis 低成本 --> 高成本`, `y-axis 低价值 --> 高价值`, `quadrant-1 扩展`, `quadrant-2 推广`, `quadrant-3 观望`, `quadrant-4 改进`, `甲: [0.3, 0.6]`, `乙: [0.7, 0.4]`; the docs config example (`"Important ❤"`, config ignored, no points, so no legend) |
| ok-08 | `%% expect 60 natural`, `%% expect 59 natural`, `%% expect 58 keyed`, `quadrant-1 Expand into adjacent markets` (28 cells), `A: [0.5, 0.5]` |
| ok-09 | `%% expect 60 natural widest 60`, `Expand the partner network across each region: [0.25, 0.75]` (the legend row is 1 + 1 + 45 + 1 + 12 = 60 cells) |
| ok-10 | the docs class example (`Point A:::class1: [0.9, 0.0]`, `Point B:::class2: [0.8, 0.1]`, `Point C:::class3: [0.7, 0.2]`, `Point D:::class3: [0.7, 0.2]`, its `classDef` lines): C and D share key 3; four legend rows |
| reject-01…04 | ok-01's body plus `Point A: [0.9, 0.0] radius: 12`; `A: [1.2, 0.5]`; `A: [1.0, 0.5]`; `x-axis Low -->` |
| reject-05…07 | `quadrant-1 A`, `quadrant-1 B`; `A: [0.3 0.6]`; `Titled work: [0.3, 0.6]` |
| reject-08, -09 | ok-05's `P1`…`P9`, then `J: [0.49, 0.5]`: J takes key 10 in the left half's last cell, so the key runs into the cross; `%% expect 18 fallback` and the docs campaign example (q = 7) |
| reject-10…15 | ok-01's body plus: `` quadrant-1 "`**A**`" `` (markdown); a second `x-axis Low --> High`; `A: [.5, 0.5]`; `Point A: [0.9, 0.0] color: #ff3300`; `… stroke-color: #10f0f0`; `… stroke-width: 5px` |

- [ ] **Done when:** `UPDATE_GOLDEN=1 node --test tests/golden/c-golden_test.ts` writes `goldens/quadrant/`. After each golden is read, `node --test tests/golden/c-golden_test.ts tests/golden/quadrant_test.ts tests/golden/golden_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add quadrant fixtures and goldens"`
