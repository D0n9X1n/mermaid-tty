import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { samePath } from '../../scripts/lib/is-main.ts'

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
// by it skips its body and exits 0, so a check passes without running. Scripts use lib/is-main.ts.
test('A8.portability: no .ts file under scripts/, core/ or hooks/ uses import.meta.main', () => {
  const files = ['scripts', 'core', 'hooks'].flatMap(d => tsFiles(d))
  for (const f of ['scripts/check-palettes.ts', 'core/themes.ts', 'hooks/fences.ts']) assert.ok(files.includes(f), `${f} was not scanned`)
  const uses = files.flatMap(f => readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/)
    .flatMap((line, i) => (line.includes('import.meta.main') ? [`${f}:${i + 1}: ${line.trim()}`] : [])))
  assert.deepEqual(uses, [])
})

// One shared guard, not a copy per script: the copies compared the paths exactly, so on a Windows
// UNC path, whose host realpath keeps in its case and the module URL lowercases, each one skipped
// main() and exited 0 without checking anything.
test('A8.portability: every script with a main() guards it with isMain from lib/is-main.ts, and none compares argv[1] or realpaths itself', () => {
  const mains = ['scripts', 'core', 'hooks'].flatMap(d => tsFiles(d)).filter(f => /\bfunction main\(/.test(readFileSync(join(ROOT, f), 'utf8')))
  for (const f of ['scripts/check.ts', 'scripts/check-ids.ts', 'scripts/check-palettes.ts']) assert.ok(mains.includes(f), `${f} was not scanned`)
  const bad = mains.flatMap(f => {
    const text = readFileSync(join(ROOT, f), 'utf8')
    return [...(text.includes('if (isMain(import.meta.url)) process.exitCode = main()') ? [] : [`${f}: no isMain(import.meta.url) guard`]),
      ...(/process\.argv\[1\]|realpathSync/.test(text) ? [`${f}: an inline argv[1] or realpath guard`] : [])]
  })
  assert.deepEqual(bad, [])
})
test('A8.portability: on Windows, samePath ignores the case of a UNC host', () =>
  assert.equal(samePath('\\\\SERVER\\share\\x.ts', '\\\\server\\share\\x.ts', 'win32'), true))
test('A8.portability: on Windows, samePath ignores the case of a drive letter, and still tells two paths apart', () => {
  assert.equal(samePath('C:\\a\\x.ts', 'c:\\a\\x.ts', 'win32'), true)
  assert.equal(samePath('C:\\a\\x.ts', 'C:\\b\\x.ts', 'win32'), false)
})
test('A8.portability: elsewhere, samePath compares exactly, case included', () => {
  for (const platform of ['linux', 'darwin']) {
    assert.equal(samePath('/A/x.ts', '/a/x.ts', platform), false, platform); assert.equal(samePath('/a/x.ts', '/a/x.ts', platform), true, platform)
  }
})

// Node gives the main module its real path, but argv[1] keeps the path node was given,
// which on macOS often runs through a symlink: temp dirs live under /var -> /private/var.
test('A8.portability: check-palettes runs main() when argv[1] reaches it through a symlink, as macOS temp paths do', t => {
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-tty-link-')), link = join(dir, 'scripts')
  t.after(() => rmdirSync(dir))                   // not rmSync recursive: cleanup never reaches through the link
  symlinkSync(join(ROOT, 'scripts'), link, 'junction')
  try {
    const r = spawnSync(process.execPath, [join(link, 'check-palettes.ts')], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^ok: nord, dracula, gruvbox, solarized pass: contrast >= 3, OKLab distance >= 0\.08$/m)
  } finally { unlinkSync(link) }
})

// When another module is the main one, argv[1] may be absent, or name no file (node -e code arg).
test('A8.portability: importing check-palettes runs nothing, whether argv[1] is absent or names no file', () => {
  const url = new URL('../../scripts/check-palettes.ts', import.meta.url).href
  for (const argv of [[], ['no-such-file']]) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`, ...argv], { encoding: 'utf8' })
    assert.equal(r.status, 0, `[${argv}] ${r.stderr}`); assert.equal(r.stdout, '', `[${argv}]`)
  }
})
