import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isFail } from '../../core/fail.ts'
import { fitLadder, RESCUE_WORK } from '../../core/fit.ts'
import { findPath } from '../../core/graph/find-path.ts'
import type { Graph } from '../../core/graph/model.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'
import { readSource, type Source } from '../../core/source.ts'

// A 20 by 20 grid whose end cell is walled off, so the search expands until something stops it.
const search = (budget: { left: number }, work?: { left: number }) =>
  findPath(
    { at: { r: 0, c: 0 }, face: 1, group: 'a' },
    { at: { r: 19, c: 19 }, face: 1, group: 'b' },
    (c) => c.r === 19 && c.c === 19,
    () => true,
    20,
    20,
    budget,
    work,
  )

test('a path search charges each expansion to the shared work, and stops when it is spent', () => {
  const budget = { left: 1000 }
  const work = { left: 10 }

  const path = search(budget, work)

  assert.equal(path, null)
  assert.equal(work.left, 0)
  assert.ok(budget.left >= 1000 - 11, `${budget.left}`)
})

test('a path search with no work left expands nothing', () => {
  const budget = { left: 1000 }

  const path = search(budget, { left: 0 })

  assert.equal(path, null)
  assert.equal(budget.left, 1000)
})

// No rescue draws this chart at 80 columns: unbounded, its rescue searched about twice what its normal ladder did. The
// whole rescue pass, every step, wrap, gap and search, shares RESCUE_WORK expansions, and stops once they are spent.
test('a chart no rescue draws spends at most RESCUE_WORK expansions in the whole rescue pass, then stops', () => {
  const src = readFileSync(new URL('../../fixtures/flowchart/flowchart-reject-06.mmd', import.meta.url), 'utf8')
  const model = flowchart.parse(readSource(src) as Source) as Graph
  const left: number[][] = []
  const mod = {
    ...flowchart,
    rescue: (m: Graph, step: Parameters<typeof flowchart.layout>[1], columns: number, work: { left: number }) => {
      const before = work.left
      const d = flowchart.rescue!(m, step, columns, work)
      left.push([before, work.left])
      return d
    },
  }

  const r = fitLadder(mod, model, 80)

  assert.ok(isFail(r), JSON.stringify(r))
  assert.equal(left[0]![0], RESCUE_WORK)
  assert.equal(left.at(-1)![1], 0)
  assert.ok(left.slice(0, -1).every(([, after]) => after > 0))
  assert.ok(left.every(([before, after]) => after >= 0 && after <= before))
})
