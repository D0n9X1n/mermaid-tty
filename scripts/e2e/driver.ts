// The e2e session driver: runs a program, in the e2e scenarios a real Claude Code, at 100×40, types into it and reads its
// screen back as cells. The pty driver runs it under node-pty and parses its output into a screen. The tmux driver, E1's
// fallback on Linux and macOS, runs it in a tmux server of its own and parses each read's capture-pane into a fresh screen.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Driver } from './env.ts'
import { createScreen, type Cell } from './screen.ts'

export type { Driver }
export type Key = 'enter' | 'ctrl-o' | 'escape'
// A running session. Its reads are async: the tmux driver captures and parses a screen, and the pty driver first parses
// all the output it has received.
export type Session = {
  type(text: string): Promise<void>
  key(k: Key): Promise<void>
  // Polls the screen's text every 100 ms until re matches it, and resolves to that text; after ms, throws with the last.
  waitFor(re: RegExp, ms: number): Promise<string>
  cells(): Promise<Cell[][]>
  text(): Promise<string>
  // The last text the program copied with OSC 52, or undefined before any.
  clipboard(): Promise<string | undefined>
  // Hangs the program up and resolves once it has exited (on Windows, once cmd.exe has); called again, resolves at once.
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

// text() polled every 100 ms until re matches it: resolves to the text it matched; after ms, throws with the last text.
async function poll(text: () => Promise<string>, re: RegExp, ms: number): Promise<string> {
  const end = Date.now() + ms
  for (;;) {
    const t = await text()
    if (t.search(re) >= 0) return t
    if (Date.now() >= end) throw new Error(`waitFor ${re} timed out after ${ms} ms; the screen:\n${t}`)
    await sleep(100)
  }
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
    waitFor: (re, ms) => poll(text, re, ms),
    cells: () => read(screen.cells),
    text,
    clipboard: () => read(screen.clipboard),
    stop: () => { if (!exited) p.kill(); return exit },
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
// Runs tmux on the server under env -i with env alone: no variable of this process's reaches the server, whose
// environment each pane inherits. Returns its stdout; throws with its stderr when it fails.
function tmux(env: Record<string, string>, args: string[]): string {
  const r = spawnSync('env', ['-i', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), 'tmux', '-L', SOCKET, ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`tmux ${args.join(' ')} failed: ${r.error?.message ?? r.stderr.trim()}`)
  return r.stdout
}

// The server sizes its window 100×40 with no client attached; gives the pane the pty driver's TERM rather than its own;
// keeps an OSC 52 copy as a buffer; and keeps the pane after its program exits, so that its last screen stays readable.
function tmuxSession(o: SessionOptions): Session {
  const run = (...args: string[]) => tmux(o.env, args)
  run('-f', '/dev/null',
    'set', '-g', 'window-size', 'manual', ';', 'set', '-g', 'default-size', `${COLS}x${ROWS}`, ';',
    'set', '-g', 'default-terminal', 'xterm-256color', ';', 'set', '-g', 'set-clipboard', 'on', ';',
    'set', '-g', 'remain-on-exit', 'on', ';',
    'new-session', '-d', '-s', 'mtty-e2e', '-x', String(COLS), '-y', String(ROWS), '-c', o.cwd, '--', ...o.argv)
  // capture-pane ends each row with \n. The screen needs \r\n between rows and none after the last, which would scroll it.
  const capture = async () => {
    const screen = createScreen(COLS, ROWS)
    await screen.write(run('capture-pane', '-p', '-e', '-t', 'mtty-e2e').replace(/\n$/, '').replaceAll('\n', '\r\n'))
    return screen
  }
  const text = async () => (await capture()).text()
  let stopped = false
  return {
    type: async t => { run('send-keys', '-t', 'mtty-e2e', '-l', '--', t) },
    key: async k => { run('send-keys', '-t', 'mtty-e2e', TMUX_KEYS[k]) },
    waitFor: (re, ms) => poll(text, re, ms),
    cells: async () => (await capture()).cells(),
    text,
    clipboard: async () => {
      try { return run('show-buffer') } catch (e) {
        if (e instanceof Error && e.message.endsWith('no buffers')) return undefined
        throw e
      }
    },
    // stop() hangs the program up as node-pty's kill() does, with SIGHUP while its tty is still open, and waits for it
    // to exit, which a program that first saves its state does later; a dead pane has no pid. Only then does it end the
    // server, and remove the socket tmux leaves behind: on macOS a Node program whose tty closes under it may stall
    // rather than exit.
    stop: async () => {
      if (stopped) return
      stopped = true
      const pid = Number(run('display', '-p', '-t', 'mtty-e2e', '#{pane_pid}')), socket = run('display', '-p', '#{socket_path}').trim()
      if (pid > 0) {
        // The program may have exited since; then there is nothing to hang up.
        try { process.kill(pid, 'SIGHUP') } catch {}
        while (alive(pid)) await sleep(50)
      }
      run('kill-server')
      rmSync(socket, { force: true })
    },
  }
}

// Whether a process has pid.
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
