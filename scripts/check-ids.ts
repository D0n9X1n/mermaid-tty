// node scripts/check-ids.ts: checks that scripts/check.ts has a row for each A and
// VR check ID of the acceptance doc (31 of B7's 48), and no row for any other ID.
// B's check-ci-coverage.ts uses the same parser for all 48.
import { readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECKS } from './check.ts'
import { diffIds, parseIds } from './lib/check-ids.ts'

function main(): number {
  const doc = parseIds(readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', 'utf8')).filter(id => /^(A\d|VR\.)/.test(id))
  const diff = diffIds(doc, CHECKS.map(c => c.id))
  if (diff.missing.length || diff.extra.length) { console.error(`check-ids: ${JSON.stringify(diff)}`); return 1 }
  console.log(`check-ids: CHECKS matches the ${doc.length} A and VR IDs`)
  return 0
}

// main() runs only when node runs this file, by the same guard as check.ts.
const real = (p: string) => { try { return realpathSync(p) } catch { return p } }
const argv1 = process.argv[1]
if (argv1 && real(resolve(argv1)) === real(fileURLToPath(import.meta.url))) process.exitCode = main()
