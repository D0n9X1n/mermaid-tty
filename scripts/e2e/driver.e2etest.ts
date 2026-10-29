// The e2e session driver: a program run at 100×40 under node-pty or tmux, typed into and read back as cells. It needs
// node-pty and @xterm/headless, so only the e2e job, which installs scripts/e2e's packages, runs this.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { ensureSpawnHelper, ptyCommand, startSession, type Driver } from './driver.ts'
import { sessionEnv } from './env.ts'

// The program each session runs. It writes its pid to dir/pid; draws its size and env and a colored row; then shows on one
// line, redrawn, every byte typed so far; on the first enter copies '读 hi' with OSC 52; and on q says bye and exits. A
// hangup it answers as a program that first saves its state would: it exits 300 ms later, and errors on its closed tty
// do not end it sooner.
const PROG = String.raw`
import { writeFileSync } from 'node:fs'
writeFileSync(process.argv[2] + '/pid', String(process.pid))
process.stdin.setRawMode(true)
for (const sig of ['SIGHUP', 'SIGTERM']) process.on(sig, () => setTimeout(() => process.exit(0), 300))
process.stdin.on('error', () => {})
process.stdout.on('error', () => {})
const e = process.env
process.stdout.write(process.stdout.columns + 'x' + process.stdout.rows + ' TERM=' + e.TERM + ' USER=' + e.USER + ' TMUX=' + (e.TMUX ? 'set' : 'unset') + ' PARENT=' + (e.MTTY_PARENT ?? 'unset') + '\r\n')
process.stdout.write('\x1b[38;2;94;129;172m读\x1b[0m \x1b[38;5;110mb\x1b[0m\r\nready\r\n')
let got = '', copied = false
process.stdin.on('data', d => {
  got += d.toString('utf8')
  let out = '\r\x1b[2Kgot ' + JSON.stringify(got)
  if (!copied && got.includes('\r')) { copied = true; out += '\x1b]52;c;6K+7IGhp\x07' }
  process.stdout.write(out)
  if (got.endsWith('q')) { process.stdout.write('\r\nbye\r\n'); process.exit(0) }
})
`
const dir = mkdtempSync(join(tmpdir(), 'mtty-driver-'))
writeFileSync(join(dir, 'prog.mjs'), PROG)
after(() => rmSync(dir, { recursive: true, force: true }))
// A variable of this process's that no session may inherit.
process.env.MTTY_PARENT = 'leak'

const start = (driver: Driver) => startSession({
  driver, argv: [process.execPath, join(dir, 'prog.mjs'), dir], cwd: dir,
  env: sessionEnv({ home: dir, config: join(dir, 'cfg'), mockUrl: 'http://127.0.0.1:9', platform: process.platform, color: 'truecolor', driver, path: process.env.PATH ?? '' }),
})
// The program's first row under driver: the size, TERM and env it was given; tmux sets TMUX itself.
const first = (driver: Driver) => `100x40 TERM=xterm-256color USER=e2e TMUX=${driver === 'tmux' ? 'set' : 'unset'} PARENT=unset`
const pid = () => Number(readFileSync(join(dir, 'pid'), 'utf8'))
// Whether a process has pid.
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
// Whether no process has pid within 10 s.
async function gone(pid: number): Promise<boolean> {
  for (const end = Date.now() + 10000; Date.now() < end; await sleep(50)) if (!alive(pid)) return true
  return false
}
const SKIP = { pty: false, tmux: process.platform === 'win32' || spawnSync('tmux', ['-V']).status !== 0 }

for (const driver of ['pty', 'tmux'] as const) test(`A9.harness: the ${driver} driver runs a program at 100×40 in the env given, types keys into it, reads its cells, text and OSC 52 copy, and stops it`, { skip: SKIP[driver] }, async () => {
  const s = await start(driver)
  try {
    // The program takes a while to start, so waitFor finds ready only on a later poll; it resolves to the screen's text.
    assert.deepEqual((await s.waitFor(/ready/, 10000)).split('\n').slice(0, 4), [first(driver), '读 b', 'ready', ''])
    const row = (await s.cells())[1]!
    assert.deepEqual([row.length, row[0]!.ch, row[0]!.width, row[0]!.fg, row[1]!.width, row[3]!.ch, row[3]!.fg],
      [100, '读', 2, { mode: 'rgb', value: 0x5e81ac }, 0, 'b', { mode: 'p256', value: 110 }])
    assert.equal(await s.clipboard(), undefined)
    // Text that starts with - is typed, not taken for an option.
    await s.type('-hi')
    await s.key('enter')
    await s.key('ctrl-o')
    await s.key('escape')
    await s.waitFor(/u001b"/, 10000)
    const screen = await s.text()
    assert.equal(screen.split('\n')[3], String.raw`got "-hi\r\u000f\u001b"`)
    // The enter made the program copy.
    assert.equal(await s.clipboard(), '读 hi')
    await assert.rejects(s.waitFor(/never/, 300), { message: `waitFor /never/ timed out after 300 ms; the screen:\n${screen}` })
  } finally { await s.stop() }
  // stop() resolves once the program has exited, here 300 ms after its hangup. On Windows node-pty's exit is that of
  // cmd.exe, which may come first, so there the program is polled for.
  assert.equal(process.platform === 'win32' ? await gone(pid()) : !alive(pid()), true)
  // A second stop() resolves too.
  assert.equal(await s.stop(), undefined)
})

for (const driver of ['pty', 'tmux'] as const) test(`A9.harness: under the ${driver} driver the last screen stays readable after the program exits, and waitFor then times out with it`, { skip: SKIP[driver] }, async () => {
  const s = await start(driver)
  try {
    await s.waitFor(/ready/, 10000)
    await s.type('q')
    assert.equal(await gone((await s.waitFor(/bye/, 10000), pid())), true)
    // tmux marks the dead pane on its last row, scrolling the screen up one row.
    const screen = await s.waitFor(driver === 'tmux' ? /Pane is dead/ : /bye/, 10000), lines = screen.split('\n')
    const drawn = ['读 b', 'ready', 'got "q"', 'bye', ...Array<string>(35).fill('')]
    if (driver === 'pty') assert.deepEqual(lines, [first(driver), ...drawn])
    else assert.deepEqual([lines.slice(0, 39), /^Pane is dead \(status 0, [^)]+\)$/.test(lines[39]!)], [drawn, true])
    await assert.rejects(s.waitFor(/never/, 300), { message: `waitFor /never/ timed out after 300 ms; the screen:\n${screen}` })
  } finally { await s.stop() }
})

