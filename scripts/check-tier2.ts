// The Tier 2 gate: a Tier 2 type may be in TIER2_PASSED only when one vr-C-<type> pass record in
// ci/reviews lists every ok fixture of the type and its golden, each with the SHA-256 of its bytes now.
// Usage: node scripts/check-tier2.ts   (exits 1 unless TIER2_PASSED lists exactly the Tier 2 types that pass)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIER2, TIER2_PASSED } from '../core/registry.ts'
import { checkRecords, parseRecord, requirePass, type ReviewRecord } from './check-review-hashes.ts'
import { isMain } from './lib/is-main.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIR = 'ci/reviews'

// A file's raw bytes, from a path relative to the repo root, or null when it is not a file.
function readRepo(path: string): Uint8Array | null {
  return statSync(join(ROOT, path), { throwIfNoEntry: false })?.isFile() ? readFileSync(join(ROOT, path)) : null
}

// Each fixtures/<t>/<t>-ok-NN.mmd, sorted, followed by its goldens/<t>/<t>-ok-NN.golden, present or not, so a missing
// golden fails the gate. None when the fixture folder is absent.
export function tier2Files(t: string): string[] {
  const dir = join(ROOT, 'fixtures', t)
  const ok = new RegExp(`^${t}-ok-\\d{2}\\.mmd$`)
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((n) => ok.test(n))
    .sort()
    .flatMap((n) => [`fixtures/${t}/${n}`, `goldens/${t}/${n.slice(0, -'.mmd'.length)}.golden`])
}

// Every ci/reviews/*.md record that parses. One that does not is dropped, so the gate fails closed;
// check-review-hashes.ts reports its parse error.
export function repoRecords(): ReviewRecord[] {
  const dir = join(ROOT, DIR)
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseRecord(`${DIR}/${f}`, readFileSync(join(dir, f), 'utf8')))
    .filter((p): p is ReviewRecord => !('error' in p))
}

// Why t fails the gate, or [] when it passes. Each vr-C-<t> pass record is checked alone: it must list every path in
// files, and every file it lists must hash as recorded. Records never add up. With no passing record, the problems of
// the record with the fewest, the first on a tie, or with none at all, each unlisted path.
export function tier2Problems(
  t: string,
  files: string[],
  records: ReviewRecord[],
  read: (path: string) => string | Uint8Array | null = readRepo,
): string[] {
  const scope = `vr-C-${t}`
  if (!files.length) {
    return [`${scope}: no ok fixtures`]
  }

  const each = records
    .filter((r) => r.scope === scope && r.verdict === 'pass')
    .map((r) => [...requirePass([r], { [scope]: files }), ...checkRecords([r], read)])
  if (!each.length) {
    return requirePass([], { [scope]: files })
  }

  return each.reduce((best, p) => (p.length < best.length ? p : best))
}

function main(): number {
  const records = repoRecords()
  const problems = TIER2.flatMap((t) => {
    const found = tier2Problems(t, tier2Files(t), records)
    const enabled = TIER2_PASSED.includes(t)
    if (enabled) {
      return found.map((p) => `${t}: ${p}`)
    }

    return found.length ? [] : [`${t}: passes the gate but is not in TIER2_PASSED`]
  })
  for (const p of problems) {
    console.error(p)
  }

  if (problems.length) {
    return 1
  }

  console.log(
    `check-tier2: TIER2_PASSED [${TIER2_PASSED.join(', ')}] lists exactly the Tier 2 types that pass the gate`,
  )
  return 0
}

// main() runs only when node runs this file, not when a test imports tier2Problems.
if (isMain(import.meta)) {
  process.exitCode = main()
}
