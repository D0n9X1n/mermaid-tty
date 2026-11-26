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
// passes, each on RESCUE_WORK of its own, and lrToTd tries two orders of its spacings on it, each from the budget it
// started with. So a pass of the first round spends at most RESCUE_WORK expansions and one of the second at most twice
// that: a chart no rescue draws stops after 300,000. Every expansion counts, those before a refill too.
test('a chart no rescue draws spends at most RESCUE_WORK per order on each rescue pass, 300,000 in all', () => {
  const model = flowchart.parse(readSource(UNROUTED) as Source) as Graph
  const calls: { step: string; spent: number; refills: number; rip: boolean }[] = []
  const mod = {
    ...flowchart,
    rescue: (
      m: Graph,
      step: Parameters<typeof flowchart.layout>[1],
      columns: number,
      work: { left: number; rip?: boolean },
    ) => {
      const call = { step, spent: 0, refills: 0, rip: work.rip === true }
      const counted = new Proxy(work, {
        set(target, key, value) {
          if (key === 'left') {
            if (value < target.left) {
              call.spent += target.left - value
            } else if (value > target.left) {
              call.refills++
            }
          }

          return Reflect.set(target, key, value)
        },
      })
      const d = flowchart.rescue!(m, step, columns, counted)
      calls.push(call)
      assert.ok(work.left >= 0, `${step} left ${work.left}`)
      return d
    },
  }

  const r = fitLadder(mod, model, 80)

  assert.ok(isFail(r), JSON.stringify(r))
  const fallback = calls.findIndex((x) => x.step === 'lrToTd')
  assert.ok(fallback > 0 && calls.slice(fallback).every((x) => x.step === 'lrToTd'), 'lrToTd runs after every pass')
  const total = calls.reduce((n, x) => n + x.spent, 0)
  for (const [round, cap] of [
    [calls.slice(0, fallback), RESCUE_WORK],
    [calls.slice(fallback), 2 * RESCUE_WORK],
  ] as const) {
    for (const rip of [false, true]) {
      const pass = round.filter((x) => x.rip === rip)
      const spent = pass.reduce((n, x) => n + x.spent, 0)
      assert.ok(spent > 0 && spent <= cap, `rip ${rip}: spent ${spent} of ${cap}`)
    }

    assert.ok(round.findIndex((x) => x.rip) === round.filter((x) => !x.rip).length)
  }

  assert.deepEqual(
    calls.filter((x) => x.step === 'lrToTd').map((x) => x.refills),
    [1, 1],
    'lrToTd refills its budget once per pass, for its second order',
  )
  assert.ok(total <= 6 * RESCUE_WORK, `spent ${total}`)
})
