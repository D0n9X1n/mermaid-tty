import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { isFail } from '../../core/fail.ts'
import { validate } from '../../core/validate.ts'

for (const dir of ['TB', 'BT', 'LR', 'RL']) {
  for (const style of ['-->', '-.->']) {
    test(`two ${dir} loop-backs with ${style} ends can enter the same node`, () => {
      const src = `flowchart ${dir}
        A --> B
        B --> C
        C --> D
        D ${style} A
        C ${style} A`

      const result = explain(src, { columns: 120 })

      assert.ok(!isFail(result), JSON.stringify(result))
      assert.equal(validate(result.drawing), null)
    })
  }
}

for (const dir of ['TB', 'BT', 'LR', 'RL']) {
  test(`three ${dir} loop-backs preserve every original arrow direction`, () => {
    const src = `flowchart ${dir}
      A --> B
      B --> C
      C --> D
      D --> E
      E --> A
      D --> A
      C --> A`

    const result = explain(src, { columns: 160 })

    assert.ok(!isFail(result), JSON.stringify(result))
    assert.equal(validate(result.drawing), null)
    assert.equal(result.drawing.expect.edges.length, 7)
  })
}

for (const dir of ['TB', 'BT', 'LR', 'RL']) {
  test(`labelled ${dir} loop-backs preserve their edge labels`, () => {
    const src = `flowchart ${dir}
      A --> B
      B --> C
      C --> D
      D -->|retry| A
      C -->|restart| A`

    const result = explain(src, { columns: 160 })

    assert.ok(!isFail(result), JSON.stringify(result))
    assert.equal(validate(result.drawing), null)
    assert.deepEqual(
      result.drawing.expect.labels
        .filter((label) => label.owner.endsWith(':label'))
        .map((label) => label.text)
        .sort(),
      ['restart', 'retry'],
    )
  })
}
