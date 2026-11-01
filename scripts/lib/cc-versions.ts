// The scheduled Claude Code version job (B4): which versions to test. No dependencies, so the version job needs no docs
// tooling; its workflow rule runs on the parsed YAML tree in docs/ci-rules.ts.
const STABLE = /^\d+\.\d+\.\d+$/
// The versions earlier runs tested: every leg of a run uploads an artifact named leg-<version>-<os>, pass or fail, so
// the Actions API's artifact list is the record, and nothing is written back to the repo. A tested version is never
// selected again (retry it with workflow_dispatch).
export const tested = (names: string) => [
  ...new Set([...names.matchAll(/^leg-(\d+\.\d+\.\d+)-\S+$/gm)].map((m) => m[1]!)),
]
// Untested stable versions after the first tested one, oldest first, at most `limit`; with none tested, only the
// latest. Artifacts expire, so the oldest tested versions drop out of the record; the first tested one then moves up,
// and nothing older is selected again.
export function untested(published: string[], done: string[], limit = 20): string[] {
  const stable = published.filter((v) => STABLE.test(v))
  const seen = new Set(done)
  const first = Math.min(...done.map((v) => stable.indexOf(v)).filter((i) => i >= 0))
  return first === Infinity
    ? stable.slice(-1)
    : stable
        .slice(first + 1)
        .filter((v) => !seen.has(v))
        .slice(0, limit)
}
