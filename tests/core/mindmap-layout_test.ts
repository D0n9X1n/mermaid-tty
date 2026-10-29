import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas } from '../../core/canvas.ts'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'; import { validate } from '../../core/validate.ts'; import { mindmap } from '../../core/diagrams/mindmap/layout.ts'; import { parseMindmap } from '../../core/diagrams/mindmap/parse.ts'; import { readSource } from '../../core/source.ts'
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

// Beyond the plan's tests.
const T = 'Root\n  Bigger node\n    Leaf\n  A\n    Long leaf name'
test('A3: siblings stack in source order, each after the subtrees above it; natural stretches connectors to the depth column', () => {
  const r = X('Root\n  A\n    A1\n    A2\n  Bee\n    B1', 80)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [' Root ─┬─ A ───┬─ A1', '       │       └─ A2', '       └─ Bee ─── B1'])
})
test('A4.fit-ladder: compact starts each group after its parent; wrap breaks labels at the first width that fits', () => {
  assert.deepEqual([X(T, 35).step, ...text(X(T, 35).drawing)], ['compact', ' Root ─┬─ Bigger node ─── Leaf', '       └─ A ─── Long leaf name'])
  assert.deepEqual([X(T, 26).step, ...text(X(T, 26).drawing)],
    ['wrap', ' Root ─┬─ Bigger ─── Leaf', '       │  node', '       └─ A ─── Long', '                leaf', '                name'])
})
test('A4.fit-ladder: an outline continuation row takes │ under a node with a later sibling, blanks under the last', () =>
  assert.deepEqual(text(X('Root\n  one<br/>two\n    x\n  B<br/>C', 12).drawing), [' Root', '├─ one', '│  two', '│  └─ x', '└─ B', '   C']))
test('A3: a capped pill draws its caps on every row; a title is stacked above', () =>
  assert.deepEqual(text(explain('---\ntitle: Ideas\n---\nmindmap\nroot((a<br/>bb))', { columns: 80, theme: 'mono' }).drawing), ['Ideas', '(( a  ))', '(( bb ))']))
// Each cell's role and owner where the label or connector glyph s starts on its row.
const cell = (d: any, s: string) => {
  for (const row of d.cells) {
    const line = row.map((c: any) => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)).join(''), at = line.indexOf(s)
    if (at >= 0) return `${row[at].role} ${row[at].owners.join()}`
  }
}
test('A3: colorBy branch inks each top-level subtree the next series; depth inks each depth; a connector takes its child\'s', () => {
  const S = 'Root\n  A\n    A1\n  Bee\n    B1', d = X(S, 80).drawing
  assert.deepEqual(['Root', 'A ', 'A1', 'Bee', 'B1', '┬', '└', '───'].map(s => cell(d, s)),
    ['node m0', 's1 m1', 's1 m2', 's2 m3', 's2 m4', 's1 m1:link,m3:link', 's2 m3:link', 's1 m2:link'])
  const e = explain(`---\nconfig:\n  mindmap:\n    colorBy: depth\n---\nmindmap\n${S}`, { columns: 80, theme: 'mono' }).drawing
  assert.deepEqual(['Root', 'A ', 'A1', 'Bee', 'B1'].map(s => cell(e, s)), ['node m0', 's1 m1', 's2 m2', 's1 m3', 's2 m4'])
  const edges = [[0, 1], [1, 2], [0, 3], [3, 4]].map(([f, t]) => ({ id: `m${t}:link`, from: `m${f}`, to: `m${t}`, ends: [] }))
  assert.deepEqual(d.expect, { labels: ['Root', 'A', 'A1', 'Bee', 'B1'].map((t, k) => ({ owner: `m${k}`, text: t })), edges, edgeLabels: [], frames: [] })
})
test('A4.fit-ladder: wrap tries 24 before narrower widths; the outline tries its labels unwrapped first', () => {
  assert.deepEqual([X('Root\n  aaaa bbbb cccc dddd eeee ffff', 30).step, ...text(X('Root\n  aaaa bbbb cccc dddd eeee ffff', 30).drawing)],
    ['wrap', ' Root ─── aaaa bbbb cccc dddd', '          eeee ffff'])
  const L = 'Abcdefghijklmnopqrstuvwxyz0123', r = X(`Root\n  ${L}\n  B`, 34)
  assert.deepEqual([r.step, ...text(r.drawing)], ['outline', ' Root', `├─ ${L}`, '└─ B'])
})

