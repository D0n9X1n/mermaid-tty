// drawGraph (plan A §6, T18): a placed, routed graph drawn onto the canvas.
import assert from 'node:assert/strict'
import test from 'node:test'
import { CAPS } from '../../core/caps.ts'
import type { Shape } from '../../core/caps.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Route } from '../../core/graph/route.ts'
import { validate } from '../../core/validate.ts'
import { g, text } from './graph-fixture.ts'

const D = (gr: ReturnType<typeof g>, wrapAt: number | null = null) => {
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt }) as Placed
  return { p, d: drawGraph(p, routeGraph(p) as Route[], 80) }
}

test('A3: edge labels draw centered text without fill while nodes keep their fill', () => {
  const p = layoutGraph(g('LR', ['A>B|成功']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const d = drawGraph(p, [], 80), label = p.boxes.get('e0:label')!, a = p.boxes.get('A')!
  assert.equal(d.cells[label.row]![label.col], null)
  assert.equal(d.cells[label.row]![label.col + label.cols - 1], null)
  assert.deepEqual(d.cells[label.row]![label.col + 1]!.owners, ['e0:label', 'e0'])
  assert.equal(d.cells[label.row]![label.col + 1]!.ch, '成')
  assert.equal(d.cells[a.row]![a.col + 1]!.kind, 'fill')
})

test('A3: one row per label line; no border-only rows', () => {
  const { p, d } = D(g('TB', ['A>B'], { A: 'one', B: 'two<br/>lines' }))
  assert.equal(validate(d), null)
  assert.equal(p.boxes.get('A')!.rows, 1)
  assert.equal(p.boxes.get('B')!.rows, 2)
  for (const id of ['A', 'B']) {
    const b = p.boxes.get(id)!
    for (let r = b.row; r < b.row + b.rows; r++) assert.ok(d.cells[r]!.some(c => c?.kind === 'text' && c.owners.includes(id)), `${id}@${r}`)
  }
  assert.match(text(d).join('\n'), /\[ one \][\s\S]*▼[\s\S]*\[ +two +\]/)
})

test('A3: a wrapped label takes one row per wrapped line', () => {
  const { p, d } = D(g('TB', ['A>B'], { A: 'alpha beta gamma' }), 8)
  assert.equal(validate(d), null)
  assert.equal(p.boxes.get('A')!.rows, 3)
})

test('A3: every shape: a one-line label takes 1 row, a <br/> label N rows, a wrapped label one row per wrapped line', () => {
  for (const shape of Object.keys(CAPS) as Shape[]) {
    for (const [label, wrapAt, rows] of [['one', null, 1], ['a<br/>b<br/>c', null, 3], ['alpha beta gamma', 8, 3]] as const) {
      const gr = g('TB', ['A>B'], { A: label })
      gr.nodes[0]!.shape = shape
      const { p, d } = D(gr, wrapAt)
      assert.equal(validate(d), null, `${shape} ${label}`)
      assert.equal(p.boxes.get('A')!.rows, rows, `${shape} ${label}`)
    }
  }
})

test('A1: thick bends are heavy; dotted bends are dashed with light corners; thick crosses solid with ╂ or ┿', () => {
  const heavy = text(D(g('TB', ['A=>B', 'A=>C'])).d).join('\n')
  assert.match(heavy, /[┏┓┗┛]/)
  assert.match(heavy, /[┳┻┣┫]/)
  const dot = text(D(g('TB', ['A.>B', 'A.>C'])).d).join('\n')
  assert.match(dot, /┆/)
  assert.match(dot, /[┌┐└┘]/)
  assert.doesNotMatch(dot, /[┏┓┗┛]/)
  assert.match(text(D(g('TB', ['A>C', 'A=>D', 'B>C', 'B>D'])).d).join('\n'), /[╂┿]/)
})

test('expect lists each drawn edge with its original ends and head glyphs; a back edge keeps its direction', () => {
  const { d } = D(g('TB', ['A>B', 'B>C', 'C>A']))
  assert.equal(validate(d), null)
  assert.deepEqual(d.expect.edges, [
    { id: 'e0', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] },
    { id: 'e1', from: 'B', to: 'C', ends: [{ node: 'C', glyph: '▼' }] },
    { id: 'e2', from: 'C', to: 'A', ends: [{ node: 'A', glyph: '◄' }] },
  ])
})

test('edges that share an endpoint merge their lines into one junction', () => {
  const { d } = D(g('TB', ['A>B', 'A>C']))
  assert.equal(validate(d), null)
  assert.match(text(d).join('\n'), /[┴┬├┤]/)
})

test('an edge label is drawn in its label box, owned by the label then its edge, and paired with its edge', () => {
  const { p, d } = D(g('TB', ['A>B|yes', 'C>D']))   // A>B|yes alone is routed off the grid (router, T17)
  assert.equal(validate(d), null)
  const b = p.boxes.get('e0:label')!
  assert.ok(d.cells[b.row]!.some(c => c?.kind === 'text' && c.ch === 'y' && c.owners[0] === 'e0:label' && c.owners.includes('e0')))
  assert.deepEqual(d.expect.edgeLabels, [{ owner: 'e0:label', edge: 'e0' }])
})

test('A3: a member row is owned by its own id (C contract)', () => {
  const gr = g('TB', ['U>V'])
  gr.nodes[0]!.rows = [{ text: 'User', role: 'node', align: 'center' }, { text: '+name', role: 'label', align: 'left', id: 'U.name' }]
  const { d } = D(gr)
  assert.equal(validate(d), null)
  assert.ok(d.cells.flat().some(c => c?.kind === 'text' && c.ch === '+' && c.owners[0] === 'U.name' && c.owners.includes('U')))
})

test("a cluster is framed, its title drawn on the frame's top and listed under the cluster id", () => {
  const gr = g('TB', ['A>B'])
  gr.clusters = [{ id: 'S', title: 'Group', dir: null, nodes: ['A', 'B'], clusters: [] }]
  const { p, d } = D(gr)
  assert.equal(validate(d), null)
  assert.match(text(d)[p.frames.get('S')!.row]!, /┌─Group─*┐/)
  assert.deepEqual(d.expect.labels.find(l => l.owner === 'S'), { owner: 'S', text: 'Group' })
})

test('the graph title is title text on row 0, the graph below it, the grid as wide as the title', () => {
  const gr = g('TB', ['A>B'])
  gr.title = 'A long chart title'
  const { d } = D(gr)
  assert.equal(validate(d), null)
  assert.equal(text(d)[0], 'A long chart title')
  assert.ok(d.cells[0]!.every(c => c === null || (c.role === 'title' && c.owners[0] === 'title')))
  assert.match(text(d).slice(1).join('\n'), /^\[ A \][\s\S]*▼[\s\S]*\[ B \]/)
})

test('every shape validates; every row of every box has its caps, owned by the node, at its left and right columns', () => {
  for (const shape of Object.keys(CAPS) as Shape[]) {
    const [l, r] = CAPS[shape]
    for (const [label, wrapAt] of [['one', null], ['a<br/>b<br/>c', null], ['alpha beta gamma', 8]] as const) {
      const gr = g('TB', ['A>B'], { A: label, B: label })
      for (const n of gr.nodes) n.shape = shape
      const { p, d } = D(gr, wrapAt), at = `${shape} ${label}`
      assert.equal(validate(d), null, at)
      for (const id of ['A', 'B']) {
        const b = p.boxes.get(id)!
        for (let row = b.row; row < b.row + b.rows; row++) {
          // An empty cap leaves its column to the node's fill.
          const left = d.cells[row]![b.col], right = d.cells[row]![b.col + b.cols - 1]
          assert.deepEqual([left?.kind, left?.ch, left?.owners], [l ? 'cap' : 'fill', l ? [...l][0] : ' ', [id]], `${at} ${id}@${row} left`)
          assert.deepEqual([right?.kind, right?.ch, right?.owners], [r ? 'cap' : 'fill', r ? [...r].at(-1) : ' ', [id]], `${at} ${id}@${row} right`)
        }
      }
      const a = p.boxes.get('A')!
      if (label === 'one') assert.equal(text(d)[a.row]!.slice(a.col), `${l} one ${r}`.trimEnd(), at)
    }
  }
})

test('a CJK label is drawn in wide cells and validates, whole or wrapped between wide characters', () => {
  for (const [wrapAt, shown] of [[null, /\[ 你好世界 \]/], [4, /\[ 你好 \]\n *\[ 世界 \]/]] as const) {
    const { d } = D(g('TB', ['A>B'], { A: '你好世界' }), wrapAt)
    assert.equal(validate(d), null, `${wrapAt}`)
    assert.match(text(d).join('\n'), shown)
  }
})

test('a back edge validates, listed in its original direction, top-down and bottom-up', () => {
  for (const dir of ['TB', 'BT'] as const) {
    const { d } = D(g(dir, ['A>B', 'B>C', 'C>A']))
    assert.equal(validate(d), null, dir)
    assert.deepEqual(d.expect.edges.map(e => [e.from, e.to]), [['A', 'B'], ['B', 'C'], ['C', 'A']], dir)
  }
})

test('a dotted edge bends with light corners, dashed everywhere else, and validates', () => {
  const { d } = D(g('TB', ['A.>B', 'A.>C']))
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  assert.match(t, /┄/)
  assert.match(t, /[┌┐└┘]/)
  assert.doesNotMatch(t, /[─│━┃┏┓┗┛]/)
})

test('drawing is deterministic', () => {
  const make = () => {
    const gr = g('TB', ['A>B|yes', 'C=>D', 'D.>E'], { A: 'two<br/>lines' })
    gr.title = 'Title'
    return D(gr).d
  }
  assert.equal(validate(make()), null)
  assert.deepEqual(make(), make())
})

test('fan-in: edges into one node share one arrowhead, owned by each, and validate', () => {
  for (const specs of [['A>C', 'B>C'], ['A>B', 'B>C', 'A>C']]) {
    const { d } = D(g('TB', specs))
    assert.equal(validate(d), null, specs.join(' '))
  }
  const { d } = D(g('TB', ['A>C', 'B>C']))
  assert.deepEqual(d.cells.flat().filter(c => c?.kind === 'arrow').map(c => c!.owners), [['e0', 'e1']])
})

// The layout marks each edge it reverses, so expect lists a back edge in its source direction whatever its ends.
test('a back edge is listed in its original direction, whatever its ends: <-->, ---, -->', () => {
  for (const [tail, head] of [['arrow', 'arrow'], ['none', 'none'], ['none', 'arrow']] as const) {
    const gr = g('TB', ['A>B', 'B>C', 'C>A'])
    gr.edges[2]!.tail = tail
    gr.edges[2]!.head = head
    const { d } = D(gr)
    assert.equal(validate(d), null, `${tail} ${head}`)
    assert.deepEqual(d.expect.edges.map(e => [e.id, e.from, e.to]), [['e0', 'A', 'B'], ['e1', 'B', 'C'], ['e2', 'C', 'A']], `${tail} ${head}`)
  }
})
