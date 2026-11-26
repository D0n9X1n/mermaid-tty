// Seeded flowcharts shaped like the ones a coding assistant writes: a top-down or left-right process, decisions with
// labelled branches, branches that meet again at shared ends, now and then a retry back to an earlier step and a
// subgraph grouping a few steps. Plain functions of a seed, so a test sees the same charts every run.

const STEPS = [
  'Parse request',
  'Validate input',
  'Load config',
  'Call API',
  'Write result',
  'Render',
  'Notify user',
  'Retry',
  'Log error',
  'Fork session',
  'Show source',
  'Draw diagram',
  'Cache result',
  'Queue job',
  'Return response',
]
const QUESTIONS = ['Valid?', 'Cache hit?', 'Auth ok?', 'Timeout?', 'Any text?', 'Pane placed?', 'Source mode?']
const BRANCHES = [
  ['yes', 'no'],
  ['ok', 'error'],
  ['hit', 'miss'],
  ['answered', 'empty'],
]

// A xorshift generator over seed: each call answers a whole number below k.
function generator(seed: number): (k: number) => number {
  let s = seed >>> 0 || 1
  return (k) => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) % k
  }
}

// The flowchart for seed.
export function flowchartOf(seed: number): string {
  const rnd = generator(seed * 2654435761)
  const pick = <T>(a: readonly T[]) => a[rnd(a.length)]!
  const lines = [`flowchart ${pick(['TD', 'TD', 'LR', 'LR', 'TB'])}`]
  let count = 0
  const id = () => `N${count++}`
  const start = id()
  lines.push(`  ${start}(["${pick(['Start', 'Request', '/btw question'])}"])`)
  const ends = [id()]
  lines.push(`  ${ends[0]}(["Done"])`)
  if (rnd(2)) {
    ends.push(id())
    lines.push(`  ${ends[1]}["${pick(['Show error', 'Native /btw', 'Fallback'])}"]`)
  }

  const all = [start]
  let frontier = [start]
  for (let depth = 2 + rnd(4); depth > 0; depth--) {
    const next: string[] = []
    for (const from of frontier) {
      const step = id()
      if (rnd(3) > 0) {
        lines.push(`  ${from} --> ${step}["${pick(STEPS)}"]`)
        all.push(step)
        next.push(step)
        continue
      }

      const [yes, no] = pick(BRANCHES)
      lines.push(`  ${from} --> ${step}{"${pick(QUESTIONS)}"}`)
      const then = id()
      lines.push(`  ${step} -->|${yes}| ${then}["${pick(STEPS)}"]`)
      all.push(step, then)
      next.push(then)
      if (rnd(2)) {
        lines.push(`  ${step} -->|${no}| ${pick(ends)}`)
      } else {
        const other = id()
        lines.push(`  ${step} -->|${no}| ${other}["${pick(STEPS)}"]`)
        all.push(other)
        next.push(other)
      }
    }

    frontier = next.slice(0, 3)
  }

  for (const from of frontier) {
    lines.push(`  ${from} --> ${pick(ends)}`)
  }

  if (rnd(4) === 0 && all.length > 3) {
    lines.push(`  ${all[2 + rnd(all.length - 2)]} -->|retry| ${all[1 + rnd(2)]}`)
  }

  if (rnd(5) === 0 && all.length > 4) {
    const at = 1 + rnd(all.length - 3)
    lines.push(`  subgraph G1 ["${pick(['Validation', 'Worker', 'Fork path'])}"]`)
    for (const member of all.slice(at, at + 2 + rnd(2))) {
      lines.push(`    ${member}`)
    }

    lines.push('  end')
  }

  return lines.join('\n')
}
