import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { explain } from '../../core/render.ts'; import { tangles } from '../../scripts/lib/tangle.ts'
const fresh = () => (explain(readFileSync('fixtures/flowchart/flowchart-ok-30.mmd', 'utf8'), { columns: 80, theme: 'mono' }) as any).drawing
const find = (d: any, p: (c: any) => boolean) => { for (const [r, row] of d.cells.entries()) for (const [c, x] of row.entries()) if (x && p(x)) return [r, c]; throw new Error('none') }
test('VR.tangled: a clean golden has no tangle; each rule catches its break', () => {
  assert.deepEqual(tangles(fresh()), [])
  const t = fresh(), [r, c] = find(t, x => x.kind === 'fill' && x.owners.includes('A'))
  t.cells[r][c] = { ch: '│', role: 'edge', kind: 'line', owners: ['Z>Y'], dirs: 5 }; assert.ok(tangles(t).includes('through-node'))
  const s = fresh(), [r2, c2] = find(s, x => x.kind === 'line'); s.cells[r2][c2] = { ...s.cells[r2][c2], owners: [...s.cells[r2][c2].owners, 'Z>Y'] }
  assert.ok(tangles(s).includes('shared-segment'))
  const h = fresh(); for (const row of h.cells) row.forEach((x: any, i: number) => { if (x?.kind === 'arrow') row[i] = null })
  assert.ok(tangles(h).includes('ambiguous-head'))
  const l = fresh(); l.expect = { ...l.expect, edgeLabels: l.expect.edgeLabels.map((e: any) => ({ ...e, edge: 'nope' })) }
  assert.ok(tangles(l).includes('label-detached'))
})

// A hand-built drawing: rows of glyphs, and under each a row of keys into own, the owners of that cell ('.' for none). A key
// in kinds sets its cells' kind; otherwise ─┄│┌┐└┘├┤┬┴┼ are line cells, each owner running all their dirs; ▲►▼◄ arrows;
// [ ] caps; a space a fill; any other glyph text.
const DIRS: Record<string, number> = { '─': 10, '┄': 10, '│': 5, '┌': 6, '┐': 12, '└': 3, '┘': 9, '├': 7, '┤': 13, '┬': 14, '┴': 11, '┼': 15 }
function grid(glyphs: string[], keys: string[], own: Record<string, string[]>, expect: object, kinds: Record<string, string> = {}): any {
  const cells = glyphs.map((g, r) => [...g].map((ch, c) => {
    const k = keys[r]![c]!, owners = own[k]
    if (k === '.') return null
    if (!owners) throw new Error(`no owners for key ${k} at ${r},${c}`)
    const dirs = DIRS[ch] ?? 0
    const kind = kinds[k] ?? (dirs ? 'line' : '▲►▼◄'.includes(ch) ? 'arrow' : '[]'.includes(ch) ? 'cap' : ch === ' ' ? 'fill' : 'text')
    const role = ({ line: 'edge', arrow: 'arrow', frame: 'frame', lifeline: 'note' } as Record<string, string>)[kind] ?? 'node'
    return { ch, role, kind, owners, dirs, ...(kind === 'line' ? { segs: owners.map(owner => ({ owner, dirs })) } : {}) }
  }))
  return { columns: 80, cells, conflicts: [], expect: { labels: [], edges: [], edgeLabels: [], ...expect } }
}
const named = (...ids: string[]) => ids.map(id => ({ owner: id, text: id }))
// Each head glyph is an end mark at to, as validate's Expect lists them.
const edge = (id: string, from: string, to: string, ...heads: string[]) => ({ id, from, to, ends: heads.map(glyph => ({ node: to, glyph })) })

test('VR.tangled through-node: a line across a box fires; a line ending at its own endpoint\'s cap does not', () => {
  const across = grid(['  [ B ]  ', 'A───────►C', '  [   ]  '], ['..BBBBB..', 'AeeeeeeeeC', '..BBBBB..'],
    { A: ['A'], B: ['B'], C: ['C'], e: ['e'] }, { labels: named('A', 'B', 'C'), edges: [edge('e', 'A', 'C', '►')] })
  assert.deepEqual(tangles(across), ['through-node'])
  const ends = grid(['    [ B ]', 'A──►[   ]', '    [   ]'], ['....BBBBB', 'AeeeBBBBB', '....BBBBB'],
    { A: ['A'], B: ['B'], e: ['e'] }, { labels: named('A', 'B'), edges: [edge('e', 'A', 'B', '►')] })
  assert.deepEqual(tangles(ends), [])
})

test('VR.tangled through-node: a line across a cluster\'s border, or between its top and bottom borders, passes no node', () => {
  const into = grid(['   ┌─s───┐', '[A]─►[X] │', '   └─────┘'], ['...ffSffff', 'AAAeeXXX.f', '...fffffff'],
    { A: ['A'], X: ['X'], S: ['s'], f: ['s'], e: ['e'] }, { labels: named('A', 'X', 's'), edges: [edge('e', 'A', 'X', '►')] }, { f: 'frame' })
  assert.deepEqual(tangles(into), [])
})

