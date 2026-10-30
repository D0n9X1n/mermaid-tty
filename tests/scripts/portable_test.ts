import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { scanSource, scanRepo } from '../../scripts/check-portable.ts'
import { claude } from '../../scripts/lib/claude.ts'
import { testCount, testFiles } from '../../scripts/fresh-clone.ts'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
test('A8.portability: forbidden tokens and imports are found; comments and strings are not', () => {
  for (const s of ["import x from 'node:fs'", "import y from 'lodash'", 'process.env.X', 'const t = `a ${process.env.X} b`', "require('a')", 'Buffer.from(s)', 'window.x',
    'document.x', 'eval(s)', 'new Function(s)', "await import('./a.ts')", "import { w } from './width'"]) assert.notDeepEqual(scanSource(s), [], s)
  for (const s of ["import type { Register } from 'claude-code'", "import { width } from './width.ts'", '// process.env', "const s = 'require(x)'", 'const t = `process.env is ${n} here`'])
    assert.deepEqual(scanSource(s), [], s)
  assert.deepEqual(scanRepo('.'), [])
})
test('A8.platforms: .gitattributes keeps text files LF', () => assert.match(readFileSync('.gitattributes', 'utf8'), /^\* text=auto eol=lf$/m))

// [rule, [source, the problems scanSource reports][]]: each rule's cases fail a scanner that lacks the rule.
const RULES: [string, [string, string[]][]][] = [
  ['a } in ${} closes a nested brace, not the substitution', [
    ['const t = `${ { a: process } }`', ['1 process']],
    ['const t = `${ { a: 1 }.a + process.env.X }`', ['1 process']],
    ['const t = `${ { a: 1 } } process`; window.x', ['1 window']]]],
  ['a template in ${} in a template nests, to any depth', [
    ['const t = `a ${ `b ${ process.env.X } c` } d`', ['1 process']],
    ['const t = `a ${ `b process ${ 1 } c` } d`; Buffer.from(s)', ['1 Buffer']],
    ['const t = `a ${ `b ${ 1 } c` } process`', []]]],
  ['a block comment is blanked, and keeps its lines', [
    ['/* require( */', []],
    ['x = a / b /* require( */', []],
    ['/* a\n process */\nrequire(x)', ['3 require']]]],
  ['an escaped quote or backtick ends no literal, and an escaped backslash escapes no quote', [
    ["const s = 'it\\'s require('", []],
    ['const s = "a \\" require(" + "b"', []],
    ["const s = '\\\\'; process.x", ['1 process']],
    ['const t = `a \\` process \\${ window }`', []]]],
  // The choice: a regex literal is a pattern, not a use of a global, so its text is blanked like a
  // string's and /process/ is not flagged. The token before a / tells a regex from a division.
  ['a regex literal is blanked like a string, so /process/ is not flagged, and a quote or / in it opens nothing', [
    ['const r = /process/', []],
    ['if (s) return /process/.test(s)', []],
    ["const r = /'/; process.x", ['1 process']],
    ['const r = /[/]process/; window.x', ['1 window']],
    ['const r = /\\/process/', []],
    ['const r = a / process.y / 2', ['1 process']]]],
  ['lines stay aligned across multi-line literals', [
    ['const t = `a\nb`\nwindow.x', ['3 window']],
    ["const s = 'a'\n\n  process.exit(1)", ['3 process']]]],
  ['export … from is an import too, so its specifier is checked', [
    ["export { a } from 'node:x'", ["1 import 'node:x'"]],
    ["export * from 'lodash'", ["1 import 'lodash'"]],
    ["export * from './a.ts'", []]]],
  ['claude-code is the only package, and only in a type-only statement', [
    ["import type { X } from 'other'", ["1 import 'other'"]],
    ["export type { R } from 'claude-code'", []],
    ["import { type R } from 'claude-code'", ["1 import 'claude-code'"]],
    ["import type from 'claude-code'", ["1 import 'claude-code'"]],
    ["import type { R } from 'claude-code'\nimport { x } from 'claude-code'", ["2 import 'claude-code'"]]]],
  ['a relative specifier ends in .ts or .tsx, and its text is not scanned for tokens', [
    ["import { A } from './a.tsx'", []],
    ["import './layout.ts'", []],
    ["import x from '../x.js'", ["1 import '../x.js'"]],
    ["import x from './a.jsx'", ["1 import './a.jsx'"]],
    ["import 'node:fs'", ["1 import 'node:fs'"]],
    ['import {\n  a,\n} from "lodash"', ["3 import 'lodash'"]],
    ["import { p } from './process.ts'", []]]],
  // A / starts a regex unless it follows a value: a name or number that is not a keyword such as return,
  // a ) that does not close the head of if, for or while, a ], or the < of a JSX closing tag.
  ['a / after a value divides; after if (…), }, a keyword or an operator it starts a regex literal, whose quotes, backticks and [/] open nothing', [
    ["if (true) /\"/.test('x'); process.cwd();", ['1 process']],
    ["if (s) /'/.test(s); process.x", ['1 process']],
    ['while (s) /`/.test(s)\nprocess.x', ['2 process']],
    ['for (;;) /[/"]/.test(s); process.x', ['1 process']],
    ["function f() {}\n/'/.test(s); process.x", ['2 process']],
    ["if (a) b(); else /'/.test(s); process.x", ['1 process']],
    ['const t = a / b / c; x = d / process.e / f', ['1 process']],
    ['const r = (a + b) / process.y / 2', ['1 process']],
    ['if (f(x) / process.y) z()', ['1 process']],
    ['const r = x[0] / process.y / 10', ['1 process']],
    ['<Text>a</Text><Text>{process.cwd()}</Text>', ['1 process']]]],
  ['a \\u escape outside literals and comments is flagged, since no name in our code needs one', [
    ['\\u0070rocess.cwd()', ['1 \\u']],
    ['const p = pro\\u0063ess.env', ['1 \\u']],
    ["const s = '\\u0070rocess' // \\u0070rocess", []],
    ['const r = /\\u{1F600}/u, t = `\\u0070 ${n}`', []]]],
  ['globalThis and Reflect are flagged as words', [
    ["globalThis['proc' + 'ess'].cwd()", ['1 globalThis']],
    ["const g = Reflect.get(globalThis, 'process')", ['1 Reflect', '1 globalThis']],
    ["const s = 'globalThis Reflect' // Reflect.get(globalThis)", []],
    ['const reflection = isReflected(myGlobalThis)', []]]],
  ['eval and require are flagged as bare words, so indirect eval and aliasing are found', [
    ['(0, eval)(s)', ['1 eval']],
    ['const e = eval, r = require', ['1 eval', '1 require']],
    ["const s = 'eval require' /* eval(s) require(x) */", []],
    ['evaluate(required, myeval, requireX)', []]]],
  // Code here uses specific function types, so Function is flagged in every use, a type too: in
  // { make: Function } it is a value after a :.
  ['Function is flagged in every use, a type position too', [
    ['const F = Function', ['1 Function']],
    ["Function('return this')()", ['1 Function']],
    ['if (f instanceof Function) g()', ['1 Function']],
    ["const t = { k: Function('x'), p: Function.prototype }", ['1 Function', '1 Function']],
    ['const factory = { make: Function }', ['1 Function']],
    ['const f = { make: Function }.make', ['1 Function']],
    ['function run(cb: Function, xs: Array<Function>): Function { return cb as Function }', ['1 Function', '1 Function', '1 Function', '1 Function']],
    ['const g = f satisfies Function, h = <Function>f', ['1 Function', '1 Function']],
    ["const s = 'Function' // new Function(s)", []],
    ['const isFunction = (x: unknown): x is Functional => typeof x === "function"', []]]],
  // A function's constructor is Function, so constructor reaches it without naming it: flagged as a bare word in every
  // use. Portable code here declares no class constructor and reads no constructor property.
  ['constructor is flagged in every use: it reaches Function without naming it', [
    ["export const c = (() => {}).constructor('return process')().cwd()", ['1 constructor']],
    ['const F = f.constructor, G = (0).constructor', ['1 constructor', '1 constructor']],
    ['class A { constructor() {} }', ['1 constructor']],
    ["const s = 'constructor' // x.constructor", []]]],
  // After a < a / starts a regex literal, as in a < /x/.test(s), unless it is right after the < and right
  // before a name or a >: then it is the </ of a JSX closing tag, as in </Text> or </>, and divides.
  ['a / after a < starts a regex literal, unless right after it and right before a name or >, as in </Text>', [
    ['if (offset < /"/.exec(line)!.index) process.cwd();', ['1 process']],
    ['a < /x/.source.length; process.cwd()', ['1 process']],
    ["const n = a < /'/.exec(s)!.index ? 1 : 2; process.cwd()", ['1 process']],
    ['ok = i < /`/.exec(s)?.index; process.cwd()', ['1 process']],
    ["if (a < /x'/.test(s)) process.cwd()", ['1 process']],
    ["if (a </'/.test(s)) process.cwd()", ['1 process']],
    ['const r = a < /process/.source.length', []],
    ['<Ink.Text>a</Ink.Text><Ink.Text>{process.cwd()}</Ink.Text>', ['1 process']],
    ['<>a</><Text>{process.cwd()}</Text>', ['1 process']],
    ['if (a < b / c) process.cwd(); d = e / f', ['1 process']]]],
  // $.process is the engine's own noun (run a command through the hooks), not Node's global.
  ['$.process is the engine API; process anywhere else is still flagged', [
    ["await $.process.run(['mmdc'])", []],
    ['const p = $.process', []],
    ['$.process.run(x); process.exit(1)', ['1 process']],
    ['a$.process.run(x)', ['1 process']],
    ['$ .process.run(x); x.process', ['1 process', '1 process']]]],
]
for (const [rule, cases] of RULES)
  test(`A8.portability: ${rule}`, () => { for (const [s, want] of cases) assert.deepEqual(scanSource(s), want, s) })

