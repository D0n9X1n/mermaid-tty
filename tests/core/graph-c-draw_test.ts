import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'
import { routeGraph, type Route } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { validate } from '../../core/validate.ts'
import { falsePairs, g, text } from './graph-fixture.ts'
import type { NodeRow } from '../../core/graph/model.ts'
const D = (gr: ReturnType<typeof g>) => {
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  return drawGraph(p, routeGraph(p) as Route[], 80)
}
test('A3: marks draw one glyph and no label; class ends and cardinality draw at their ends', () => {
  const gr = g('TB', ['S>A', 'A>B', 'A>C', 'B>E']) // nodes S A B C E; edges e0…e3
  Object.assign(gr.nodes[0]!, { mark: 'start', rows: [] })
  Object.assign(gr.nodes[4]!, { mark: 'end', rows: [] })
  Object.assign(gr.edges[1]!, { tail: 'triangle', head: 'none' })
  Object.assign(gr.edges[2]!, { tail: 'diamond', head: 'none', headLabel: '0..*' })
  const d = D(gr)
  const t = text(d).join('\n')
  assert.equal(validate(d), null)
  assert.deepEqual(
    [...t].filter((c) => '●◉'.includes(c)),
    ['●', '◉'],
  )
  assert.match(t, /△/)
  assert.match(t, /◆/)
  assert.match(t, /0\.\.\*/)
  assert.deepEqual(
    [d.expect.edges[1]!.ends, d.expect.edges[2]!.ends],
    [[{ node: 'A', glyph: '△' }], [{ node: 'A', glyph: '◆' }]],
  ) // A's per-end marks
  assert.deepEqual(d.expect.edges[2]!.endLabels, [{ node: 'C', owner: 'e2:head' }])
})
test('A3: member columns align; a column cell is owned by its own id, then the node; every drawn column and fixed row is listed', () => {
  const gr = g('TB', ['C>D'])
  const cols = (k: number, type: string, name: string, note: string) =>
    [
      { text: type, role: 'label', id: `C.a${k}.type`, width: 6 },
      { text: name, role: 'label', id: `C.a${k}.name`, width: 5 },
      { text: note, role: 'note', id: `C.a${k}.note`, width: 2 },
    ] as NodeRow['cols']
  gr.nodes[0]!.rows = [
    { text: 'CAR', role: 'node', align: 'center' },
    { text: 'string id pk', role: 'label', align: 'left', fixed: true, cols: cols(0, 'string', 'id', 'pk') },
    { text: 'int seats', role: 'label', align: 'left', fixed: true, cols: cols(1, 'int', 'seats', '') },
  ]
  gr.nodes[1]!.rows = [
    { text: '«service»', role: 'node', align: 'center', id: 'D.annot' },
    { text: 'D', role: 'node', align: 'center' },
    ...['+run()', '+eat()'].map(
      (text, k) => ({ text, role: 'label', align: 'left', fixed: true, id: `D.m${k}` }) as NodeRow,
    ),
  ]
  const d = D(gr)
  const t = text(d)
  assert.equal(validate(d), null)
  const r1 = t.find((l) => l.includes('string id'))!
  const r2 = t.find((l) => l.includes('int    seats'))!
  assert.equal(r1.indexOf(' id'), r2.indexOf(' seats'))
  assert.ok(
    d.cells
      .flat()
      .some((c) => c?.kind === 'text' && c.ch === 's' && c.owners[0] === 'C.a1.name' && c.owners.includes('C')),
  )
  // Each fixed row or column is placed, from its pill's top-left: a column at its offset, the widths before it and a gap cell each.
  const C = ([k, r, c]: [string, number, number]) => ({ id: `C.${k}`, parent: 'C', place: { r, c } })
  assert.deepEqual(d.expect.members, [
    ...(
      [
        ['a0.type', 1, 2],
        ['a0.name', 1, 9],
        ['a0.note', 1, 15],
        ['a1.type', 2, 2],
        ['a1.name', 2, 9],
      ] as const
    ).map(C),
    { id: 'D.annot', parent: 'D' },
    { id: 'D.m0', parent: 'D', place: { r: 2, c: 2 } },
    { id: 'D.m1', parent: 'D', place: { r: 3, c: 2 } },
  ]) // a1's blank note draws no cell, so it is not listed; every row with an id is, «annot» included, unplaced as it is centered
})
test('A4: an end label gets room beside its end, and a reversed edge lists its true ends', () => {
  const one = g('TB', ['A>B'])
  Object.assign(one.edges[0]!, { head: 'none', headLabel: '0..*' })
  const d = D(one)
  assert.equal(d.conflicts.length, 0)
  assert.equal(validate(d), null)
  assert.match(text(d).join('\n'), /0\.\.\*/)
  for (const dir of ['TB', 'BT', 'LR', 'RL'] as const) {
    // a back edge can leave A on row 0 or column 0; its label must still fit
    const cyc = g(dir, ['A>B', 'B>A'])
    Object.assign(cyc.edges[1]!, { tail: 'diamond', head: 'none', headLabel: '0..*' })
    const c = D(cyc)
    assert.equal(c.conflicts.length, 0, dir)
    assert.equal(validate(c), null, dir)
    assert.deepEqual(
      [c.expect.edges[1]!.ends, c.expect.edges[1]!.endLabels],
      [[{ node: 'B', glyph: '◆' }], [{ node: 'A', owner: 'e1:head' }]],
      dir,
    )
  }
})
// Each mark node's cap cells, as glyphs then their roles, by owner.
const capsOf = (d: ReturnType<typeof D>, id: string) => {
  const cs = d.cells.flat().filter((c) => c?.kind === 'cap' && c.owners.join() === id)
  return `${cs.map((c) => c!.ch).join('')} ${[...new Set(cs.map((c) => c!.role))].join()}`
}
test('A3: a mark is its glyph alone, a cap its node owns in its role, with no label; a bar runs across the flow', () => {
  for (const dir of ['TB', 'LR'] as const) {
    const gr = g(dir, ['S>A', 'A>C', 'C>E'])
    for (const [i, mark] of (['start', 'choice', 'bar', 'end'] as const).entries()) {
      Object.assign(gr.nodes[i]!, { mark, ...(mark === 'bar' ? { span: 3 } : {}) })
    }
    const d = D(gr)
    assert.equal(validate(d), null, dir)
    assert.deepEqual(d.expect.labels, [], dir)
    assert.deepEqual(
      ['S', 'A', 'C', 'E'].map((id) => capsOf(d, id)),
      ['● node', '◇ decision', `${dir === 'TB' ? '━━━' : '┃┃┃'} node`, '◉ node'],
      dir,
    )
  }
})
test('A3: a fixed row starts a pad cell and its indent inside its cap, left-aligned, its fill in its own role; its continuation joins as given', () => {
  const gr = g('TB', ['D>E'])
  gr.nodes[0]!.rows = [
    { text: 'D', role: 'node', align: 'center' },
    { text: '+run()', role: 'label', align: 'left', fixed: true, id: 'D.m0' },
    { text: 'more', role: 'label', align: 'left', fixed: true, id: 'D.m0', indent: 1, join: ' ' },
  ]
  const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const d = drawGraph(p, routeGraph(p) as Route[], 80, (x) => x)
  const b = p.boxes.get('D')!
  const row = (r: number) => d.cells[b.row + r]!.slice(b.col, b.col + b.cols)
  assert.equal(validate(d), null)
  assert.deepEqual(
    [0, 1, 2].map((r) =>
      row(r)
        .map((c) => c?.ch ?? ' ')
        .join(''),
    ),
    ['[   D    ]', '[ +run() ]', '[  more  ]'],
  )
  assert.deepEqual(
    [0, 1, 2].map((r) => [
      ...new Set(
        row(r)
          .filter((c) => c?.kind === 'fill')
          .map((c) => c!.role),
      ),
    ]),
    [['node'], ['label'], ['label']],
  )
  assert.deepEqual(
    [row(2).find((c) => c?.kind === 'text')!.join, d.expect.labels.find((l) => l.owner === 'D.m0')],
    [' ', { owner: 'D.m0', text: '+run() more' }],
  )
})
// Each edge's drawn ends, as glyph@node.
const endsOf = (d: ReturnType<typeof D>) =>
  d.expect.edges.map((e) => e.ends.map((x) => `${x.glyph}@${x.node}`).join(' '))
