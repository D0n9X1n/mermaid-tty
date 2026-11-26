import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { validate } from '../../core/validate.ts'

// Each source is valid Mermaid that a graph layout of it can route, so it must draw, not fall back to its source. At
// columns wide enough that width never decides: what is checked is that some step of the fit ladder routes it.
function draws(source: string, columns = 400): void {
  const r = explain(source, { columns })

  assert.ok(!isFail(r), `falls back with ${isFail(r) ? r.reason : ''}:\n${source}`)
  assert.equal(validate(r.drawing), null)
}

const flow = (dir: string, ...lines: string[]) => [`flowchart ${dir}`, ...lines.map((l) => `  ${l}`)].join('\n')

test('A3: a labelled edge into a subgraph draws, with the subgraph above, below or beside it', () => {
  for (const dir of ['TD', 'BT', 'LR', 'RL']) {
    draws(flow(dir, 'H -->|go| K', 'subgraph S1 [Group]', '  K --> L', 'end'))
    draws(flow(dir, 'H -->|go| K', 'subgraph S1', '  K --> L', 'end'))
    draws(flow(dir, 'D -->|x| L', 'subgraph S1 [组]', '  K', '  L', 'end'))
  }
})