// Ordinary code that mixes regex literals, comparisons, generic calls, arrows, TSX, ?. and templates. Each
// FLAGGED case ends with process.cwd(), which the scan finds on its last line, and finds nothing else;
// each CLEAN case names a global only inside a literal or a comment, and the scan finds nothing.
const FLAGGED = [
  "const n = parse<Node>(src).items.filter(x => x.size < /'/.source.length).length; process.cwd()",
  `const Badge = ({ s }: Props) => <Text color={s.length < /"/.source.length ? 'red' : 'green'}>{s}</Text>; process.cwd()`,
  "const tag = (n: number) => `${n < /`/.exec(s)!.index ? 'lo' : 'hi'}`; process.cwd()",
  `while (i < /["']/.exec(rest)!.index) i++; const w = width<string>(rest)?.cols; process.cwd()`,
  "const keys = Object.keys(o).map(k => k.replace(/^\"|\"$/g, '')).sort((a, b) => a < b ? -1 : 1)\nconst msg = `${keys.length} keys / ${(n / total * 100).toFixed(1)}%`\nprocess.cwd()",
  "const List = ({ items }: { items?: string[] }) => {\n  const [sel] = useState<number>(0)\n  return <Box>{items?.filter(s => sel < /'/.exec(s)!.index).map(s => <Text key={s}>{s}</Text>)}</Box>\n}\nprocess.cwd()",
  "const at = `${(m?.index ?? 0) < /'/.exec(s)!.index ? 'in' : 'out'}`; process.cwd()",
  'const isShort = <T,>(xs: T[]) => xs.length < 3 && /^\\w+$/.test(String(xs[0])); process.cwd()',
  "if ((re?.lastIndex ?? 0) < /'/.exec(src)!.index) skip(); process.cwd()",
  "const Head = ({ t }: { t: string }) => <>\n  <Text>{`${t.replace(/[<>]/g, '')}`}</Text>\n  {t.length < /'/.source.length ? null : <Text dimColor>{t}</Text>}\n</>\nprocess.cwd()",
]
const CLEAN = [
  'const n = rows.filter(r => r.at < /window/.exec(src)!.index).length',
  "const Title = ({ t }: { t?: string }) => {\n  const [w] = useState<number>(80)\n  return <Text>{`${t?.slice(0, w) ?? 'process.cwd()'}`}</Text>\n}",
  `const quoted = (s: string) => (/["']/.exec(s)?.index ?? -1) < s.length / 2 ? 'document' : "window"`,
  "const msg = parse<Doc>(src).nodes.length < /Buffer/.source.length ? `few ${n}` : `many globalThis`",
  "const Hint = () => <><Text>{n < /process|window/.lastIndex ? 'a' : 'b'}</Text></>",
  "const clean = (s?: string) => s?.replace(/\\/\\*[^]*?\\*\\//g, '') // strip /* require() */ comments",
  "const pct = (done / total * 100).toFixed(0) + '% of process'; const r = /require\\(/.test(src)",
  `<Text color="gray">{items.length < /eval/.source.length ? 'none' : "eval me"}</Text>`,
  'const avg = total / Math.max(1, list?.filter(x => /window/.test(x)).length ?? 0)',
  "const out = `${xs.map(x => `${x < 0 ? '-' : ''}${x.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')}`).join(' ')} process`",
]
test('A8.portability: ordinary code mixing regexes, comparisons, generics, arrows, TSX, ?. and templates hides no process.cwd()', () =>
  assert.deepEqual(FLAGGED.map(s => scanSource(s)), FLAGGED.map(s => [`${s.split('\n').length} process`])))
