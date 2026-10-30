// The gitGraph module (plan C T80; matrix, gitGraph): one row per event, time running down (BT: up, glyphs flipped);
// branches are lanes 2 cells apart, sorted by order; a fork ├─╮ or ╭─┤ from the parent's lane, a merge ◉─┤ or ├─◉ from
// the merged lane, ┼ where a connector crosses a lane; one label column right of the lanes. Commits are caps; every link
// drawn with cells is an edge the validator traces, expect.order pins the rest, and expect.glyphs each commit's type.
// Ladder: natural, then wrapped labels.
// It registers itself on import.
import { createCanvas, type Drawing } from '../../canvas.ts'
import { heading, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap, type Piece } from '../../text.ts'
import type { Ink, SeriesKey } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { width } from '../../width.ts'
import { parseGitGraph, type GitEvent, type GitGraph } from './parse.ts'

const STEPS: readonly Step[] = ['natural', 'wrap']
const GLYPH = { NORMAL: '●', REVERSE: '⊗', HIGHLIGHT: '■' } as const

// A drawn label: its owner, its text as expect lists it, and its ink.
type Item = { owner: string; text: string; ink: Ink }
// One placed piece of a label row: its column within the label column, its text, and its join to the owner's last piece.
type Put = Item & { at: number; join?: Piece['join'] }

// e's labels, e the i-th event drawn in ink: a start's branch name; a commit's `id: msg` (whichever exists), a merge's id;
// then each tag as [t]. Blank text is drawn nowhere, so it is not listed.
function items(e: GitEvent, i: number, ink: Ink): Item[] {
  if (e.kind === 'start') return [{ owner: `b:${e.branch}`, text: e.branch, ink }]
  const head = e.kind === 'commit' ? [e.id, e.msg].filter(x => x !== null).join(': ') : e.kind === 'merge' ? e.id : null
  const out: Item[] = head !== null && head.trim() !== '' ? [{ owner: `e${i}`, text: head, ink: 'label' }] : []
  e.tags.forEach((t, j) => out.push({ owner: `e${i}.t${j}`, text: `[${t}]`, ink: 'note' }))
  return out
}

// its packed into rows at most max wide: each label's first piece follows the last one after a space when it fits, and
// each later piece starts a row. At least one row. null if a word is wider than max.
function pack(its: readonly Item[], max: number): Put[][] | null {
  const rows: Put[][] = [[]]
  let col = 0
  for (const it of its) {
    const ps = wrap(it.text, max)
    if (!ps) return null
    ps.forEach((p, j) => {
      if (p.text === '') return
      const w = width(p.text)
      if (col > 0 && (j > 0 || col + 1 + w > max)) { rows.push([]); col = 0 }
      const at = col === 0 ? 0 : col + 1
      rows.at(-1)!.push({ ...it, at, text: p.text, ...(j > 0 ? { join: p.join } : {}) })
      col = at + w
    })
  }
  return rows
}

const series = (k: number): SeriesKey => `s${k % 8 + 1}` as SeriesKey
const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8
const ROUND: Readonly<Record<string, string>> = { '┐': '╮', '┌': '╭', '┘': '╯', '└': '╰' }

// What replay finds, by event index: each node's first parent, each merge's merged head, and each branch's fork point.
type Links = { parent: Map<number, number | null>; merged: Map<number, number>; fork: Map<string, number | null> }

// Replays g's events through each branch's head. A fork point or merged head is drawn off its lane's latest node, so
// every branch whose head lies on that lane (a merge's own branch aside) must hold that node, and a merge's head must
// lie off its own lane; else 'link-ambiguous', as the drawing could join the wrong commits.
function replay(g: GitGraph): Links | Fail {
  const heads = new Map<string, number | null>(), latest = new Map<string, number>(), laneOf = new Map<number, string>()
  const L: Links = { parent: new Map(), merged: new Map(), fork: new Map() }
  const agreed = (f: string, skip?: string): number | undefined => {
    const on = [...heads].filter(([b, h]) => b !== skip && h !== null && laneOf.get(h) === f).map(([, h]) => h)
    const top = latest.get(f)
    return on.length > 0 && on.every(h => h === top) ? top : undefined
  }
  for (const [i, e] of g.events.entries()) {
    if (e.kind === 'start') {
      const f = e.from === undefined ? null : agreed(e.from)
      if (f === undefined) return fail('link-ambiguous')
      heads.set(e.branch, f); L.fork.set(e.branch, f)
      continue
    }
    L.parent.set(i, heads.get(e.branch) ?? null)
    if (e.kind === 'merge') {
      const h = e.from === e.branch ? undefined : agreed(e.from!, e.branch)
      if (h === undefined) return fail('link-ambiguous')
      L.merged.set(i, h)
    }
    heads.set(e.branch, i); latest.set(e.branch, i); laneOf.set(i, e.branch)
  }
  return L
}

