// Drawings the validator tests share: path, one edge drawn a cell per step, and fork, two edges that share a junction.
import { createCanvas, type Drawing } from '../../core/canvas.ts'

// Edge A>B from a to b, one cell per step: down column 0, or along row 0 when across. A number is a line's dirs, a
// string an arrow glyph, null an empty cell, and { text, owners } a label cell, whose owners[0] expect lists with its
// text. Each of ends names an end mark's node, then its glyph: 'B▼'.
export type Step = number | string | null | { text: string; owners: string[] }
export function path(steps: readonly Step[], ends: readonly string[], across = false): Drawing {
  const n = steps.length + 2
  const c = across ? createCanvas(1, n, n) : createCanvas(n, 1, 1)
  const extra: { owner: string; text: string }[] = []
  const pos = (i: number): [number, number] => (across ? [0, i] : [i, 0])
  c.text(...pos(0), 'a', 'node', 'A')
  steps.forEach((s, i) => {
    if (typeof s === 'number') {
      c.line(...pos(i + 1), s, 'light', 'edge', 'A>B')
    } else if (typeof s === 'string') {
      c.arrow(...pos(i + 1), s, 'A>B')
    } else if (s) {
      c.text(...pos(i + 1), s.text, 'label', s.owners)
      extra.push({ owner: s.owners[0]!, text: s.text })
    }
  })
  c.text(...pos(n - 1), 'b', 'node', 'B')
  return c.toDrawing({
    labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }, ...extra],
    edges: [{ id: 'A>B', from: 'A', to: 'B', ends: ends.map((s) => ({ node: s[0]!, glyph: s.slice(1) })) }],
    edgeLabels: [],
    frames: [],
  })
}

// A forks at a ├ that A>B and A>C share: a in row 0, ├┐ in row 1, then ││, ▼▼ and bc.
export function fork(): Drawing {
  const c = createCanvas(5, 2, 2, (x, y) => x.split('>')[0] === y.split('>')[0])
  c.text(0, 0, 'a', 'node', 'A')
  c.line(1, 0, 5, 'light', 'edge', 'A>B')
  c.line(2, 0, 5, 'light', 'edge', 'A>B')
  c.arrow(3, 0, '▼', 'A>B')
  c.line(1, 0, 3, 'light', 'edge', 'A>C')
  c.line(1, 1, 12, 'light', 'edge', 'A>C')
  c.line(2, 1, 5, 'light', 'edge', 'A>C')
  c.arrow(3, 1, '▼', 'A>C')
  c.text(4, 0, 'b', 'node', 'B')
  c.text(4, 1, 'c', 'node', 'C')
  return c.toDrawing({
    labels: [
      { owner: 'A', text: 'a' },
      { owner: 'B', text: 'b' },
      { owner: 'C', text: 'c' },
    ],
    edges: [
      { id: 'A>B', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] },
      { id: 'A>C', from: 'A', to: 'C', ends: [{ node: 'C', glyph: '▼' }] },
    ],
    edgeLabels: [],
    frames: [],
  })
}
