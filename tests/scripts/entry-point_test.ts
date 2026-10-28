import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// The .ts files under dir, a '/'-separated path from the repo root, in every
// subdirectory except node_modules.
function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const file = `${dir}/${e.name}`
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : tsFiles(file)
    return e.isFile() && e.name.endsWith('.ts') ? [file] : []
  })
}

// import.meta.main arrived in Node 24.2, but package.json allows 24.0: there a script guarded
// by it skips its body and exits 0, so a check passes without running. Compare process.argv[1].
test('A8.portability: no .ts file under scripts/, core/ or hooks/ uses import.meta.main', () => {
  const files = ['scripts', 'core', 'hooks'].flatMap(d => tsFiles(d))
  for (const f of ['scripts/check-palettes.ts', 'core/themes.ts', 'hooks/fences.ts']) assert.ok(files.includes(f), `${f} was not scanned`)
  const uses = files.flatMap(f => readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/)
    .flatMap((line, i) => (line.includes('import.meta.main') ? [`${f}:${i + 1}: ${line.trim()}`] : [])))
  assert.deepEqual(uses, [])
})
