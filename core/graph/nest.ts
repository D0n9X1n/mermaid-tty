// One rank's order (plan A §7.4): its items sorted by val, then by source order, each strip's items kept together as a
// block at their mean val, its first key breaking ties. Blocks of strips that are also on the fixed rank keep their order
// there (fixed: each strip's first index on it), so that two strips never swap from one rank to the next.
import type { Item } from './chains.ts'

type Block = { c: string | null; items: Item[]; v: number; key: number }

export function nest(items: readonly Item[], val: ReadonlyMap<string, number>, path: (o: string | null) => string[],
  fixed: ReadonlyMap<string, number>, d = 0): Item[] {
  const blocks: Block[] = []
  for (const it of items) {
    const c = path(it.owner)[d] ?? null, b = c === null ? undefined : blocks.find(x => x.c === c)
    if (b) b.items.push(it)
    else blocks.push({ c, items: [it], v: 0, key: 0 })
  }
  for (const b of blocks) {
    b.v = b.items.reduce((a, it) => a + val.get(it.id)!, 0) / b.items.length
    b.key = Math.min(...b.items.map(it => it.key))
  }
  blocks.sort((a, b) => a.v - b.v || a.key - b.key)
  const slots = blocks.flatMap((b, i) => (b.c !== null && fixed.has(b.c) ? [i] : []))
  const kept = slots.map(i => blocks[i]!).sort((a, b) => fixed.get(a.c!)! - fixed.get(b.c!)!)
  slots.forEach((i, j) => { blocks[i] = kept[j]! })
  return blocks.flatMap(b => (b.c === null ? b.items : nest(b.items, val, path, fixed, d + 1)))
}
