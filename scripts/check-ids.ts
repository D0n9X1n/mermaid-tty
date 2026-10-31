// node scripts/check-ids.ts: checks that scripts/check.ts has a row for each A and
// VR check ID in ci/coverage.json (31 of the 48), and no row for any other ID, so a check
// CI maps is one check.ts can run by name.
import { readFileSync } from 'node:fs'
import { CHECKS } from './check.ts'
import { diffIds } from './lib/check-ids.ts'
import { isMain } from './lib/is-main.ts'

function main(): number {
  const doc = Object.keys(JSON.parse(readFileSync('ci/coverage.json', 'utf8'))).filter(id => /^(A\d|VR\.)/.test(id))
  const diff = diffIds(doc, CHECKS.map(c => c.id))
  if (diff.missing.length || diff.extra.length) { console.error(`check-ids: ${JSON.stringify(diff)}`); return 1 }
  console.log(`check-ids: CHECKS matches the ${doc.length} A and VR IDs`)
  return 0
}

// main() runs only when node runs this file, not when another module imports it.
if (isMain(import.meta)) process.exitCode = main()
