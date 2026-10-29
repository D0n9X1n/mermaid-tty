import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { validate } from '../../core/validate.ts'
import { isFail } from '../../core/fail.ts'
import { text } from './graph-fixture.ts'

// V7: a cycle between nodes of one frame draws, its back edge inside the frame (V6 keeps it there), not as a fallback.
const REPROS = {
  'flowchart TD two-node cycle': 'flowchart TD\nsubgraph S\n  a --> b\n  b --> a\nend',
  'state composite cycle': 'stateDiagram-v2\nstate P {\n  A --> B\n  B --> A\n}\n[*] --> P',
  'flowchart LR three-node cycle, edge to the frame': 'flowchart LR\nsubgraph S\n  a --> b --> c\n  c --> a\nend\nx --> S',
  'nested frames, the cycle in the inner one': 'flowchart TD\nsubgraph O\n  subgraph I\n    a --> b\n    b --> a\n  end\n  c\nend\nc --> I',
}
for (const [name, src] of Object.entries(REPROS)) {
  test(`V7: ${name} draws at 80 columns with the back edge inside the frame`, () => {
    const r = explain(src, { columns: 80, theme: 'mono' })
    assert.ok(!isFail(r), `fell back: ${isFail(r) ? r.reason : ''}`)
    assert.equal(validate(r.drawing), null, text(r.drawing).join('\n'))
  })
}
