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
import { mirrorAxis, turn, turnBack } from './mirror.ts'

export type { Route } from './route-base.ts'

// May extend rows/cols for exterior routing lanes; node, label and frame boxes never move. A back edge with no dummy
// and no label routes first with the forward edges, in the nearest free column, so a 2-cycle draws as two parallel
// edges, not a long detour; else, as each back edge with a dummy or label, in an outside lane. work, a rescue pass's
// shared budget, bounds every path search and lets the search router refill its own budget once (searchRoutes). p's
// routes, or why it has none. A bottom-to-top or right-to-left layout none of the routers draws as it stands is routed
// turned over, as top to bottom or left to right, and its routes turned back (mirror.ts); p then takes the size the
// turned routes need.
export function routeGraph(p: Placed, work?: { left: number }): Route[] | Fail {
  const routes = routeAsPlaced(p, work)
  const axis = mirrorAxis(p.graph.dir)
  if (Array.isArray(routes) || axis === null || (work && work.left <= 0)) {
    return routes
  }

  const q = turn(p, axis)
  const turned = routeAsPlaced(q, work)
  return Array.isArray(turned) ? turnBack(p, q, turned, axis) : routes
}

function routeAsPlaced(p: Placed, work?: { left: number }): Route[] | Fail {
  const backs = p.graph.edges.filter((e) => e.reversed && e.style !== 'invisible')
  const laned = (e: GEdge) =>
    p.boxes.has(`${e.id}:label`) || [...p.boxes.keys()].some((id) => id.startsWith(`${e.id}#`))
  if (backs.some((e) => !laned(e))) {
    const trial = { ...p }
    const rs = routeWith(trial, backs.filter(laned), work)
    if (Array.isArray(rs)) {
      p.rows = trial.rows
      p.cols = trial.cols
      return rs
    }
  }

  const routed = routeWith(p, backs, work)
  const sharedEnd = backs.some((a) => backs.some((b) => a !== b && (a.from === b.from || a.to === b.to)))
  if (Array.isArray(routed) || !sharedEnd) {
    return routed
  }

  // Outside lanes use each face's middle. Shared back-edge endpoints may need separate slots on other faces; the
  // bounded general search can use those slots while still obeying the dummy and label waypoints.
  const searched = searchRoutes(p, false, [], work)
  return Array.isArray(searched) ? searched : searchRoutes(p, true, [], work)
}

// The edges in outside routed in outside lanes, the rest by channels, else by search.
function routeWith(p: Placed, outside: readonly GEdge[], work: { left: number } | undefined): Route[] | Fail {
  const ids = new Set(outside.map((e) => e.id))
  const byOrder = (a: Route, b: Route) =>
    p.graph.edges.find((e) => e.id === a.edge)!.order - p.graph.edges.find((e) => e.id === b.edge)!.order
  if (outside.length) {
    const forward = { ...p, graph: { ...p.graph, edges: p.graph.edges.filter((e) => !ids.has(e.id)) } }
    const rs = routeWith(forward, [], work)
    p.rows = Math.max(p.rows, forward.rows)
    p.cols = Math.max(p.cols, forward.cols)
    if (!Array.isArray(rs)) {
      return rs
    }

    let needsReservation = false
    for (const e of outside) {
      const route = outsideRoute(p, e, rs, work)
      if (!route) {
        needsReservation = true
        break
      }

      rs.push(route)
    }

    if (needsReservation) {
      const lanes: Route[] = []
      for (const e of outside) {
        const route = outsideRoute(p, e, lanes, work)
        if (!route) {
          return fail('route-conflict')
        }

        lanes.push(route)
      }

      const reserved = { ...p, graph: { ...p.graph, edges: p.graph.edges.filter((e) => !ids.has(e.id)) } }
      const remaining = searchRoutes(reserved, false, lanes, work)
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

  const searched = searchRoutes(p, false, [], work)
  return Array.isArray(searched) ? searched : searchRoutes(p, true, [], work)
}