test('A9.harness: the tmux driver runs a server of its own, on a socket named for this process, and stop() removes the socket', { skip: SKIP.tmux }, async () => {
  const socket = join('/tmp', `tmux-${process.getuid!()}`, `mtty-${process.pid}`)
  const s = await start('tmux')
  try {
    await s.waitFor(/ready/, 10000)
    assert.equal(existsSync(socket), true)
  } finally { await s.stop() }
  assert.equal(existsSync(socket), false)
})

test('A9.harness: a PTY session starts even when npm left the prebuilt spawn-helper without its execute bit', { skip: process.platform !== 'darwin' }, async () => {
  const helper = join(dirname(createRequire(import.meta.url).resolve('node-pty/package.json')), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper')
  chmodSync(helper, 0o644)
  const s = await start('pty')
  try {
    assert.equal((await s.waitFor(/ready/, 10000)).split('\n')[2], 'ready')
    assert.equal(statSync(helper).mode & 0o777, 0o755)
  } finally { await s.stop() }
})

test('A9.harness: ensureSpawnHelper sets the execute bits of each prebuilt spawn-helper that lacks them, once, and nothing on Windows', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'mtty-pty-'))
  try {
    const file = (sub: string, name: string, mode: number) => {
      mkdirSync(join(root, 'prebuilds', sub), { recursive: true })
      const p = join(root, 'prebuilds', sub, name)
      writeFileSync(p, '')
      chmodSync(p, mode)
      return p
    }
    const arm = file('darwin-arm64', 'spawn-helper', 0o644), x64 = file('darwin-x64', 'spawn-helper', 0o755), node = file('win32-x64', 'pty.node', 0o644)
    const modes = () => [arm, x64, node].map(p => statSync(p).mode & 0o777)
    assert.deepEqual(ensureSpawnHelper(root, 'win32'), [])
    assert.deepEqual(modes(), [0o644, 0o755, 0o644])
    assert.deepEqual(ensureSpawnHelper(root, 'darwin'), [arm])
    assert.deepEqual(modes(), [0o755, 0o755, 0o644])
    assert.deepEqual(ensureSpawnHelper(root, 'darwin'), [])
    // A root without a prebuilds directory.
    assert.deepEqual(ensureSpawnHelper(join(root, 'prebuilds', 'win32-x64'), 'linux'), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('A9.harness: the PTY driver runs argv as given on Linux and macOS, and on Windows through cmd.exe /d /s /c, which finds the .cmd shim (E2)', () => {
  assert.deepEqual(ptyCommand(['claude', '--debug'], 'linux', {}), { file: 'claude', args: ['--debug'] })
  assert.deepEqual(ptyCommand(['claude'], 'darwin', { ComSpec: 'C:\\Windows\\system32\\cmd.exe' }), { file: 'claude', args: [] })
  assert.deepEqual(ptyCommand(['claude', '--debug'], 'win32', { ComSpec: 'C:\\Windows\\system32\\cmd.exe' }), { file: 'C:\\Windows\\system32\\cmd.exe', args: '/d /s /c "claude --debug"' })
  // Without ComSpec, cmd.exe; an argument with a space is quoted inside the outer quotes, which /s strips.
  assert.deepEqual(ptyCommand(['C:\\Program Files\\nodejs\\node.exe', 'p.mjs'], 'win32', {}), { file: 'cmd.exe', args: '/d /s /c ""C:\\Program Files\\nodejs\\node.exe" p.mjs"' })
})

test('A9.harness: driver.ts loads where node-pty cannot, so the tmux driver stays usable without it (E1)', () => {
  const hook = join(dir, 'no-pty.mjs')
  writeFileSync(hook, "import { registerHooks } from 'node:module'\nregisterHooks({ resolve(s, c, next) { if (s === 'node-pty') throw new Error('node-pty is unavailable'); return next(s, c) } })\n")
  const driver = JSON.stringify(new URL('./driver.ts', import.meta.url).href)
  const code = `const m = await import(${driver}); let pty = 'loaded'; try { await import('node-pty') } catch (e) { pty = e.message } console.log(typeof m.startSession, pty)`
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, '--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.deepEqual([r.stdout, r.status], ['function node-pty is unavailable\n', 0])
})
