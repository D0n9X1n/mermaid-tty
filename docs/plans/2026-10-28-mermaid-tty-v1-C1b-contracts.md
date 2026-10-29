# mermaid-tty v1 C — tasks T86–T88 (validator contracts, the Tier 2 gate)

**Depends on:** the index (§4, §5) A's validator (T11), and A's shared contracts: per-end marks (`Expect.edges[].ends: { node, glyph }[]`, `end-misplaced`), frame integrity (`Expect.frames`, `frame-broken`) and `label-blank-line`. C builds on them and re-specifies none. This file continues C1. It holds the shared contract tasks that fix cycle 1 added; they are numbered after T85, so no task is renumbered.
**Conventions:** as in C1. Every contract is an optional `Expect` field, so A's drawings and goldens do not change. Each new check runs after A's checks (labels, edges, dangling, the in-flight `crossing-ambiguous`, conflicts, rows, edge labels) and never edits them.

### T86: Validator contracts I: end labels, bars, members
**Group** G1 · **Deps** A's per-end-mark contract · **Covers** fix-cycle findings 2 and 5; spec C rules 4 and 5 (bars, zero); matrix class and ER ends and cardinality; A5.mutation-tests
**Files:** modify `core/validate.ts`. Test: `tests/core/validate-c_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'; import { validate, type Expect } from '../../core/validate.ts'
// [ A ] at row 0 and [ B ] at row 4; edge e0 down column 2, its tail mark at row 1; the end labels at column 3, rows tl and hl.
function edge(mark: string, tl: number, hl: number): Drawing {
  const c = createCanvas(5, 10, 10)
  for (const [r, id] of [[0, 'A'], [4, 'B']] as const) { c.cap(r, 0, '[', 'node', id); c.text(r, 2, id, 'node', id); c.cap(r, 4, ']', 'node', id) }
  c.arrow(1, 2, mark, 'e0'); c.line(2, 2, 5, 'light', 'edge', 'e0'); c.line(3, 2, 5, 'light', 'edge', 'e0')
  c.text(tl, 3, '1', 'label', 'e0:tail'); c.text(hl, 3, '0..*', 'label', 'e0:head')
  return c.toDrawing({ labels: [{ owner: 'A', text: 'A' }, { owner: 'B', text: 'B' }, { owner: 'e0:tail', text: '1' }, { owner: 'e0:head', text: '0..*' }],
    edges: [{ id: 'e0', from: 'A', to: 'B', heads: [mark], ends: [{ node: 'A', glyph: mark }],
      endLabels: [{ node: 'A', owner: 'e0:tail' }, { node: 'B', owner: 'e0:head' }] }],
    edgeLabels: [{ owner: 'e0:tail', edge: 'e0' }, { owner: 'e0:head', edge: 'e0' }] })
}
test("A5.mutation-tests: an end label sits at its own end, strictly; a C triangle must point at its node under A's end rule", () => {
  assert.equal(validate(edge('△', 1, 3)), null)
  assert.deepEqual(validate(edge('△', 3, 1)), { reason: 'end-label' })     // the cardinalities swapped
  assert.deepEqual(validate(edge('△', 2, 3)), { reason: 'end-label' })     // the tail label as near the other end
  assert.ok(['edge-disconnected', 'end-misplaced'].includes(validate(edge('▽', 1, 3))?.reason ?? ''))   // ▽ points away from A
})
const bar = (cells: string, eighths: number, extra: Partial<Expect> = {}): Drawing => { const c = createCanvas(1, 8, 8); c.cap(0, 0, cells, 's1', 'x0')
  return c.toDrawing({ labels: [], edges: [], edgeLabels: [], bars: [{ owner: 'x0', eighths, axis: 'h' }], ...extra }) }
test('A5.mutation-tests: a bar draws exactly its eighths; zero draws nothing, and only zero; no stray bar cell', () => {
  assert.equal(validate(bar('██▌', 20)), null); assert.equal(validate(bar('', 0)), null)
  for (const [cells, e] of [['██▌', 21], ['█', 0], ['▌█', 12], ['', 20]] as const) assert.deepEqual(validate(bar(cells, e)), { reason: 'bar' }, cells)
  assert.deepEqual(validate(bar('██▌', 20, { bars: [] })), { reason: 'bar-stray' })
})
const vbar = (lanes: readonly (readonly string[])[], eighths: number): Drawing => { const c = createCanvas(3, 4, 4)
  lanes.forEach((cells, k) => cells.forEach((g, r) => { if (g) c.cap(r, k, g, 's1', 'x0.b0') }))
  return c.toDrawing({ labels: [], edges: [], edgeLabels: [], bars: [{ owner: 'x0.b0', eighths, axis: 'v', lanes: 2 }] }) }
test('A5.mutation-tests: a positive bar with its cells deleted, a lane missing, short or shifted fails; nothing passes vacuously', () => {
  assert.equal(validate(vbar([['▄', '█'], ['▄', '█']], 12)), null)                 // two lanes, each █ then ▄ bottom up: 8 + 4
  for (const lanes of [[['', ''], ['', '']], [['▄', '█'], ['', '']], [['▄', '█'], ['▂', '█']]]) assert.deepEqual(validate(vbar(lanes, 12)), { reason: 'bar' }, String(lanes))
  assert.equal(validate(vbar([['', '▄', '█'], ['', '▄', '█']], 12)), null)
  assert.deepEqual(validate(vbar([['', '▄', '█'], ['▄', '█', '']], 12)), { reason: 'bar' })   // one lane shifted up a row: both runs still sum to 12
})
const member = (owners: string[]): Drawing => { const c = createCanvas(1, 6, 6); c.text(0, 0, '+name', 'label', owners)
  return c.toDrawing({ labels: [{ owner: owners[0]!, text: '+name' }], edges: [], edgeLabels: [], members: [{ id: 'U.m0', parent: 'U' }] }) }
test("A5.mutation-tests: a member row is owned by exactly its own id and its parent's, and every drawn member row is listed", () => {
  assert.equal(validate(member(['U.m0', 'U'])), null)
  for (const o of [['U.m0', 'V'], ['U.m0'], ['W.m0', 'U']]) assert.deepEqual(validate(member(o)), { reason: 'member' }, o.join())
  assert.deepEqual(validate({ ...member(['U.m0', 'U']), expect: { ...member(['U.m0', 'U']).expect, members: [] } }), { reason: 'member-unlisted' })   // its entry omitted
})
```
- [ ] **Run** `node --test tests/core/validate-c_test.ts` → FAIL: `Expected values to be strictly deep-equal` (`validate` returns null for the swapped labels).
- [ ] **Implement** in `core/validate.ts`:
  - **Built on A:** end marks use A's per-end-mark contract, `Expect.edges[].ends: { node, glyph }[]`, which fails `end-misplaced`. Frames use A's `Expect.frames` (`frame-broken`). C re-specifies neither. C adds `△▷▽◁` to A's pointing glyphs (`POINT`), so a triangle must point at its node; `◆`, `◇`, `o` and `x` have no point.
  - **Types:**
    - `Expect.edges[]` gains `endLabels?: readonly { node: string; owner: string }[]`, a C extension. The owner is `${id}:tail` or `${id}:head`, named by the true end, even on a reversed edge.
    - `Expect` gains `bars?: readonly { owner: string; eighths: number; axis: 'h' | 'v'; lanes?: number }[]` and `members?: readonly { id: string; parent: string }[]`.
  - **Order:** `validate` appends `?? endLabels(d, all) ?? bars(d, all) ?? members(d)` after A's last check. A's checks (`ends`, `frames`, `label-blank-line`, `crossing-ambiguous`) run first and are not edited. Every new field is optional, and A has no bar cells. So A's drawings check exactly as before.
  - **`endLabels`:** a node's terminal is the edge's line or arrow cells beside it. The owner needs a cell within Chebyshev distance 1 of its node's terminal, and strictly nearer it than the edge's other terminal; a tie fails. Else `end-label`. The text is checked by `labels`.
  - **`bars`:**
    - Bar cells are cap cells drawn in a bar glyph: `▏…█` on axis h, `▁…▇█` on axis v.
    - A bar's runs are the maximal row runs (h) or column runs (v) of cap cells whose owners[0] is its owner. Each run reads full `█` cells, then at most one partial glyph, left to right (h) or bottom to top (v), and sums to `eighths`: `█` counts 8, and a partial counts its index + 1.
    - The count is exact, never vacuous: a bar with `eighths > 0` has exactly `lanes ?? 1` runs, its width across the axis as drawn (2 for a vertical xychart bar). A bar with `eighths` 0 has no cell. Deleted cells, a missing or split lane, or any other mismatch fail `bar` (cycle 2).
    - **Lanes share a baseline (final edit):** the runs lie in `lanes ?? 1` adjacent columns (v) or rows (h), one run in each, so a lane's cells are contiguous. Every run starts on the same baseline, its axis-side end: its bottom row (v) or its left column (h). All runs have the same length, `⌈eighths / 8⌉` cells. A lane shifted by a row or a column, split, or of another length fails `bar`, even when every run sums to `eighths`.
    - A bar cell whose owners[0] is not a listed owner fails `bar-stray`.
  - **`members`:** each listed `{ id, parent }` has at least one cell whose owners are exactly `[id, parent]`, and every cell whose owners[0] is id has those owners, else `member`. Only drawn members are listed: a blank ER column draws no cell, so T50 does not list it (finding 7). T87 accepts a keyed member's legend cells, owned by `[id]` alone (finding 8). When `members` is set, every text or key cell with two distinct owners whose second is not an edge in `expect.edges` must be listed as `{ id: owners[0], parent: owners[1] }`, else `member-unlisted`, so an omitted row fails (B6).
