// node scripts/e2e/run.ts [--claude-version V] [--theme default|nord|dracula|gruvbox|solarized|mono|all]
//   [--installed CONFIG_DIR] [--color truecolor|256] [--driver pty|tmux] [--scenario
//   harness|source-view|stored|lead|btw|btw-resumed|btw-fresh|crossing|all] [--keep]
// The e2e scenarios (A9): a real Claude Code, installed from npm at the pinned version, loads this repo with
// --plugin-dir
// in a fresh config against the mock Messages API, and each scenario reads its screen. Each run is one theme, color and
// scenario in a session of its own. Prints PASS|FAIL <os> <theme> <color> <scenario> per run, each run's problems under
// it, and a summary line; exits 1 on any FAIL. --keep keeps each run's temp dir, with screen.ansi in it, and under tmux
// leaves the last run's session up to attach to.
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { THEMES, type ThemeName } from '../../core/themes.ts'
import { removeSandbox } from './cleanup.ts'
import { checkDiagramScreen, drawnDiagrams, drawnRows, sourceShown, type ColorCheck } from './assert.ts'
import { startSession, TMUX_SOCKET, type Session } from './driver.ts'
import type { Cell } from './screen.ts'
import { mergeJson, sessionEnv, seedConfig, seedSettings, type Color, type Driver } from './env.ts'
import { asksLast, startMock, type Mock } from './mock.ts'
import { REPLY, REPLY_BTW, REPLY_CROSS, REPLY_LEAD } from './reply.ts'
import { BTW_STATUS } from '../../hooks/btw.ts'
import { splitFences } from '../../hooks/fences.ts'
import { atLeast } from '../lib/cc-versions.ts'
import { isMain } from '../lib/is-main.ts'
import { clipboardStubs, fenceBody, findReply } from './stored.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const win = process.platform === 'win32'
const THEME_NAMES = ['default', 'nord', 'dracula', 'gruvbox', 'solarized', 'mono'] as const
const SCENARIOS = ['harness', 'source-view', 'stored', 'lead', 'btw', 'btw-resumed', 'btw-fresh', 'crossing'] as const
type Scenario = (typeof SCENARIOS)[number]
type Run = { theme: ThemeName; color: Color }

// v, when it is one of allowed; else exits 2 saying what --name takes.
function oneOf<T extends string>(name: string, v: string, allowed: readonly T[]): T {
  if (allowed.includes(v as T)) {
    return v as T
  }

  console.error(`--${name} ${v}: expected ${allowed.join('|')}`)
  process.exit(2)
}

// The runs: --theme's themes, each in --color; by default each in truecolor, plus one 256-color run under nord.
function runsFor(theme: string, color: string | undefined): Run[] {
  const themes = theme === 'all' ? [...THEME_NAMES] : [oneOf('theme', theme, THEME_NAMES)]
  if (color !== undefined) {
    return themes.map((t) => ({ theme: t, color: oneOf('color', color, ['truecolor', '256'] as const) }))
  }

  return [
    ...themes.map((t) => ({ theme: t, color: 'truecolor' as const })),
    ...(themes.includes('nord') ? [{ theme: 'nord' as const, color: '256' as const }] : []),
  ]
}

// Claude Code V, installed once into <tmpdir>/mtty-cc-V and reused while it runs: its binary (on Windows, npm's .cmd
// shim, which only a shell runs). npm may skip the package's postinstall, which puts the native binary in place of its
// placeholder; then its install.cjs is run here.
function installClaude(v: string): string {
  const dir = join(tmpdir(), `mtty-cc-${v}`)
  const bin = join(dir, 'node_modules', '.bin', win ? 'claude.cmd' : 'claude')
  const pkg = join(dir, 'node_modules', '@anthropic-ai', 'claude-code')
  const works = () =>
    existsSync(bin) &&
    (spawnSync(bin, ['--version'], { encoding: 'utf8', shell: win, timeout: 60000 }).stdout ?? '').includes(v)
  if (works()) {
    return bin
  }

  const npm = spawnSync('npm', ['install', '--prefix', dir, `@anthropic-ai/claude-code@${v}`], {
    encoding: 'utf8',
    shell: win,
  })
  if (npm.status !== 0) {
    throw new Error(`npm install @anthropic-ai/claude-code@${v} failed:\n${npm.stderr}`)
  }

  if (!works()) {
    spawnSync(process.execPath, [join(pkg, 'install.cjs')], { cwd: pkg, stdio: 'inherit' })
  }

  if (!works()) {
    throw new Error(`claude ${v} does not run from ${bin}`)
  }

  return bin
}

