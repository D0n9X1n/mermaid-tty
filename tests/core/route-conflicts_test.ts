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

// A side question's flowchart, all 14 of its edges: long edges from C and E fan into N and X side by side, so their
// labels and bends sit on neighbouring rows. Each must keep a free cell from the others, or the edge that has to pass
// beside them cannot.
const BTW_FLOW = [
  'A["/btw question"] --> B{"Terminal, not source mode, question not blank?"}',
  'B -->|no| N["Native /btw"]',
  'B -->|yes| C["Fork the session transcript"]',
  'C -->|answered| P{"Pane placed?"}',
  'C -->|nothing-to-fork| D{"Any message with text?"}',
  'C -->|error or empty| N',
  'C -->|Esc| X["Nothing shown"]',
  'D -->|no| N',
  'D -->|yes| E["Ask the model over the conversation"]',
  'E -->|answered| P',
  'E -->|error or empty| N',
  'E -->|Esc| X',
  'P -->|yes| Q["mermaid-tty btw pane"]',
  'P -->|no| N',
]

// Its smallest part that once fell back at every width: nine edges, from C's fan-out to the pane and N.
const BTW_CORE = [
  'C -->|nothing-to-fork| D{"Any message with text?"}',
  'C -->|error or empty| N',
  'C -->|Esc| X["Nothing shown"]',
  'D -->|yes| E["Ask the model over the conversation"]',
  'E -->|answered| P',
  'E -->|error or empty| N',
  'E -->|Esc| X',
  'P -->|yes| Q["mermaid-tty btw pane"]',
  'P -->|no| N',
]

// Both draw at the widths a terminal has. Below 70 columns the whole flowchart's unbreakable label nothing-to-fork
// leaves it too wide, a fallback for width, not routing.
test('A3: long edges fanning into the same nodes draw, their labels and bends clear of each other', () => {
  assert.equal(BTW_FLOW.length, 14)
  for (const columns of [60, 80, 120, 400]) {
    draws(flow('LR', ...BTW_CORE), columns)
  }

  for (const columns of [70, 80, 120, 400]) {
    draws(flow('LR', ...BTW_FLOW), columns)
  }
})

// Edges fanning into one node from different sources each end on its face with an arrowhead, which needs the row in
// front of the face for its stem. A run routed earlier along that row would leave a later edge no way in.
test('A3: a node many edges fan into keeps the row before its face free for each arrowhead', () => {
  draws(flow('LR', ...BTW_FLOW), 80)
  draws(flow('TD', ...BTW_FLOW), 80)
  draws(flow('TD', 'A --> B & C & D', 'B -->|x| N', 'C -->|y| N', 'D -->|z| N', 'A -->|w| N'), 80)
})

// A labelled edge back to an earlier node takes an outside lane, past everything at its level. When another node sits
// right beside its end, where the lane would leave, it routes through its label by the general search instead.
test('A3: a labelled edge back beside an unrelated part of the graph draws', () => {
  for (const dir of ['LR', 'RL', 'TD', 'BT']) {
    draws(flow(dir, 'C -.-> E["Error"]', 'E -->|x| C', 'I --> J & K'))
    draws(flow(dir, 'B ---|x| D(("Read config"))', 'F --> C', 'D ==> B'))
  }
})

// Every source joined to every target, and many arrow styles into one node: each incoming group takes a column of its
// own on the target's face.
test('A3: complete fans and many arrow styles into one node draw', () => {
  for (const dir of ['TD', 'BT', 'LR', 'RL']) {
    draws(flow(dir, 'A --> X & Y & Z', 'B --> X & Y & Z', 'C --> X & Y & Z'), 80)
    draws(flow(dir, 'A --> X', 'B ==> X', 'C -.-> X', 'D --o X', 'E --x X', 'F <--> X', 'G o--o X', 'H x--x X'), 80)
  }
})

// A labelled edge back over a subgraph it does not enter runs in a lane past everything: its label stays in that lane,
// never moved beside an end the subgraph's frame stands between, and an end level with the subgraph keeps to the lane's
// side of it, closed off as a block or open to an edge from outside. A label or bend moved toward its end never jumps
// over a frame, and an edge passing over a subgraph's top border has room to run along it.
test('A3: a labelled edge back past a subgraph between its ends draws', () => {
  const minimal = [
    'N4 --> N6["Load config"]',
    'N6 --> N10{"Pane placed?"}',
    'N10 -->|x| N11["Notify user"]',
    'N13 -->|x| N14["Call API"]',
    'N11 -->|x| N4',
    'subgraph G1 ["Fork path"]',
    '  N13',
    '  N14',
    'end',
  ]
  const open = [
    'N4 --> N6["Load config"]',
    'N6 --> N10{"Pane placed?"}',
    'N10 -->|x| N11["Notify user"]',
    'N9 --> N13{"Pane placed?"}',
    'N11 -->|x| N4',
    'subgraph G1 ["Fork path"]',
    '  N13',
    'end',
  ]
  const cycle = ['B -.->|x| E{{"Log"}}', 'E -.-> B', 'subgraph S1 ["Worker tier"]', '  E', '  G', 'end']
  for (const dir of ['LR', 'RL', 'TD', 'BT']) {
    for (const columns of [80, 120]) {
      draws(flow(dir, ...minimal), columns)
      draws(flow(dir, ...open), columns)
      draws(flow(dir, ...cycle), columns)
    }
  }

  draws(
    flow(
      'TD',
      'N10 -->|x| N11["Render"]',
      'N12 -->|x| N14["Queue job"]',
      'N11 --> N18{"Pane placed?"}',
      'N18 -->|x| N20["Parse request"]',
      'N13 --> N21{"Pane placed?"}',
      'N14 --> N23{"Pane placed?"}',
      'N23 -->|x| N1',
      'subgraph G1 ["Validation"]',
      '  N20',
      '  N21',
      'end',
    ),
    120,
  )
})

// Two subgraphs side by side, a back edge between the nodes of one: its bend and the other edges' labels stay at their
// own subgraph's level, never moved across the sibling, so the plain layout still draws.
test('A3: an edge kept beside its own subgraph never moves across a sibling subgraph', () => {
  const source = flow(
    'LR',
    'A -->|yes| B; A --> C; C --> D; D -->|retry| C',
    'subgraph S0; A; B; end',
    'subgraph S1; C; D; end',
  )
  for (const columns of [60, 80, 120, 400]) {
    const r = explain(source, { columns })

    assert.ok(!isFail(r), `${columns}: ${JSON.stringify(r)}`)
    assert.equal(r.step, 'natural', `${columns}`)
  }
})