- [ ] **Done when:**
  - `node --test tests/core/validate-c_test.ts tests/core/validate_test.ts` passes;
  - `node scripts/typecheck.ts` passes;
  - `node scripts/check.ts A4` passes, with every golden unchanged.
- [ ] **Commit:** `git commit -m "Validate end labels, bars and member rows"`

### T87: Validator contracts II: keys
**Group** G2 · **Deps** T86 · **Covers** fix-cycle finding 1; spec C rule 7 (keyed items, all or none); A5.mutation-tests
**Files:** modify `core/canvas.ts`, `core/validate.ts`. Test: `tests/core/validate-keys_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'; import { validate, type Expect } from '../../core/validate.ts'
const TEXT: Record<string, string> = { n1: 'memo', n2: 'other' }
// Row 0: each item's in-place key, or its text when it is unkeyed. Row 1 + i: item i's legend row, its key and then its text.
// Each tuple is [item, in-place key, legend key]; a null legend key drops that key cell, and an omitted one drops the whole row.
function keyed(drawn: readonly [string, string | null, (string | null)?][], keys: Expect['keys']): Drawing {
  const c = createCanvas(4, 12, 12)
  drawn.forEach(([item, key, lk], i) => {
    if (key === null) { c.text(0, 6 * i, TEXT[item]!, 'note', item); return }
    c.key(0, 6 * i, key, 'note', item, false)
    if (lk !== undefined) { if (lk !== null) c.key(1 + i, 0, lk, 'note', item, true); c.text(1 + i, 2, TEXT[item]!, 'note', item) }
  })
  return c.toDrawing({ labels: drawn.map(([item]) => ({ owner: item, text: TEXT[item]! })), edges: [], edgeLabels: [],
    keys, keyable: [{ item: 'n1', cls: 'note' }, { item: 'n2', cls: 'note' }] })
}
const K = [{ key: 'a', item: 'n1', cls: 'note' }, { key: 'b', item: 'n2', cls: 'note' }]
test('A5.mutation-tests: each key is drawn once at its item and once in the legend, and a class is keyed all or none', () => {
  assert.equal(validate(keyed([['n1', 'a', 'a'], ['n2', 'b', 'b']], K)), null)
  assert.equal(validate(keyed([['n1', null], ['n2', null]], [])), null)
  const cases = [
    [[['n1', 'b', 'a'], ['n2', 'a', 'b']], K, 'key-mismatch'],               // two keys swapped in place
    [[['n1', 'a', null], ['n2', 'b', 'b']], K, 'key-missing'],               // a legend key deleted
    [[['n1', 'a'], ['n2', 'b', 'b']], K, 'label-missing'],                   // a whole legend row deleted
    [[['n1', 'a', 'a'], ['n2', null]], [K[0]!], 'key-partial'],              // half the class keyed
    [[['n1', 'a', 'a'], ['n2', 'b', 'b']], [K[0]!], 'key-stray'],            // a key no entry lists
  ] as const
  for (const [drawn, keys, reason] of cases) assert.deepEqual(validate(keyed(drawn, keys)), { reason }, reason)
})
test('A5.mutation-tests: a legend key is bound to its own row, so swapping whole legend key cells between rows fails', () => {
  const rows = (k1: string, k2: string): Drawing => { const c = createCanvas(3, 12, 12), own = (k: string) => (k === 'a' ? 'n1' : 'n2')
    c.key(0, 0, 'a', 'note', 'n1', false); c.key(0, 6, 'b', 'note', 'n2', false)
    c.key(1, 0, k1, 'note', own(k1), true); c.text(1, 2, 'memo', 'note', 'n1'); c.key(2, 0, k2, 'note', own(k2), true); c.text(2, 2, 'other', 'note', 'n2')
    return c.toDrawing({ labels: [{ owner: 'n1', text: 'memo' }, { owner: 'n2', text: 'other' }], edges: [], edgeLabels: [], keys: K,
      keyable: [{ item: 'n1', cls: 'note' }, { item: 'n2', cls: 'note' }] }) }
  assert.equal(validate(rows('a', 'b')), null); assert.deepEqual(validate(rows('b', 'a')), { reason: 'key-unbound' })   // b memo / a other
})
test("A5.mutation-tests: an edge label's key cell carries its edge like the label's text", () => {
  const draw = (key: boolean): Drawing => {
    const c = createCanvas(7, 8, 8); c.text(0, 2, 'A', 'node', 'A'); c.line(1, 2, 5, 'light', 'edge', 'e0')
    if (key) c.key(2, 2, 'a', 'label', ['e0:label', 'e0'], false)
    c.line(3, 2, 5, 'light', 'edge', 'e0'); c.arrow(4, 2, '▼', 'e0'); c.text(5, 2, 'B', 'node', 'B')
    c.key(6, 0, 'a', 'label', 'e0:label', true); c.text(6, 2, 'yes', 'label', 'e0:label')
    return c.toDrawing({ labels: [{ owner: 'A', text: 'A' }, { owner: 'B', text: 'B' }, { owner: 'e0:label', text: 'yes' }],
      edges: [{ id: 'e0', from: 'A', to: 'B', heads: ['▼'] }], edgeLabels: [{ owner: 'e0:label', edge: 'e0' }],
      keys: [{ key: 'a', item: 'e0:label', cls: 'label' }], keyable: [{ item: 'e0:label', cls: 'label' }] })
  }
  assert.equal(validate(draw(true)), null); assert.deepEqual(validate(draw(false)), { reason: 'edge-disconnected' })
})
test('A5.mutation-tests: a keyed member keeps its in-place key with its parent; its legend cells are owned by it alone', () => {
  const draw = (owners: string[]): Drawing => { const c = createCanvas(2, 10, 10)
    c.key(0, 0, 'a', 'note', owners, false); c.key(1, 0, 'a', 'note', 'U.c0', true); c.text(1, 2, 'pk', 'note', 'U.c0')
    return c.toDrawing({ labels: [{ owner: 'U.c0', text: 'pk' }], edges: [], edgeLabels: [], members: [{ id: 'U.c0', parent: 'U' }],
      keys: [{ key: 'a', item: 'U.c0', cls: 'comment' }], keyable: [{ item: 'U.c0', cls: 'comment' }] }) }
  assert.equal(validate(draw(['U.c0', 'U'])), null); assert.deepEqual(validate(draw(['U.c0'])), { reason: 'member' })
})
```
- [ ] **Run** `node --test tests/core/validate-keys_test.ts` → FAIL: `TypeError: c.key is not a function`.
- [ ] **Implement:**
  - **`core/canvas.ts`:**
    - `Kind` gains `'key'`, and `Cell` gains `legend?: true`.
    - `key(r, c, s, role, owner: string | readonly string[], legend: boolean): number` writes each character of s as a `key` cell with owners `[owner].flat()`, plus `legend: true` for a legend key. It returns the columns used, and conflicts like `cap`.
    - `toRows` and `render.ts` draw a key cell as they draw a cap: its ink, with no pill.
  - **`core/validate.ts`:**
    - `Expect` gains `keys?: readonly { key: string; item: string; cls: string }[]` and `keyable?: readonly { item: string; cls: string }[]`.
    - `connects` and `dangling` accept a `key` cell whose owners[0] is `${id}:label`, as they accept the label's text cells.
    - `validate` appends `?? keys(d, all)` after `members`.
    - **`keys`:** a run is a maximal row run of key cells with one owners[0] and one `legend` flag.
      - For each entry, the runs whose owners include its item must be exactly one in place and one in the legend. Fewer fails `key-missing`, more `key-dup`; either run reading other than `key` fails `key-mismatch`.
      - **Binding (cycle 2):** the legend run must be followed, on its row, by one empty cell and then a text cell whose owners[0] is the item, the start of its legend text. Else `key-unbound`. So the key at the item equals the key in that item's own legend row, and swapping legend key cells between rows fails.
      - Then a run that no entry's item owns fails `key-stray`.
      - Then each `cls` in `keyable` must have an entry for all of its items or for none, else `key-partial`.
    - **Keyed members (finding 8):** for an item that is also a listed member, `members` accepts its cells owned by `[id]` alone: its legend key, its legend text and their continuation rows. Its in-place key stays owned by `[id, parent]`, so its member row still needs that cell. A keyed ER comment's text lives only in its legend row (T61).
    - A point key owned by several points is one in-place run for each of them. The item's legend text is checked by `labels`: a legend row's text is owned by the item itself.
