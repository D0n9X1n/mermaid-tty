import test from 'node:test'; import assert from 'node:assert/strict'
import { renderMermaid, explain, createRenderer, toRows, type Span } from '../../core/render.ts'; import { THEMES, palette } from '../../core/themes.ts'
import { createCanvas } from '../../core/canvas.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'; import { fitLadder } from '../../core/fit.ts'
import { readSource } from '../../core/source.ts'; import { validate } from '../../core/validate.ts'
import type { Source } from '../../core/source.ts'
import type { Cell, Drawing } from '../../core/canvas.ts'
import type { Ink, Palette } from '../../core/themes.ts'
import type { Fail } from '../../core/fail.ts'
const FC = 'flowchart TD\nA[读取配置文件] --> B{完成?}', O = { columns: 80, theme: 'nord' }
const spans = (rows: Span[][] | null) => rows!.flat()

test('A5.errors: parse errors and unsupported types return null', () => {
  for (const s of ['flowchart TD\nA[open --> B', 'pie title x\n"a": 1', 'flowchart-elk TD\nA', 'Flowchart TD\nA']) assert.equal(renderMermaid(s, O), null, s)
  assert.deepEqual(explain('flowchart TD\nA[👨‍👩]', O), { reason: 'unsupported-char U+200D' })
})
test('A4.fit-ladder: below the minimum width falls back', () => assert.ok('reason' in explain(FC, { columns: 8, theme: 'nord' })))

// The first Fail wins, in pipeline order: the source, the header's module, the parse, then the fit ladder.
test('A5.errors: explain returns the first Fail of source, lookup, parse and fit, in that order', () => {
  assert.deepEqual(explain('flowchart TD', O), { reason: 'empty' })
  assert.deepEqual(explain('pie title x\n"a": 1', O), { reason: 'disabled:pie' })
  assert.deepEqual(explain('sequenceDiagram\nA->>B: hi', O), { reason: 'unregistered:sequence' })
  const bad = 'flowchart TD\nA[open --> B'
  assert.deepEqual(explain(bad, O), flowchart.parse(readSource(bad) as Source))
  const model = flowchart.parse(readSource(FC) as Source)
  assert.deepEqual(explain(FC, { columns: 8 }), fitLadder(flowchart, model as never, 8))
})
test('A4.fit-ladder: explain returns the first step that fits, with its drawing at the given columns', () => {
  const r = explain(FC, O) as { step: string; drawing: { columns: number } }
  assert.equal(r.step, 'natural')
  assert.equal(r.drawing.columns, 80)
  assert.equal(validate(r.drawing as never), null)
  const lr = 'flowchart LR\nA[alpha one] --> B[beta two] --> C[gamma three] --> D[delta four]'
  assert.equal((explain(lr, { columns: 40 }) as { step: string }).step, 'lrToTd')
})
test('A5.errors: renderMermaid falls back with null when no step fits', () => {
  assert.equal(renderMermaid(FC, { columns: 8 }), null)
})

test('A7: spans carry the palette colors; mono carries none', () => {
  const s = spans(renderMermaid(FC, O)), n = THEMES.nord.roles
  assert.equal(s.find(x => x.text.includes('读取配置文件'))?.backgroundColor, n.node)
  assert.equal(s.find(x => x.text.includes('完成?'))?.backgroundColor, n.decision)
  assert.equal(s.find(x => x.text.includes('▼'))?.color, n.arrow)
  assert.ok(spans(renderMermaid(FC, { columns: 80, theme: 'mono' })).every(x => x.color === undefined && x.backgroundColor === undefined))
})
test('A7: a series-inked cell yields a span with role s3 and the palette series color (C contract)', () => {
  const c = createCanvas(1, 4, 4); c.text(0, 0, 'ab', 's3', 'x')
  const span = toRows(c.toDrawing({ labels: [], edges: [], edgeLabels: [] }), palette('nord'))[0]![0]!
  assert.deepEqual([span.role, span.color], ['s3', THEMES.nord.series.s3])
})

// A drawing written cell by cell: a node pill around a wide label then an arrow; an empty row; an edge and its label
// after a blank; a title; a decision pill. _ is no cell.
const c = (ch: string, role: Ink, kind: Cell['kind']): Cell => ({ ch, role, kind, owners: ['x'], dirs: 0 }), _ = null
const D: Drawing = { columns: 20, conflicts: [], expect: { labels: [], edges: [], edgeLabels: [] }, cells: [
  [c('[', 'node', 'cap'), c(' ', 'node', 'fill'), c('读', 'node', 'text'), c('', 'node', 'cont'), c('取', 'node', 'text'),
    c('', 'node', 'cont'), c(' ', 'node', 'fill'), c(']', 'node', 'cap'), _, _, c('▼', 'arrow', 'arrow'), _, _],
  [_, _, _],
  [_, c('─', 'edge', 'line'), c('─', 'edge', 'line'), c('y', 'label', 'text'), c('e', 'label', 'text'), c('s', 'label', 'text'), _],
  [c('T', 'title', 'text'), c('i', 'title', 'text'), _],
  [c('{', 'decision', 'cap'), c('?', 'decision', 'text'), c('}', 'decision', 'cap')],
] }
test('A7: toRows merges neighbours of one role and style, skips cont cells, trims trailing blanks, omits null properties', () => {
  const n = THEMES.nord.roles, on = THEMES.nord.onFill
  assert.deepEqual(toRows(D, palette('nord')), [
    [{ text: '[', role: 'node', color: n.node }, { text: ' 读取 ', role: 'node', color: on, backgroundColor: n.node },
      { text: ']', role: 'node', color: n.node }, { text: '  ' }, { text: '▼', role: 'arrow', color: n.arrow }],
    [],
    [{ text: ' ' }, { text: '──', role: 'edge', color: n.edge }, { text: 'yes', role: 'label', color: n.label }],
    [{ text: 'Ti', role: 'title', color: n.title, bold: true }],
    [{ text: '{', role: 'decision', color: n.decision }, { text: '?', role: 'decision', color: on, backgroundColor: n.decision },
      { text: '}', role: 'decision', color: n.decision }],
  ])
})
test('A7: without fill a pill is one span in its role color; a role the palette dims carries dimColor', () => {
  const p: Palette = { ...palette('nord'), fill: false, dim: ['edge'] }, rows = toRows(D, p), n = p.roles
  assert.deepEqual(rows[0]![0], { text: '[ 读取 ]', role: 'node', color: n.node })
  assert.deepEqual(rows[2], [{ text: ' ' }, { text: '──', role: 'edge', color: n.edge, dimColor: true }, { text: 'yes', role: 'label', color: n.label }])
})
test('A7: under mono no span has a color or a background, so a pill and its caps merge', () => {
  assert.deepEqual(toRows(D, palette('mono'))[0], [{ text: '[ 读取 ]', role: 'node' }, { text: '  ' }, { text: '▼', role: 'arrow' }])
})
test('A7: renderMermaid draws the rows toRows makes of the drawing, in the given theme or else the default', () => {
  const d = (explain(FC, O) as { drawing: Drawing }).drawing
  assert.deepEqual(renderMermaid(FC, O), toRows(d, palette('nord')))
  assert.deepEqual(renderMermaid(FC, { columns: 80 }), toRows(d, palette('default')))
})

