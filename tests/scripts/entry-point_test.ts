import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMain } from '../../scripts/lib/is-main.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const IS_MAIN = new URL('../../scripts/lib/is-main.ts', import.meta.url).href

// The .ts files under dir, a '/'-separated path from the repo root, in every
// subdirectory except node_modules.
function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const file = `${dir}/${e.name}`
    if (e.isDirectory()) { return e.name === 'node_modules' ? [] : tsFiles(file) }
    return e.isFile() && e.name.endsWith('.ts') ? [file] : []
  })
}

// import.meta.main arrived in Node 24.2, but package.json allows 24.0, where it is undefined: a
// script guarded by it skips its body and exits 0, so a check passes without running. Only
// lib/is-main.ts reads it, and without it falls back to Node's own rule for the main entry.
test('A8.portability: no .ts file under scripts/, core/ or hooks/ uses import.meta.main, except lib/is-main.ts', () => {
  const files = ['scripts', 'core', 'hooks'].flatMap(d => tsFiles(d))
  for (const f of ['scripts/check-palettes.ts', 'scripts/lib/is-main.ts', 'core/themes.ts', 'hooks/fences.ts']) { assert.ok(files.includes(f), `${f} was not scanned`) }
  const uses = files.filter(f => f !== 'scripts/lib/is-main.ts').flatMap(f => readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/)
    .flatMap((line, i) => (line.includes('import.meta.main') ? [`${f}:${i + 1}: ${line.trim()}`] : [])))
  assert.deepEqual(uses, [])
})

// One shared guard, not a copy per script (an async main() is awaited): the copies compared the paths exactly, so on a Windows
// UNC path, whose host realpath keeps in its case and the module URL lowercases, each one skipped
// main() and exited 0 without checking anything.
test('A8.portability: every script with a main() guards it with isMain(import.meta) from lib/is-main.ts, and none compares argv[1] or realpaths itself', () => {
  const mains = ['scripts', 'core', 'hooks'].flatMap(d => tsFiles(d)).filter(f => /\bfunction main\(/.test(readFileSync(join(ROOT, f), 'utf8')))
  for (const f of ['scripts/check.ts', 'scripts/check-ids.ts', 'scripts/check-palettes.ts']) { assert.ok(mains.includes(f), `${f} was not scanned`) }
  const bad = mains.flatMap(f => {
    const text = readFileSync(join(ROOT, f), 'utf8')
    return [...(/if \(isMain\(import\.meta\)\) \{?\s*process\.exitCode = (await )?main\([^)]*\)/.test(text) ? [] : [`${f}: no isMain(import.meta) guard`]),
      ...(/process\.argv\[1\]|realpathSync/.test(text) ? [`${f}: an inline argv[1] or realpath guard`] : [])]
  })
  assert.deepEqual(bad, [])
})

// A module that prints one JSON line: its URL, Node's answer to whether it is the main module,
// and isMain's fallback, the answer isMain gives on Node 24.0 and 24.1, which lack
// import.meta.main. It imports the modules at imports first, so their lines come before its own.
function probe(...imports: string[]): string {
  return [...imports.map(f => `import ${JSON.stringify(pathToFileURL(f).href)}`), `import { isMain } from ${JSON.stringify(IS_MAIN)}`,
    'console.log(JSON.stringify({ url: import.meta.url, native: import.meta.main, fallback: isMain({ url: import.meta.url }) }))', ''].join('\n')
}

// One run of node on entry from cwd, and import.meta.main in each module it loads, in the
// order they print.
type Run = { cwd: string; entry: string; native: boolean[] }

// The OS refused to create a link: Windows needs admin rights or Developer Mode for a symlink to
// a file, and some filesystems have no hard links.
class LinkRefused extends Error {}
function makeLink(make: () => void): void {
  try { make() } catch (e) {
    const { code, message } = e as { code?: string; message?: string }
    if (code === 'EPERM' || code === 'EACCES') { throw new LinkRefused(`the OS refused to create a link: ${message}`) }
    throw e
  }
}

// Each layout builds its modules in dir, a real path, and returns the runs to make.
const LAYOUTS: { name: string; build: (dir: string) => Run[] }[] = [
  { name: '(a) a direct run, and an import from a module run directly', build: dir => {
    const file = join(dir, 'probe.mjs')
const  importer = join(dir, 'importer.mjs')
    writeFileSync(file, probe()); writeFileSync(importer, probe(file))
    return [{ cwd: dir, entry: file, native: [true] }, { cwd: dir, entry: importer, native: [false, true] }]
  } },
  { name: '(b) a run through a symlink, and an import through it', build: dir => {
    const file = join(dir, 'probe.mjs')
const  symlink = join(dir, 'link.mjs')
const  importer = join(dir, 'importer.mjs')
    writeFileSync(file, probe()); makeLink(() => symlinkSync(file, symlink)); writeFileSync(importer, probe(symlink))
    return [{ cwd: dir, entry: symlink, native: [true] }, { cwd: dir, entry: importer, native: [false, true] }]
  } },
  // Two hard links are one file, but Node loads them as two modules, by URL: only the entry is main.
  { name: '(c) a run of either of two same-named hard links in different directories, each importing the other', build: dir => {
    const a = join(dir, 'a', 'probe.mjs')
const  b = join(dir, 'b', 'probe.mjs')
    mkdirSync(join(dir, 'a')); mkdirSync(join(dir, 'b'))
    writeFileSync(a, probe(a, b)); makeLink(() => linkSync(a, b))
    return [{ cwd: dir, entry: a, native: [false, true] }, { cwd: dir, entry: b, native: [false, true] }]
  } },
  { name: '(d) a run by a relative path from another cwd, and an import from a module run that way', build: dir => {
    const real = join(dir, 'real')
const  cwd = join(dir, 'elsewhere')
const  file = join(real, 'probe.mjs')
const  importer = join(real, 'importer.mjs')
    mkdirSync(real); mkdirSync(cwd)
    writeFileSync(file, probe()); writeFileSync(importer, probe(file))
    return [{ cwd, entry: relative(cwd, file), native: [true] }, { cwd, entry: relative(cwd, importer), native: [false, true] }]
  } },
  { name: '(e) a run through a symlinked parent directory, and an import through it', build: dir => {
    const real = join(dir, 'real')
const  alias = join(dir, 'alias')
    mkdirSync(real); makeLink(() => symlinkSync(real, alias, 'junction'))
    writeFileSync(join(real, 'probe.mjs'), probe()); writeFileSync(join(real, 'importer.mjs'), probe(join(alias, 'probe.mjs')))
    return [{ cwd: dir, entry: join(alias, 'probe.mjs'), native: [true] }, { cwd: dir, entry: join(alias, 'importer.mjs'), native: [false, true] }]
  } },
]

// On Node 24.0 and 24.1 isMain falls back to Node's own rule for the main entry, so wherever a
// module lies, the fallback must give Node's answer: here, from 24.2, import.meta.main. On those
// two, which lack it, there is no answer to compare with, so only these tests skip.
const NO_NATIVE = typeof import.meta.main !== 'boolean' && 'native import.meta.main unavailable (Node < 24.2): agreement not checkable'
for (const { name, build } of LAYOUTS) {
  test(`A8.portability: isMain's fallback agrees with import.meta.main in every module of ${name}`, { skip: NO_NATIVE }, t => {
    // A real path: macOS's temp dir lies under the /var symlink, which would make every layout (e).
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mermaid-tty-main-')))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    let runs: Run[]
    try { runs = build(dir) } catch (e) {
      if (!(e instanceof LinkRefused)) { throw e }
      t.skip(e.message); return
    }
    for (const { cwd, entry, native } of runs) {
      const r = spawnSync(process.execPath, [entry], { cwd, encoding: 'utf8' })
      assert.equal(r.status, 0, `node ${entry}: ${r.stderr}`)
      const modules = r.stdout.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as { url: string; native?: boolean; fallback: boolean })
      assert.deepEqual(modules.map(m => m.native), native, `node ${entry}: import.meta.main in each module`)
      for (const m of modules) { assert.equal(m.fallback, m.native, `node ${entry}: isMain's fallback in ${relative(dir, fileURLToPath(m.url))}`) }
    }
  })
}

