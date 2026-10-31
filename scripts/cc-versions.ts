// The version job's CLI. `list PUBLISHED_JSON TESTED_TXT [VERSION]` prints the versions to test as a JSON array; VERSION, from
// workflow_dispatch, retries just that one. `record LEGS_DIR TESTED_TXT VERSIONS_JSON` writes a result for every selected version:
// LEGS_DIR/<artifact>/leg.txt holds `VERSION OS STATUS`, and a version with a missing leg is recorded as fail.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { record, recorded, untested, verdict } from './lib/cc-versions.ts'
const [mode, a = '', b = '', extra = ''] = process.argv.slice(2)
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
if (mode === 'list') {
  console.log(
    JSON.stringify(/^\d+\.\d+\.\d+$/.test(extra) ? [extra] : untested(JSON.parse(read(a) || '[]'), recorded(read(b)))),
  )
} else if (mode === 'record') {
  const legs: Record<string, Record<string, string>> = Object.fromEntries(
    (JSON.parse(extra || '[]') as string[]).map((v) => [v, {}]),
  )
  for (const d of existsSync(a) ? readdirSync(a) : []) {
    const [v = '', os = '', status = ''] = read(join(a, d, 'leg.txt'))
      .trim()
      .split(/\s+/)
    if (legs[v]) {
      legs[v]![os] = status
    }
  }
  writeFileSync(b, record(read(b), Object.fromEntries(Object.entries(legs).map(([v, l]) => [v, verdict(l)]))))
  console.log(`cc-versions: recorded ${Object.keys(legs).join(', ') || 'nothing'}`)
} else {
  console.error(
    'usage: node scripts/cc-versions.ts list PUBLISHED_JSON TESTED_TXT [VERSION] | record LEGS_DIR TESTED_TXT VERSIONS_JSON',
  )
  process.exit(2)
}