test('A3: a triangle points into the node it touches, at either end and in any direction; ◆ ◇ o x on any side', () => {
  const tri = { TB: '△@A ▽@B', BT: '▽@A △@B', LR: '◁@A ▷@B', RL: '▷@A ◁@B' } as const
  for (const dir of ['TB', 'BT', 'LR', 'RL'] as const) {
    const gr = g(dir, ['A>B', 'C>D', 'E>F'])
    for (const [i, [tail, head]] of [
      ['triangle', 'triangle'],
      ['diamond', 'odiamond'],
      ['circle', 'cross'],
    ].entries()) {
      Object.assign(gr.edges[i]!, { tail, head })
    }
    const d = D(gr)
    assert.equal(validate(d), null, dir)
    assert.deepEqual(endsOf(d), [tri[dir], '◆@C ◇@D', 'o@E x@F'], dir)
    const cyc = g(dir, ['A>B', 'B>A'])
    Object.assign(cyc.edges[1]!, { tail: 'triangle', head: 'none' }) // drawn reversed, on the outside lane
    const c = D(cyc)
    assert.equal(validate(c), null, `${dir} cycle`)
    assert.match(endsOf(c)[1]!, /^[△▷▽◁]@B$/, `${dir} cycle`)
  }
})
test('A3: a tail moved to a side face, off a frame border, still points into its node', () => {
  const gr = g('TB', ['D>E', 'B>E'])
  Object.assign(gr.edges[1]!, { tail: 'triangle', minlen: 3 })
  gr.clusters = [{ id: 'S2', nodes: ['B'], title: null, dir: null, clusters: [] }]
  const d = D(gr)
  assert.equal(validate(d), null)
  assert.match(endsOf(d)[1]!, /^[△▷▽◁]@B ▼@E$/)
})
test('A4: an end-labelled edge spans two ranks; a reversed edge swaps its end labels with its ends', () => {
  const L = (gr: ReturnType<typeof g>) => layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  for (const k of ['tailLabel', 'headLabel'] as const) {
    const one = g('TB', ['A>B'])
    Object.assign(one.edges[0]!, { [k]: '1' })
    assert.ok(L(one).boxes.has('e0#1'), k)
  }
  const cyc = g('TB', ['A>B', 'B>A'])
  Object.assign(cyc.edges[1]!, { tail: 'diamond', head: 'none', tailLabel: '1', headLabel: '0..*' })
  const e = L(cyc).graph.edges[1]!
  assert.deepEqual([e.reversed, e.tail, e.head, e.tailLabel, e.headLabel], [true, 'none', 'diamond', '0..*', '1'])
  assert.ok(!('tailLabel' in L(g('TB', ['A>B', 'B>A'])).graph.edges[1]!)) // nothing to swap adds no label
})
test('A4: an end label sits right of a vertical run, above a horizontal one, at its own end, in its role, named and listed by its true end', () => {
  for (const dir of ['TB', 'BT', 'LR', 'RL'] as const) {
    const gr = g(dir, ['A>B'])
    Object.assign(gr.edges[0]!, { tail: 'diamond', tailLabel: '1', headLabel: '0..*', endRole: 'note' })
    const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const d = drawGraph(p, routeGraph(p) as Route[], 80, (x) => x)
    assert.equal(validate(d), null, dir)
    const e = d.expect.edges[0]!
    const vertical = dir === 'TB' || dir === 'BT'
    assert.deepEqual(
      e.endLabels,
      [
        { node: 'A', owner: 'e0:tail' },
        { node: 'B', owner: 'e0:head' },
      ],
      dir,
    )
    assert.deepEqual(
      d.expect.edgeLabels,
      [
        { owner: 'e0:tail', edge: 'e0' },
        { owner: 'e0:head', edge: 'e0' },
      ],
      dir,
    )
    assert.deepEqual(
      d.expect.labels.filter((l) => l.owner.startsWith('e0:')),
      [
        { owner: 'e0:tail', text: '1' },
        { owner: 'e0:head', text: '0..*' },
      ],
      dir,
    )
    for (const owner of ['e0:tail', 'e0:head']) {
      const mine = d.cells.flatMap((row, r) => row.flatMap((x, c) => (x?.owners[0] === owner ? [{ r, c, x }] : [])))
      assert.deepEqual(
        [...new Set(mine.map((m) => `${m.x.kind} ${m.x.role} ${m.x.owners.join()}`))],
        [`text note ${owner},e0`],
        dir,
      )
      const by = (r: number, c: number) => (d.cells[r]?.[c]?.owners.includes('e0') ? d.cells[r]![c]!.dirs : -1)
      if (vertical) {
        assert.equal(by(mine[0]!.r, mine[0]!.c - 1), 5, `${dir} ${owner}`)
      } // right of a │
      else {
        assert.ok(
          mine.some((m) => [0, 10].includes(by(m.r + 1, m.c))),
          `${dir} ${owner}`,
        )
      } // above the ─ run or its mark
    }
  }
})
// Whether any line or arrow cell of d is drawn for both a and b.
const shared = (d: ReturnType<typeof D>, a: string, b: string) =>
  d.cells.flat().some((c) => c !== null && c.owners.includes(a) && c.owners.includes(b))
