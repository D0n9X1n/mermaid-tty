import test from 'node:test'; import assert from 'node:assert/strict'
import { ENABLED, TIER1, TIER2, TIER2_PASSED, KEYWORDS, lookup, supportTable } from '../../core/registry.ts'
import { explain } from '../../core/render.ts'; import { TIER1_MODULES } from '../../core/diagrams/all.ts'
import { register, type DiagramModule, type DiagramType } from '../../core/registry.ts'; import { fail } from '../../core/fail.ts'
const kws = (t: string) => Object.keys(KEYWORDS).filter(k => KEYWORDS[k] === t)
test('A5.errors: ENABLED is A, Tier 1 and the passed Tier 2 types; every other Tier 2 keyword is disabled', () => {
  assert.deepEqual([...ENABLED], ['flowchart', 'sequence', ...TIER1, ...TIER2_PASSED])
  assert.deepEqual([...TIER1].sort(), ['class', 'er', 'gantt', 'gitGraph', 'journey', 'mindmap', 'pie', 'quadrant', 'state', 'timeline', 'xychart'])
  assert.deepEqual([...TIER2].sort(), ['architecture', 'block', 'c4', 'kanban', 'packet', 'radar', 'requirement', 'sankey', 'treemap', 'zenuml'])
  for (const t of TIER2.filter(t => !TIER2_PASSED.includes(t))) { for (const k of kws(t)) { assert.deepEqual(lookup(k), { reason: `disabled:${t}` }, k) } }
  assert.deepEqual(explain('radar-beta\naxis A', { columns: 80 }), { reason: 'disabled:radar' })
})
test('A5.errors: every Tier 1 keyword resolves to its registered module', () => {
  assert.equal(TIER1_MODULES.length, 11); assert.ok(TIER1_MODULES.every(m => TIER1.includes(m.type)))
  for (const m of TIER1_MODULES) { for (const k of kws(m.type)) { assert.equal(lookup(k), m, k) } }
})
test('B1: supportTable lists each ENABLED type with its header keywords', () => {
  const t = supportTable().split('\n')
  assert.deepEqual(t.slice(0, 4), ['| Type | Header keywords |', '|---|---|', '| `flowchart` | `flowchart`, `graph` |', '| `sequence` | `sequenceDiagram` |'])
  assert.ok(t.includes('| `state` | `stateDiagram`, `stateDiagram-v2` |') && t.includes('| `xychart` | `xychart-beta`, `xychart` |'))
  assert.equal(t.length, 2 + ENABLED.size)
})

// Beyond the plan's three tests: all.ts holds each Tier 1 type once, so none is left out behind a duplicate; and a Tier 1
// type whose module fails falls back through explain. The last test files a failing module, the shape T40's stub had
// (T85 deleted core/diagrams/stub.ts), in each module's place, then files the module back.
const stub = (type: DiagramType): DiagramModule => {
  const unimplemented = () => fail(`unimplemented:${type}`)
  return { type, parse: unimplemented, steps: () => [], layout: unimplemented }
}
test('A5.errors: TIER1_MODULES holds exactly one module for each Tier 1 type', () => {
  assert.deepEqual(TIER1_MODULES.map(m => m.type).sort(), [...TIER1].sort())
})
test('A5.errors: a Tier 1 type whose module is a stub falls back: explain returns unimplemented:<type> for each keyword', () => {
  for (const m of TIER1_MODULES) {
    register(stub(m.type))
    try { for (const k of kws(m.type)) { assert.deepEqual(explain(`${k}\nA`, { columns: 80 }), { reason: `unimplemented:${m.type}` }, k) } }
    finally { register(m) }
  }
})
