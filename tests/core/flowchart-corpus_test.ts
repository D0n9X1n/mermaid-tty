import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { validate } from '../../core/validate.ts'
import { flowchartOf } from './flowchart-corpus.ts'

// Flowcharts as a coding assistant writes them draw at 80 and 120 columns, every one, each a drawing the validator
// accepts: none falls back, for routing or anything else.
test('A3: seeded assistant-style flowcharts draw at 80 and 120 columns', () => {
  const fallbacks: string[] = []
  for (let seed = 1; seed <= 150; seed++) {
    const source = flowchartOf(seed)
    for (const columns of [80, 120]) {
      const r = explain(source, { columns })
      if (isFail(r)) {
        fallbacks.push(`seed ${seed} at ${columns}, ${r.reason}:\n${source}`)
        continue
      }

      assert.equal(validate(r.drawing), null, `seed ${seed} at ${columns}`)
    }
  }

  assert.deepEqual(fallbacks, [])
})