// Two labelled ends on one face of a TB node get adjacent ports, so one label meets the other's stem: that drawing fails
// closed, a Conflict or end-label, and the ladder moves on. Across, each label lies in its own run's channel, and passes.
test('A4: an end with a label gets its own port, never a shared stem, at a fan-out or a fan-in', () => {
  for (const [specs, k] of [
    [['A>B', 'A>C'], 'tailLabel'],
    [['A>C', 'B>C'], 'headLabel'],
  ] as const) {
    for (const dir of ['TB', 'LR'] as const) {
      const gr = g(dir, [...specs])
      Object.assign(gr.edges[0]!, { [k]: '1' })
      Object.assign(gr.edges[1]!, { [k]: '0..*' })
      const d = D(gr)
      assert.ok(!shared(d, 'e0', 'e1'), `${k} ${dir}`)
      if (dir === 'LR') {
        assert.equal(validate(d), null, `${k} ${dir}`)
      } else {
        assert.ok(['overwrite', 'label-missing', 'end-label'].includes(validate(d)?.reason ?? ''), `${k} ${dir}`)
      }
    }
  }
})
test('A4: V4 reads a C end as a mark at its node: a ◆ fan-out draws separate lines, and joined they fail merge-ambiguous', () => {
  for (const tail of ['none', 'triangle', 'diamond', 'odiamond', 'circle', 'cross'] as const) {
    const gr = g('TB', ['A>B', 'A>C'])
    Object.assign(gr.edges[0]!, { tail })
    const d = D(gr)
    assert.equal(validate(d), null, tail)
    assert.deepEqual(falsePairs(d), [], tail)
    if (tail !== 'none') {
      assert.ok(!shared(d, 'e0', 'e1'), tail)
    }
    const cell = d.cells.flat().find((c) => c?.kind === 'line' && c.owners.join() === 'e1')! // join e0 onto one of e1's line cells
    Object.assign(cell, { owners: ['e1', 'e0'], segs: [...cell.segs!, { owner: 'e0', dirs: cell.dirs }] })
    assert.deepEqual(validate(d), tail === 'none' ? null : { reason: 'merge-ambiguous' }, tail) // a plain fan-out may join; a mark at A may not
  }
})
test("A4: a compacted drawing keeps every end label beside its end, apart from the other end's", () => {
  for (const dir of ['TB', 'BT', 'LR', 'RL'] as const) {
    const gr = g(dir, ['A>B', 'B>C'])
    for (const e of gr.edges) {
      Object.assign(e, { tail: 'diamond', tailLabel: '1', headLabel: '0..*' })
    }
    const p = layoutGraph(gr, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const rs = routeGraph(p) as Route[]
    const full = drawGraph(p, rs, 80, (x) => x)
    const d = drawGraph(p, rs, 80)
    assert.equal(validate(d), null, dir)
    assert.ok(d.cells.length * d.cells[0]!.length < full.cells.length * full.cells[0]!.length, `${dir} compacts`)
    assert.deepEqual(
      d.expect.edges.map((e) => e.endLabels),
      full.expect.edges.map((e) => e.endLabels),
      dir,
    )
    assert.doesNotMatch(text(d).join('\n'), /10\.\.\*|\*1/, dir) // the two cardinalities never read as one
  }
})
// [ A ] then e0 along row 0 to ► and [ B ], its channel n cells: '1' runs right from the second cell, '0..*' left to the
// cell before ►.
function channel(n: number) {
  const gr = g('LR', ['A>B'])
  Object.assign(gr.edges[0]!, { tailLabel: '1', headLabel: '0..*' })
  const boxes = new Map([
    ['A', { row: 0, col: 0, rows: 1, cols: 5 }],
    ['B', { row: 0, col: 6 + n, rows: 1, cols: 5 }],
  ])
  const route: Route = {
    edge: 'e0',
    style: 'solid',
    ends: [{ r: 0, c: 5 + n, ch: '►' }],
    cells: Array.from({ length: n }, (_, i) => ({ r: 0, c: 5 + i, dirs: 10 })),
  }
  return drawGraph({ graph: gr, boxes, frames: new Map(), rows: 1, cols: 11 + n }, [route], 80, (x) => x)
}
test('A4: two end labels that meet end to end are a Conflict; a cell apart they pass', () => {
  assert.ok(channel(5).conflicts.length > 0)
  assert.deepEqual(validate(channel(6)), { reason: 'overwrite' })
  const d = channel(7)
  assert.deepEqual([d.conflicts.length, validate(d)], [0, null])
  assert.equal(text(d)[0], '      1 0..*')
})
test('A3: a keyed column draws its key in its place, owned by [col id, node]: a member, but no label', () => {
  const gr = g('TB', ['C>D'])
  const cols = [
    { text: 'string', role: 'label', id: 'C.a0.type', width: 6 },
    { text: 'id', role: 'label', id: 'C.a0.name', width: 5 },
    { text: 'a long comment', role: 'note', id: 'C.a0.note', width: 1, key: 'k' },
  ] as NodeRow['cols']
  gr.nodes[0]!.rows = [
    { text: 'CAR', role: 'node', align: 'center' },
    { text: 'string id k', role: 'label', align: 'left', fixed: true, cols },
  ]
  const d = D(gr)
  const t = text(d).join('\n')
  assert.deepEqual(validate(d), { reason: 'key-stray' })
  assert.match(t, /string id    k/)
  assert.doesNotMatch(t, /comment/)
  assert.ok(!d.expect.labels.some((l) => l.owner === 'C.a0.note'))
  assert.ok(d.cells.flat().some((c) => c?.kind === 'key' && c.ch === 'k' && c.owners.join() === 'C.a0.note,C'))
  assert.deepEqual(
    d.expect.members,
    (
      [
        ['type', 2],
        ['name', 9],
        ['note', 15],
      ] as const
    ).map(([k, c]) => ({ id: `C.a0.${k}`, parent: 'C', place: { r: 1, c } })),
  )
})
