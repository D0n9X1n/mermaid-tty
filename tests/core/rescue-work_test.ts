import test from 'node:test'
import assert from 'node:assert/strict'
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

// A chart no step and no rescue routes at 80 columns, so both rescue passes run to their ends. Each pass, every step,
// wrap, gap and search, shares its own RESCUE_WORK expansions, and stops once they are spent; the second, with rip set,
// starts only when the first has drawn nothing.
const UNROUTED = [
  'flowchart LR',
  '  A("Parse request") -->|成功| B{{"Draw diagram"}}',
  '  A ---|Esc| C>"Any text?"]',
  '  B -->|answered| D[("Native /btw")]',
  '  B -.->|ok| E{{"Ask the model"}}',
  '  E --- F["Fallback"]',
  '  D --> G{"Timeout?"}',
  '  F --> H>"Parse request"]',
  '  A --> H',
  '  E -.->|hit| G',
  '  E -.-> B',
  '  A --> B & C',
  '  subgraph S1 ["Group"]',
  '    direction TB',
  '    C',
  '    D',
  '    E',
  '    F',
  '  end',
].join('\n')
// The rescue runs in two rounds, the left-to-right steps, then lrToTd, the fallback top to bottom; each round runs two
// passes, each on RESCUE_WORK of its own: the budget runs out, then its steps stop, and none goes below zero.
test('a chart no rescue draws spends at most RESCUE_WORK expansions on each rescue pass of each round, then stops', () => {
  const model = flowchart.parse(readSource(UNROUTED) as Source) as Graph
  const left: { step: string; before: number; after: number; rip: boolean }[] = []
  const mod = {
    ...flowchart,
    rescue: (
      m: Graph,
      step: Parameters<typeof flowchart.layout>[1],
      columns: number,
      work: { left: number; rip?: boolean },
    ) => {
      const before = work.left
      const d = flowchart.rescue!(m, step, columns, work)
      left.push({ step, before, after: work.left, rip: work.rip === true })
      return d
    },
  }

  const r = fitLadder(mod, model, 80)

  assert.ok(isFail(r), JSON.stringify(r))
  const fallback = left.findIndex((x) => x.step === 'lrToTd')
  assert.ok(fallback > 0 && left.slice(fallback).every((x) => x.step === 'lrToTd'), 'lrToTd runs after every pass')
  for (const round of [left.slice(0, fallback), left.slice(fallback)]) {
    for (const rip of [false, true]) {
      const pass = round.filter((x) => x.rip === rip)
      assert.equal(pass[0]!.before, RESCUE_WORK, `rip ${rip}`)
      assert.equal(pass.at(-1)!.after, 0, `rip ${rip}`)
      assert.ok(
        pass.slice(0, -1).every((x, k) => x.after > 0 && x.after === pass[k + 1]!.before),
        `rip ${rip}`,
      )
      assert.ok(
        pass.every((x) => x.after >= 0 && x.after <= x.before),
        `rip ${rip}`,
      )
    }

    assert.ok(round.findIndex((x) => x.rip) === round.filter((x) => !x.rip).length)
  }
})
