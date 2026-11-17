import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { isFail } from '../../core/fail.ts'
import { validate } from '../../core/validate.ts'

const source = (dir: string) => `flowchart ${dir}
  subgraph S["Collector end shard front end"]
    X[shard login region Collector]
  end
  B --> X
  A --> B
  B --> C
  A --> C`

for (const dir of ['TB', 'BT', 'LR', 'RL']) {
  test(`a ${dir} fan-out reaches inside and outside a subgraph without crossing an unrelated frame`, () => {
    for (const columns of [80, 120, 200]) {
      const r = explain(source(dir), { columns })

      assert.ok(!isFail(r), `${dir} at ${columns}: ${JSON.stringify(r)}`)
      assert.equal(validate(r.drawing), null)
    }
  })
}

for (const dir of ['TB', 'BT', 'LR', 'RL']) {
  for (const edge of ['-->', '-.->', '==>']) {
    test(`a nested ${dir} subgraph leaves room for ${edge} fan-out outside its inner frame`, () => {
      const src = `flowchart ${dir}
        subgraph Outer["Outer region"]
          subgraph S["Collector end shard front end"]
            X[shard login region Collector]
          end
          A ${edge} B
          B ${edge} X
          B ${edge} C
          A ${edge} C
        end`

      const r = explain(src, { columns: 200 })

      assert.ok(!isFail(r), JSON.stringify(r))
      assert.equal(validate(r.drawing), null)
    })
  }
}

for (const dir of ['TB', 'BT', 'LR', 'RL']) {
  for (const labels of [
    ['go in', ''],
    ['', 'go out'],
    ['go in', 'go out'],
  ]) {
    test(`a ${dir} fan-out with labels ${labels.join('/')} still has exterior routing space`, () => {
      const inside = labels[0] ? `-->|${labels[0]}|` : '-->'
      const outside = labels[1] ? `-->|${labels[1]}|` : '-->'
      const src = source(dir).replace('B --> X', `B ${inside} X`).replace('B --> C', `B ${outside} C`)

      const result = explain(src, { columns: 200 })

      assert.ok(!isFail(result), JSON.stringify(result))
      assert.equal(validate(result.drawing), null)
    })
  }
}
