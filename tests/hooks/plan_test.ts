import test from 'node:test'
import assert from 'node:assert/strict'
import { safePlan } from '../../hooks/plan.ts'

// Fail closed at the hook: an error in the plugin's own work gives null, and the hook then sends the
// reply through next(e) unchanged. The debug log is best-effort: a failing log never stops a drawing.
const FC = '```mermaid\nflowchart TD\nP[一] --> Q[二]\n```\n', BAD = '```mermaid\nflowchart TD\nA[👩‍👧]\n```\n'
const ev = (text: string) => ({ surface: 'terminal', props: { text, isFirstOfReply: true }, viewport: { columns: 80, rows: 40 } })
const ui = { log: () => {}, resolve: () => ({ Box: 'Box', Text: 'Text' }) }, diagram = async () => 'diagram' as const
const boom = () => { throw new Error('down') }

test('A5.errors: a throwing mode read, UI resolve or renderer callback gives null, so the reply goes through untouched', async () => {
  assert.equal(await safePlan({ ui }, ev(`a\n${FC}b`), 'default', async () => boom()), null)
  assert.equal(await safePlan({ ui: { ...ui, resolve: boom } }, ev(`a\n${FC}b`), 'default', diagram), null)
})
test('A5.errors: a throwing or rejecting debug log still draws the diagram; the failed fence joins the prose', async () => {
  for (const log of [boom, async () => boom()]) {
    const p = await safePlan({ ui: { ...ui, log } }, ev(`a\n${BAD}m\n${FC}b`), 'default', diagram)
    assert.deepEqual(p?.parts.map(x => 'prose' in x ? x.prose : 'rows'), [`a\n${BAD}m\n`, 'rows', 'b'])
  }
})
