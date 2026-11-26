import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { validate } from '../../core/validate.ts'
import { flowchartOf } from './flowchart-corpus.ts'

// Flowcharts as a coding assistant writes them draw at 80 and 120 columns: none falls back because no route was found.
// A chart may still be too wide for a width; that is a fallback of its own, never a routing one.
test('A3: seeded assistant-style flowcharts route at 80 and 120 columns', () => {
  const unrouted: string[] = []
  for (let seed = 1; seed <= 150; seed++) {
    const source = flowchartOf(seed)
    for (const columns of [80, 120]) {
      const r = explain(source, { columns })
      if (isFail(r)) {
        if (r.reason === 'route-conflict') {
          unrouted.push(`seed ${seed} at ${columns}:\n${source}`)
        }

        continue
      }

      assert.equal(validate(r.drawing), null, `seed ${seed} at ${columns}`)
    }
  }

  assert.deepEqual(unrouted, [])
})