// What a scenario gets: its session, its run, its sandbox's config dir and temp dir, the mock it talks to, and resume,
// which ends the session and continues its conversation in a new one, as claude --continue does, and resolves to it.
type Ctx = {
  s: Session
  run: Run
  config: string
  base: string
  copied: string
  mock: Mock
  resume: () => Promise<Session>
}
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
// The prompt line showing text. Claude Code follows ❯ with a no-break space, which \s matches, where a plain space
// would not.
const promptLine = (text: string) => new RegExp(`❯\\s${escape(text)}`)
// Types text at the prompt, waits until the prompt line shows it, then presses enter.
async function submit(s: Session, text: string): Promise<void> {
  await s.type(text)
  await s.waitFor(promptLine(text), 5000)
  await s.key('enter')
}
// Waits until Claude Code offers mermaid-tty's own command as /mermaid-tty is typed, which the plugin registers as its
// session starts, so its hooks have run; then erases what was typed, sending nothing.
async function pluginLoaded(s: Session): Promise<void> {
  const typed = '/mermaid-tty'
  await s.type(typed)
  await s.waitFor(/Show Mermaid diagrams/, 30000)
  for (let i = 0; i < typed.length; i++) {
    await s.key('backspace')
  }

  await s.waitFor(/^(?![\s\S]*Show Mermaid diagrams)/, 5000)
}

// Asks the mock's REPLY for, and waits until the screen shows its last prose line, then lets the drawing settle.
async function showDiagrams(s: Session): Promise<void> {
  await submit(s, 'Show the diagrams')
  await s.waitFor(/Unclosed:/, 30000)
  await sleep(500)
}

// One run of one scenario, in a sandbox of its own: a temp HOME, config dir and cwd, the mock, and the seeded config.
// Resolves to its problems, [] when it passes. Under --keep the sandbox stays, with screen.ansi in it, and keepUp
// leaves a tmux session up. With installed (A9.release), that config dir, where the plugin is installed, is the
// session's: the seeds are merged into its files, and the session starts without --plugin-dir. version is Claude
// Code's.
async function runOne(
  claude: string,
  version: string,
  run: Run,
  driver: Driver,
  scenario: Scenario,
  keep: boolean,
  keepUp: boolean,
  installed?: string,
): Promise<string[]> {
  const base = await realpath(mkdtempSync(join(tmpdir(), 'mtty-')))
  const [home, cwd, bin] = ['home', 'cwd', 'bin'].map((d) => join(base, d)) as [string, string, string]
  const config = installed ?? join(base, 'config')
  for (const d of [home, cwd, bin, ...(installed ? [] : [config])]) {
    mkdirSync(d)
  }
  // The clipboard stubs, first on PATH: the stored scenario's /copy writes to copied.
  const copied = join(base, 'copied.txt')
  for (const [name, script] of Object.entries(clipboardStubs(process.platform, copied))) {
    writeFileSync(join(bin, name), script)
    chmodSync(join(bin, name), 0o755)
  }

  const mock = await startMock()
  let s: Session | undefined
  try {
    const seed = (file: string, json: string) =>
      writeFileSync(
        join(config, file),
        existsSync(join(config, file)) ? mergeJson(readFileSync(join(config, file), 'utf8'), json) : json,
      )
    seed('.claude.json', seedConfig(cwd, 'dummy', process.platform))
    seed('settings.json', seedSettings(run.theme))
    const env = sessionEnv({
      home,
      config,
      mockUrl: mock.url,
      platform: process.platform,
      color: run.color,
      driver,
      path: [bin, process.env.PATH ?? ''].join(delimiter),
    })
    // A /btw scenario's layout is set for its own sessions alone, by a settings file on the command line: an installed
    // config dir is shared by every run, so a setting saved there would carry into the next.
    const isBtw = scenario.startsWith('btw') && atLeast(version, ROWS_FROM)
    const layout = join(base, 'fullscreen.json')
    if (isBtw) {
      writeFileSync(layout, FULLSCREEN)
    }

    const argv = [
      ...(installed ? [claude] : [claude, '--plugin-dir', repoRoot]),
      ...(isBtw ? ['--settings', layout] : []),
    ]
    const cols = isBtw ? BTW_COLUMNS : undefined
    s = await startSession({ driver, argv, cwd, env, cols })
    await s.waitFor(/❯/, 15000)
    const resume = async () => {
      await s?.stop()
      s = await startSession({ driver, argv: [...argv, '--continue'], cwd, env, cols })
      await s.waitFor(/❯/, 15000)
      return s
    }
    return await SCENARIO_RUN[scenario]({ s, run, config, base, copied, mock, resume })
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  } finally {
    if (s && keep) {
      writeFileSync(join(base, 'screen.ansi'), await s.ansi().catch((e) => String(e)))
    }

    if (s && !keepUp) {
      await s.stop()
    }

    await mock.stop()
    // A sandbox left behind is a warning, not a problem of the run's, and ends no later run.
    const left = keep ? undefined : removeSandbox(base)
    if (left) {
      console.log(left)
    }

    if (keep) {
      console.log(`kept ${base}${keepUp ? `; attach with: tmux -L ${TMUX_SOCKET} attach -t mtty-e2e` : ''}`)
    }
  }
}

