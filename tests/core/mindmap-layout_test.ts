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
    ['node m0', 's1 m1', 's1 m2', 's2 m3', 's2 m4', 's1 m1:link', 's2 m3:link', 's1 m2:link'])
  const e = explain(`---\nconfig:\n  mindmap:\n    colorBy: depth\n---\nmindmap\n${S}`, { columns: 80, theme: 'mono' }).drawing
  assert.deepEqual(['Root', 'A ', 'A1', 'Bee', 'B1'].map(s => cell(e, s)), ['node m0', 's1 m1', 's2 m2', 's1 m3', 's2 m4'])
  assert.deepEqual(d.expect, { labels: ['Root', 'A', 'A1', 'Bee', 'B1'].map((t, k) => ({ owner: `m${k}`, text: t })), edges: [], edgeLabels: [], frames: [] })
})
test('A4.fit-ladder: wrap tries 24 before narrower widths; the outline tries its labels unwrapped first', () => {
  assert.deepEqual([X('Root\n  aaaa bbbb cccc dddd eeee ffff', 30).step, ...text(X('Root\n  aaaa bbbb cccc dddd eeee ffff', 30).drawing)],
    ['wrap', ' Root ─── aaaa bbbb cccc dddd', '          eeee ffff'])
  const L = 'Abcdefghijklmnopqrstuvwxyz0123', r = X(`Root\n  ${L}\n  B`, 34)
  assert.deepEqual([r.step, ...text(r.drawing)], ['outline', ' Root', `├─ ${L}`, '└─ B'])
})
