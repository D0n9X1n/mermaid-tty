// A level's items and segments (plan A §7.1–3): its units on their longest-path ranks, a label node on the middle rank of a
// labelled edge, and a dummy on every other rank an edge spans. A back edge is reversed, its ends swapped.
import type { GEdge } from './model.ts'
import { backLinks, longestPath } from './ranks.ts'
import type { Link } from './ranks.ts'

export type Kind = 'node' | 'block' | 'label' | 'dummy' | 'spacer'
export type Extent = { cross: number; main: number } // across the ranks and along them
// owner: the innermost strip cluster that holds the item, or null. key: its place in source order.
export type Unit = Extent & { id: string; kind: Kind; owner: string | null; key: number }
export type Item = Unit & { rank: number }
export type Seg = { edge: string; upper: string; lower: string } // a piece of an edge between adjacent ranks, upper above
export type Level = { items: Item[]; segs: Seg[]; edges: GEdge[] }

// labels: each labelled edge's label extent; common: the innermost strip cluster that holds both of two owners.
export function buildLevel(
  units: readonly Unit[],
  edges: readonly GEdge[],
  labels: ReadonlyMap<string, Extent>,
  common: (a: string | null, b: string | null) => string | null,
): Level {
  // A labelled edge, or one with an end label, spans at least two ranks: the room its label, or each end's, takes.
  const long = (e: GEdge) => e.label !== null || e.tailLabel !== undefined || e.headLabel !== undefined
  const links = edges
    .filter((e) => e.from !== e.to)
    .map((e): Link => ({ id: e.id, from: e.from, to: e.to, minlen: Math.max(e.minlen, long(e) ? 2 : 1) }))
  const ids = units.map((u) => u.id)
  const back = backLinks(ids, links)
  const rank = longestPath(
    ids,
    links.map((l) => (back.has(l.id) ? { ...l, from: l.to, to: l.from } : l)),
  )
  const owner = new Map(units.map((u) => [u.id, u.owner]))
  const items: Item[] = units.map((u) => ({ ...u, rank: rank.get(u.id)! }))
  const segs: Seg[] = []
  const K = 1 + Math.max(-1, ...units.map((u) => u.key))
  // A back edge is reversed with its ends, and each end's label, swapped; a missing label stays missing.
  const swap = ({ tailLabel, headLabel, ...e }: GEdge): GEdge => ({
    ...e,
    from: e.to,
    to: e.from,
    tail: e.head,
    head: e.tail,
    reversed: true,
    ...(headLabel === undefined ? {} : { tailLabel: headLabel }),
    ...(tailLabel === undefined ? {} : { headLabel: tailLabel }),
  })
  const out = edges.map((e) => (back.has(e.id) ? swap(e) : e))
  for (const e of out) {
    const lo = rank.get(e.from)!
    const span = e.from === e.to ? (e.label === null ? 0 : 1) : rank.get(e.to)! - lo
    const mid = e.label === null ? -1 : e.from === e.to ? 1 : Math.floor(span / 2)
    const own = common(owner.get(e.from) ?? null, owner.get(e.to) ?? null)
    let prev = e.from
    for (let k = 1; k < span || k === mid; k++) {
      const id = k === mid ? `${e.id}:label` : `${e.id}#${k}`
      const ext = k === mid ? labels.get(e.id)! : { cross: 1, main: 1 }
      items.push({ id, kind: k === mid ? 'label' : 'dummy', rank: lo + k, ...ext, owner: own, key: K + e.order })
      segs.push({ edge: e.id, upper: prev, lower: id })
      prev = id
    }
    if (e.from !== e.to) {
      segs.push({ edge: e.id, upper: prev, lower: e.to })
    }
  }
  return { items, segs, edges: out }
}
