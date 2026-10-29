// The e2e session driver: runs a program, in the e2e scenarios a real Claude Code, at 100×40, types into it and reads its
// screen back as cells. The pty driver runs it under node-pty and parses its output into a screen. The tmux driver, E1's
// fallback on Linux and macOS, runs it in a tmux server of its own and parses each read's capture-pane into a fresh screen.
import { execFile, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Driver } from './env.ts'
import { createScreen, type Cell } from './screen.ts'

export type { Driver }
export type Key = 'enter' | 'ctrl-o' | 'escape'
// A running session. Its reads are async: the tmux driver captures and parses a screen, and the pty driver first parses
// all the output it has received. Under the tmux driver, a command the server does not answer within 2 s fails.
export type Session = {
  type(text: string): Promise<void>
  key(k: Key): Promise<void>
  // Polls the screen's text every 100 ms until re matches it, and resolves to that text; after ms, throws with the last
  // text read. A read still pending at ms is abandoned, so it throws on time.
  waitFor(re: RegExp, ms: number): Promise<string>
  cells(): Promise<Cell[][]>
  text(): Promise<string>
  // The last text the program copied with OSC 52, or undefined before any.
  clipboard(): Promise<string | undefined>
  // Hangs the program up; if it has not exited within 2 s, kills its process group (on Windows, its tree). Resolves once it
  // has exited (on Windows, once cmd.exe has), and at the latest 3 s after the hangup (4 s on Windows), plus, under tmux,
  // up to 2 s for each of its two server commands. Never throws, even if the program or the server is gone already.
  // Called again, resolves at once.
  stop(): Promise<void>
}
// env is the session's whole env, as sessionEnv builds it.
export type SessionOptions = { driver: Driver; argv: string[]; cwd: string; env: Record<string, string> }

const COLS = 100, ROWS = 40
const PTY_KEYS: Record<Key, string> = { enter: '\r', 'ctrl-o': '\x0f', escape: '\x1b' }
const TMUX_KEYS: Record<Key, string> = { enter: 'Enter', 'ctrl-o': 'C-o', escape: 'Escape' }

export async function startSession(o: SessionOptions): Promise<Session> {
  return o.driver === 'pty' ? ptySession(o) : tmuxSession(o)
}

// read() polled every 100 ms until re matches the text it resolves to: resolves to that text; after ms, throws with the last
// text read. The deadline is checked before each read, and a read still pending at it is aborted and abandoned, so that a
// read that hangs cannot hold waitFor past ms.
export async function waitForText(read: (signal: AbortSignal) => Promise<string>, re: RegExp, ms: number): Promise<string> {
  const deadline = Date.now() + ms
  let last = ''
  for (let left = ms; left > 0; left = deadline - Date.now()) {
    const abort = new AbortController(), t = await within(read(abort.signal), left)
    if (t === LATE) { abort.abort(); break }
    if (t.search(re) >= 0) return t
    last = t
    await sleep(Math.min(100, Math.max(0, deadline - Date.now())))
  }
  throw new Error(`waitFor ${re} timed out after ${ms} ms; the screen:\n${last}`)
}

// How long stop() waits for a program to exit after its hangup, then after it is killed.
const HUP_MS = 2000, KILL_MS = 1000
// p's value, or LATE if it has not settled within ms.
const LATE = Symbol('late')
async function within<T>(p: Promise<T>, ms: number): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([p, new Promise<typeof LATE>(resolve => { timer = setTimeout(resolve, ms, LATE) })]) }
  finally { clearTimeout(timer) }
}
// Whether a process has pid; whether none has within ms.
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
async function gone(pid: number, ms: number): Promise<boolean> {
  for (const until = Date.now() + ms; alive(pid); await sleep(50)) if (Date.now() >= until) return false
  return true
}
// Ends a program as closing its terminal would: hangUp; then, if it has not exited within HUP_MS, kill its process group
// or tree, and wait up to KILL_MS more. Neither step throws for a program that has already exited.
async function end(hangUp: () => void, exited: (ms: number) => Promise<boolean>, kill: () => void): Promise<void> {
  try { hangUp() } catch {}
  if (await exited(HUP_MS)) return
  try { kill() } catch {}
  await exited(KILL_MS)
}
// Kills pid and every process under it: on Windows its tree, with taskkill /T /F; elsewhere its process group, which
// node-pty and tmux each make it lead.
function killTree(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: KILL_MS })
  else process.kill(-pid, 'SIGKILL')
}

