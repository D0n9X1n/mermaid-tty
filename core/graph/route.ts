// Route in increasing main-axis coordinates; transpose/mirror only at cell boundaries. The entry point: it picks which
// edges take outside lanes and which router draws the rest, from lanes.ts, channels.ts and search.ts.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import type { Placed } from './layered.ts'
import type { GEdge } from './model.ts'
import { channelsRoute } from './channels.ts'
import { outsideRoute } from './lanes.ts'
import type { Route } from './route-base.ts'
import { searchRoutes } from './search.ts'

export type { Route } from './route-base.ts'

// May extend rows/cols for exterior routing lanes; node, label and frame boxes never move. A back edge with no dummy
// and no label routes first with the forward edges, in the nearest free column, so a 2-cycle draws as two parallel
// edges, not a long detour; else, as each back edge with a dummy or label, in an outside lane.
export function routeGraph(p: Placed): Route[] | Fail {
  const backs = p.graph.edges.filter((e) => e.reversed && e.style !== 'invisible')
  const laned = (e: GEdge) =>
    p.boxes.has(`${e.id}:label`) || [...p.boxes.keys()].some((id) => id.startsWith(`${e.id}#`))
  if (backs.some((e) => !laned(e))) {
    const trial = { ...p }
    const rs = routeWith(trial, backs.filter(laned))
    if (Array.isArray(rs)) {
      p.rows = trial.rows
      p.cols = trial.cols
      return rs
    }
  }

  return routeWith(p, backs)
}

// The edges in outside routed in outside lanes, the rest by channels, else by search.
function routeWith(p: Placed, outside: readonly GEdge[]): Route[] | Fail {
  const ids = new Set(outside.map((e) => e.id))
  const byOrder = (a: Route, b: Route) =>
    p.graph.edges.find((e) => e.id === a.edge)!.order - p.graph.edges.find((e) => e.id === b.edge)!.order
  if (outside.length) {
    const forward = { ...p, graph: { ...p.graph, edges: p.graph.edges.filter((e) => !ids.has(e.id)) } }
    const rs = routeWith(forward, [])
    p.rows = Math.max(p.rows, forward.rows)
    p.cols = Math.max(p.cols, forward.cols)
    if (!Array.isArray(rs)) {
      return rs
    }

    let needsReservation = false
    for (const e of outside) {
      const route = outsideRoute(p, e, rs)
      if (!route) {
        needsReservation = true
        break
      }

      rs.push(route)
    }

    if (needsReservation) {
      const lanes: Route[] = []
      for (const e of outside) {
        const route = outsideRoute(p, e, lanes)
        if (!route) {
          return fail('route-conflict')
        }

        lanes.push(route)
      }

      const reserved = { ...p, graph: { ...p.graph, edges: p.graph.edges.filter((e) => !ids.has(e.id)) } }
      const remaining = searchRoutes(reserved, false, lanes)
      p.rows = Math.max(p.rows, reserved.rows)
      p.cols = Math.max(p.cols, reserved.cols)
      if (!Array.isArray(remaining)) {
        return remaining
      }

      return remaining.sort(byOrder)
    }

    return rs.sort(byOrder)
  }

  const fast = channelsRoute(p)
  if (Array.isArray(fast)) {
    return fast
  }

  const searched = searchRoutes(p)
  return Array.isArray(searched) ? searched : searchRoutes(p, true)
}