- [ ] **Done when:**
  - `node --test tests/core/validate-keys_test.ts tests/core/validate-c_test.ts tests/core/validate_test.ts tests/core/canvas_test.ts` passes;
  - `node scripts/typecheck.ts` passes;
  - `node scripts/check.ts A4` passes, with every golden unchanged.
- [ ] **Commit:** `git commit -m "Validate keyed items: in place, in the legend, all or none"`

### T88: The Tier 2 gate, hash-checked
**Group** G2 · **Deps** T40 · **Covers** fix-cycle finding 4; index §9; A5.errors; VR.passes
**Files:** create `scripts/check-tier2.ts`. Test: `tests/scripts/check-tier2_test.ts`. T40 does not check a record by name; this test replaces that check.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'
import { tier2Problems, tier2Files, repoRecords } from '../../scripts/check-tier2.ts'
import { TIER2, TIER2_PASSED } from '../../core/registry.ts'; import type { ReviewRecord } from '../../scripts/check-review-hashes.ts'
const FILES: Record<string, string> = { 'fixtures/radar/radar-ok-01.mmd': 'radar-beta\naxis A\n', 'goldens/radar/radar-ok-01.golden': '@80\nA\n' }
const ALL = Object.keys(FILES), read = (p: string) => FILES[p] ?? null
const sha = (p: string) => createHash('sha256').update(FILES[p]!).digest('hex')
const rec = (paths: string[], verdict: 'pass' | 'fail' = 'pass', scope = 'vr-C-radar'): ReviewRecord =>
  ({ path: 'docs/reviews/x.md', scope, verdict, date: '2026-11-01', reviewers: ['a', 'b'], files: paths.map(p => ({ path: p, sha256: sha(p) })) })
