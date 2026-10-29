// The e2e session driver: a program run at 100×40 under node-pty or tmux, typed into and read back as cells. It needs
// node-pty and @xterm/headless, so only the e2e job, which installs scripts/e2e's packages, runs this.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { ensureSpawnHelper, ptyCommand, startSession, waitForText, type Driver } from './driver.ts'
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

// The env of a session under driver, as the e2e scenarios build it.
const envFor = (driver: Driver) => sessionEnv({ home: dir, config: join(dir, 'cfg'), mockUrl: 'http://127.0.0.1:9', platform: process.platform, color: 'truecolor', driver, path: process.env.PATH ?? '' })
const start = (driver: Driver) => startSession({ driver, argv: [process.execPath, join(dir, 'prog.mjs'), dir], cwd: dir, env: envFor(driver) })
// The tmux driver's socket, in tmux's default directory: the driver runs tmux without TMUX_TMPDIR.
const socketPath = () => join('/tmp', `tmux-${process.getuid!()}`, `mtty-${process.pid}`)
// The pid of the tmux driver's server, asked of it on that socket, as the driver runs tmux.
const serverPid = () => Number(spawnSync('tmux', ['-L', `mtty-${process.pid}`, 'display', '-p', '#{pid}'], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' }, timeout: 5000 }).stdout)
// A program that ignores hangups and starts a child that does too: it writes its pid and the child's to dir/pids, then
// ready. On Windows, a Node program does what sh does elsewhere.
writeFileSync(join(dir, 'hup.mjs'), [
  "import { spawn } from 'node:child_process'",
  "import { writeFileSync } from 'node:fs'",
  "process.on('SIGHUP', () => {})",
  "const child = spawn(process.execPath, ['-e', \"process.on('SIGHUP', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' })",
  "writeFileSync(process.argv[2] + '/pids', process.pid + ' ' + child.pid)",
  "console.log('ready')",
  'setInterval(() => {}, 1000)',
].join('\n'))
const HUP = process.platform === 'win32' ? [process.execPath, join(dir, 'hup.mjs'), dir]
  : ['/bin/sh', '-c', `trap '' HUP; sleep 1000 & echo "$$ $!" > pids; echo ready; wait`]
// A program that exits on a hangup, and whose child ignores hangups: it prints its pid, then starts the child, which
// prints its own.
writeFileSync(join(dir, 'kid.mjs'), [
  "import { spawn } from 'node:child_process'",
  "process.on('SIGHUP', () => process.exit(0))",
  "console.log('parent ' + process.pid)",
  "spawn(process.execPath, ['-e', \"process.on('SIGHUP', () => {}); console.log('child ' + process.pid); setInterval(() => {}, 1000)\"], { stdio: 'inherit' })",
  'setInterval(() => {}, 1000)',
].join('\n'))
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

for (const driver of ['pty', 'tmux'] as const) test(`A9.harness: the ${driver} driver runs a program at 100×40 in the env given, types keys into it, reads its cells, text, ANSI and OSC 52 copy, and stops it`, { skip: SKIP[driver] }, async () => {
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
    await s.key('down')
    await s.waitFor(/u001b\[B"/, 10000)
    const screen = await s.text()
    assert.equal(screen.split('\n')[3], String.raw`got "-hi\r\u000f\u001b\u001b[B"`)
    // ansi() is what the screen was drawn from: the pty stream, or capture-pane -e; its colors as escape codes.
    assert.match(await s.ansi(), /\x1b\[[0-9;]*38;2;94;129;172m读/)
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
  const s = await start('tmux')
  try {
    await s.waitFor(/ready/, 10000)
    assert.equal(existsSync(socketPath()), true)
  } finally { await s.stop() }
  assert.equal(existsSync(socketPath()), false)
})

for (const driver of ['pty', 'tmux'] as const) test(`A9.harness: under the ${driver} driver stop() ends a program that ignores hangups, and its child, within 5 s, and leaves no socket`, { skip: SKIP[driver] }, async () => {
  const s = await startSession({ driver, argv: HUP, cwd: dir, env: envFor(driver) })
  let pids: number[] = []
  try {
    await s.waitFor(/ready/, 10000)
    pids = readFileSync(join(dir, 'pids'), 'utf8').trim().split(' ').map(Number)
    assert.ok(pids.length === 2 && pids.every(p => p > 0), `pids ${pids}`)
    const t0 = Date.now()
    assert.equal(await Promise.race([s.stop().then(() => 'stopped'), sleep(6000, 'still stopping', { ref: false })]), 'stopped')
    assert.ok(Date.now() - t0 < 5000, `stop() took ${Date.now() - t0} ms`)
    for (const p of pids) assert.equal(await gone(p), true, `pid ${p}`)
    if (driver === 'tmux') assert.equal(existsSync(socketPath()), false)
  } finally { for (const p of pids) if (p > 0) try { process.kill(p, 'SIGKILL') } catch {} }
})

// The child stays in the program's process group, which outlives the program. Windows has no process groups, and
// taskkill /T cannot find the tree under a program that has exited, so there only stop() hangs the program up.
for (const early of [false, true]) for (const driver of ['pty', 'tmux'] as const) test(`A9.harness: under the ${driver} driver stop() kills the child of a program that exits on a hangup${early ? ' before stop()' : ''}, though the child ignores hangups`, { skip: SKIP[driver] || (early && process.platform === 'win32') }, async () => {
  const s = await startSession({ driver, argv: [process.execPath, join(dir, 'kid.mjs')], cwd: dir, env: envFor(driver) })
  let child = 0
  try {
    const screen = await s.waitFor(/^child \d+$/m, 10000), pidOf = (who: string) => Number(new RegExp(`^${who} (\\d+)$`, 'm').exec(screen)?.[1])
    const parent = pidOf('parent')
    child = pidOf('child')
    assert.ok(parent > 0 && child > 0, `parent ${parent}, child ${child}`)
    if (early) {
      process.kill(parent, 'SIGHUP')
      assert.equal(await gone(parent), true)
    }
    await s.stop()
    assert.deepEqual([await gone(parent), await gone(child)], [true, true])
  } finally {
    if (child > 0) try { process.kill(child, 'SIGKILL') } catch {}
    await s.stop()
  }
})

// On Windows, closing the console ends the program and what shares its console, but not a process detached from it, as
// a program's background work may be; stop() must kill the tree while the program still roots it.
writeFileSync(join(dir, 'detach.mjs'), [
  "import { spawn } from 'node:child_process'",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })",
  "console.log('parent ' + process.pid + ' child ' + child.pid)",
  'setInterval(() => {}, 1000)',
].join('\n'))
test('A9.harness: on Windows the pty driver\'s stop() kills a child detached from the program\'s console, with the program', { skip: process.platform !== 'win32' }, async () => {
  const s = await startSession({ driver: 'pty', argv: [process.execPath, join(dir, 'detach.mjs')], cwd: dir, env: envFor('pty') })
  let pids: number[] = []
  try {
    const m = /parent (\d+) child (\d+)/.exec(await s.waitFor(/parent \d+ child \d+/, 10000))
    pids = [Number(m?.[1]), Number(m?.[2])]
    await s.stop()
    assert.deepEqual([await gone(pids[0]!), await gone(pids[1]!)], [true, true])
  } finally {
    for (const p of pids) if (p > 0) try { process.kill(p, 'SIGKILL') } catch {}
    await s.stop()
  }
})

// What holds the session goes first: under tmux its server, whose end hangs the program up; under the pty driver the
// program, killed outright. With the program gone, stop() must still reach its process group. Windows, without process
// groups, is skipped as above.
for (const driver of ['pty', 'tmux'] as const) test(`A9.harness: under the ${driver} driver stop() still kills the child that ignores hangups once the ${driver === 'tmux' ? 'server' : 'program'} is gone`, { skip: SKIP[driver] || process.platform === 'win32' }, async () => {
  const s = await startSession({ driver, argv: [process.execPath, join(dir, 'kid.mjs')], cwd: dir, env: envFor(driver) })
  let pids: number[] = []
  try {
    const screen = await s.waitFor(/^child \d+$/m, 10000), pidOf = (who: string) => Number(new RegExp(`^${who} (\\d+)$`, 'm').exec(screen)?.[1])
    pids = [pidOf('parent'), pidOf('child')]
    const [parent, child] = pids as [number, number]
    assert.ok(parent > 0 && child > 0, `parent ${parent}, child ${child}`)
    if (driver === 'tmux') assert.equal(spawnSync('tmux', ['-L', `mtty-${process.pid}`, 'kill-server'], { env: { PATH: process.env.PATH ?? '' }, timeout: 5000 }).status, 0)
    else process.kill(parent, 'SIGKILL')
    assert.equal(await gone(parent), true)
    await s.stop()
    assert.deepEqual([await gone(parent), await gone(child)], [true, true])
    if (driver === 'tmux') assert.equal(existsSync(socketPath()), false)
  } finally {
    for (const p of pids) if (p > 0) try { process.kill(p, 'SIGKILL') } catch {}
    await s.stop()
  }
})

test('A9.harness: waitFor checks its deadline before each read, and abandons a read that outlasts it', async () => {
  const t0 = Date.now()
  await assert.rejects(waitForText(() => sleep(2000, ''), /never/, 100), { message: 'waitFor /never/ timed out after 100 ms; the screen:\n' })
  assert.ok(Date.now() - t0 < 300, `waitFor took ${Date.now() - t0} ms`)
})

test('A9.harness: with its tmux server suspended, waitFor still times out on time, type() fails within 2 s, and stop() ends the server, the program and the socket', { skip: SKIP.tmux }, async () => {
  const s = await start('tmux')
  let server = 0, prog = 0, resume: ReturnType<typeof spawn> | undefined
  try {
    await s.waitFor(/ready/, 10000)
    prog = pid()
    server = serverPid()
    assert.ok(server > 0 && prog > 0, `server ${server}, program ${prog}`)
    process.kill(server, 'SIGSTOP')
    // Resumes the server 5 s on, so that a read or write without a bound blocks only that long.
    resume = spawn(process.execPath, ['-e', `setTimeout(() => process.kill(${server}, 'SIGCONT'), 5000)`], { stdio: 'ignore' })
    let t0 = Date.now()
    await assert.rejects(s.waitFor(/never/, 100), { message: 'waitFor /never/ timed out after 100 ms; the screen:\n' })
    assert.ok(Date.now() - t0 < 300, `waitFor took ${Date.now() - t0} ms`)
    t0 = Date.now()
    await assert.rejects(s.type('x'), { message: 'tmux send-keys -t mtty-e2e -l -- x failed: no answer in 2000 ms' })
    assert.ok(Date.now() - t0 < 3000, `type() took ${Date.now() - t0} ms`)
    resume.kill()
    t0 = Date.now()
    await s.stop()
    assert.ok(Date.now() - t0 < 5000, `stop() took ${Date.now() - t0} ms`)
    assert.deepEqual([await gone(server), await gone(prog), existsSync(socketPath())], [true, true, false])
  } finally {
    resume?.kill()
    if (server > 0) try { process.kill(server, 'SIGCONT') } catch {}
    if (prog > 0) try { process.kill(prog, 'SIGKILL') } catch {}
    await s.stop()
  }
})

test('A9.harness: with its live tmux socket unlinked, stop() still kills the server whose pid it recorded, and the program', { skip: SKIP.tmux }, async () => {
  const s = await start('tmux')
  let server = 0, prog = 0
  try {
    await s.waitFor(/ready/, 10000)
    prog = pid()
    server = serverPid()
    assert.ok(server > 0 && prog > 0, `server ${server}, program ${prog}`)
    // No tmux command reaches the server now, kill-server included.
    rmSync(socketPath())
    await s.stop()
    assert.deepEqual([await gone(server), await gone(prog)], [true, true])
  } finally {
    for (const p of [server, prog]) if (p > 0) try { process.kill(p, 'SIGKILL') } catch {}
    await s.stop()
  }
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

test('A9.harness: on Windows the PTY driver runs a real .cmd shim, which cmd.exe /d /s /c finds on PATH as it finds claude.cmd (E2)', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'echo-hi.cmd'), '@echo off\r\necho hi\r\n')
  const s = await startSession({ driver: 'pty', argv: ['echo-hi'], cwd: dir, env: { ...envFor('pty'), PATH: bin + delimiter + (process.env.PATH ?? '') } })
  try {
    assert.deepEqual((await s.waitFor(/^hi$/m, 10000)).split('\n').filter(Boolean), ['hi'])
  } finally { await s.stop() }
})

test('A9.harness: driver.ts loads where node-pty cannot, so the tmux driver stays usable without it (E1)', () => {
  const hook = join(dir, 'no-pty.mjs')
  writeFileSync(hook, "import { registerHooks } from 'node:module'\nregisterHooks({ resolve(s, c, next) { if (s === 'node-pty') throw new Error('node-pty is unavailable'); return next(s, c) } })\n")
  const driver = JSON.stringify(new URL('./driver.ts', import.meta.url).href)
  const code = `const m = await import(${driver}); let pty = 'loaded'; try { await import('node-pty') } catch (e) { pty = e.message } console.log(typeof m.startSession, pty)`
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, '--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.deepEqual([r.stdout, r.status], ['function node-pty is unavailable\n', 0])
})
