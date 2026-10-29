import test from 'node:test'; import assert from 'node:assert/strict'
import { createRenderer, explain, renderMermaid } from '../../core/render.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'; import { register } from '../../core/registry.ts'
import type { DiagramModule } from '../../core/registry.ts'

const O = { columns: 80 }
// 10000 empty accDescr {} blocks on one line, then A: each block closes on the line, which then reads on.
const REPRO = 'flowchart TD\n' + 'accDescr {} '.repeat(10000) + 'A'

test('A5.errors: a line of 10000 accDescr {} blocks neither throws nor fails internal-error: it reads as A alone', () => {
  assert.deepEqual(explain(REPRO, O), explain('flowchart TD\nA', O))
  assert.deepEqual(renderMermaid(REPRO, O), renderMermaid('flowchart TD\nA', O))
})
// A module that throws stands in for any bug below explain. This file runs in its own process, so its registrations
// reach no other test file; finally restores the flowchart module for the rest of this one.
test('A5.errors: a module that throws in parse or layout gives internal-error from explain and render, and null from renderMermaid', () => {
  const boom = () => { throw new RangeError('boom') }
  try {
    for (const bad of [{ ...flowchart, parse: boom }, { ...flowchart, layout: boom }]) {
      register(bad as DiagramModule)
      assert.deepEqual(explain('flowchart TD\nA', O), { reason: 'internal-error' })
      assert.equal(renderMermaid('flowchart TD\nA', O), null)
      assert.deepEqual(createRenderer().render('flowchart TD\nA', O), { reason: 'internal-error' })
    }
  } finally { register(flowchart as DiagramModule) }
})
