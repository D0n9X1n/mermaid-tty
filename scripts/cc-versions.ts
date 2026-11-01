// The version job's CLI. `list PUBLISHED_JSON ARTIFACT_NAMES [VERSION]` prints the versions to test as a JSON array:
// ARTIFACT_NAMES holds one artifact name per line, as the Actions API lists the repo's artifacts, and every
// leg-<version>-* among them is a version already tested. VERSION, from workflow_dispatch, retries just that one.
import { existsSync, readFileSync } from 'node:fs'
import { tested, untested } from './lib/cc-versions.ts'
const [mode, a = '', b = '', extra = ''] = process.argv.slice(2)
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
if (mode === 'list') {
  console.log(
    JSON.stringify(/^\d+\.\d+\.\d+$/.test(extra) ? [extra] : untested(JSON.parse(read(a) || '[]'), tested(read(b)))),
  )
} else {
  console.error('usage: node scripts/cc-versions.ts list PUBLISHED_JSON ARTIFACT_NAMES [VERSION]')
  process.exit(2)
}