test('A8.portability: ordinary code that names a global only in a literal or a comment is not flagged', () =>
  assert.deepEqual(CLEAN.map(s => scanSource(s)), CLEAN.map(() => [])))

// A scratch repo: core/ and hooks/ files with one problem each, decoys outside them, and a dependency.
const REPO: Record<string, string> = {
  'core/a.ts': "import { x } from './x.ts'\nimport { readFileSync } from 'node:fs'\n",
  'core/sub/b.ts': "const s = 'process'\nexport const n = process.argv.length\n",
  'hooks/h.tsx': 'export const w = window.innerWidth\n',
  'hooks/hooks.json': '{ "process": 1 }\n',
  'scripts/s.ts': "import { spawnSync } from 'node:child_process'\n",
  'notes.md': 'process.env\n',
  'package.json': '{\n  "name": "x",\n  "dependencies": { "lodash": "1" }\n}\n',
}
const PROBLEMS = ["core/a.ts:2 import 'node:fs'", 'core/sub/b.ts:2 process', 'hooks/h.tsx:1 window', 'package.json:3 dependencies']
function scratch<T>(files: Record<string, string>, body: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  try {
    for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text) }
    return body(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
test('A8.portability: scanRepo reports file:line token in core/ and hooks/ .ts and .tsx files, and a dependencies key', () =>
  scratch(REPO, dir => assert.deepEqual(scanRepo(dir), PROBLEMS)))
test('A8.portability: check-portable.ts prints the problems and exits 1, and exits 0 on this repo', () => {
  const script = fileURLToPath(new URL('../../scripts/check-portable.ts', import.meta.url))
  scratch(REPO, dir => {
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 1); assert.deepEqual(r.stderr.split('\n').filter(l => PROBLEMS.includes(l)), PROBLEMS)
  })
  assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 0)
})