// REPLY's labels by role, its prose lines, and every line of its two drawn diagrams' source, which holds those labels
// too.
const LABELS = { 读取配置文件: 'node', '完成?': 'decision', 结束: 'node', User: 'node', ping: 'label' }
const PROSE = ['Here is the config flow:', 'And the handshake:', 'This one stays source:', 'Unclosed:']
const LEAD_SOURCE = fenceBody(REPLY_LEAD).split('\n')
const SOURCE = splitFences(REPLY)
  .filter((f) => f.kind === 'mermaid')
  .slice(0, 2)
  .flatMap((f) => (f.kind === 'mermaid' ? f.body.split('\n') : []))
// The width the expected rows are drawn at: the session's (driver.ts's COLS). The replies' diagrams draw the same at
// any width from it down to well under it, so Claude Code's margins do not change them; REPLY_BTW's, from 90 columns
// up, so they draw the same in the /btw scenarios' wider sessions too.
const DRAW_COLUMNS = 100
// The /btw scenarios' session on a Claude Code that places transcript rows (ROWS_FROM): 130 columns, in Claude Code's
// fullscreen layout, where a pane docks beside the transcript at 45% of the terminal, 57 columns, too narrow for
// REPLY_BTW's flowchart, which a transcript row draws whole. An earlier Claude Code answers in the pane, which is drawn
// above the prompt at the session's full width in its own 100 columns.
const BTW_COLUMNS = 130
const ROWS_FROM = '2.1.314'
const FULLSCREEN = JSON.stringify({ tui: 'fullscreen' })
// REPLY_BTW's diagram lines past its header, which nothing but the answer holds.
const BTW_LINES = fenceBody(REPLY_BTW).split('\n').slice(1)
// The color a run's diagram rows must carry: none under mono (A3), else its color mode.
const colorOf = (r: Run): ColorCheck => (r.theme === 'mono' ? 'none' : r.color)
// A curated palette's role colors, as 0xRRGGBB; none for default, which follows the user's Claude Code theme, and mono.
function hexOf(r: Run): Record<string, number> | undefined {
  if (r.theme === 'default' || r.theme === 'mono') {
    return undefined
  }

  return Object.fromEntries(Object.entries(THEMES[r.theme].roles).map(([role, c]) => [role, parseInt(c!.slice(1), 16)]))
}
// The drawn screen's problems: REPLY's drawn diagrams' rows as the renderer draws them, in order, each label in its
// role's color, the prose once, and the fences left as source shown so.
async function drawnScreen({ s, run }: Ctx): Promise<string[]> {
  const diagrams = drawnDiagrams(REPLY, DRAW_COLUMNS, run.theme)
  const problems = checkDiagramScreen(await s.cells(), {
    labels: LABELS,
    prose: PROSE,
    diagrams,
    color: colorOf(run),
    hex: hexOf(run),
  })
  const text = await s.text()
  for (const line of ['flowchart-elk TD', 'X --> Y', 'A --> B']) {
    if (!text.includes(line)) {
      problems.push(`${line}: expected as source`)
    }
  }

  return [...problems, ...sourceShown(text, SOURCE)]
}