// node-pty feeds the program's output to a screen. node-pty is imported here, not at the top: where it cannot load, the
// tmux driver still can (E1).
async function ptySession(o: SessionOptions): Promise<Session> {
  const { spawn } = await import('node-pty')
  ensureSpawnHelper()
  const { file, args } = ptyCommand(o.argv, process.platform, o.env)
  const screen = createScreen(COLS, ROWS)
  const p = spawn(file, args, { name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: o.cwd, env: o.env })
  // parsed resolves once the screen has parsed the output received so far: the screen parses writes in order.
  let parsed = Promise.resolve(), exited = false
  p.onData(d => { parsed = screen.write(d) })
  const exit = new Promise<void>(resolve => p.onExit(() => { exited = true; resolve() }))
  const read = async <T>(f: () => T) => { await parsed; return f() }
  const text = () => read(screen.text)
  return {
    type: async t => { p.write(t) },
    key: async k => { p.write(PTY_KEYS[k]) },
    waitFor: (re, ms) => waitForText(text, re, ms),
    cells: () => read(screen.cells),
    text,
    clipboard: () => read(screen.clipboard),
    stop: async () => { if (!exited) await end(() => p.kill(), ms => within(exit, ms).then(r => r !== LATE), () => killTree(p.pid)) },
  }
}

// node-pty's own directory. Its package.json is resolved, not loaded, which works where its native module cannot load.
const ptyRoot = () => dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
// Sets the execute bits of each prebuilt spawn-helper under root's prebuilds that lacks them, and returns those helpers.
// node-pty 1.1.0 installs its macOS spawn-helper without them, and spawns every program on macOS through it. Nothing on
// Windows, which has no spawn-helper and no execute bits. A helper built from source, under build/, is executable already.
export function ensureSpawnHelper(root = ptyRoot(), platform: string = process.platform): string[] {
  const prebuilds = join(root, 'prebuilds'), fixed: string[] = []
  if (platform === 'win32' || !existsSync(prebuilds)) return fixed
  for (const d of readdirSync(prebuilds)) {
    const helper = join(prebuilds, d, 'spawn-helper')
    if (!existsSync(helper)) continue
    const mode = statSync(helper).mode & 0o7777
    if ((mode & 0o111) === 0o111) continue
    chmodSync(helper, mode | 0o111)
    fixed.push(helper)
  }
  return fixed
}

// The file and args node-pty spawns for argv. On Windows, cmd.exe /d /s /c runs argv, as Node's shell option does: only
// cmd.exe finds an npm shim such as claude.cmd through PATHEXT (E2). The args are then one command line, which /s strips
// of its outer quotes; an argument with a space keeps its own, and no other cmd.exe metacharacter is escaped.
export function ptyCommand(argv: string[], platform: string, env: Record<string, string>): { file: string; args: string[] | string } {
  const [file = '', ...args] = argv
  if (platform !== 'win32') return { file, args }
  const line = argv.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')
  return { file: env.ComSpec ?? 'cmd.exe', args: `/d /s /c "${line}"` }
}

