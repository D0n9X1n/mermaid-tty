# mermaid-tty v1 A — tasks T0–T11 (scaffold, core)

**Depends on:** `2026-10-28-mermaid-tty-v1-A-renderer.md`: the interfaces in §6, the algorithms in §7, the checks in §9 and the review format in §10. A3 (`…-A3-tasks.md`, T12–T21), A4 (`…-A4-tasks.md`, T22–T32) and A5 (`…-A5-tasks.md`, T33–T39) depend on T0–T11 here.
**Conventions:**
- Every test title starts with its check ID.
- Node tests are `*_test.ts`, run as `node --test <file>`. Kit tests are `tests/hooks/*.test.tsx`, run by `claude plugin test .`.
- Imports carry the `.ts`/`.tsx` suffix.
- Each task ends with one commit carrying the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Parallel groups:** tasks in one group touch disjoint files. A group starts when every dependency of its tasks is merged.
- **Done-when:** each task's own command. `scripts/check.sh` goes green only at T38, when every row of §9 exists.

## File structure (A2–A5)
```text
.gitattributes .gitignore package.json tsconfig.json README.md(B)      T0
.claude-plugin/{plugin.json,marketplace.json}  hooks/{hooks.json,register.tsx}  T0, T21, T22
types/mermaid-tty.d.ts (PluginState)                              T0, T22
hooks/{fences.ts T8, mode.ts T21}
core/{fail.ts T0, width.ts width-table.ts T2, glyphs.ts box-table.ts T3, caps.ts T4, themes.ts color.ts T5, lru.ts T6,
      source.ts T7, text.ts T9, canvas.ts T10, validate.ts T11, fit.ts registry.ts T12, render.ts T19}
core/graph/{model.ts layered.ts T16, route.ts T17, draw.ts T18}
core/diagrams/flowchart/{parse.ts T13-T15, layout.ts T19}   core/diagrams/sequence/{parse.ts T23, layout.ts T24}
fixtures/{flowchart T20, sequence T25, corpus T29}/*.mmd    goldens/{flowchart,sequence}/*.golden  T20, T25
tests/core/*_test.ts  tests/golden/golden_test.ts (T20)  tests/hooks/{*_test.ts,*.test.tsx}  tests/scripts/*_test.ts
scripts/{check.sh check.ts check-ids.ts lib/check-ids.ts lib/claude.ts T1, gen-width-table.ts T2, gen-box-table.ts T3, check-palettes.ts T5,
         smoke.ts explain.ts T19, check-portable.ts fresh-clone.ts T27, bench.ts T28, gen-corpus.ts corpus-gate.ts T29,
         render-svg.ts render-gallery.ts T30, lib/tangle.ts check-tangle.ts T31, check-review-hashes.ts T32}
scripts/e2e/{package.json package-lock.json CLAUDE_VERSION reply.ts mock.ts T33, env.ts driver.ts screen.ts T34, assert.ts run.ts T35-T37, stored.ts T36}
scripts/{typecheck.ts TS_VERSION} T39
docs/decisions/task0-spikes.md T0    docs/reviews/ (PM)
```

