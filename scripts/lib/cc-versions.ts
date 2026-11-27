// The scheduled Claude Code version job (B4): which versions to test. No dependencies, so the version job needs no docs
// tooling; its workflow rule runs on the parsed YAML tree in docs/ci-rules.ts.
const STABLE = /^\d+\.\d+\.\d+$/
// The versions earlier scheduled runs tested: every leg of one uploads an artifact named leg-<version>-<os>, pass or
// fail, so the Actions API's artifact list is the record, and nothing is written back to the repo. A retry
// (workflow_dispatch) names its legs retry-<version>-<os>, which are not the record: scheduled runs only move forward,
// so the newest version's artifact is always the last to expire, and a retry can't move the selection back.
export const tested = (names: string) => [
  ...new Set([...names.matchAll(/^leg-(\d+\.\d+\.\d+)-\S+$/gm)].map((m) => m[1]!)),
]
// Untested stable versions published after the newest tested one, oldest first, at most `limit`; with none tested, only
// the latest. Anchored at the newest record, the selection never moves back: neither an artifact that expired nor a
// retry of an old version (workflow_dispatch) reschedules a version the job already passed by.
export function untested(published: string[], done: string[], limit = 20): string[] {
  const stable = published.filter((v) => STABLE.test(v))
  const seen = new Set(done)
  const newest = Math.max(...done.map((v) => stable.indexOf(v)).filter((i) => i >= 0))
  return newest === -Infinity
    ? stable.slice(-1)
    : stable
        .slice(newest + 1)
        .filter((v) => !seen.has(v))
        .slice(0, limit)
}

// Whether stable version v is floor or later, each a major.minor.patch, compared part by part as numbers.
export function atLeast(v: string, floor: string): boolean {
  const a = v.split('.').map(Number)
  const b = floor.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return (a[i] ?? 0) > (b[i] ?? 0)
    }
  }

  return true
}