// The graph, labels packed at max. Lanes are stably sorted by order, 2 cells apart; lane k in creation order takes
// s<k mod 8 + 1>. Each event takes a block of rows, its glyph row first, in display order (BT reversed). A lane runs from
// its start row to the end row, the last event's glyph row, drawing only the arms that are there. Nodes c<i> are caps.
// Each link with a cell between its nodes is an edge: r<i> from node i's first parent, m<i> from a merge's merged head.
// The order lists keep each lane's nodes, and all nodes, in time order, so adjacent nodes, which no cell joins, cannot
// swap. 'too-wide' if a word is wider than max.
function draw(g: GitGraph, L: Links, max: number, columns: number): Drawing | Fail {
  const lanes = [...g.branches].sort((a, b) => a.order - b.order).map(b => b.name)
  const col = new Map(lanes.map((b, i) => [b, 2 * i])), ink = new Map(g.branches.map((b, k) => [b.name, series(k)]))
  const n = g.events.length, bt = g.dir === 'BT', pos = (i: number): number => (bt ? n - 1 - i : i)
  const blocks: Put[][][] = [], labels: Expect['labels'][number][] = [], marks: { mark: string; owners: string[] }[] = []
  for (const [i, e] of g.events.entries()) {
    const its = items(e, i, ink.get(e.branch)!), rows = pack(its, max)
    if (!rows) return fail('too-wide')
    blocks[pos(i)] = rows
    labels.push(...its.map(({ owner, text }) => ({ owner, text })))
    marks[pos(i)] = { mark: e.kind === 'start' ? `s${i}` : `c${i}`, owners: its.map(q => q.owner) }
  }
  const top: number[] = []
  let h = 0
  for (const b of blocks) { top.push(h); h += b.length }
  const rowOf = (i: number): number => top[pos(i)]!, end = rowOf(n - 1), back = bt ? DOWN : UP, fwd = bt ? UP : DOWN
  const lane = (i: number): string => g.events[i]!.branch
  const start = new Map(g.events.flatMap((e, i) => (e.kind === 'start' ? [[e.branch, rowOf(i)] as const] : [])))
  const nodes = new Map(g.branches.map(b => [b.name, [] as number[]]))
  g.events.forEach((e, i) => { if (e.kind !== 'start') nodes.get(e.branch)!.push(i) })
  // The owner of lane b's line at row y: the edge into b's next node, or lane:<b> when no edge leads there.
  const owner = (b: string, y: number): string => {
    const nx = nodes.get(b)!.find(i => (bt ? rowOf(i) < y : rowOf(i) > y))
    return nx === undefined || L.parent.get(nx) === null ? `lane:${b}` : `r${nx}`
  }
  // Each connector's row and the columns strictly between its ends, which it crosses.
  const spans = g.events.flatMap((e, i) => {
    const f = e.kind === 'start' ? L.fork.get(e.branch) : L.merged.get(i)
    if (f === null || f === undefined) return []
    const a = col.get(lane(f))!, c = col.get(e.branch)!
    return [{ y: rowOf(i), lo: Math.min(a, c), hi: Math.max(a, c) }]
  })
  // The row lane b's line ends on: the end row, or, while a connector crosses b there and no node of b sits there, the
  // row before, so a crossed lane with nothing after it never meets the connector in a ┴ that reads as a join.
  const last = new Map(lanes.map(b => {
    const c = col.get(b)!, s = start.get(b)!, at = new Set(nodes.get(b)!.map(rowOf))
    let y = end
    while (y !== s && !at.has(y) && spans.some(p => p.y === y && p.lo < c && c < p.hi)) y += bt ? 1 : -1
    return [b, y] as const
  }))
  const x = 2 * lanes.length, wide = Math.max(x - 1, ...blocks.flat(2).map(q => x + q.at + width(q.text)))
  const cv = createCanvas(h, wide, columns, () => true), corners: [number, number, number][] = []
  // A connector on row y owned by o, in ink k: a tee arm at lane f, ─ between, and at lane b, for a fork (fork: its start
  // event), a corner turning forward (unless b's line ends on its start row); lane f's line from row y0, its link's other
  // node, is o's too.
  const connect = (y: number, f: string, b: string, k: Ink, o: string, y0: number, fork: number | null): void => {
    const cf = col.get(f)!, cb = col.get(b)!, d = cb > cf ? 2 : -2
    cv.line(y, cf, d > 0 ? RIGHT : LEFT, 'light', k, o)
    for (let c = cf + d / 2; c !== cb; c += d / 2) cv.line(y, c, LEFT | RIGHT, 'light', k, o)
    if (fork !== null) {
      const on = last.get(b) === y && y !== end ? 0 : fwd
      cv.line(y, cb, (d > 0 ? LEFT : RIGHT) | on, 'light', k, o); corners.push([y, cb, fork])
    }
    for (let r = Math.min(y0, y) + 1; r < Math.max(y0, y); r++) cv.line(r, cf, UP | DOWN, 'light', ink.get(f)!, o)
  }
  for (const [i, e] of g.events.entries()) {
    const f = e.kind === 'start' ? L.fork.get(e.branch) : null, first = nodes.get(e.branch)![0]
    if (f !== null && f !== undefined) {
      connect(rowOf(i), lane(f), e.branch, ink.get(e.branch)!, first === undefined ? `lane:${e.branch}` : `r${first}`, rowOf(f), i)
    }
    const hd = L.merged.get(i)
    if (hd !== undefined) connect(rowOf(i), lane(hd), e.branch, ink.get(lane(hd))!, `m${i}`, rowOf(hd), null)
  }
  for (const b of lanes) {
    const at = new Set(nodes.get(b)!.map(rowOf)), s = start.get(b)!, e = last.get(b)!
    for (let y = Math.min(s, e); y <= Math.max(s, e); y++) {
      if (y === s || at.has(y)) continue
      // A lane's stretch with no link (after its last node, or before an unforked first one) is no edge but lane:<b>, which
      // a crossing cell records beside the connector's edge, so the validator checks every arm its glyph shows.
      cv.line(y, col.get(b)!, y === e ? back : UP | DOWN, 'light', ink.get(b)!, owner(b, y))
    }
  }
  const glyphs: { owner: string; ch: string }[] = [], caps: [number, string][] = []
  for (const [i, e] of g.events.entries()) {
    const k = ink.get(e.branch)!, c = col.get(e.branch)!, r = rowOf(i)
    const mark = e.kind === 'start' ? (L.fork.get(e.branch) === null ? (bt ? '╵' : '╷') : null) : e.kind === 'pick' ? '◎' : e.type === null ? '◉' : GLYPH[e.type]
    const id = e.kind === 'start' ? `s${i}` : `c${i}`
    if (mark !== null) { cv.cap(r, c, mark, k, id); glyphs.push({ owner: id, ch: mark }); caps.push([i, id]) }
    blocks[pos(i)]!.forEach((ps, j) => ps.forEach(q => cv.text(r + j, x + q.at, q.text, q.ink, q.owner, q.join)))
  }
  const all = g.events.flatMap((e, i) => (e.kind === 'start' ? [] : [i])), ids = (is: number[]) => (bt ? [...is].reverse() : is).map(i => `c${i}`)
  const edges = all.flatMap(i => {
    const p = L.parent.get(i)!, hd = L.merged.get(i)
    const run = p !== null && (lane(p) !== lane(i) || Math.abs(rowOf(i) - rowOf(p)) > 1) ? [{ id: `r${i}`, from: `c${p}`, to: `c${i}`, ends: [] }] : []
    return hd === undefined ? run : [...run, { id: `m${i}`, from: `c${hd}`, to: `c${i}`, ends: [] }]
  })
  const order = [...g.branches.map(b => ({ ids: ids(nodes.get(b.name)!), column: true })).filter(o => o.ids.length > 0), { ids: ids(all), column: false }]
  const d = cv.toDrawing({ labels, edges, edgeLabels: [], frames: [], order, glyphs, rows: marks })
  // A fork's corner is its start's mark too, so its branch name binds to its row.
  for (const [r, c, i] of corners) { const cell = d.cells[r]![c]!; d.cells[r]![c] = { ...cell, ch: ROUND[cell.ch] ?? cell.ch, owners: [...cell.owners, `s${i}`] } }
  // A node or opening cap is its lane's too, so a lane:<b> arm that ends at it is joined.
  for (const [i, id] of caps) { const r = rowOf(i), c = col.get(lane(i))!; d.cells[r]![c] = { ...d.cells[r]![c]!, owners: [id, `lane:${lane(i)}`] } }
  return d
}

// natural draws labels unwrapped; wrap wraps them to the columns right of the lanes. 'too-wide' if the lanes leave no
// label column. The title heads the body (common rule 3).
function layout(g: GitGraph, step: Step, columns: number): Drawing | Fail {
  if (!STEPS.includes(step)) return fail('step')
  const max = step === 'natural' ? Infinity : columns - 2 * g.branches.length
  if (max < 1) return fail('too-wide')
  const links = replay(g)
  if (isFail(links)) return links
  const body = draw(g, links, max, columns)
  if (isFail(body) || g.title === null) return body
  const head = heading(g.title, 'title', 'title', columns)
  return isFail(head) ? head : stack([head, body], columns)
}

export const gitGraph: DiagramModule<GitGraph> = { type: 'gitGraph', parse: parseGitGraph, steps: () => STEPS, layout }

register(gitGraph as DiagramModule)