// isMain(meta) in a process that node started with argv after its own path.
function isMainWith(argv: string[], meta: { url: string; main?: boolean }): boolean {
  const saved = process.argv
  process.argv = [process.execPath, ...argv]
  try { return isMain(meta) } finally { process.argv = saved }
}

// node -e, -p, stdin and the REPL leave argv[1] unset, unless given more arguments. A fallback
// that resolved a missing argv[1] would get the cwd, and take a module there for the main one.
test('A8.portability: isMain is false when argv[1] is absent', () =>
  assert.equal(isMainWith([], { url: pathToFileURL(realpathSync(process.cwd())).href }), false))

// From Node 24.2, import.meta.main is a boolean: Node's own answer, whatever argv[1] names.
test('A8.portability: isMain returns a boolean import.meta.main as it is, whatever argv[1] names', () => {
  const self = fileURLToPath(import.meta.url)
const  other = new URL('no-such-module.ts', import.meta.url).href
  assert.equal(isMainWith([self], { url: import.meta.url }), true); assert.equal(isMainWith([self], { url: import.meta.url, main: false }), false)
  assert.equal(isMainWith([self], { url: other }), false); assert.equal(isMainWith([self], { url: other, main: true }), true)
})

// node -e code arg leaves argv[1] naming no file, so its realpath throws.
test('A8.portability: when argv[1] names no file, isMain compares the URL of the path as given, and does not throw', () => {
  assert.equal(isMainWith(['no-such-file.ts'], { url: import.meta.url }), false)
  assert.equal(isMainWith(['no-such-file.ts'], { url: pathToFileURL(resolve('no-such-file.ts')).href }), true)
})

// Node gives the main module its real path, but argv[1] keeps the path node was given,
// which on macOS often runs through a symlink: temp dirs live under /var -> /private/var.
test('A8.portability: check-palettes runs main() when argv[1] reaches it through a symlink, as macOS temp paths do', t => {
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-tty-link-'))
const  link = join(dir, 'scripts')
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
