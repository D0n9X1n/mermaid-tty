import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { gate } from '../../scripts/corpus-gate.ts'
const C = readdirSync('fixtures/corpus').map(f => readFileSync(`fixtures/corpus/${f}`, 'utf8'))
const share = (re: RegExp) => C.filter(s => re.test(s)).length / C.length
test("A10: at least 90 synthetic blocks with the owner's feature mix", () => {
  assert.ok(C.length >= 90); assert.ok(share(/^(---[\s\S]*?---\n)?(flowchart|graph)\b/) >= 0.92); assert.ok(share(/^sequenceDiagram/m) >= 0.08)
  for (const [re, min] of [[/[[({]"/, 0.76], [/-->\|| -- /, 0.47], [/\p{Script=Han}/u, 0.47], [/<br\/?>/, 0.33], [/^---\n/, 0.07], [/^\s*subgraph /m, 0.1]] as const)
    assert.ok(share(re) >= min, String(re))
  assert.ok(C.filter(s => /^sequenceDiagram/m.test(s) && /^\s*title /m.test(s)).length >= 3)
})
test('A10: every block renders and validates at 80 and 120 columns',
  () => assert.deepEqual(gate('fixtures/corpus').failed, []))
