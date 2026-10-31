// The scheduled Claude Code version job (B4): which versions to test and how a run's legs become results. No
// dependencies, so the version job needs no docs tooling; its workflow rule runs on the parsed YAML tree in
// docs/ci-rules.ts.
const STABLE = /^\d+\.\d+\.\d+$/
const OSES = ['ubuntu-latest', 'macos-latest', 'windows-latest']
// tested.txt holds `VERSION pass|fail` lines; a recorded version is never selected again (retry it with
// workflow_dispatch).
export const recorded = (text: string) => [...text.matchAll(/^(\d+\.\d+\.\d+) (?:pass|fail)$/gm)].map((m) => m[1]!)
// Unrecorded stable versions after the first recorded one, oldest first, at most `limit`; with no record, only the
// latest.
export function untested(published: string[], tested: string[], limit = 20): string[] {
  const stable = published.filter((v) => STABLE.test(v))
  const seen = new Set(tested)
  const first = Math.min(...tested.map((v) => stable.indexOf(v)).filter((i) => i >= 0))
  return first === Infinity
    ? stable.slice(-1)
    : stable
        .slice(first + 1)
        .filter((v) => !seen.has(v))
        .slice(0, limit)
}
// A version passes only when its leg succeeded on every OS; a missing leg is a failure.
export const verdict = (legs: Record<string, string>) => (OSES.every((os) => legs[os] === 'success') ? 'pass' : 'fail')
// tested.txt with one line per result; a retried version's old line is replaced.
export const record = (text: string, results: Record<string, string>) =>
  [
    ...text.split('\n').filter((l) => l && !(l.split(' ')[0]! in results)),
    ...Object.entries(results).map(([v, r]) => `${v} ${r}`),
  ].join('\n') + '\n'