// harness: REPLY's diagrams drawn in the run's colors, the prose intact, the other fences as source.
async function harness(c: Ctx): Promise<string[]> {
  await showDiagrams(c.s)
  return drawnScreen(c)
}

// source-view: /mermaid-tty source shows each diagram's source, on screen and under ctrl+o; /mermaid-tty diagram draws
// them again, on the reply already on screen too.
async function sourceView(c: Ctx): Promise<string[]> {
  const { s } = c
  const problems: string[] = []
  const labels = Object.keys(LABELS)
  const asSource = (where: string, text: string) => {
    for (const line of SOURCE) {
      if (!text.includes(line)) {
        problems.push(`${where}: ${line} not shown`)
      }
    }

    for (const row of drawnRows(text, labels, SOURCE)) {
      problems.push(`${where}: drawn row ${JSON.stringify(row.trim())}`)
    }
  }
  await showDiagrams(s)
  await submit(s, '/mermaid-tty source')
  asSource(
    'source',
    await s
      .waitFor(/showing diagrams as source/, 10000)
      .then(() => sleep(500))
      .then(() => s.text()),
  )
  await s.key('ctrl-o')
  asSource(
    'ctrl+o',
    await s
      .waitFor(/detailed transcript/, 10000)
      .then(() => sleep(500))
      .then(() => s.text()),
  )
  await s.key('ctrl-o')
  await s.waitFor(/^(?![\s\S]*detailed transcript)/, 10000)
  await submit(s, '/mermaid-tty diagram')
  await s.waitFor(/drawing diagrams/, 10000)
  await s.waitFor(/^(?![\s\S]*A\[读取配置文件\])/, 10000)
  await sleep(500)
  return [...problems, ...(await drawnScreen(c))]
}

// lead: a reply that opens on its diagram draws it, not its source, and draws its bullet on no row of its own: no row
// between the prompt line and the diagram's first row holds only the bullet.
async function lead({ s, run }: Ctx): Promise<string[]> {
  await submit(s, 'lead')
  await s.waitFor(/After the diagram\./, 30000)
  await sleep(500)
  const cells = await s.cells()
  const text = await s.text()
  const rows = text.split('\n')
  const diagrams = drawnDiagrams(REPLY_LEAD, DRAW_COLUMNS, run.theme)
  const problems = checkDiagramScreen(cells, {
    labels: { 开始: 'node', 结束: 'node' },
    prose: ['After the diagram.'],
    diagrams,
    color: colorOf(run),
    hex: hexOf(run),
  })
  problems.push(...sourceShown(text, LEAD_SOURCE))
  const from = rows.findIndex((r) => promptLine('lead').test(r))
  const to = rows.findIndex((r) => r.includes('开始'))
  if (from < 0 || to < from) {
    return [...problems, 'lead: prompt line or diagram not found']
  }

  for (const r of rows.slice(from + 1, to)) {
    if (r.trim() === '⏺') {
      problems.push('lead: a row holds only the reply bullet (D5)')
    }
  }

  return problems
}