// The tmux driver's server, on a socket of its own, so that no other server's options or sessions apply.
const SOCKET = `mtty-${process.pid}`
// The longest the driver waits for a tmux command; a server that has not answered by then is taken to hang.
const CMD_MS = 2000
// A tmux command that got no answer within CMD_MS.
class TmuxTimeout extends Error {}
// tmux on the server, under env -i with env alone: no variable of this process's reaches the server, whose environment
// each pane inherits.
const tmuxArgv = (env: Record<string, string>, args: string[]) => ['-i', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), 'tmux', '-L', SOCKET, ...args]
// Runs tmux and returns its stdout. Throws with its stderr when it fails, and a TmuxTimeout when it gets no answer.
function tmux(env: Record<string, string>, args: string[]): string {
  const r = spawnSync('env', tmuxArgv(env, args), { encoding: 'utf8', timeout: CMD_MS, killSignal: 'SIGKILL' })
  if ((r.error as { code?: string } | undefined)?.code === 'ETIMEDOUT') throw new TmuxTimeout(`tmux ${args.join(' ')} failed: no answer in ${CMD_MS} ms`)
  if (r.status !== 0) throw new Error(`tmux ${args.join(' ')} failed: ${r.error?.message ?? r.stderr.trim()}`)
  return r.stdout
}
// tmux for a read: as tmux(), but async, so that the event loop runs on while it waits, and signal can abort it.
function tmuxRead(env: Record<string, string>, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => execFile('env', tmuxArgv(env, args), { encoding: 'utf8', timeout: CMD_MS, killSignal: 'SIGKILL', signal },
    (e, stdout, stderr) => (e ? reject(new Error(`tmux ${args.join(' ')} failed: ${e.killed ? `no answer in ${CMD_MS} ms` : stderr.trim() || e.message}`)) : resolve(stdout))))
}

// The server sizes its window 100×40 with no client attached; gives the pane the pty driver's TERM rather than its own;
// keeps an OSC 52 copy as a buffer; and keeps the pane after its program exits, so that its last screen stays readable.
function tmuxSession(o: SessionOptions): Session {
  const run = (...args: string[]) => tmux(o.env, args)
  // new-session prints the server's pid, the program's and the socket's path.
  const started = run('-f', '/dev/null',
    'set', '-g', 'window-size', 'manual', ';', 'set', '-g', 'default-size', `${COLS}x${ROWS}`, ';',
    'set', '-g', 'default-terminal', 'xterm-256color', ';', 'set', '-g', 'set-clipboard', 'on', ';',
    'set', '-g', 'remain-on-exit', 'on', ';',
    'new-session', '-d', '-P', '-F', '#{pid} #{pane_pid} #{socket_path}', '-s', 'mtty-e2e', '-x', String(COLS), '-y', String(ROWS),
    '-c', o.cwd, '--', ...o.argv).trim().split(' ')
  const server = Number(started[0]), pane = Number(started[1]), socket = started.slice(2).join(' ')
  // capture-pane ends each row with \n. The screen needs \r\n between rows and none after the last, which would scroll it.
  const capture = async (signal?: AbortSignal) => {
    const screen = createScreen(COLS, ROWS)
    await screen.write((await tmuxRead(o.env, ['capture-pane', '-p', '-e', '-t', 'mtty-e2e'], signal)).replace(/\n$/, '').replaceAll('\n', '\r\n'))
    return screen
  }
  const text = async (signal?: AbortSignal) => (await capture(signal)).text()
  let stopped = false
  return {
    type: async t => { run('send-keys', '-t', 'mtty-e2e', '-l', '--', t) },
    key: async k => { run('send-keys', '-t', 'mtty-e2e', TMUX_KEYS[k]) },
    waitFor: (re, ms) => waitForText(text, re, ms),
    cells: async () => (await capture()).cells(),
    text,
    clipboard: async () => {
      try { return await tmuxRead(o.env, ['show-buffer']) } catch (e) {
        if (e instanceof Error && e.message.endsWith('no buffers')) return undefined
        throw e
      }
    },
    // stop() ends the program as the pty driver does: SIGHUP while its tty is still open, then if need be SIGKILL to its
    // process group; a dead pane has no pid. Only then does it end the server, and remove the socket tmux leaves behind:
    // on macOS a Node program whose tty closes under it may stall rather than exit. It never throws, as the server may be
    // gone already.
    stop: async () => {
      if (stopped) return
      stopped = true
      try {
        const pid = Number(run('display', '-p', '-t', 'mtty-e2e', '#{pane_pid}'))
        if (pid > 0) await end(() => process.kill(pid, 'SIGHUP'), ms => gone(pid, ms), () => killTree(pid))
        run('kill-server')
      } catch (e) {
        // A server that does not answer can neither end nor reap the program, so stop() kills both.
        if (e instanceof TmuxTimeout) {
          if (server > 0) try { process.kill(server, 'SIGKILL') } catch {}
          if (pane > 0) try { killTree(pane) } catch {}
        }
      }
      rmSync(socket, { force: true })
    },
  }
}
