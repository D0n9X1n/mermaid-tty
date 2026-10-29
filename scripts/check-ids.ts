// node scripts/check-ids.ts: checks that scripts/check.ts has a row for each A and
// VR check ID of the acceptance doc (31 of B7's 48), and no row for any other ID.
// B's check-ci-coverage.ts uses the same parser for all 48.
import { readFileSync } from 'node:fs'
import { CHECKS } from './check.ts'
import { diffIds, parseIds } from './lib/check-ids.ts'
import { isMain } from './lib/is-main.ts'

function main(): number {
  const doc = parseIds(readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', 'utf8')).filter(id => /^(A\d|VR\.)/.test(id))
  const diff = diffIds(doc, CHECKS.map(c => c.id))
  if (diff.missing.length || diff.extra.length) { console.error(`check-ids: ${JSON.stringify(diff)}`); return 1 }
  console.log(`check-ids: CHECKS matches the ${doc.length} A and VR IDs`)
  return 0
}

// main() runs only when node runs this file, not when another module imports it.
if (isMain(import.meta)) process.exitCode = main()