// A fake claude is a POSIX sh script, as check-sh_test's is. On Windows, check.ts A8.no-build runs
// fresh-clone.ts, so claude(args, cwd), with the real claude.
const POSIX_ONLY = process.platform === 'win32' && 'needs a POSIX sh fake claude on PATH'
const writeFakeClaude = (dir: string, script: string) => {
  mkdirSync(join(dir, 'bin')); writeFileSync(join(dir, 'bin/claude'), script); chmodSync(join(dir, 'bin/claude'), 0o755)
}
test('A8.no-build: claude(args, cwd) runs claude in cwd, and in the current directory without one', { skip: POSIX_ONLY }, () =>
  scratch({ 'work/mtty-cwd-marker': '' }, dir => {
    writeFakeClaude(dir, '#!/bin/sh\ntest -f mtty-cwd-marker\n')
    const saved = process.env.PATH; process.env.PATH = join(dir, 'bin') + delimiter + saved
    try {
      assert.equal(claude([], join(dir, 'work')), 0); assert.equal(claude([], dir), 1); assert.equal(claude([]), 1)
    } finally { process.env.PATH = saved }
  }))

test('A8.no-build: testFiles lists the *_test.ts files under tests/, nested ones too, sorted and /-separated', () =>
  scratch({ 'tests/b_test.ts': '', 'tests/a/c_test.ts': '', 'tests/helper.ts': '', 'tests/k.test.tsx': '', 'tests/a/d_test.ts.bak': '', 'scripts/e_test.ts': '' },
    dir => assert.deepEqual(testFiles(dir), ['tests/a/c_test.ts', 'tests/b_test.ts'])))