// btw: while a /btw side question asked after a reply is answered, mermaid-tty's status row says so; then the answer
// shows in a transcript row of mermaid-tty's at the transcript's full width, its diagram drawn as written, not its
// source nor turned top to bottom, the status row gone, and nothing of it reaches the stored transcript. With resumed,
// the /btw is asked in a session that continues that conversation and has sent nothing yet, so there is no request of
// its own a fork could share: mermaid-tty still answers it. With fresh, it is asked before any prompt, in a session
// with no conversation at all: mermaid-tty answers the question alone.
async function btw(c: Ctx, resumed = false, fresh = false): Promise<string[]> {
  const { run, config, mock } = c
  let s = c.s
  const problems: string[] = []
  const since = Date.now() - 1000
  // A short reply first, so the session has a transcript to fork and the pane has room on screen. A fresh session sends
  // none: it waits for mermaid-tty to be loaded instead, since Claude Code shows its prompt before it has run a
  // plugin's hooks, and a /btw sent in that time is its own, whatever the plugin does.
  if (fresh) {
    await pluginLoaded(s)
  } else {
    await submit(s, 'lead')
    await s.waitFor(/After the diagram\./, 30000)
  }

  if (resumed) {
    s = await c.resume()
    await s.waitFor(/After the diagram\./, 30000)
  }

  // The answer is held until the row has been read, so the row is read while the fork runs: only once the side question
  // has reached the mock, and always let go, so no failure here leaves the session waiting on it.
  const hold = mock.holdSide()
  try {
    await submit(s, '/btw what does it do?')
    const wait = new AbortController()
    const came = await Promise.race([
      hold.arrived.then(() => true),
      sleep(15000, false, { signal: wait.signal }).catch(() => false),
    ])
    wait.abort()
    if (!came) {
      throw new Error('the side question never reached the mock')
    }

    await s.waitFor(new RegExp(escape(BTW_STATUS)), 15000)
  } catch (e) {
    problems.push(`btw: no status row while answering: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    hold.release()
  }

  await s.waitFor(/Side done\./, 30000)
  await sleep(500)
  const text = await s.text()
  // The answer row's lines inside its frame: each line from a │ in the first column to the last │ on it, wherever the
  // row's width ends it.
  const inside = (await s.cells()).map((row) => {
    const end = row.findLastIndex((c) => c.ch === '│')
    return row[0]?.ch === '│' && end > 0 ? row.slice(1, end) : row
  })
  problems.push(
    ...checkDiagramScreen(inside, {
      labels: { 侧问: 'node', 回答: 'node' },
      prose: ['Side answer:', 'Side done.'],
      diagrams: drawnDiagrams(REPLY_BTW, DRAW_COLUMNS, run.theme),
      color: colorOf(run),
      hex: hexOf(run),
    }),
  )
  problems.push(...sourceShown(text, fenceBody(REPLY_BTW).split('\n')))
  if (text.includes(BTW_STATUS)) {
    problems.push('btw: the status row stays once the answer shows')
  }

  if (!text.includes('/btw what does it do?')) {
    problems.push('btw: the answer row does not show the question')
  }

  // The main thread's next request holds none of the answer row: a row is display only.
  const sent = mock.requests().length
  await submit(s, 'lead again')
  const main =
    (await poll(() => {
      const out = mock
        .requests()
        .slice(sent)
        .filter((b) => asksLast(b, 'lead again'))
      return out.length ? out : undefined
    }, 30000)) ?? []
  if (main.length === 0) {
    problems.push('btw: the main thread sent no request after the answer')
  }

  // The answer's prose, its question and its diagram's own lines: none of the row may reach the main thread. The
  // header, flowchart LR, is left out, as mermaid-tty's system prompt asks for it by name.
  const row = ['Side answer:', 'Side done.', 'what does it do?', ...BTW_LINES]
  for (const word of row) {
    if (main.some((b) => b.includes(JSON.stringify(word).slice(1, -1)))) {
      problems.push(`btw: the main thread's next request holds ${JSON.stringify(word)}`)
    }
  }

  // Nor the transcript file, read once that turn's reply is written, so a session that had none before the /btw (the
  // fresh one) has one to read.
  const files = () => jsonlFiles(join(config, 'projects')).filter((f) => statSync(f).mtimeMs >= since)
  const written = await poll(() => {
    const all = files().map((f) => readFileSync(f, 'utf8'))
    return all.some((t) => t.includes('lead again') && t.includes('After the diagram.')) ? all : undefined
  }, 10000)
  if (!written) {
    problems.push(`btw: no transcript holds the turn after the answer (${files().length} .jsonl files)`)
  }

  for (const word of ['Side answer:', 'Side done.', 'what does it do?', ...BTW_LINES]) {
    if ((written ?? []).some((t) => t.includes(JSON.stringify(word).slice(1, -1)))) {
      problems.push(`btw: the stored transcript holds ${JSON.stringify(word)}`)
    }
  }

  if (resumed) {
    problems.push(...(await btwCancelled(s, mock)))
  }

  return problems
}

