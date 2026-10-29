import test from 'node:test'; import assert from 'node:assert/strict'; import { createCanvas } from '../../core/canvas.ts'
import { fitLadder } from '../../core/fit.ts'; import { lookup, ENABLED, KEYWORDS } from '../../core/registry.ts'
import type { Drawing } from '../../core/canvas.ts'; import { fail, type Fail } from '../../core/fail.ts'; import type { Step } from '../../core/fit.ts'
import { register, type DiagramModule, type DiagramType } from '../../core/registry.ts'; import { validate } from '../../core/validate.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'; import { sequence } from '../../core/diagrams/sequence/layout.ts'
const fake = { type: 'flowchart', parse: (s: unknown) => s, steps: () => ['natural', 'tight'],
  layout: (_m: unknown, step: string, cols: number) => {
    const t = 'x'.repeat(step === 'natural' ? 11 : 9), c = createCanvas(1, 12, cols); c.text(0, 0, t, 'node', 'A')
    return c.toDrawing({ labels: [{ owner: 'A', text: t }], edges: [], edgeLabels: [] }) } }
test('A4.fit-ladder: the first fitting step is taken; none fits → Fail', () => {
  assert.equal((fitLadder(fake as never, {}, 10) as { step: string }).step, 'tight')
  assert.ok('reason' in fitLadder(fake as never, {}, 4))
})
// The A1 test below also covers matrix row flowchart-reject-05: a flowchart-elk TD header falls back.
test('A1: registry keywords; ENABLED is exactly A', () => {
  assert.deepEqual([...ENABLED].sort(), ['flowchart', 'sequence'])
  assert.equal(KEYWORDS['graph'], 'flowchart'); assert.equal(KEYWORDS['stateDiagram-v2'], 'state'); assert.equal(KEYWORDS['flowchart-elk'], null)
  assert.deepEqual(lookup('flowchart-elk TD'), { reason: 'fallback:flowchart-elk' }); assert.deepEqual(lookup('pie title x'), { reason: 'disabled:pie' })
  assert.deepEqual(lookup('Flowchart TD'), { reason: 'unknown-type' })
})

// A fake type whose model is its own ladder: each step, and what its layout draws at the budget it is given: a one-row
// label n cells wide; the label xxx with an arrow written over its first cell ('clash'); a label one cell wider than the
// budget on a canvas that declares 5 columns more ('liar'); the label xxx on a canvas that declares 5 columns fewer
// ('short'); or a Fail. calls logs each layout.
type Rung = readonly [Step, number | 'clash' | 'liar' | 'short' | Fail]
function draw(what: Rung[1], columns: number): Drawing | Fail {
  if (typeof what === 'object') return what
  const n = what === 'clash' || what === 'short' ? 3 : what === 'liar' ? columns + 1 : what
  const t = 'x'.repeat(n), c = createCanvas(1, 12, what === 'liar' ? columns + 5 : what === 'short' ? columns - 5 : columns)
  c.text(0, 0, t, 'node', 'A')
  if (what === 'clash') c.arrow(0, 0, '►', 'A')
  return c.toDrawing({ labels: [{ owner: 'A', text: t }], edges: [], edgeLabels: [] })
}
function fit(rungs: readonly Rung[], columns: number, calls: [Step, number][] = []) {
  const mod: DiagramModule<readonly Rung[]> = { type: 'flowchart', parse: () => fail('unused'), steps: m => m.map(([step]) => step),
    layout: (m, step, cols) => { calls.push([step, cols]); return draw(m.find(([s]) => s === step)![1], cols) } }
  return fitLadder(mod, rungs, columns)
}
test('A4.fit-ladder: a drawing the validator rejects, a conflict included, is skipped; the last rejection is returned', () => {
  assert.deepEqual(fit([['natural', 'clash'], ['tight', 9]], 10), { step: 'tight', drawing: draw(9, 10) })
  assert.deepEqual(fit([['natural', 'clash'], ['tight', 11]], 10), { reason: 'row-too-wide' })
  assert.deepEqual(fit([['natural', 11], ['tight', 'clash']], 10), { reason: 'overwrite' })
})
test('A4.fit-ladder: a layout that returns a Fail is skipped; its reason is returned when it is the last rejection', () => {
  assert.deepEqual(fit([['natural', fail('no-route')], ['tight', 9]], 10), { step: 'tight', drawing: draw(9, 10) })
  assert.deepEqual(fit([['natural', 11], ['tight', fail('no-route')]], 10), { reason: 'no-route' })
  assert.deepEqual(fit([['natural', fail('no-route')], ['tight', 11]], 10), { reason: 'row-too-wide' })
})
test('A4.fit-ladder: a drawing whose columns differ from the budget is skipped, though validate accepts it; columns-mismatch when last', () => {
  const liar = draw('liar', 10) as Drawing
  assert.deepEqual([liar.columns, liar.cells[0]!.filter(x => x !== null).length, validate(liar)], [15, 11, null])
  assert.deepEqual(fit([['natural', 'liar'], ['tight', 9]], 10), { step: 'tight', drawing: draw(9, 10) })
  assert.deepEqual(fit([['natural', 11], ['tight', 'liar']], 10), { reason: 'columns-mismatch' })
})
test('A4.fit-ladder: a drawing that declares fewer columns than the budget is skipped as columns-mismatch too, though validate accepts it', () => {
  const short = draw('short', 10) as Drawing
  assert.deepEqual([short.columns, validate(short)], [5, null])
  assert.deepEqual(fit([['natural', 11], ['tight', 'short']], 10), { reason: 'columns-mismatch' })
  assert.deepEqual(fit([['natural', 'short'], ['tight', 9]], 10), { step: 'tight', drawing: draw(9, 10) })
})
test('A4.fit-ladder: steps run in the order the type lists them, each at the full budget, until the first fits', () => {
  const calls: [Step, number][] = []
  assert.deepEqual(fit([['natural', 11], ['wrap', 7], ['tight', 9]], 10, calls), { step: 'wrap', drawing: draw(7, 10) })
  assert.deepEqual(calls, [['natural', 10], ['wrap', 10]])
})
test('A4.fit-ladder: a type with no steps fails with too-wide and lays out nothing', () => {
  const calls: [Step, number][] = []
  assert.deepEqual(fit([], 10, calls), { reason: 'too-wide' })
  assert.deepEqual(calls, [])
})

