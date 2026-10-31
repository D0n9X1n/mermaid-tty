// An empty accTitle: or accDescr: (only spaces after the colon) in Mermaid 12.2.0: the lexer's value rule skips the
// line break, so the value is the next line, which then draws nothing. Verified under JSDOM per type: flowchart, class,
// er, gantt, journey, quadrant, state, timeline and xychart swallow it; pie and gitGraph (Langium) keep it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'

const T: Record<string, [string, string, string]> = {
  flowchart: ['flowchart TD', 'A-->B', 'C-->D'],
  class: ['classDiagram', 'class A', 'class B'],
  er: ['erDiagram', 'A ||--o{ B : x', 'C ||--o{ D : y'],
  gantt: ['gantt\ndateFormat YYYY-MM-DD', 'section S', 'T :2024-01-01, 1d'],
  journey: ['journey', 'section S', 't: 3: me'],
  quadrant: ['quadrantChart', 'Point A: [0.3, 0.6]', 'Point B: [0.5, 0.5]'],
  state: ['stateDiagram-v2', 'A --> B', 'C --> D'],
  timeline: ['timeline', 'section S', '2020 : a'],
  xychart: ['xychart-beta', 'x-axis [a, b]', 'bar [1, 2]'],
}
const drawn = (src: string) => !('reason' in explain(src, { columns: 80 }))
const src = (t: string, acc: string) => {
  const [h, a, b] = T[t]!
  return `${h}\n${acc}\n${a}\n${b}`
}

test('A5.errors: an empty accTitle: or accDescr: falls back where Mermaid reads the next line as its text', () => {
  for (const t of Object.keys(T)) {
    assert.ok(drawn(src(t, 'accTitle: x')), `${t}: control draws`)
    for (const acc of ['accTitle:', 'accDescr:', 'accTitle :  ', '  accDescr:\t']) {
      assert.ok(!drawn(src(t, acc)), `${t}: ${JSON.stringify(acc)}`)
    }
  }
})
test('A1: pie and gitGraph keep the line after an empty acc statement, as Mermaid does, so they still draw', () => {
  assert.ok(drawn('pie\naccTitle:\n"a" : 1\n"b" : 2'))
  assert.ok(drawn('gitGraph\naccDescr:\ncommit\ncommit'))
})
