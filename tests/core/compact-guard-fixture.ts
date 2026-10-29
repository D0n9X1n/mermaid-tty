// Test fixture, not a test file: compact_test.ts runs `node --experimental-test-module-mocks FILE MODE`. A module mock
// breaks every drawing the flowchart module makes, the way MODE says, where compaction alone would hide the break; the
// fixture then draws through the module and prints, as JSON, the verdict on its natural step and what explain makes of it.
// route: each route loses its middle cell (repro A). frame: a frame-side cell goes, in the second row of a run of
// pass-through rows if there is one, else in any pass-through row (repro B).
import { mock } from 'node:test'
import type { Cell, Drawing } from '../../core/canvas.ts'

const at = (p: string) => new URL(p, import.meta.url).href
const ROUTE = at('../../core/graph/route.ts'), CANVAS = at('../../core/canvas.ts')
// Whether a row only carries │: each cell empty, or a line or frame cell with dirs 5.
const plain = (row: readonly (Cell | null)[]) => row.every(x => x === null || ((x.kind === 'line' || x.kind === 'frame') && x.dirs === 5))
function breakFrame(d: Drawing): Drawing {
  const pass = d.cells.map(plain), side = (r: number) => d.cells[r]!.findIndex(x => x?.kind === 'frame')
  const rows = [...pass.keys()].filter(r => pass[r] && side(r) >= 0), r = rows.find(r => pass[r - 1]) ?? rows[0]
  if (r !== undefined) d.cells[r]![side(r)] = null
  return d
}

const mode = process.argv[2]
if (mode === 'route') {
  const real = await import(ROUTE)
  const routeGraph = (...a: unknown[]) => {
    const rs = real.routeGraph(...a)
    return Array.isArray(rs) ? rs.map(r => ({ ...r, cells: r.cells.filter((_: unknown, i: number) => i !== r.cells.length >> 1) })) : rs
  }
  mock.module(ROUTE, { namedExports: { ...real, routeGraph } })
} else if (mode === 'frame') {
  const real = await import(CANVAS)
  const createCanvas = (...a: unknown[]) => {
    const cv = real.createCanvas(...a)
    return { ...cv, toDrawing: (e: unknown) => breakFrame(cv.toDrawing(e)) }
  }
  mock.module(CANVAS, { namedExports: { ...real, createCanvas } })
} else throw new Error(`mode: route or frame, not ${mode}`)

const { explain } = await import(at('../../core/render.ts'))
const { flowchart } = await import(at('../../core/diagrams/flowchart/layout.ts'))
const { readSource } = await import(at('../../core/source.ts'))
const { validate } = await import(at('../../core/validate.ts'))
const src = mode === 'route' ? 'flowchart LR\nA --> B' : 'flowchart TB\nsubgraph S\nA --> B\nend'
const d = flowchart.layout(flowchart.parse(readSource(src)), 'natural', 80), r = explain(src, { columns: 80 })
console.log(JSON.stringify({ natural: 'reason' in d ? d.reason : validate(d)?.reason ?? 'valid', explain: 'reason' in r ? 'rejected' : r.step }))