// Parentage is checked: each link is an expected edge the validator traces, so pills moved under another parent fail.
const L = (body: string, step: string, columns: number) => mindmap.layout(parseMindmap(readSource(`mindmap\n${body}`) as any) as any, step as any, columns) as any
// A clone of d with the complete cells owned by a and b exchanged, ownership and expect kept; null if their shapes differ.
function swap(d: any, a: string, b: string): any {
  const cells = d.cells.map((row: any[]) => [...row]), of = (o: string) => d.cells.flatMap((row: any[], r: number) =>
    row.flatMap((x: any, c: number) => (x?.owners[0] === o ? [{ r, c, x }] : [])))
  const p = of(a), q = of(b), rel = (s: any[]) => s.map(y => `${y.r - s[0].r},${y.c - s[0].c}`).join()
  if (p.length === 0 || rel(p) !== rel(q)) return null
  p.forEach((y: any, i: number) => { cells[q[i].r][q[i].c] = y.x; cells[y.r][y.c] = q[i].x })
  return { ...d, cells }
}
const STEPS = ['natural', 'compact', 'wrap', 'outline'], WIDTHS = [30, 40, 60, 80, 120]
test('validate: the QA swap, X and Y exchanged between A and B, fails at every step and width', () => {
  const seen = new Set<string>()
  for (const step of STEPS) for (const cols of WIDTHS) {
    const d = L('Root\n  A\n    X\n  B\n    Y', step, cols)
    if (d.cells === undefined) continue
    seen.add(step); assert.equal(validate(d), null, `${step} ${cols}`)
    assert.notEqual(validate(swap(d, 'm2', 'm4')), null, `${step} ${cols}`)
  }
  assert.deepEqual([...seen], STEPS)
})
test('validate: a child moved onto a sibling\'s trunk fails, tree and outline', () => {
  const S = 'Root\n  A\n    A1\n    A2\n  B\n    B1\n    B2'
  for (const [step, cols] of [['natural', 80], ['compact', 80], ['outline', 80]] as const) {
    const d = L(S, step, cols)
    assert.equal(validate(d), null); assert.notEqual(validate(swap(d, 'm3', 'm5')), null, step)
    assert.notEqual(validate(swap(d, 'm2', 'm6')), null, step)
  }
})
test('validate: every swap of two same-shaped pills with different parents fails', () => {
  const S = ['Root\n  A\n    X\n  B\n    Y', 'Root\n  A\n    A1\n    A2\n  B\n    B1\n    B2', 'R\n  a\n    b\n      c\n  d\n    e\n  f',
    'R\n  aa\n    x<br/>y\n    p\n  bb\n    q\n    z<br/>w\n  cc', 'R\n  a\n    b\n    c\n      d\n  e\n    f\n      g']
  let n = 0
  for (const s of S) for (const step of STEPS) for (const cols of [16, 24, 40, 80]) {
    const d = L(s, step, cols)
    if (d.cells === undefined) continue
    const ids = d.expect.labels.map((l: any) => l.owner), parent = new Map(d.expect.edges.map((e: any) => [e.to, e.from]))
    assert.equal(parent.size, ids.length - 1, 'each child declares its parent link')
    for (const a of ids) for (const b of ids) {
      if (a >= b || parent.get(a) === parent.get(b)) continue
      const m = swap(d, a, b)
      if (m) { n++; assert.notEqual(validate(m), null, `${s} ${step} ${cols} ${a}<>${b}`) }
    }
  }
  assert.ok(n > 50, `${n} mutants`)
})
// QA's cross-family repro: X and Y swapped, and their links redrawn to cross through one shared column, ┬ over ┴, so each
// pill sits under the other's parent. The links have no end marks, so only a rule on unmarked merges catches it.
test('validate: unmarked links from different parents merged through one trunk fail merge-ambiguous', () => {
  const d = swap(X('Root\n  A\n    X\n  B\n    Y', 80).drawing, 'm2', 'm4'), cv = createCanvas(d.cells.length, 18, 80, () => true)
  const paths: [string, [number, number, number][]][] = [['m2:link', [[0, 12, 10], [0, 13, 12], [1, 13, 3], [1, 14, 10]]],
    ['m4:link', [[1, 12, 10], [1, 13, 9], [0, 13, 6], [0, 14, 10]]]]
  for (const [o, p] of paths) for (const [r, c, dirs] of p) { d.cells[r][c] = null; cv.line(r, c, dirs, 'light', 'edge', o) }
  const drawn = cv.toDrawing(d.expect)
  for (const [, p] of paths) for (const [r, c] of p) d.cells[r][c] = drawn.cells[r]![c]
  assert.deepEqual(text(d), [' Root ─┬─ A ─┬─ Y', '       └─ B ─┴─ X'])
  assert.equal(validate(d)?.reason, 'merge-ambiguous')
})
