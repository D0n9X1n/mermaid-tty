import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { validate } from '../../core/validate.ts'

const flow = (dir: string, ...lines: string[]) => [`flowchart ${dir}`, ...lines.map((l) => `  ${l}`)].join('\n')

// A subgraph level with an edge that holds neither end of it is a wall that edge cannot cross: so the edge's ends and
// its label, on the ranks the subgraph spans, keep to one side of it, and the edge goes round.
test('A3: an edge beside a subgraph that holds neither end keeps to one side of it', () => {
  for (const dir of ['LR', 'RL', 'TD', 'BT']) {
    for (const source of [
      flow(dir, 'C -->|x| F', 'D -->|x| B', 'subgraph S1 [Group]', '  E', '  F', 'end'),
      flow(dir, 'C -.-> M', 'B --> A', 'I -->|x| C', 'subgraph S1 [组]', '  L', '  M', 'end'),
      flow(dir, 'H ==>|x| L', 'J -->|x| E', 'subgraph S1 [组]', '  E', '  F', 'end'),
    ]) {
      const r = explain(source, { columns: 400 })

      assert.ok(!isFail(r), `${isFail(r) ? r.reason : ''}:\n${source}`)
      assert.equal(validate(r.drawing), null)
    }
  }
})
