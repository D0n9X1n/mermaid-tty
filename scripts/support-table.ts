// node scripts/support-table.ts --write | --check: the README's support table (spec C Registry, B1), generated from the
// registry. --write writes supportTable() and a newline to docs/generated/support-table.md; --check exits 1 when the file
// differs from it. B owns README.md and includes the generated file (B-T12), so this never touches the README.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { supportTable } from '../core/registry.ts'
import { isMain } from './lib/is-main.ts'

export const FILE = fileURLToPath(new URL('../docs/generated/support-table.md', import.meta.url))
const USAGE = 'usage: node scripts/support-table.ts --write | --check'

// Writes or checks the file. 1 when --check finds it stale or missing, 2 on a bad argument.
function main(args: readonly string[] = process.argv.slice(2)): number {
  const want = supportTable() + '\n'
  if (args.length === 1 && args[0] === '--write') {
    mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, want)
    console.log('support-table: wrote docs/generated/support-table.md')
    return 0
  }
  if (args.length !== 1 || args[0] !== '--check') { console.error(USAGE); return 2 }
  let got: string | null = null
  try { got = readFileSync(FILE, 'utf8') } catch { /* missing: stale */ }
  if (got === want) { console.log('support-table: docs/generated/support-table.md is current'); return 0 }
  console.error('support-table: docs/generated/support-table.md is stale; run node scripts/support-table.ts --write')
  return 1
}

// main() runs only when node runs this file.
if (isMain(import.meta)) process.exitCode = main()