test('A8.cache: a hit; a miss when any key part changes; LRU eviction at the 65th entry', () => {
  let calls = 0; const r = createRenderer(64, (s, o) => { calls++; return explain(s, o) })
  r.render(FC, O); r.render(FC, O); assert.equal(calls, 1)
  r.render(FC + ' ', O); r.render(FC, { ...O, columns: 81 }); r.render(FC, { ...O, theme: 'mono' }); assert.equal(calls, 4)
  for (let i = 0; i < 64; i++) r.render(`flowchart TD\nN${i}`, O)
  assert.equal(r.size, 64); r.render(FC, O); assert.equal(calls, 69)
})
test('A8.cache: onMiss gets the Fail of a miss only; a hit returns the cached Fail and does not call it', () => {
  const r = createRenderer(), seen: Fail[] = [], bad = 'flowchart TD\nA[open --> B'
  const first = r.render(bad, O, f => seen.push(f)), again = r.render(bad, O, f => seen.push(f))
  assert.deepEqual(seen, [explain(bad, O)])
  assert.equal(again, first)
  r.render(FC, O, f => seen.push(f))
  assert.equal(seen.length, 1)
})
test('A8.cache: render returns the rows renderMermaid draws, in the given theme, or the Fail explain returns', () => {
  const r = createRenderer()
  assert.deepEqual(r.render(FC, O), renderMermaid(FC, O))
  assert.deepEqual(r.render(FC, { columns: 80, theme: 'mono' }), renderMermaid(FC, { columns: 80, theme: 'mono' }))
  assert.deepEqual(r.render(FC, { columns: 8 }), explain(FC, { columns: 8 }))
})

// Columns must be a positive safe integer. JSON.stringify keys ±Infinity and NaN alike, as null.
const BAD_COLUMNS = [0, -1, 1.5, NaN, Infinity, -Infinity, 2 ** 53]
test('A5.errors: explain fails bad-columns, before any other check, unless columns is a positive safe integer', () => {
  for (const columns of BAD_COLUMNS) assert.deepEqual(explain('pie', { columns }), { reason: 'bad-columns' }, String(columns))
  assert.equal(renderMermaid(FC, { columns: Infinity }), null)
})
test('A8.cache: one renderer gives what a fresh explain gives at Infinity, then at -Infinity (the null-key collision)', () => {
  const r = createRenderer(), s = 'flowchart TD\nA'
  for (const columns of [Infinity, -Infinity]) assert.deepEqual(r.render(s, { columns }), explain(s, { columns }), String(columns))
})
test('A8.cache: render refuses bad columns uncached, whatever inner would draw, and passes the Fail to onMiss', () => {
  let calls = 0; const r = createRenderer(64, (s, o) => { calls++; return explain(s, { ...o, columns: 80 }) }), seen: Fail[] = []
  for (const columns of BAD_COLUMNS) assert.deepEqual(r.render(FC, { columns }, f => seen.push(f)), { reason: 'bad-columns' }, String(columns))
  assert.deepEqual([calls, r.size, seen.length], [0, 0, BAD_COLUMNS.length])
})

test('A5.errors: a frontmatter title with U+200D falls back: renderMermaid returns null, and explain says why', () => {
  const s = '---\ntitle: "x‍y"\n---\nflowchart TD\nA'
  assert.equal(renderMermaid(s, O), null)
  assert.deepEqual(explain(s, O), { reason: 'unsupported-char U+200D' })
})

test('A8.cache: with no capacity given, a renderer keeps 64 entries, and evicts the least recently used at the 65th', () => {
  let calls = 0; const r = createRenderer(undefined, (s, o) => { calls++; return explain(s, o) })
  for (let i = 0; i < 64; i++) r.render(`flowchart TD\nN${i}`, O)
  for (let i = 0; i < 64; i++) r.render(`flowchart TD\nN${i}`, O)
  assert.deepEqual([calls, r.size], [64, 64])
  r.render('flowchart TD\nN64', O); r.render('flowchart TD\nN0', O)
  assert.deepEqual([calls, r.size], [66, 64])
})
