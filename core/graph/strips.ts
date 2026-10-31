// Cluster strips at one level (plan A §7.5): each strip's path and span, and the spacers that hold its place on the
// ranks of
// its span where it has no item, so that ordering and packing keep outsiders out of its strip there too.
import type { Item } from './chains.ts'

// The strips around owner, outermost first. outer: each strip at this level and the strip around it, or null.
export function pathOf(outer: ReadonlyMap<string, string | null>, owner: string | null): string[] {
  const p: string[] = []
  for (let c = owner; c !== null && !p.includes(c); c = outer.get(c) ?? null) {
    p.unshift(c)
  }

  return p
}

// Each strip's first and last rank.
export function spans(items: readonly Item[], path: (o: string | null) => string[]): Map<string, [number, number]> {
  const span = new Map<string, [number, number]>()
  for (const it of items) {
    for (const c of path(it.owner)) {
      const s = span.get(c)
      span.set(c, s ? [Math.min(s[0], it.rank), Math.max(s[1], it.rank)] : [it.rank, it.rank])
    }
  }

  return span
}

// Adds a 1×1 spacer, owned by the strip and keyed as its first item, on each rank of a strip's span that holds none of
// its
// items, innermost strips first, so that an outer strip counts an inner one's spacers.
export function addSpacers(
  items: Item[],
  span: ReadonlyMap<string, readonly [number, number]>,
  path: (o: string | null) => string[],
): void {
  for (const c of [...span.keys()].sort((a, b) => path(b).length - path(a).length)) {
    const [lo, hi] = span.get(c)!
    const mine = items.filter((it) => path(it.owner).includes(c))
    const key = Math.min(...mine.map((it) => it.key))
    for (let r = lo; r <= hi; r++) {
      if (!mine.some((it) => it.rank === r)) {
        items.push({ id: `\u0003${c}#${r}`, kind: 'spacer', owner: c, key, rank: r, cross: 1, main: 1 })
      }
    }
  }
}