test('VR.tangled through-node: a sequence frame\'s divider, drawn beside its title, passes no node', () => {
  const alt = grid(['┌─alt─┐', '├┄no┄┄┤', '└─────┘'], ['ffFFFff', 'ddDDddd', 'fffffff'],
    { f: ['f0'], F: ['f0'], d: ['f0.1'], D: ['f0.1'] }, { labels: named('f0', 'f0.1') }, { f: 'frame' })
  assert.deepEqual(tangles(alt), [])
})

test('VR.tangled through-node: a message across a third participant\'s lifeline passes no node', () => {
  const lanes = grid(['[A] [B] [C]', ' │   │   │ ', ' │──────►│ ', ' │   │   │ '], ['AAA.BBB.CCC', '.a...b...c.', '.ammmmmmmc.', '.a...b...c.'],
    { A: ['A'], B: ['B'], C: ['C'], a: ['A'], b: ['B'], c: ['C'], m: ['m0'] }, { labels: named('A', 'B', 'C'), edges: [edge('m0', 'A', 'C', '►')] },
    { a: 'lifeline', b: 'lifeline', c: 'lifeline' })
  assert.deepEqual(tangles(lanes), [])
})

test('VR.tangled shared-segment: two edges bending into one ┼ fire; a perpendicular crossing, and a fan-in into one node, do not', () => {
  // H and V meet in the ┼: each bends there (A→D, C→B), or they cross straight (A→B, C→D). Both draw the same glyphs.
  const plus = (mid: string, low: string, edges: object[], runs: [number, number]) => {
    const d = grid(['  C   ', '  │   ', 'A─┼─►B', '  │   ', '  ▼   ', '  D   '], ['..C...', '..v...', mid, low, low, '..D...'],
      { A: ['A'], B: ['B'], C: ['C'], D: ['D'], h: ['H'], v: ['V'], X: ['H', 'V'] }, { labels: named('A', 'B', 'C', 'D'), edges })
    d.cells[2][2].segs = [{ owner: 'H', dirs: runs[0] }, { owner: 'V', dirs: runs[1] }]
    return d
  }
  assert.deepEqual(tangles(plus('AhXvvB', '..h...', [edge('H', 'A', 'D', '▼'), edge('V', 'C', 'B', '►')], [12, 3])), ['shared-segment'])
  assert.deepEqual(tangles(plus('AhXhhB', '..v...', [edge('H', 'A', 'B', '►'), edge('V', 'C', 'D', '▼')], [10, 5])), [])
  const fanIn = grid(['A─┬─►B', '  │   ', '  C   '], ['AhJJJB', '..v...', '..C...'], { A: ['A'], B: ['B'], C: ['C'], h: ['H'], v: ['V'], J: ['H', 'V'] },
    { labels: named('A', 'B', 'C'), edges: [edge('H', 'A', 'B', '►'), edge('V', 'C', 'B', '►')] })
  assert.deepEqual(tangles(fanIn), [])
})

test('VR.tangled ambiguous-head: a head just past a junction fires; a self-message\'s corner ◄┘ does not', () => {
  const merge = grid(['A─┬►B', '  │  ', '  C  '], ['AhJJB', '..v..', '..C..'], { A: ['A'], B: ['B'], C: ['C'], h: ['H'], v: ['V'], J: ['H', 'V'] },
    { labels: named('A', 'B', 'C'), edges: [edge('H', 'A', 'B', '►'), edge('V', 'C', 'B', '►')] })
  assert.deepEqual(tangles(merge), ['ambiguous-head'])
  const self = grid(['[A] ', ' │─┐', ' │◄┘', ' │  '], ['AAA.', '.amm', '.amm', '.a..'], { A: ['A'], a: ['A'], m: ['m0'] },
    { labels: named('A'), edges: [edge('m0', 'A', 'A', '◄')] }, { a: 'lifeline' })
  assert.deepEqual(tangles(self), [])
})

test('VR.tangled label-detached: a label 2 cells from its edge fires; one diagonally beside it, 1 cell by Chebyshev, does not', () => {
  const own = { A: ['A'], B: ['B'], e: ['e'], L: ['e:label', 'e'] }
  const expect = { labels: [...named('A', 'B'), { owner: 'e:label', text: 'yes' }], edges: [edge('e', 'A', 'B', '►')], edgeLabels: [{ owner: 'e:label', edge: 'e' }] }
  assert.deepEqual(tangles(grid(['yes  ', '     ', 'A──►B'], ['LLL..', '.....', 'AeeeB'], own, expect)), ['label-detached'])
  assert.deepEqual(tangles(grid(['yes    ', '  A──►B'], ['LLL....', '..AeeeB'], own, expect)), [])
})
