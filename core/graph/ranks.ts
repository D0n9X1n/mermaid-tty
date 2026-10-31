// Cycle breaking and ranks (plan A §7.1–2) over a level's units and the links between them, self-loops left out.
export type Link = { id: string; from: string; to: string; minlen: number }

const outLinks = (ids: readonly string[], links: readonly Link[]): Map<string, Link[]> => {
  const out = new Map<string, Link[]>(ids.map((id) => [id, []]))
  for (const l of links) {
    out.get(l.from)!.push(l)
  }
  return out
}

// The links a DFS in source order (ids', then links' order) finds pointing back to a unit on its path: reversing them leaves
// no cycle. Iterative, so a long chain cannot overflow the stack.
export function backLinks(ids: readonly string[], links: readonly Link[]): Set<string> {
  const out = outLinks(ids, links)
  const state = new Map<string, 'open' | 'done'>()
  const back = new Set<string>()
  for (const root of ids) {
    if (state.has(root)) {
      continue
    }
    const stack: [string, number][] = [[root, 0]]
    state.set(root, 'open')
    while (stack.length > 0) {
      const top = stack.at(-1)!
      const l = out.get(top[0])![top[1]++]
      if (!l) {
        state.set(top[0], 'done')
        stack.pop()
        continue
      }
      const s = state.get(l.to)
      if (s === 'open') {
        back.add(l.id)
      } else if (s === undefined) {
        state.set(l.to, 'open')
        stack.push([l.to, 0])
      }
    }
  }
  return back
}

// Longest-path ranks of acyclic links: a unit with no in-link is on rank 0, any other at least minlen below each in-link's tail.
export function longestPath(ids: readonly string[], links: readonly Link[]): Map<string, number> {
  const out = outLinks(ids, links)
  const rank = new Map(ids.map((id) => [id, 0]))
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const l of links) {
    indeg.set(l.to, indeg.get(l.to)! + 1)
  }
  const queue = ids.filter((id) => indeg.get(id) === 0)
  for (let i = 0; i < queue.length; i++) {
    for (const l of out.get(queue[i]!)!) {
      rank.set(l.to, Math.max(rank.get(l.to)!, rank.get(l.from)! + l.minlen))
      indeg.set(l.to, indeg.get(l.to)! - 1)
      if (indeg.get(l.to) === 0) {
        queue.push(l.to)
      }
    }
  }
  return rank
}
