import test from 'node:test'; import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource } from '../../core/source.ts'
import type { Source } from '../../core/source.ts'
const P = (t: string) => parseFlowchart(readSource(`flowchart TD\n${t}`) as Source)

// Lines with accDescr {…} blocks, ; and direction statements, each beside the plain lines it reads as.
const SAME = [
  ['A; accDescr { x } B', 'A\nB'],
  ['accDescr { a; b } A; B', 'A\nB'],
  ['accDescr{}A', 'A'],
  ['A;;B', 'A\nB'],
  ['A; accDescr { "x\nB }\nC', 'A\nC'],
  ['accTitle: x; accDescr { y\nA', 'A'],
  ['accDescr { direction LR } A', 'A'],
  ['subgraph S\naccDescr { x } direction LR\nA\nend', 'subgraph S\ndirection LR\nA\nend'],
  ['subgraph S\naccDescr { direction LR } direction BT\nA\nend', 'subgraph S\ndirection BT\nA\nend'],
  ['accDescr {} '.repeat(50) + 'A', 'A'],
]
test('A1: after an accDescr {…} block closes, its line reads on as statements, a direction there included', () => {
  for (const [line, plain] of SAME) { assert.deepEqual(P(line!), P(plain!), line) }
})
// A line where direction X appears is only that statement: anywhere at its start, or after a block closes on it.
const FAILS = [
  ['accDescr { x } direction LR', 'syntax:2'],
  ['A --> B; direction LR', 'syntax:2'],
  ['accDescr { x } A["direction LR"]', 'syntax:2'],
  ['A["direction LR"]; accDescr { x } B', 'syntax:2'],
]
test('A5.errors: a line where direction X appears is only that statement, after a closed accDescr {…} block too', () => {
  for (const [line, reason] of FAILS) { assert.deepEqual(P(line!), { reason }, line) }
})
