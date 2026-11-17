import test from 'node:test'
import assert from 'node:assert/strict'
import { bandTops, borders } from '../../core/graph/main-axis.ts'

for (const nested of [false, true]) {
  test(`exterior clearance leaves two cells before ${nested ? 'nested' : 'single'} starting strip borders`, () => {
    const spans = new Map<string, readonly [number, number]>([['Outer', [1, 1]]])
    if (nested) {
      spans.set('Inner', [1, 1])
    }

    const depth = (id: string) => (id === 'Outer' ? 1 : 2)
    const b = borders(spans, depth, [4], 2, new Set([1]))
    const { tops } = bandTops([1, 1], [4], b.before, b.after)
    const firstBorder = tops[1]! - b.up('Outer')

    assert.equal(firstBorder - (tops[0]! + 1), 2)
    assert.equal(tops[1]! - (tops[1]! - b.up(nested ? 'Inner' : 'Outer')), 5)
  })
}

test('a gap without a bypassing fan-out keeps its original border placement', () => {
  const b = borders(new Map([['S', [1, 1] as const]]), () => 1, [4], 2)
  const { tops } = bandTops([1, 1], [4], b.before, b.after)

  assert.equal(tops[1]! - b.up('S'), tops[0]! + 1)
})
