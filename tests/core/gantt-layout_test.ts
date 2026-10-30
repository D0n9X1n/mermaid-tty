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

// Beyond the plan's tests. A row's distinct cells as `kind ink owners`, in reading order.
const kinds = (row: any[]) => [...new Set(row.flatMap(c => (c ? [`${c.kind} ${c.role} ${c.owners.join()}`] : [])))]
// Ink: crit is arrow, else done is note, else active is decision, else the section's series. Tasks before the first section
// take s1, so the sections take s2, s3, …; with no such tasks the first section takes s1.
test('A4: status, bar and ◆ ink: arrow for crit, note for done, decision for active, else the series, shifted by early tasks', () => {
  const d = X('A :crit, 2024-01-01, 1d\nsection S\nB :done, 2024-01-02, 1d\nsection T\nC :active, 2024-01-03, 1d\nD :2024-01-04, 1d', 80).drawing
  assert.deepEqual(d.cells.slice(0, 6).map(kinds), [['cap arrow t0', 'text label t0', 'text value t0.t'], ['text s2 sec0'],
    ['cap note t1', 'text label t1', 'text value t1.t'], ['text s3 sec1'], ['cap decision t2', 'text label t2', 'text value t2.t'],
    ['text label t3', 'text value t3.t', 'cap s3 t3']])
  const e = X('section S\nA :2024-01-01, 1d\nM :crit, milestone, 2024-01-02, 0d\nB :active, done, 2024-01-02, 1d', 80).drawing
  assert.deepEqual(e.cells.slice(0, 4).map(kinds), [['text s1 sec0'], ['text label t0', 'text value t0.t', 'cap s1 t0'],
    ['cap arrow t1', 'text label t1', 'text value t1.t'], ['cap note t2', 'text label t2', 'text value t2.t']])
  assert.deepEqual(text(e).slice(1, 4).map(t => t.slice(0, 5)), ['   A ', '!  M ', ' ✓ B '])
})
// gantt-ok-04, the docs' milestone example, at 120 (W = 60): ◆ at cells 2 and 54, Task A from cell 5 for 209 eighths, and
// 5-minute ticks at 0, 13, 26, 39, 52. A milestone lists 0 eighths though it spans 2m or 4m: its ◆ is a mark, not a bar.
test('A4: gantt-ok-04: milestones at start + duration/2 list 0 eighths; bars start at their cell from t0', () => {
  const r = X('dateFormat HH:mm\naxisFormat %H:%M\nInitial milestone : milestone, m1, 17:49, 2m\nTask A : 10m\nTask B : 5m\n' +
    'Final milestone : milestone, m2, 18:08, 4m', 120)
  assert.equal(r.step, 'natural')
  const rows = text(r.drawing), left = 17 + 10 + 5
  assert.deepEqual(rows.slice(0, 4).map(t => [t.slice(0, left), t.slice(left)]), [
    ['   Initial milestone 17:49 · 2m ', ' '.repeat(2) + '◆'], ['   Task A            10m        ', ' '.repeat(5) + '█'.repeat(26) + '▏'],
    ['   Task B            5m         ', ' '.repeat(31) + '█'.repeat(13)], ['   Final milestone   18:08 · 4m ', ' '.repeat(54) + '◆']])
  assert.deepEqual(r.drawing.expect.bars.map(({ at: _, ...b }: any) => b), [{ owner: 't0', eighths: 0, axis: 'h' }, { owner: 't1', eighths: 209, axis: 'h' },
    { owner: 't2', eighths: 104, axis: 'h' }, { owner: 't3', eighths: 0, axis: 'h' }])
  assert.deepEqual(rows.slice(4), [rule(left, 60, [0, 13, 26, 39, 52]), ' '.repeat(left) + '17:49        17:54        17:59        18:04        18:09'])
})
// keyedWrap: W = 20, names wrap to columns − 25 − K, and the key and bar sit on the name's first row.
const LONG = 'section Build\nWrite the first spec :a, 2024-01-01, 7d\nShip it :after a, 8d'
test('A4.fit-ladder: natural, keyed, then keyedWrap with wrapped names, then fallback', () => {
  assert.deepEqual([60, 59, 46, 45, 31, 30].map(c => X(LONG, c).step ?? X(LONG, c).reason), ['natural', 'keyed', 'keyed', 'keyedWrap', 'keyedWrap', 'too-wide'])
  const r = X(LONG, 40); assert.equal(r.step, 'keyedWrap')
  assert.deepEqual(text(r.drawing), ['Build', '   Write the  a ' + '█'.repeat(9) + '▍', '   first spec', '   Ship it    b ' + ' '.repeat(9) + '█'.repeat(10) + '▋',
    rule(16, 20, [0]), ' '.repeat(16) + '2024-01-01', 'a 2024-01-01 · 7d', 'b after a · 8d'])
  assert.deepEqual(r.drawing.expect.keys, [{ key: 'a', item: 't0.t', cls: 'timing', at: { r: 1, c: 14 } }, { key: 'b', item: 't1.t', cls: 'timing', at: { r: 3, c: 14 } }])
  assert.deepEqual(r.drawing.expect.keyable, [{ item: 't0.t', cls: 'timing' }, { item: 't1.t', cls: 'timing' }])
  assert.deepEqual(r.drawing.expect.frames, [])
  assert.ok(Object.values(r.drawing.expect).every(v => v !== undefined))
  const n = X(LONG, 60).drawing.expect; assert.deepEqual([n.keys, n.keyable.length], [[], 2])
})
test('A5.errors: a repeated section name, an empty chart and the entity markers fall back', () => {
  assert.deepEqual(X('section A\nT :2024-01-01, 1d\nsection A\nU :2024-01-02, 1d', 80), { reason: 'section-repeat' })
  assert.deepEqual(X('title T', 80), { reason: 'domain' })
  assert.deepEqual(X('A ﬂ°x¶ß :2024-01-01, 1d', 80), { reason: 'entity' })
  assert.deepEqual(X('section ﬂ°x¶ß\nA :2024-01-01, 1d', 80), { reason: 'entity' })
})
// Mermaid 12.2.0's ground truth: a task name shows <br>, tags and & as written, never split; a section name splits at all four
// <br> spellings.
test('A4: a section splits at every <br> spelling; a task name draws <br>, tags and & as written', () => {
  const d = X('section One<br>two<BR>three<br/>four<br />five\nQ&A <b>x</b> a<br>b :2024-01-01, 2d', 80).drawing
  assert.deepEqual(text(d).slice(0, 6), ['One', 'two', 'three', 'four', 'five', '   Q&A <b>x</b> a<br>b 2024-01-01 · 2d ' + '█'.repeat(41)])
  assert.deepEqual(d.expect.labels.slice(0, 2), [{ owner: 'sec0', text: 'One\ntwo\nthree\nfour\nfive', at: { r: 0, c: 0 } }, { owner: 't0', text: 'Q&A <b>x</b> a<br>b', at: { r: 5, c: 3 } }])
})
// X2: Mermaid 12.2.0 draws no header for a section with no task, so one falls back wherever it stands.
test('A5.errors: a section with no task falls back', () => {
  for (const body of ['section A\nT :2024-01-01, 1d\nsection B', 'section A\nsection B\nT :2024-01-01, 1d', 'T :2024-01-01, 1d\nsection A'])
    assert.deepEqual(X(body, 80), { reason: 'section-empty' }, body)
  assert.equal(X('section A\nT :2024-01-01, 1d\nsection B\nU :2024-01-02, 1d', 80).step, 'natural')
})
