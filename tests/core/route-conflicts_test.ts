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

// Bottom to top and right to left are top to bottom and left to right mirrored: whatever draws one way draws the other.
test('A3: a graph that draws top to bottom or left to right also draws mirrored', () => {
  const shapes = [
    ['A --> B', 'B -->|again| B', 'B --> C'],
    ['A --> B', 'B -->|x| B', 'B -->|y| B'],
    ['A --> C', 'A --> D', 'B --> C', 'B --> D'],
    ['A & B --> C & D'],
    ['A --> B', 'B -->|again| B', 'B --> C', 'C -->|retry| A'],
    ['A --> B', 'B -->|again| B', 'B -->|more| B', 'B --> C', 'A --> C'],
  ]
  for (const lines of shapes) {
    for (const [one, other] of [
      ['TB', 'BT'],
      ['LR', 'RL'],
    ]) {
      if (!isFail(explain(flow(one!, ...lines), { columns: 400 }))) {
        draws(flow(other!, ...lines))
      }
    }
  }
})

// A self-loop turns round its node, so a subgraph holding that node leaves room for the loop inside it.
test('A3: a self-loop on a node inside a subgraph draws, labelled or not, in every direction', () => {
  for (const dir of ['TD', 'BT', 'LR', 'RL']) {
    for (const loop of ['G --> G', 'G -->|x| G', 'G -.->|again| G']) {
      draws(flow(dir, loop, 'subgraph S1 [Group]', '  G', 'end'))
      draws(flow(dir, 'A --> G', loop, 'subgraph S1 [Group]', '  G', '  H', 'end', 'G --> H'))
    }
  }
})
