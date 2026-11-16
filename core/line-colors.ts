// core/line-colors.ts — a color of its own for each edge that crosses another, so a reader can follow a line past a
// ┼ from its source to its target. Presentation only: it reads a validated drawing and changes no cell, role or glyph.
import type { Drawing } from './canvas.ts'

const VERTICAL = 5 // up | down
const HORIZONTAL = 10 // left | right

// The edges each edge crosses. A crossing is a line cell every owner of which draws straight through it, some up and
// down, some across: a ┼ where lines pass, never a junction where edges that share an end merge, whose owners turn or
// stop there. Note links are not edges a reader follows from source to target, so only drawn edges count.
function crossings(d: Drawing): Map<string, Set<string>> {
  const edges = new Set(d.expect.edges.filter((e) => !e.id.endsWith(':link')).map((e) => e.id))
  const crosses = new Map<string, Set<string>>()
  const meet = (a: string, b: string) => {
    if (a !== b && edges.has(a) && edges.has(b)) {
      crosses.set(a, (crosses.get(a) ?? new Set()).add(b))
      crosses.set(b, (crosses.get(b) ?? new Set()).add(a))
    }
  }
  for (const row of d.cells) {
    for (const cell of row) {
      const segs = cell?.kind === 'line' ? (cell.segs ?? []) : []
      if (!segs.length || !segs.every((s) => s.dirs === VERTICAL || s.dirs === HORIZONTAL)) {
        continue
      }

      for (const v of segs.filter((s) => s.dirs === VERTICAL)) {
        for (const h of segs.filter((s) => s.dirs === HORIZONTAL)) {
          meet(v.owner, h.owner)
        }
      }
    }
  }

  return crosses
}

// The edges each edge shares a line or arrow cell with: a trunk or an arrowhead two edges draw as one. A line can be
// followed by its color only where its color differs from those it runs into, so these must differ too.
function neighbours(d: Drawing, ids: ReadonlySet<string>): Map<string, Set<string>> {
  const near = new Map<string, Set<string>>()
  for (const row of d.cells) {
    for (const cell of row) {
      if (!cell || (cell.kind !== 'line' && cell.kind !== 'arrow')) {
        continue
      }

      const own = [...new Set(cell.owners)].filter((o) => ids.has(o))
      for (const a of own) {
        for (const b of own) {
          if (a !== b) {
            near.set(a, (near.get(a) ?? new Set()).add(b))
          }
        }
      }
    }
  }

  return near
}

// The edges that draw a line or arrow cell alone: only there can an edge's color show. An edge whose every cell another
// edge shares, as on a merged trunk, would hold a color no reader sees, and could take the last one from a line that
// crosses it.
function seen(d: Drawing): Set<string> {
  const own = new Set<string>()
  for (const row of d.cells) {
    for (const cell of row) {
      const owners = cell && (cell.kind === 'line' || cell.kind === 'arrow') ? new Set(cell.owners) : null
      if (owners?.size === 1) {
        own.add(cell!.owners[0]!)
      }
    }
  }

  return own
}

// Each crossing edge's color, an index below count. Edges take colors in the order the source lists them, and while
// colors last each takes a new one: two lines in one color read as one line that ends in two arrowheads, even where
// they never meet. Once colors run out, an edge takes the first that no edge it crosses or shares a cell with has, so
// two lines that meet never look alike; one left with no such color keeps the theme's edge color. Only an edge with a
// cell of its own takes a color. With no colors, as in mono, or no crossing, no edge has one, and the drawing looks as
// it always did.
export function lineColors(d: Drawing, count: number): Map<string, number> {
  const colors = new Map<string, number>()
  if (count <= 0) {
    return colors
  }

  const crosses = crossings(d)
  const shown = seen(d)
  const near = neighbours(d, new Set(crosses.keys()))
  const edges = d.expect.edges.map((e) => e.id).filter((id) => crosses.has(id) && shown.has(id))
  edges.slice(0, count).forEach((id, i) => colors.set(id, i))
  for (const id of edges.slice(count)) {
    const taken = new Set<number>()
    for (const other of [...crosses.get(id)!, ...(near.get(id) ?? [])]) {
      if (colors.has(other)) {
        taken.add(colors.get(other)!)
      }
    }

    let free = 0
    while (taken.has(free)) {
      free++
    }

    if (free < count) {
      colors.set(id, free)
    }
  }

  return colors
}
