// scripts/lib/tangle.ts — the independent tangle check (VR.tangled): a second reviewer over each golden. It looks for a
// drawing that passes core/validate.ts but would confuse a reader. It reads only the drawing's cells and expect, and shares
// no logic with the validator, so one bug cannot hide in both.
import type { Cell, Drawing } from '../../core/canvas.ts'

export type Rule = 'through-node' | 'shared-segment' | 'ambiguous-head' | 'label-detached'
type Drawn = { r: number; c: number; x: Cell }

const cellAt = (d: Drawing, r: number, c: number): Cell | null => d.cells[r]?.[c] ?? null
const ownedBy = (x: Cell | null, id: string): boolean => x?.owners.includes(id) ?? false

// The nodes: label owners that are neither an edge label nor a frame. A frame owns a frame cell, or a line cell drawn for
// no edge: a sequence frame's divider.
function nodes(d: Drawing, all: readonly Drawn[]): string[] {
  const edges = new Set(d.expect.edges.map(e => e.id))
  const frames = new Set(all.flatMap(({ x }) => (x.kind === 'frame' ? x.owners : x.kind === 'line' ? x.owners.filter(o => !edges.has(o)) : [])))
  return d.expect.labels.map(l => l.owner).filter(o => !o.endsWith(':label') && !frames.has(o))
}

// The two axes as [dr, dc]: a cell's opposite neighbours are at -step and +step.
const AXES: readonly (readonly [number, number])[] = [[0, 1], [1, 0]]

// Whether x is part of node n: owned by n and not its lifeline, a background that messages cross by design, as a frame's is.
const ofNode = (x: Cell | null, n: string): boolean => x?.kind !== 'lifeline' && ownedBy(x, n)

// through-node: a line or arrow cell between two cells of one node, left and right or up and down.
function throughNode(d: Drawing, all: readonly Drawn[]): boolean {
  const ns = nodes(d, all)
  return all.some(({ r, c, x }) => (x.kind === 'line' || x.kind === 'arrow') && AXES.some(([dr, dc]) =>
    ns.some(n => ofNode(cellAt(d, r - dr, c - dc), n) && ofNode(cellAt(d, r + dr, c + dc), n))))
}

// The endpoints of edge id, or none when expect lists no such edge.
function ends(d: Drawing, id: string): string[] {
  const e = d.expect.edges.find(x => x.id === id)
  return e ? [e.from, e.to] : []
}

// The dirs owner o runs in line cell x, by its segs; 0 when x has no seg for o.
const run = (x: Cell, o: string): number => x.segs?.find(s => s.owner === o)?.dirs ?? 0

// Whether a and b only cross in x: a ┼ (dirs 15) where, by segs, one runs up-down (5) and the other left-right (10).
const crossing = (x: Cell, a: string, b: string): boolean =>
  x.dirs === 15 && [run(x, a), run(x, b)].sort((p, q) => p - q).join() === '5,10'

// shared-segment: a line cell drawn for two edges that share no endpoint, unless they only cross there.
function sharedSegment(d: Drawing, all: readonly Drawn[]): boolean {
  return all.some(({ x }) => x.kind === 'line' && x.owners.some((a, i) => x.owners.slice(i + 1).some(b =>
    !ends(d, a).some(n => ends(d, b).includes(n)) && !crossing(x, a, b))))
}

// The step from a head to the cell behind it, opposite where it points. Other heads (o x )) point nowhere.
const BEHIND: Readonly<Record<string, readonly [number, number]>> = { '▲': [1, 0], '►': [0, -1], '▼': [-1, 0], '◄': [0, 1] }
// How many sides x's dirs reach.
const branches = (x: Cell | null): number => [1, 2, 4, 8].filter(b => ((x?.dirs ?? 0) & b) !== 0).length

// ambiguous-head: an edge with end marks but no arrow cell of its own, or a head just past a junction (3 or more branches),
// so a reader cannot tell which line it ends. A corner behind it, as in a self-message's ◄┘, is fine.
function ambiguousHead(d: Drawing, all: readonly Drawn[]): boolean {
  const headless = d.expect.edges.some(e => e.ends.length > 0 && !all.some(({ x }) => x.kind === 'arrow' && ownedBy(x, e.id)))
  return headless || all.some(({ r, c, x }) => {
    const back = x.kind === 'arrow' ? BEHIND[x.ch] : undefined
    return back !== undefined && branches(cellAt(d, r + back[0], c + back[1])) >= 3
  })
}

// Whether a line or arrow cell of edge id is within 1 cell of (r, c), diagonals included (Chebyshev distance 1).
const touches = (d: Drawing, r: number, c: number, id: string): boolean => [-1, 0, 1].some(dr => [-1, 0, 1].some(dc => {
  const x = cellAt(d, r + dr, c + dc)
  return (x?.kind === 'line' || x?.kind === 'arrow') && ownedBy(x, id)
}))

// label-detached: an edge label with no cell within 1 cell of a line or arrow cell of its own edge.
function labelDetached(d: Drawing, all: readonly Drawn[]): boolean {
  return d.expect.edgeLabels.some(l => !all.some(({ r, c, x }) => ownedBy(x, l.owner) && touches(d, r, c, l.edge)))
}

const RULES: readonly [Rule, (d: Drawing, all: readonly Drawn[]) => boolean][] =
  [['through-node', throughNode], ['shared-segment', sharedSegment], ['ambiguous-head', ambiguousHead], ['label-detached', labelDetached]]

// The rule codes d breaks, each once, in rule order.
export function tangles(d: Drawing): Rule[] {
  const all: Drawn[] = d.cells.flatMap((row, r) => row.flatMap((x, c) => (x ? [{ r, c, x }] : [])))
  return RULES.filter(([, broken]) => broken(d, all)).map(([rule]) => rule)
}
