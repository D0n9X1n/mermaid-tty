import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { fx, spanOf } from './c-lib.ts'
test('A7: with sections, disableMulticolor changes nothing: each section keeps its own color, as in Mermaid', async () => {
  const { renderMermaid } = await import('../../core/render.ts')
const  body = 'timeline\nsection Alpha\n2001 : x\nsection Beta\n2002 : y'
  const on = renderMermaid(body, { columns: 80, theme: 'nord' })!
const  colorOf = (s: string) => on.flat().find(x => x.text.includes(s))?.color
  assert.deepEqual(renderMermaid(`---\nconfig:\n  timeline:\n    disableMulticolor: true\n---\n${body}`, { columns: 80, theme: 'nord' }), on)
  assert.ok(colorOf('Alpha') && colorOf('Alpha') !== colorOf('Beta'))
})
test('A7: without sections each period takes the next series color; disableMulticolor keeps them all on s1', () => {
  const n = THEMES.nord
const  ink = (id: string, y: string) => spanOf(renderMermaid(fx(id), { columns: 120, theme: 'nord' })!, new RegExp(`^ ?${y} ?$`))?.color
  assert.deepEqual([ink('timeline-ok-01', '2002'), ink('timeline-ok-01', '2004')], [n.series.s1, n.series.s2])
  assert.deepEqual([ink('timeline-ok-08', '2002'), ink('timeline-ok-08', '2004')], [n.series.s1, n.series.s1])
})