// Esc while a /btw is still being answered cancels it: no answer shows, neither in a row of mermaid-tty's nor in Claude
// Code's own panel, and the status row goes. The answer an earlier /btw showed stays in its own row, so answers are
// counted, not looked for. Esc is pressed only once the request is out and held at the mock, so it cuts a request in
// flight, not one yet to start.
async function btwCancelled(s: Session, mock: Mock): Promise<string[]> {
  const problems: string[] = []
  const answers = (t: string) => t.split('Side done.').length - 1
  const before = answers(await s.text())
  const hold = mock.holdSide()
  try {
    await submit(s, '/btw and now?')
    const wait = new AbortController()
    const came = await Promise.race([
      hold.arrived.then(() => true),
      sleep(15000, false, { signal: wait.signal }).catch(() => false),
    ])
    wait.abort()
    if (!came) {
      throw new Error('the side question never reached the mock')
    }

    await s.waitFor(new RegExp(escape(BTW_STATUS)), 15000)
    await s.key('escape')
    await s.waitFor(new RegExp(`^(?![\\s\\S]*${escape(BTW_STATUS)})`), 10000)
  } catch (e) {
    problems.push(`btw: escape did not cancel the answer: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    hold.release()
  }

  await sleep(2000)
  const text = await s.text()
  if (answers(text) > before || text.includes('Answering')) {
    problems.push('btw: an answer shows after escape cancelled it')
  }

  return problems
}

// crossing: a diagram whose edges cross draws whole, and each crossing line takes its own color: A→D and B→C differ
// from each other and from the ┼ they share, which keeps the edge color. Under mono none carries a color. After
// /mermaid-tty crossings off, all three are drawn in the one edge color.
async function crossing({ s, run }: Ctx): Promise<string[]> {
  await submit(s, 'crossing')
  await s.waitFor(/Crossed\./, 30000)
  await sleep(500)
  const cells = await s.cells()
  const problems = checkDiagramScreen(cells, {
    labels: { 甲: 'node', 乙: 'node', 丙: 'node', 丁: 'node' },
    prose: ['Crossing lines:', 'Crossed.'],
    diagrams: drawnDiagrams(REPLY_CROSS, DRAW_COLUMNS, run.theme),
    color: colorOf(run),
    hex: hexOf(run),
  })
  problems.push(...sourceShown(await s.text(), fenceBody(REPLY_CROSS).split('\n')))
  // The drawing, located by its rows as the renderer draws them: A→D's own stretch (row 1, the run from ┴ to ┐),
  // B→C's (row 2, the run up to ┼) and the ┼ they share. Each is read in the screen's own color mode, so the check
  // holds in truecolor and 256 colors alike, and under the default theme, whose colors are Claude Code's.
  const show = (c: Cell['fg']) => `${c.mode}:${c.value}`
  const rows = drawnDiagrams(REPLY_CROSS, DRAW_COLUMNS, run.theme)[0] ?? []
  const text = cells.map((row) => row.map((c) => c.ch).join(''))
  const top = text.findIndex((r) => r.includes(rows[1]?.trim() ?? '\u0000'))
  const at = (r: number, glyph: string, nth = 0) => {
    const row = cells[top + r - 1] ?? []
    return row.filter((c) => c.ch === glyph)[nth]
  }
  const ad = at(1, '─')
  const bc = at(2, '─')
  const cross = at(2, '┼')
  if (top < 0 || !ad || !bc || !cross) {
    problems.push(`crossing: the crossing lines were not found on screen:\n${text.join('\n')}`)
  } else if (run.theme === 'mono') {
    for (const [name, c] of [
      ['A→D', ad],
      ['B→C', bc],
      ['┼', cross],
    ] as const) {
      if (c.fg.mode !== 'default') {
        problems.push(`crossing: mono ${name} carries color ${show(c.fg)}`)
      }
    }
  } else {
    const [a, b, x] = [show(ad.fg), show(bc.fg), show(cross.fg)]
    if (a === b || a === x || b === x) {
      problems.push(`crossing: A→D ${a}, B→C ${b} and the ┼ ${x} are not three colors`)
    }
  }

  // /mermaid-tty crossings off draws the same reply again with every line in the edge color: A→D's and B→C's own cells
  // now match the ┼, which never took a line color.
  await submit(s, '/mermaid-tty crossings off')
  await s.waitFor(/drawing crossing lines in the edge color/, 10000)
  await sleep(500)
  const plain = await s.cells()
  const cell = (r: number, glyph: string) => (plain[top + r - 1] ?? []).filter((c) => c.ch === glyph)[0]
  const [a, b, x] = [cell(1, '─'), cell(2, '─'), cell(2, '┼')]
  if (run.theme !== 'mono' && (!a || !b || !x || show(a.fg) !== show(x.fg) || show(b.fg) !== show(x.fg))) {
    problems.push(`crossing: after crossings off, A→D, B→C and the ┼ are not one color`)
  }

  // Back on, the default, so the setting this run saved never carries into a later run in the same config.
  await submit(s, '/mermaid-tty crossings on')
  await s.waitFor(/coloring crossing lines apart/, 10000)

  return problems
}

// The *.jsonl files under dir, at any depth; none when it does not exist.
function jsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) {
      return jsonlFiles(join(dir, e.name))
    }

    return e.name.endsWith('.jsonl') ? [join(dir, e.name)] : []
  })
}

// Polls check every 100 ms for up to ms; resolves to its first truthy answer, or to undefined.
async function poll<T>(check: () => T | undefined | Promise<T | undefined>, ms: number): Promise<T | undefined> {
  for (const end = Date.now() + ms; ; await sleep(100)) {
    const v = await check()
    if (v || Date.now() >= end) {
      return v || undefined
    }
  }
}

// stored (R6, E5, E6): the stored transcript holds REPLY byte for byte, and /copy copies the first diagram's exact
// source, through the stubbed clipboard command or OSC 52.
async function stored({ s, config, copied }: Ctx): Promise<string[]> {
  const os = process.platform
  const want = fenceBody(REPLY)
  const problems: string[] = []
  const since = Date.now() - 1000
  await showDiagrams(s)
  // Only this run's transcripts: an installed config dir keeps earlier runs'.
  const files = () => jsonlFiles(join(config, 'projects')).filter((f) => statSync(f).mtimeMs >= since)
  if (!(await poll(() => files().some((f) => findReply(readFileSync(f, 'utf8'), REPLY)), 5000))) {
    problems.push(`stored: no transcript holds the reply byte for byte (${files().length} .jsonl files)`)
  }

  if (Object.keys(clipboardStubs(os, copied)).length === 0) {
    console.log(`stored: not run on ${os}: no clipboard command to stub`)
    return problems
  }

  await submit(s, '/copy')
  // E6: Claude Code 2.1.308 opens a picker, Full response first, then one entry per code block; choose flowchart LR's.
  const screen = await s.waitFor(/Select content to copy|Copied/, 5000).catch(() => '')
  if (screen.includes('Select content to copy')) {
    // One entry at a time, each move seen on screen before the next press: on a slow ConPTY a fixed pause let the
    // presses run past flowchart LR to "Always copy full response", which Enter then saved as a preference. The
    // selection is read only below the picker's header; a move not seen, or a header gone, stops with Escape rather
    // than a guessed Enter.
    const at = (t: string) => {
      const h = t.lastIndexOf('Select content to copy')
      return h < 0 ? undefined : /❯\s+(.*?)\s*$/m.exec(t.slice(h))?.[1]
    }
    let sel = at(await s.text())
    let why = sel === undefined ? 'no selection is visible' : ''
    for (let i = 0; i < 10 && !why && !/^flowchart LR\b/.test(sel!); i++) {
      const was = sel
      await s.key('down')
      sel = await poll(async () => {
        const v = at(await s.text())
        return v !== undefined && v !== was ? v : undefined
      }, 3000)
      if (sel === undefined) {
        why = `the selection did not move from ${JSON.stringify(was)}`
      }
    }

    if (!why && !/^flowchart LR\b/.test(sel!)) {
      why = 'flowchart LR was not reached in 10 moves'
    }

    if (why) {
      problems.push(`stored: the /copy picker: ${why}; the screen:\n${await s.text()}`)
      await s.key('escape')
      return problems
    }

    await s.key('enter')
  }

  const exact = (t: string | undefined) => t === want || t === `${want}\n`
  const stub = () => (existsSync(copied) ? readFileSync(copied, 'utf8') : undefined)
  // The stub file is read first, so the terminal's clipboard is asked only when the stub does not hold the body.
  const copiedVia = async () => {
    if (exact(stub())) {
      return 'stub'
    }

    return exact(await s.clipboard()) ? 'osc52' : undefined
  }
  const via = await poll(copiedVia, 5000)
  if (via) {
    console.log(`stored: ran on ${os} via ${via}`)
  } else {
    problems.push(
      `stored: /copy copied ${JSON.stringify(stub() ?? (await s.clipboard()))}, not the fence body; the screen:\n${await s.text()}`,
    )
  }

  return problems
}

const SCENARIO_RUN: Record<Scenario, (c: Ctx) => Promise<string[]>> = {
  harness,
  'source-view': sourceView,
  stored,
  lead,
  btw,
  'btw-resumed': (c) => btw(c, true),
  'btw-fresh': (c) => btw(c, false, true),
  crossing,
}

async function main(): Promise<number> {
  const { values: o } = parseArgs({
    options: {
      'claude-version': { type: 'string' },
      installed: { type: 'string' },
      theme: { type: 'string', default: 'all' },
      color: { type: 'string' },
      driver: { type: 'string', default: 'pty' },
      scenario: { type: 'string', default: 'all' },
      keep: { type: 'boolean', default: false },
    },
  })
  const version = o['claude-version'] ?? readFileSync(join(here, 'CLAUDE_VERSION'), 'utf8').trim()
  const driver = oneOf('driver', o.driver, ['pty', 'tmux'] as const)
  const runs = runsFor(o.theme, o.color)
  const scenarios = o.scenario === 'all' ? [...SCENARIOS] : [oneOf('scenario', o.scenario, SCENARIOS)]
  const claude = installClaude(version)
  const os = process.platform
  const total = runs.length * scenarios.length
  let failed = 0
  let n = 0
  for (const run of runs) {
    for (const scenario of scenarios) {
      const last = ++n === total
      const problems = await runOne(
        claude,
        version,
        run,
        driver,
        scenario,
        o.keep,
        o.keep && driver === 'tmux' && last,
        o.installed,
      )
      if (problems.length) {
        failed++
      }

      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${os} ${run.theme} ${run.color} ${scenario}`)
      for (const p of problems) {
        console.log(`  ${p.replaceAll('\n', '\n  ')}`)
      }
    }
  }

  console.log(
    `e2e: ${total - failed} passed, ${failed} failed (${os}, ${driver}, claude ${version}, ${runs.map((r) => `${r.theme}/${r.color}`).join(' ')})`,
  )
  return failed ? 1 : 0
}

if (isMain(import.meta)) {
  process.exitCode = await main()
}
