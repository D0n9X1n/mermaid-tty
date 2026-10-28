import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMain, sameName, samePath } from '../../scripts/lib/is-main.ts'

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
// A Windows directory can be case-sensitive (WSL interop) and hold both Main.ts and main.ts:
// lowercasing the whole path made them one file, so importing one could run the other's main().
test('A8.portability: on Windows, samePath tells apart two files whose names differ only in case', () =>
  assert.equal(samePath('C:\\repo\\Main.ts', 'C:\\repo\\main.ts', 'win32'), false))
test('A8.portability: on Windows, samePath ignores the case of a UNC host, but not of the path after it', () =>
  assert.equal(samePath('\\\\SERVER\\share\\Main.ts', '\\\\server\\share\\main.ts', 'win32'), false))
test('A8.portability: elsewhere, samePath compares exactly, case included', () => {
  for (const platform of ['linux', 'darwin']) {
    assert.equal(samePath('/A/x.ts', '/a/x.ts', platform), false, platform); assert.equal(samePath('/a/x.ts', '/a/x.ts', platform), true, platform)
  }
})
test('A8.portability: on Windows, sameName ignores the case of a file name; elsewhere it compares exactly', () => {
  assert.equal(sameName('C:\\repo\\Main.ts', 'D:\\other\\main.ts', 'win32'), true)
  assert.equal(sameName('C:\\repo\\main.ts', 'C:\\repo\\other.ts', 'win32'), false)
  for (const platform of ['linux', 'darwin']) {
    assert.equal(sameName('/repo/Main.ts', '/other/main.ts', platform), false, platform); assert.equal(sameName('/repo/main.ts', '/other/main.ts', platform), true, platform)
  }
})

// isMain(import.meta.url) in the module at file, as if node had been given argv1 to run.
function isMainGiven(argv1: string, file: string): boolean {
  const argv = process.argv
  process.argv = [process.execPath, argv1]
  try { return isMain(pathToFileURL(file).href) } finally { process.argv = argv }
}

// An empty main.ts in a new temp dir, which the test's end removes with any links made in it.
function moduleFile(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-tty-main-')), file = join(dir, 'main.ts')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(file, '')
  return file
}

// isMain compares files, not paths: a case-sensitive directory holds main.ts and Main.ts as two
// files, while a hard link or a symlink reaches the same one. A temp dir that ignores case, as
// macOS's and Windows's do by default, cannot hold both names.
test('A8.portability: isMain tells apart two files whose names differ only in case', t => {
  const lower = moduleFile(t), upper = join(dirname(lower), 'Main.ts')
  if (existsSync(upper)) { t.skip(`${dirname(lower)} ignores case, so main.ts and Main.ts would be one file`); return }
  writeFileSync(upper, '')
  assert.equal(isMainGiven(lower, lower), true)
  assert.equal(isMainGiven(upper, lower), false)
})
test('A8.portability: isMain takes a hard link of the same name for the module itself', t => {
  const file = moduleFile(t), link = join(dirname(file), 'linked', 'main.ts')
  mkdirSync(dirname(link)); linkSync(file, link)
  assert.equal(isMainGiven(link, file), true)
})
// Without admin rights or Developer Mode, Windows refuses to create a symlink to a file.
test('A8.portability: isMain takes a symlink to the module for the module itself, whatever its name', t => {
  const file = moduleFile(t), link = join(dirname(file), 'link.ts')
  try { symlinkSync(file, link) } catch (e) {
    const code = (e as { code?: string }).code
    if (code !== 'EPERM' && code !== 'EACCES') throw e
    t.skip(`cannot create a symlink here (${code}); on Windows that needs admin rights or Developer Mode`); return
  }
  assert.equal(isMainGiven(link, file), true)
})
// A file ID can repeat: ReFS's 64-bit one is not unique. So isMain also asks that both real paths
// end in the same name, and a file that shares the module's ID under another name is not it.
test('A8.portability: isMain does not take a hard link of another name for the module, as file IDs can repeat', t => {
  const file = moduleFile(t), link = join(dirname(file), 'other.ts')
  linkSync(file, link)
  assert.equal(isMainGiven(link, file), false)
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
