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

// gitGraph's row marks (expect.rows): each commit's cap, and each branch's start, a cap or its fork's corner.
const marks = (d: Drawing): Set<string> => new Set((d.expect.rows ?? []).map(x => x.mark))
const isLine = (x: Cell | null): boolean => x?.kind === 'line'

// The commit a fork's corner at (r, c) starts from: along its side arm to the tee on the parent's lane, then back up that
// lane, against the corner's forward arm, to the first cap's mark. None if the corner has no such arms or no cap is there.
function fork(d: Drawing, r: number, c: number): string[] {
  const x = cellAt(d, r, c)!, side = x.dirs & 10, dr = x.dirs & 4 ? -1 : x.dirs & 1 ? 1 : 0, dc = side === 8 ? -1 : 1
  if (side === 0 || side === 10 || dr === 0) return []
  let cc = c, rr = r + dr
  while (isLine(cellAt(d, r, cc)) && (cellAt(d, r, cc)!.dirs & side) !== 0) cc += dc
  while (isLine(cellAt(d, rr, cc))) rr += dr
  const cap = cellAt(d, rr, cc)
  return cap?.kind === 'cap' ? cap.owners.filter(o => marks(d).has(o)) : []
}

// The commits drawn in row y: each cap's mark, and each fork corner's start resolved to the commit it starts from.
const rowMarks = (d: Drawing, y: number): string[] => (d.cells[y] ?? []).flatMap((x, c) =>
  (x ? x.owners.filter(o => marks(d).has(o)).flatMap(o => (x.kind === 'line' ? fork(d, y, c) : [o])) : []))

// The commits lane run o through (r, c) connects: up and down its column while the cells are o's, to the cap that ends it
// or, where it stops open (a lane's tail, or its start at a fork corner), to the row it stops in.
function laneEnds(d: Drawing, r: number, c: number, o: string): string[] {
  return [-1, 1].flatMap(dr => {
    let y = r
    while (cellAt(d, y, c)?.kind !== 'cap' && ownedBy(cellAt(d, y + dr, c), o)) y += dr
    return rowMarks(d, y)
  })
}

// The endpoints of owner id of line cell (r, c): an edge's from and to, a gitGraph lane run's commits, a fork corner's
// start's commit; none for any other owner.
function ends(d: Drawing, id: string, r: number, c: number): string[] {
  const e = d.expect.edges.find(x => x.id === id)
  if (e) return [e.from, e.to]
  return id.startsWith('lane:') ? laneEnds(d, r, c, id) : marks(d).has(id) ? fork(d, r, c) : []
}

// The dirs owner o runs in line cell x, by its segs; 0 when x has no seg for o.
const run = (x: Cell, o: string): number => x.segs?.find(s => s.owner === o)?.dirs ?? 0

// Whether a and b only cross in x: a ┼ (dirs 15) where, by segs, one runs up-down (5) and the other left-right (10).
const crossing = (x: Cell, a: string, b: string): boolean =>
  x.dirs === 15 && [run(x, a), run(x, b)].sort((p, q) => p - q).join() === '5,10'

// shared-segment: a line cell drawn for two edges that share no endpoint, unless they only cross there.
function sharedSegment(d: Drawing, all: readonly Drawn[]): boolean {
  return all.some(({ r, c, x }) => x.kind === 'line' && x.owners.some((a, i) => x.owners.slice(i + 1).some(b =>
    !ends(d, a, r, c).some(n => ends(d, b, r, c).includes(n)) && !crossing(x, a, b))))
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