### T0: Scaffold, line endings and loader spike
**Group** P0 · **Deps** none · **Covers** A8.platforms (`.gitattributes`), A8.validation (manifest, state declaration), S4, S6, S7
**Files:** create `.gitattributes`, `.gitignore`, `package.json`, `tsconfig.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/mermaid-tty.d.ts`, `core/fail.ts` (§6) and `docs/decisions/task0-spikes.md`. Test: `tests/hooks/loader.test.tsx`.
- [ ] **Failing test:** a mermaid reply draws the keyed probe, which proves that the `.ts` import loaded (F1).
```tsx
import { test, expect } from 'claude-code/testing'
test('A8.no-build: hooks import core with .ts suffixes; the hyphenated $.state key round-trips', async $ => {
  const mount = () => $.ui.mount({ plugin: 'mermaid-tty', surface: 'terminal', component: 'AssistantMessage',
    props: { text: '```mermaid\nflowchart TD\nA-->B\n```', isFirstOfReply: true }, viewport: { columns: 80, rows: 24 } })
  expect((await (await mount()).find({ key: 'mermaid-0' }))?.text).toBe('probe:false:false')
  await $.command.run({ command: 'mermaid-tty', args: 'source' })
  expect((await (await mount()).find({ key: 'mermaid-0' }))?.text).toBe('probe:false:true')
})
```
- [ ] **Run** `claude plugin test .` → FAIL: `plugin mermaid-tty not found` (no manifest yet).
- [ ] **Implement:**
  - `package.json`: `{"name":"mermaid-tty","version":"1.0.0","private":true,"type":"module","license":"MIT","engines":{"node":">=24"}}`, with no `dependencies`.
  - `.gitattributes`: `* text=auto eol=lf` and `*.png binary`. `.gitignore`: `.claude-plugin/types/`, `node_modules/`, `scripts/e2e/node_modules/`.
  - `tsconfig.json`: the options from types `index.d.ts:67-77`, with `"types": []` and `allowImportingTsExtensions: true`. It is for editors; CI's type check is T39 (D2).
  - `plugin.json` holds the userConfig shown in F8, with options `default`, `nord`, `dracula`, `gruvbox`, `solarized`, `mono`, and `"types": "./types/mermaid-tty.d.ts"`. `marketplace.json` (F8) has `source: "./"`. `hooks/hooks.json` is `{"modules":["./register.tsx"]}`.
  - `types/mermaid-tty.d.ts`: `declare module 'claude-code' { interface PluginState { 'mermaid-tty': { source: boolean } } }`.
  - `register.tsx` (probe; T21 and T22 replace it): `SOURCE = { plugin: 'mermaid-tty', key: 'source' }`. `session.start` registers `mermaid-tty`; `command.run` on it does `$.state.set(SOURCE, true)`. On the terminal, a reply holding "```mermaid" reads `src = (await $.state.get(SOURCE)).value === true` and returns `<Box key="mermaid-0"><Text>{'probe:' + String(isFail(null)) + ':' + String(src)}</Text></Box>`; every other reply returns `next(e)`.
  - `task0-spikes.md` records S4 (the alias list checked against `flowchart.md` at `1fb78698`), S6 (the hyphenated key; fallback `mermaidTty` for the `PluginState` key and `SOURCE.plugin`, everywhere) and S7 (the kit's `$.command.run` reaches the command; fallback in main §2). S2 closes on the first CI run of B's ci.yml.
- [ ] **Done when:** `claude plugin test .` passes, and `claude plugin validate .` passes, reports `declares state: …`, and warns only about the icon.
- [ ] **Commit:** `git add -A && git commit -m "Scaffold mermaid-tty mod; prove .ts imports load"`

### T1: The must-pass entry, the per-ID runner and ID parity
**Group** P1 · **Deps** T0 · **Covers** A8.validation, B7 binding (§9), the platform entry (§3)
**Files:** create `scripts/check.sh` (exactly as in §9), `scripts/check.ts`, `scripts/lib/check-ids.ts` (the one ID parser; B's `check-ci-coverage.ts` imports it), `scripts/check-ids.ts` (its CLI) and `scripts/lib/claude.ts`. Test: `tests/scripts/check-ids_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import { readFileSync } from 'node:fs'
import { parseIds, diffIds, slug } from '../../scripts/lib/check-ids.ts'
const DOC = '## Spec A\n| A4 | Width | **Width table:** x. **Fit ladder:** y. **not a label** z |\n| A9 | E | **Stored / copied:** z |\n## Visual review (*review*)\n**Gallery:** g\n## Spec B\n| B7 | CI | **Check IDs:** c |\n'
test('A8.validation: only bold text with the colon inside is a label; slugs collapse non-[a-z0-9] runs (B7)', () => {
  assert.deepEqual(parseIds(DOC), ['A4', 'A4.width-table', 'A4.fit-ladder', 'A9', 'A9.stored-copied', 'VR.gallery', 'B7', 'B7.check-ids'])
  assert.equal(slug('Stored / copied'), 'stored-copied'); assert.equal(slug('No build'), 'no-build')
})
test('A8.validation: the real acceptance file yields exactly the 48 B7 IDs, in order', () => assert.deepEqual(
  parseIds(readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', 'utf8')), ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 ' +
  'A6.hook-tests A6.command A6.in-claude-code A7 A8 A8.portability A8.benchmark A8.cache A8.no-build A8.validation A8.platforms A9 A9.harness A9.stored A9.release ' +
  'A10 VR.gallery VR.in-ci VR.reviewers VR.tangled VR.passes B1 B1.docs-check B1.beauty-review B2 B2.per-paragraph B2.translation-review B3 B3.publish-test ' +
  'B3.workflow-check B3.release B4 B5 B5.every-pr B5.release B6 B7 B7.check-ids').split(' ')))
test('A8.validation: diff reports missing and extra IDs', () =>
  assert.deepEqual(diffIds(['A4', 'A4.width-table'], ['A4', 'A9.harness']), { missing: ['A4.width-table'], extra: ['A9.harness'] }))
test('A8.validation: an unknown ID fails', () =>
  assert.equal(spawnSync(process.execPath, ['scripts/check.ts', 'A99']).status, 1))
```
- [ ] **Run** `node --test tests/scripts/check-ids_test.ts` → FAIL: `Cannot find module …/scripts/check-ids.ts`.
- [ ] **Implement:**
  - **`lib/claude.ts`:** `export function claude(args: string[]): number`. It calls `spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' })`, prints `r.error` on failure, and returns `r.status ?? 1`.
  - **`check.ts`:** `export const CHECKS: { id: string; steps: string[][]; inAll?: false }[]`, one row per ID in §9, in §9's order.
    - Step tokens: `['@nt']` runs the Node tests filtered by the row ID; `['@kit']` runs `claude plugin test .`; `['@tmp']` as an argument becomes a fresh `mkdtempSync(join(tmpdir(), 'mtty-'))`; `node` becomes `process.execPath`; `claude` goes through `lib/claude.ts`.
    - `@nt` lists `tests/**/*_test.ts` with a `readdirSync` walk. It runs `--test --test-reporter=tap --test-name-pattern=^<escaped ID>\b <files>`, echoes the output, and fails unless the exit code is 0 and `# pass N` has N > 0.
    - `all` runs `@nt` once with no filter, then every other distinct step of the rows not marked `inAll: false`, deduplicated by `JSON.stringify` and run in table order, except `@kit` and `claude plugin validate .`, which `check.sh` runs itself. It exits at the first non-zero result.
    - An unknown ID prints `unknown check <ID>` and exits 1. `main()` runs only when `process.argv[1]` resolves to this file.
  - **`lib/check-ids.ts`** (B7's rules exactly; `check-ids.ts` is its CLI):
    - `parseIds(md)` (B7's rule): in `## Spec A` and `## Spec B`, every `| ([AB]\d+) |` row gives its ID, plus `<row>.<slug>` for each label in the row: bold text with the colon inside, `/\*\*([^*:]+):\*\*/g`. In `## Visual review`, each label gives `VR.<slug>` (no bare `VR`). IDs keep document order. `slug(s)` lowercases, collapses every run of characters outside `[a-z0-9]` into one `-`, and trims `-` at the ends.
    - `diffIds(doc, rows)` returns `{ missing, extra }`.
    - `main` compares the acceptance doc's A and VR IDs (31 of the 48) with `CHECKS` ids and exits 1 on any difference. B's `check-ci-coverage.ts` imports `parseIds` for all 48.
- [ ] **Done when:** the test passes, and `node scripts/check.ts A8.validation` passes. It runs `claude plugin validate .` and the tests above.
- [ ] **Commit:** `git commit -m "Add check.sh entry, per-ID check runner and ID parity"`

### T2: Width
**Group** P1 · **Deps** T0 · **Covers** A4.width-table, R4
**Files:** create `core/width.ts` and `scripts/gen-width-table.ts`; generate and commit `core/width-table.ts`. Test: `tests/core/width_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { width, unsupported, isWide } from '../../core/width.ts'
test('A4.width-table: widths', () => {
  for (const [s, w] of [['a', 1], ['中', 2], ['ア', 2], ['한', 2], ['─', 1], ['│', 1], ['┌', 1], ['◇', 1], ['▶', 1],
    ['é', 1], ['​', 0], ['读取配置文件', 12]] as const) assert.equal(width(s), w, JSON.stringify(s))
  assert.equal(isWide(0x1F680), true)
})
test('A4.width-table: unsupported text falls back', () => {
  for (const s of ['👨\u{200D}👩', '✔\u{FE0F}', '✔\u{FE0E}', 'a\u{FE00}', 'a\u{E0100}', '🇨🇳', '👍🏽', 'a\u0007b', 'a\u{200F}b']) assert.notEqual(unsupported(s), null, s)
  for (const s of ['plain', '中文', 'é', 'a​b']) assert.equal(unsupported(s), null, s)
})
```
- [ ] **Run** `node --test tests/core/width_test.ts` → FAIL: `Cannot find module …/core/width.ts`.
- [ ] **Implement:**
```ts
import { WIDE } from './width-table.ts'
const ZERO = /[\p{Mn}\p{Me}​‌⁠﻿]/u
const BAD = /[\u{200D}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\p{Cc}]/u   // every variation selector (R4)
export function isWide(cp: number): boolean {
  let lo = 0, hi = WIDE.length / 2 - 1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cp < WIDE[2 * m]!) hi = m - 1; else if (cp > WIDE[2 * m + 1]!) lo = m + 1; else return true }
  return false
}
export function width(s: string): number { let w = 0; for (const ch of s) w += ZERO.test(ch) ? 0 : isWide(ch.codePointAt(0)!) ? 2 : 1; return w }
export function unsupported(s: string): string | null {
  for (const ch of s) if (BAD.test(ch) || (/\p{Cf}/u.test(ch) && !ZERO.test(ch))) return 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
  return null
}
```
  - **Generator:** `node scripts/gen-width-table.ts <EastAsianWidth.txt> > core/width-table.ts` (Unicode 16.0.0, from unicode.org/Public/16.0.0/ucd/). It keeps the `W` and `F` ranges, merges adjacent ones, and writes `export const WIDE: readonly number[] = [lo, hi, …]` under a header naming the version.
- [ ] **Done when:** `node --test tests/core/width_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add width(), unsupported() and the generated EAW table"`

### T3: Glyph allow-list and box glyphs by arm weight
**Group** P1 · **Deps** T0 · **Covers** A8.platforms, F13, matrix rule 12 (mixed junctions), flowchart-ok-50…52 (glyph choice)
**Files:** create `core/glyphs.ts`, `scripts/gen-box-table.ts` and the generated, committed `core/box-table.ts`. Test: `tests/core/glyphs_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { GLYPHS, boxGlyph, junction } from '../../core/glyphs.ts'; import { BOX } from '../../core/box-table.ts'
const MATRIX = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')
const inBox = (g: string) => g.codePointAt(0)! >= 0x2500 && g.codePointAt(0)! <= 0x257f
test('A8.platforms: GLYPHS is rule 12: ASCII, Box Drawing, section-named glyphs; no non-ASCII Emoji', () => {
  for (const g of GLYPHS) if (g > '~' && !inBox(g)) assert.ok(MATRIX.includes(g), `not named: ${g}`)
  for (const g of GLYPHS) if (g > '~') assert.ok(!/\p{Emoji}/u.test(g), `emoji: ${g}`)
  assert.ok(GLYPHS.has('►') && GLYPHS.has('╂') && !GLYPHS.has('▶'))
})
test('A8.platforms: box glyphs by arm weight (up right down left; 0 none, 1 light, 2 heavy)', () => {
  assert.equal(Object.keys(BOX).length, 80)
  for (const [arms, g] of [['1010', '│'], ['1111', '┼'], ['0110', '┌'], ['0220', '┏'], ['0120', '┎'], ['2121', '╂'], ['1212', '┿'],
    ['2120', '┠'], ['1210', '┝'], ['0222', '┳'], ['2222', '╋']] as const) assert.equal(boxGlyph(arms), g, arms)
  assert.equal(junction(10, 'dotted'), '┄'); assert.equal(junction(5, 'dotted'), '┆'); assert.equal(junction(6, 'dotted'), '┌')
  assert.equal(junction(6, 'heavy'), '┏'); assert.equal(junction(14, 'heavy'), '┳')
})
```
- [ ] **Run** `node --test tests/core/glyphs_test.ts` → FAIL: `Cannot find module …/core/glyphs.ts`.
- [ ] **Implement:**
```ts
import { BOX } from './box-table.ts'          // generated: arms 'urdl' (0 none, 1 light, 2 heavy) → glyph; 80 entries
export const boxGlyph = (arms: string): string => BOX[arms]!   // arms is never '0000'
export function junction(dirs: number, w: 'light' | 'heavy' | 'dotted'): string {
  if (w === 'dotted' && (dirs === 1 || dirs === 4 || dirs === 5)) return '┆'
  if (w === 'dotted' && (dirs === 2 || dirs === 8 || dirs === 10)) return '┄'
  const k = w === 'heavy' ? '2' : '1'                                // a dashed line bends and branches light (rule 12)
  return boxGlyph([1, 2, 4, 8].map(b => (dirs & b ? k : '0')).join(''))
}
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))
const BOXES = Array.from({ length: 128 }, (_, i) => String.fromCharCode(0x2500 + i))
export const GLYPHS: ReadonlySet<string> = new Set([...ASCII, ...BOXES, ...'►◄▲▼◇●◉'])
export const isAllowed = (g: string): boolean => GLYPHS.has(g)
```
  - **`gen-box-table.ts <UnicodeData.txt> > core/box-table.ts`** (Unicode 16.0.0):
    - For U+2500–U+257F, skip names holding DOUBLE, SINGLE, ARC, DASH or DIAGONAL, and split the rest at ` AND `.
    - Each part names directions (UP, DOWN, LEFT, RIGHT; VERTICAL is up and down; HORIZONTAL is left and right) and a weight (LIGHT 1, HEAVY 2). A part without a weight takes the other part's.
    - It writes `export const BOX: Readonly<Record<string, string>>` keyed by `urdl`; the test pins 80 entries.
- [ ] **Done when:** `node --test tests/core/glyphs_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the rule-12 glyph set and box glyphs by arm weight"`

### T4: End caps and shape aliases
**Group** P1 · **Deps** T0 · **Covers** A3 (distinct caps in mono), A1 (`@{shape}`), matrix End caps, S4
**Files:** create `core/caps.ts`. Test: `tests/core/caps_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { CAPS, shapeFromName } from '../../core/caps.ts'
test('A3: every shape has its own cap pair', () => {
  const seen = new Map<string, string>()
  for (const [s, [l, r]] of Object.entries(CAPS)) { const k = `${l}\u0000${r}`; assert.ok(!seen.has(k), `${s} = ${seen.get(k)}`); seen.set(k, s) }
})
test('A1: @{shape} names resolve; unknown → rect', () => {
  assert.equal(shapeFromName('cyl'), 'cylinder'); assert.equal(shapeFromName('diam'), 'diamond'); assert.equal(shapeFromName('h-cyl'), 'hcyl')
  assert.equal(shapeFromName('no-such-shape'), 'rect'); assert.deepEqual(CAPS.stadium, ['([', '])']); assert.deepEqual(CAPS.arrowR, ['', '►'])
})
```
- [ ] **Run** `node --test tests/core/caps_test.ts` → FAIL: `Cannot find module …/core/caps.ts`.
- [ ] **Implement:** `export const CAPS: Readonly<Record<Shape, readonly [string, string]>>` transcribes matrix lines 42–62 at 8135944: rect `[ ]`, round `( )`, stadium `([ ])`, subroutine `[[ ]]`, cylinder `[( )]`, hcyl `(| |)`, circle `(( ))`, dcircle `((( )))`, diamond `{ }`, hexagon `{{ }}`, leanR `/ /`, leanL `\ \`, trap `/ \`, trapInv `\ /`, asym `> ]`, bang `)) ((`, cloud `) (`, arrowR `'' ►`, arrowL `◄ ''`, arrowU `▲ ''`, arrowD `'' ▼`, plain `'' ''`. `shapeFromName(n)` returns `ALIASES[n.trim()] ?? 'rect'`. `ALIASES` (S4 checks it against flowchart.md):
```ts
rect rectangle proc process → rect · rounded event → round · stadium pill terminal → stadium
fr-rect framed-rectangle subproc subprocess subroutine → subroutine · cyl cylinder database db → cylinder
h-cyl das horizontal-cylinder → hcyl · circle circ → circle · dbl-circ double-circle → dcircle
diam diamond decision question → diamond · hex hexagon prepare → hexagon · lean-r lean-right in-out → leanR
lean-l lean-left out-in → leanL · trap-b trapezoid priority → trap · trap-t inv-trapezoid manual → trapInv · odd → asym
```
- [ ] **Done when:** `node --test tests/core/caps_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the end-caps table and @{shape} aliases"`

### T5: Themes, palettes and color checks
**Group** P1 · **Deps** T0 · **Covers** A7, VR.in-ci (contrast ≥ 3:1; ΔOKLab ≥ 0.08 pairwise over the 9 roles and over s1–s8), matrix rule 9 (s1–s8)
**Files:** create `core/themes.ts`, `core/color.ts`, `scripts/check-palettes.ts`. Test: `tests/core/themes_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { THEMES, palette } from '../../core/themes.ts'
import { contrast, oklabDistance } from '../../core/color.ts'; import { paletteProblems } from '../../scripts/check-palettes.ts'
const R = ['node', 'decision', 'edge', 'arrow', 'label', 'frame', 'note'] as const
const T = { default: 'suggestion warning inactive claude text permission subtle',
  nord: '#88C0D0 #EBCB8B #D8DEE9 #BF616A #A3BE8C #B48EAD #5E81AC', dracula: '#8BE9FD #F1FA8C #F8F8F2 #FF79C6 #50FA7B #BD93F9 #FFB86C',
  gruvbox: '#83A598 #FABD2F #928374 #FB4934 #B8BB26 #D3869B #FE8019', solarized: '#268BD2 #B58900 #93A1A1 #CB4B16 #EEE8D5 #D33682 #2AA198' }
test('A7: the 7 role colors under the default mapping and each palette', () => {
  for (const [t, cs] of Object.entries(T)) cs.split(' ').forEach((c, i) => assert.equal(THEMES[t as 'nord'].roles[R[i]!], c, `${t}.${R[i]}`))
  for (const r of R) assert.equal(THEMES.mono.roles[r], null)
  for (const p of Object.values(THEMES)) assert.equal(Object.keys(p.series).length, 8)
  assert.equal(palette('nope').name, 'default'); assert.equal(THEMES.mono.fill, false)
})
test('VR.in-ci: color math and curated palettes', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21); assert.ok(Math.abs(oklabDistance('#000000', '#FFFFFF') - 1) < 0.01)
  assert.deepEqual(paletteProblems(), [])
})
```
- [ ] **Run** `node --test tests/core/themes_test.ts` → FAIL: `Cannot find module …/core/themes.ts`.
- [ ] **Implement:** `themes.ts` gives `roles` exactly as in `T`; mono's roles are all null. The other fields:

| Theme | background | onFill | title | value | s1…s8 | fill | dim |
|---|---|---|---|---|---|---|---|
| default | null | `inverseText` | `text` | `success` | suggestion success warning error merged claude permission planMode | true | [] |
| nord | #2E3440 | #2E3440 | #D08770 | #81A1C1 | 88C0D0 A3BE8C EBCB8B D08770 B48EAD 81A1C1 BF616A 5E81AC | true | [] |
| dracula | #282A36 | #282A36 | #FF5555 | #6272A4 | 8BE9FD 50FA7B F1FA8C FFB86C FF79C6 BD93F9 FF5555 6272A4 | true | [] |
| gruvbox | #282828 | #282828 | #EBDBB2 | #458588 | 83A598 B8BB26 FABD2F FE8019 FB4934 D3869B 458588 928374 | true | [] |
| solarized | #002B36 | #FDF6E3 | #6C71C4 | #859900 | 268BD2 859900 B58900 CB4B16 93A1A1 D33682 6C71C4 2AA198 | true | [] |
| mono | null | null | null | null | all null | false | [] |

Series values are `#`-prefixed in code. No theme sets `dim`: CC's `dimColor` is itself a color, and mono must carry none (A3, A9).
```ts
const lin = (h: string, i: number) => { const c = parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (h: string) => 0.2126 * lin(h, 0) + 0.7152 * lin(h, 1) + 0.0722 * lin(h, 2)
export function contrast(a: string, b: string): number { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
function oklab(h: string): [number, number, number] {
  const [r, g, b] = [lin(h, 0), lin(h, 1), lin(h, 2)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function oklabDistance(a: string, b: string): number { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }
```
  - **`check-palettes.ts`:** exports `paletteProblems(): string[]`. For nord, dracula, gruvbox and solarized: every one of the 9 roles has `contrast(color, background) ≥ 3`, and every pair among the 9 roles (the 7 plus `title` and `value`) and every pair among `s1`–`s8` has `oklabDistance ≥ 0.08` (PM, 2026-10-28). Mono is exempt, and so is default, which uses theme keys. `main` prints the table and exits 1 on any problem. The values above already remove the collisions found by hand (Dracula `title` = `edge` and `value` = `label`; Nord, Gruvbox and Solarized `title`, `value` and series pairs; Gruvbox `edge`). A failure that remains takes R8, and `T` is updated to match.
- [ ] **Done when:** `node --test tests/core/themes_test.ts` passes and `node scripts/check-palettes.ts` exits 0.
- [ ] **Commit:** `git commit -m "Add themes, palettes, contrast and OKLab checks"`

### T6: LRU
**Group** P1 · **Deps** T0 · **Covers** A8.cache
**Files:** create `core/lru.ts`. Test: `tests/core/lru_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createLru } from '../../core/lru.ts'
test('A8.cache: hit, miss, and LRU eviction on the 65th entry', () => {
  const c = createLru<string, number>(64); c.set('a', 1); assert.equal(c.get('a'), 1); assert.equal(c.get('b'), undefined)
  for (let i = 0; i < 63; i++) c.set(`k${i}`, i)
  c.get('a'); c.set('k63', 63)
  assert.equal(c.size, 64); assert.equal(c.get('a'), 1); assert.equal(c.get('k0'), undefined)
})
```
- [ ] **Run** `node --test tests/core/lru_test.ts` → FAIL: `Cannot find module …/core/lru.ts`.
- [ ] **Implement:** a `Map` in recency order. `get` deletes and re-inserts the hit; `set` deletes, inserts, and evicts `m.keys().next().value` when `m.size > capacity`; `size` is a getter.
- [ ] **Done when:** `node --test tests/core/lru_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the LRU cache"`

### T7: Source boundary (CRLF, frontmatter, comments, header)
**Group** P1 · **Deps** T0 · **Covers** matrix common rules 2, 3 · A1 (-37, -38) · A8.platforms (CRLF)
**Files:** create `core/source.ts`. Test: `tests/core/source_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { readSource, type Source } from '../../core/source.ts'
test('A1: CRLF normalized once; frontmatter title; %% comments skipped', () => {
  const s = readSource('---\r\ntitle: "Flow"\r\n---\r\nflowchart TD\r\n%% note\r\n\r\nA-->B\r\n') as Source
  assert.deepEqual([s.header, s.title, s.lines.map(l => l.text)], ['flowchart TD', 'Flow', ['A-->B']])
})
test('A5.errors: init directive and trailing %% fall back', () => {
  assert.deepEqual(readSource('%%{init: {}}%%\nflowchart TD\nA'), { reason: 'directive' })
  assert.deepEqual(readSource('flowchart TD\nA-->B %% x'), { reason: 'directive' })
})
```
- [ ] **Run** `node --test tests/core/source_test.ts` → FAIL: `Cannot find module …/core/source.ts`.
- [ ] **Implement:**
  - Replace `/\r\n?/g` with `\n` (the only normalization in the pipeline).
  - A leading `---` block runs to the next `---`; with no closing line, fail 'frontmatter'. Read `title:` with its quotes stripped; a second `title` fails 'title'; ignore every other key.
  - Skip blank lines and whole-line `%%`. A line starting `%%{`, or a `%%` after text outside quotes, fails 'directive'.
  - The first remaining line, trimmed and with any trailing `;` removed, is `header`. The rest become `lines` with 1-based source numbers `n`. With none left, fail 'empty'.
- [ ] **Done when:** `node --test tests/core/source_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the source boundary: CRLF, frontmatter, comments"`

### T8: Fence splitter
**Group** P1 · **Deps** T0 · **Covers** A6.hook-tests (exact prose, unclosed, CRLF), R6
**Files:** create `hooks/fences.ts`. Test: `tests/hooks/fences_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { splitFences } from '../../hooks/fences.ts'
const F = '```mermaid\nflowchart TD\nA-->B\n```\n', CR = 'Hi\r\n```mermaid\r\nflowchart TD\r\nA-->B\r\n```\r\nBye'
test('A6.hook-tests: prose and fences split and re-join exactly (LF and CRLF)', () => {
  for (const r of [`Intro\n${F}Outro`, `${F}${F}`, `P1\n\n${F}\nP2`, CR]) {
    const s = splitFences(r); assert.equal(s.map(x => x.text).join(''), r); assert.ok(s.some(x => x.kind === 'mermaid'), r)
  }
  assert.deepEqual(splitFences(`Intro\n${F}Outro`).map(x => x.kind), ['prose', 'mermaid', 'prose'])
  assert.equal((splitFences(F)[0] as { body: string }).body, 'flowchart TD\nA-->B')
})
test('A6.hook-tests: unclosed and nested fences stay prose', () => {
  assert.deepEqual(splitFences('x\n```mermaid\nflowchart TD\n'), [{ kind: 'prose', text: 'x\n```mermaid\nflowchart TD\n' }])
  const nested = '````md\n' + F + '````\n'; assert.deepEqual(splitFences(nested), [{ kind: 'prose', text: nested }])
})
```
- [ ] **Run** `node --test tests/hooks/fences_test.ts` → FAIL: `Cannot find module …/hooks/fences.ts`.
- [ ] **Implement:**
```ts
export function splitFences(reply: string): Segment[] {
  const out: Segment[] = []; let from = 0, pos = 0
  let open: { ch: string; len: number; at: number; bodyAt: number; mermaid: boolean } | null = null
  for (const line of reply.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const t = line.replace(/\r?\n$/, ''), next = pos + line.length
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(t)
      if (m && !(m[1]![0] === '`' && m[2]!.includes('`'))) open = { ch: m[1]![0]!, len: m[1]!.length, at: pos, bodyAt: next, mermaid: m[2]!.trim() === 'mermaid' }
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(t)
      if (m && m[1]![0] === open.ch && m[1]!.length >= open.len) {
        if (open.mermaid) {
          if (open.at > from) out.push({ kind: 'prose', text: reply.slice(from, open.at) })
          out.push({ kind: 'mermaid', text: reply.slice(open.at, next), body: reply.slice(open.bodyAt, pos).replace(/\r?\n$/, '') })
          from = next
        }
        open = null
      }
    }
    pos = next
  }
  if (from < reply.length) out.push({ kind: 'prose', text: reply.slice(from) })
  return out
}
```
- [ ] **Done when:** `node --test tests/hooks/fences_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the CRLF-tolerant fence splitter"`

### T9: Label lines and wrapping
**Group** P2 · **Deps** T2 · **Covers** A3 (`<br/>` and wrapped rows), A4.fit-ladder (the wrap step), matrix rule 6
**Files:** create `core/text.ts`. Test: `tests/core/text_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { labelLines, wrap } from '../../core/text.ts'
test('A3: <br> variants split label lines', () => assert.deepEqual(labelLines('a<br>b<br/>c<br />d'), ['a', 'b', 'c', 'd']))
test('A4.fit-ladder: wrap at spaces and between W/F chars; a word wider than max fails', () => {
  assert.deepEqual(wrap('alpha beta gamma', 10), [{ text: 'alpha beta', join: '' }, { text: 'gamma', join: ' ' }])
  assert.deepEqual(wrap('读取配置文件', 8), [{ text: '读取配置', join: '' }, { text: '文件', join: '' }])
  assert.equal(wrap('supercalifragilistic', 8), null)
})
```
- [ ] **Run** `node --test tests/core/text_test.ts` → FAIL: `Cannot find module …/core/text.ts`.
- [ ] **Implement:** `labelLines = (l) => l.split(/<br\s*\/?>/i)`. In `wrap`, a token is a run of non-space characters, split between two adjacent W/F characters; each token remembers whether a space preceded it. Fill greedily:
```ts
export function wrap(line: string, max: number): Piece[] | null {
  const toks: { t: string; sp: boolean }[] = []; let cur = '', sp = false, prevWide = false
  for (const ch of line) {
    if (ch === ' ') { if (cur) toks.push({ t: cur, sp }); cur = ''; sp = true; prevWide = false; continue }
    const w = isWide(ch.codePointAt(0)!); if (w && prevWide && cur) { toks.push({ t: cur, sp }); cur = ''; sp = false }
    cur += ch; prevWide = w
  }
  if (cur) toks.push({ t: cur, sp })
  const out: Piece[] = []
  for (const k of toks) {
    if (width(k.t) > max) return null
    const last = out[out.length - 1], sep = k.sp ? ' ' : ''
    if (last && width(last.text + sep + k.t) <= max) last.text += sep + k.t
    else out.push({ text: k.t, join: out.length ? (sep as Piece['join']) : '' })
  }
  return out
}
```
  - The first piece of every label line after the first gets `join: '\n'`; the drawing code sets it.
- [ ] **Done when:** `node --test tests/core/text_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add label lines and width-aware wrapping"`

### T10: Canvas
**Group** P3 · **Deps** T2, T3, T5, T9 · **Covers** A5.mutation-tests (the conflict log), A8.platforms (glyphs come only from `boxGlyph`, `junction` and `CAPS`), A4 (combining marks join their base cell), matrix rule 12 (mixed junctions)
**Files:** create `core/canvas.ts` (§6). Test: `tests/core/canvas_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createCanvas } from '../../core/canvas.ts'
const E = { labels: [], edges: [], edgeLabels: [] }
test('A5.mutation-tests: wide text takes two cells; shared lines merge into junctions', () => {
  const c = createCanvas(3, 6, 6, (a, b) => a.split('>')[0] === b.split('>')[0])
  assert.equal(c.text(0, 0, '中a', 'label', 'n1'), 3); c.line(1, 1, 10, 'light', 'edge', 'A>B'); c.line(1, 1, 4, 'light', 'edge', 'A>C')
  const d = c.toDrawing(E); assert.equal(d.cells[0]![1]!.kind, 'cont'); assert.equal(d.cells[1]![1]!.ch, '┬'); assert.deepEqual(d.conflicts, [])
})
test('A5.mutation-tests: unrelated owners cross only perpendicular; text is exclusive', () => {
  const c = createCanvas(3, 6, 6)
  c.line(1, 2, 10, 'light', 'edge', 'e1'); c.line(1, 2, 5, 'light', 'edge', 'e2')
  c.line(2, 2, 6, 'light', 'edge', 'e3'); c.line(2, 2, 10, 'light', 'edge', 'e4')
  c.text(0, 0, 'ab', 'label', 'n1'); c.text(0, 1, 'x', 'label', 'n2')
  const d = c.toDrawing(E); assert.equal(d.cells[1]![2]!.ch, '┼'); assert.equal(d.conflicts.length, 2)
})
test('A5.mutation-tests: a combining mark joins its base cell; arms merge into rule-12 mixed glyphs; unrelated meetings conflict', () => {
  const c = createCanvas(4, 8, 8, (a, b) => a.split('>')[0] === b.split('>')[0]); assert.equal(c.text(0, 0, 'e\u{301}x', 'label', 'n1'), 2)
  c.line(2, 2, 5, 'heavy', 'edge', 'e1'); c.line(2, 2, 10, 'light', 'edge', 'e2')
  c.line(1, 1, 5, 'heavy', 'edge', 'A>B'); c.line(1, 1, 2, 'light', 'edge', 'A>C')
  c.line(3, 5, 5, 'heavy', 'edge', 'P>Q'); c.line(3, 5, 6, 'light', 'edge', 'R>S')
  const d = c.toDrawing(E); assert.equal(d.cells[0]![0]!.ch, 'e\u{301}'); assert.equal(d.cells[2]![2]!.ch, '╂')
  assert.equal(d.cells[1]![1]!.ch, '┠'); assert.equal(d.conflicts.length, 1)
})
```
- [ ] **Run** `node --test tests/core/canvas_test.ts` → FAIL: `Cannot find module …/core/canvas.ts`.
- [ ] **Implement** the §6 write policy:
  - **`text`** writes lead cells (`kind 'text'`; the first cell carries `join`). A W/F character adds a `cont` cell. A zero-width character (Mn, Me, ZWSP) joins the previous cell's `ch` and takes no column. The call returns the width used. `owner` may be a list; its first entry owns the text. `cap`, `fill` (spaces) and `arrow` (role `arrow`) are exclusive in the same way. Writing onto an empty, frame or lifeline cell replaces it; writing onto any other cell logs `{ row, col, had, by }` and keeps the old cell.
  - **`line`** keeps per-arm weights in `arms` (up, right, down, left; 0 none, 1 light, 2 heavy) and the style, and writes onto an empty, frame or lifeline cell. On a line it merges arm by arm when `shares(old, new)` holds for any old owner, or when unrelated owners cross straight and perpendicular (`{10, 5}`); light and heavy arms then meet in the matching mixed glyph, `boxGlyph(arms)` (rule 12, `flowchart-ok-51`). One arm claimed with two weights, unrelated owners meeting any other way, or a line on an exclusive cell is a conflict. A straight dotted run draws `┄`/`┆`; anything else draws `boxGlyph(arms)`.
  - **`frame`** draws `┌─┐│└┘` (kind `frame`) only into empty cells, then the title as `text` owned by the frame id at `(top, left + 2)`. **`lifeline`** writes `│`/`┃` (kind `lifeline`, role `note`, dirs 5) into empty cells only.
  - **`toDrawing(expect)`** returns `{ columns, cells, conflicts, expect }`.
- [ ] **Done when:** `node --test tests/core/canvas_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the canvas with owners, write policy and conflict log"`

### T11: Validator and mutation tests
**Group** P4 · **Deps** T10 · **Covers** A5.mutation-tests, R5, matrix rule 10, flowchart-ok-45 and sequence-ok-30 (identical text), VR.tangled (`head-on-junction`, from GPT-6)
**Files:** create `core/validate.ts`. Test: `tests/core/validate_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'
function two(t1 = 'a', t2 = 'b'): Drawing {
  const c = createCanvas(4, 8, 8); c.text(0, 2, t1, 'node', 'A'); c.line(1, 2, 5, 'light', 'edge', 'A>B'); c.arrow(2, 2, '▼', 'A>B'); c.text(3, 2, t2, 'node', 'B')
  return c.toDrawing({ labels: [{ owner: 'A', text: t1 }, { owner: 'B', text: t2 }], edges: [{ id: 'A>B', from: 'A', to: 'B', heads: ['▼'] }], edgeLabels: [] })
}
const cut = (d: Drawing, r: number, c: number) => { d.cells[r]![c] = null; return d }
test('A5.mutation-tests: each broken invariant fails', () => {
  assert.equal(validate(two()), null)
  assert.equal(validate(cut(two(), 0, 2))?.reason, 'label-missing')
  const dup = two(); dup.cells[1]![0] = { ...dup.cells[0]![2]!, join: undefined }; assert.equal(validate(dup)?.reason, 'label-dup')
  assert.equal(validate(cut(two(), 1, 2))?.reason, 'edge-disconnected')
  const j = two(); j.cells[1]![2] = { ...j.cells[1]![2]!, dirs: 7 }; assert.equal(validate(j)?.reason, 'head-on-junction')
  assert.equal(validate({ ...two(), conflicts: [{ row: 0, col: 2, had: 'a', by: 'X' }] })?.reason, 'overwrite')
  assert.equal(validate({ ...two(), columns: 2 })?.reason, 'row-too-wide')
})
test('A5.mutation-tests: identical text on distinct ids passes', () => assert.equal(validate(two('same', 'same')), null))
```
- [ ] **Run** `node --test tests/core/validate_test.ts` → FAIL: `Cannot find module …/core/validate.ts`.
- [ ] **Implement** the checks in this order, returning the first failure:
  1. **Labels.** Scan the rows in reading order. Consecutive `text` cells (and their `cont` cells) with one text owner (`owners[0]`; a member row also lists its node, for edge adjacency) form a run. A run whose first cell has no `join` starts a new instance; the runs of one instance join by their `join`. Compare with `expect.labels`, whitespace collapsed: 0 instances or different text → `label-missing`; more than 1 → `label-dup`; a text owner missing from `expect` → `label-dup`.
  2. **Edges.** BFS from the edge's `line`/`arrow` cells that are 4-adjacent to any cell of `from` (a line's `dirs` must point at that cell). Step between the edge's cells whose `dirs` point at each other; arrow cells and the edge's label cells join any adjacent cell of the edge. The edge passes when the search reaches a cell next to `to`, and each of `heads` is an `arrow` cell of the edge next to its end node. Otherwise `edge-disconnected`. A head whose cell behind it (opposite its point) has 3 or more `dirs` bits fails `head-on-junction`.
  3. **Conflicts:** a non-empty conflict log → `overwrite`.
  4. **Width:** `width` of each row (`cont` skipped, `null` → space, trailing spaces trimmed) > `columns` → `row-too-wide`.
  5. **Edge labels:** no cell of the label within Chebyshev distance 1 of an edge cell → `label-not-adjacent`.
- [ ] **Done when:** `node --test tests/core/validate_test.ts` passes.
- [ ] **Commit:** `git commit -m "Add the validator with mutation tests"`