test("A8.no-build: testCount reads the last 'ℹ tests N' line of node --test's spec reporter, colored or not", () => {
  assert.equal(testCount('✔ a (1ms)\nℹ tests 12\nℹ suites 0\n'), 12)
  assert.equal(testCount('\x1b[34mℹ tests 0\x1b[39m\n'), 0)
  assert.equal(testCount('ℹ tests 1\nℹ tests 7\n'), 7)
  assert.equal(testCount('✔ ℹ tests 5 (1ms)\n# tests 5\n'), null)
})

// fresh-clone.ts on a scratch repo whose committed smoke step exits `smoke`. The fake claude logs its cwd
// and arguments, and TMPDIR is a dir of the test's own, so the clone's removal can be seen.
const FRESH_CLONE = fileURLToPath(new URL('../../scripts/fresh-clone.ts', import.meta.url))
for (const smoke of [0, 3])
  test(`A8.no-build: fresh-clone.ts runs each step in a clone of HEAD, fails when one fails (smoke exits ${smoke}), and removes the clone`, { skip: POSIX_ONLY }, () =>
    scratch({ 'repo/package.json': '{ "type": "module" }\n',
      'repo/tests/a_test.ts': "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('a', () => assert.ok(true))\n",
      'repo/scripts/smoke.ts': `console.log('smoke cwd ' + process.cwd()); process.exitCode = ${smoke}\n` }, dir => {
      const repo = join(dir, 'repo'), tmp = join(dir, 'tmp'), log = join(dir, 'claude.log')
      writeFakeClaude(dir, `#!/bin/sh\necho "$(pwd -P) $*" >> '${log}'\n`)
      const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false',
        '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, stdio: 'pipe' })
      git('init', '-q'); git('add', '-A'); git('commit', '-q', '--no-verify', '-m', 'scratch'); mkdirSync(tmp)
      // A node --test that inherits NODE_TEST_CONTEXT from this run skips its files.
      const { NODE_TEST_CONTEXT: _, ...env } = process.env
      const r = spawnSync(process.execPath, [FRESH_CLONE], { cwd: repo, encoding: 'utf8', env: { ...env, PATH: join(dir, 'bin') + delimiter + env.PATH, TMPDIR: tmp } })
      assert.equal(r.status, smoke ? 1 : 0, r.stdout + r.stderr)
      const clone = /^smoke cwd (.+)$/m.exec(r.stdout)?.[1] ?? ''
      assert.ok(clone.startsWith(join(realpathSync(tmp), 'mtty-clone-')), clone)
      assert.equal(readFileSync(log, 'utf8'), `${clone} plugin test .\n`)
      assert.deepEqual(r.stdout.split('\n').filter(l => /^fresh-clone: (?!cloned )/.test(l)), [
        'fresh-clone: bare node --test ran more than 0 tests: yes (1)',
        'fresh-clone: ok node --test: exit 0',
        'fresh-clone: ok node --test <the walked *_test.ts list>: exit 0',
        'fresh-clone: ok claude plugin test .: exit 0',
        `fresh-clone: ${smoke ? 'FAIL' : 'ok'} node scripts/smoke.ts: exit ${smoke}`,
      ])
      assert.deepEqual(readdirSync(tmp), [])
    }))