test('A5.errors: a Tier 2 type passes the gate only with a vr-C-<type> pass record that hashes every ok fixture and golden', () => {
  assert.deepEqual(tier2Problems('radar', ALL, [rec(ALL)], read), [])
  assert.deepEqual(tier2Problems('radar', ALL, [rec(ALL.slice(1))], read), ['vr-C-radar: fixtures/radar/radar-ok-01.mmd'])  // a fixture not listed
  assert.equal(tier2Problems('radar', ALL, [rec(ALL.slice(0, 1)), rec(ALL.slice(1))], read).length, 1)   // a fixture-only and a golden-only record do not add up
  for (const records of [[rec([])], [], [rec(ALL, 'fail')], [rec(ALL, 'pass', 'vr-C-sankey')]])        // empty table, no record, fail, other scope
    assert.equal(tier2Problems('radar', ALL, records, read).length, 2)
  assert.equal(tier2Problems('radar', ALL, [rec(ALL)], p => (p.endsWith('.mmd') ? 'radar-beta\n' : read(p))).length, 1)  // a stale hash
  assert.deepEqual(tier2Problems('radar', [], [rec([])], read), ['vr-C-radar: no ok fixtures'])
})
test('A5.errors: TIER2_PASSED lists exactly the Tier 2 types that pass the gate in this repo', () => {
  const records = repoRecords()
  for (const t of TIER2) assert.equal(tier2Problems(t, tier2Files(t), records).length === 0, TIER2_PASSED.includes(t), t)
})
```
- [ ] **Run** `node --test tests/scripts/check-tier2_test.ts` → FAIL: `ERR_MODULE_NOT_FOUND` for `scripts/check-tier2.ts`.
- [ ] **Implement** `scripts/check-tier2.ts`, which reuses `parseRecord`, `checkRecords` and `requirePass` from `check-review-hashes.ts`:
  - `tier2Files(t)`: each `fixtures/<t>/<t>-ok-NN.mmd`, sorted, each followed by `goldens/<t>/<t>-ok-NN.golden`. A golden is listed even when it is absent, so a missing golden fails. An absent directory gives `[]`.
  - `repoRecords()`: every `docs/reviews/*.md` through `parseRecord`. A record that does not parse is dropped, so the gate fails closed; `check-review-hashes.ts` reports the parse error itself.
  - `tier2Problems(t, files, records, read = readRepo)`:
    - with no files, it returns `['vr-C-<t>: no ok fixtures']`;
    - otherwise, each record with scope `vr-C-<t>` and verdict pass is checked alone: its problems are `requirePass([r], { ['vr-C-' + t]: files })`, then `checkRecords([r], read)`;
    - it returns `[]` when one record has none; else the fewest problems of any record, the first on a tie; else, with no such record, `requirePass([], …)`. One record must list every ok fixture and every golden, with matching hashes; records never add up (cycle 2).
    - `readRepo` reads bytes from the repo root, or gives null.
  - T48's `GATED_DIRS` adds each type in `TIER2_PASSED`, so an enabled Tier 2 type's goldens are checked like Tier 1's.
- [ ] **Done when:** `node --test tests/scripts/check-tier2_test.ts tests/core/registry-tiers_test.ts` passes.
- [ ] **Commit:** `git commit -m "Gate Tier 2 types on hash-checked vr-C pass records"`