// Every keyword and alias of each type, as plan A T12 lists them; flowchart-elk and requirement are explicit fallbacks.
const TYPES: Record<DiagramType, readonly string[]> = {
  flowchart: ['flowchart', 'graph'], sequence: ['sequenceDiagram'], state: ['stateDiagram', 'stateDiagram-v2'],
  class: ['classDiagram', 'classDiagram-v2'], er: ['erDiagram'], requirement: ['requirementDiagram'],
  c4: ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'], architecture: ['architecture-beta'],
  gantt: ['gantt'], pie: ['pie'], xychart: ['xychart-beta', 'xychart'], quadrant: ['quadrantChart'], journey: ['journey'],
  sankey: ['sankey-beta', 'sankey'], radar: ['radar-beta'], treemap: ['treemap-beta', 'treemap'], mindmap: ['mindmap'],
  gitGraph: ['gitGraph'], timeline: ['timeline'], kanban: ['kanban'], block: ['block-beta', 'block'],
  packet: ['packet-beta', 'packet'], zenuml: ['zenuml'],
}
const TABLE: [string, string | null][] = [...Object.entries(TYPES).flatMap(([type, kws]) => kws.map((kw): [string, string] => [kw, type])),
  ['flowchart-elk', null], ['requirement', null]]
test('A1: every keyword and alias maps as in the table; each one A does not draw is disabled or falls back', () => {
  assert.deepEqual(KEYWORDS, Object.fromEntries(TABLE))
  const sweep = TABLE.filter(([, type]) => type !== 'flowchart' && type !== 'sequence')
  assert.deepEqual(sweep.map(([kw]) => lookup(kw)), sweep.map(([kw, type]) => ({ reason: type === null ? `fallback:${kw}` : `disabled:${type}` })))
})

// A module lookup only files and finds: its methods are never called. Registration lasts for the rest of this file.
const stub = (type: DiagramType): DiagramModule => ({ type, parse: () => fail('stub'), steps: () => [], layout: () => fail('stub') })
// The flowchart and sequence modules register themselves on import (T19, T24), so no enabled type stays unregistered.
test('A1: lookup returns each enabled type\'s registered module, sequenceDiagram included, then the module registered in its place; a disabled type stays disabled', () => {
  assert.equal(lookup('flowchart TD'), flowchart)
  assert.equal(lookup('graph LR'), flowchart)
  assert.equal(lookup('sequenceDiagram'), sequence)
  const flow = stub('flowchart')
  register(flow)
  register(stub('pie'))
  assert.equal(lookup('flowchart TD'), flow)
  assert.equal(lookup('graph LR'), flow)
  assert.deepEqual([lookup('sequenceDiagram'), lookup('pie'), lookup('flowchart-elk TD')],
    [sequence, { reason: 'disabled:pie' }, { reason: 'fallback:flowchart-elk' }])
})
test('A1: registering a second module of a type replaces the first, so lookup returns the second', () => {
  const first = stub('flowchart'), second = stub('flowchart')
  register(first)
  register(second)
  assert.equal(lookup('flowchart TD'), second)
})
test('A1: the keyword is the first whitespace-separated token of the header, less one trailing colon', () => {
  const headers = ['sequenceDiagram:', 'pie: title x', 'pie\ttitle x', 'flowchart-elk: TD', 'stateDiagram-v2::']
  assert.deepEqual(headers.map(h => lookup(h)),
    [sequence, { reason: 'disabled:pie' }, { reason: 'disabled:pie' }, { reason: 'fallback:flowchart-elk' }, { reason: 'unknown-type' }])
})
test('A1: whitespace before the keyword is skipped, so a header with leading spaces still names its type', () => {
  assert.deepEqual(lookup('  pie'), { reason: 'disabled:pie' })
})
test('A1: an empty header, a keyword in the wrong case and an Object.prototype name are each an unknown type', () => {
  const headers = ['', 'GRAPH TD', 'sequencediagram', 'toString', 'constructor x', 'hasOwnProperty:', '__proto__']
  assert.deepEqual(headers.map(h => lookup(h)), headers.map(() => ({ reason: 'unknown-type' })))
})
