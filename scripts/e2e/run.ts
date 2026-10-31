// node scripts/e2e/run.ts [--claude-version V] [--theme default|nord|dracula|gruvbox|solarized|mono|all]
//   [--installed CONFIG_DIR] [--color truecolor|256] [--driver pty|tmux] [--scenario harness|source-view|stored|lead|all] [--keep]
// The e2e scenarios (A9): a real Claude Code, installed from npm at the pinned version, loads this repo with --plugin-dir
// in a fresh config against the mock Messages API, and each scenario reads its screen. Each run is one theme, color and
// scenario in a session of its own. Prints PASS|FAIL <os> <theme> <color> <scenario> per run, each run's problems under
// it, and a summary line; exits 1 on any FAIL. --keep keeps each run's temp dir, with screen.ansi in it, and under tmux
// leaves the last run's session up to attach to.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
import { mergeJson, sessionEnv, seedConfig, seedSettings, type Color, type Driver } from './env.ts'
import { startMock } from './mock.ts'
import { REPLY, REPLY_LEAD } from './reply.ts'
import { splitFences } from '../../hooks/fences.ts'
import { isMain } from '../lib/is-main.ts'
import { clipboardStubs, fenceBody, findReply } from './stored.ts'

const here = dirname(fileURLToPath(import.meta.url))
const  repoRoot = join(here, '..', '..')
const  win = process.platform === 'win32'
const THEME_NAMES = ['default', 'nord', 'dracula', 'gruvbox', 'solarized', 'mono'] as const
const SCENARIOS = ['harness', 'source-view', 'stored', 'lead'] as const
type Scenario = typeof SCENARIOS[number]
type Run = { theme: ThemeName; color: Color }

// v, when it is one of allowed; else exits 2 saying what --name takes.
function oneOf<T extends string>(name: string, v: string, allowed: readonly T[]): T {
  if (allowed.includes(v as T)) { return v as T }
  console.error(`--${name} ${v}: expected ${allowed.join('|')}`)
  process.exit(2)
}

// The runs: --theme's themes, each in --color; by default each in truecolor, plus one 256-color run under nord.
function runsFor(theme: string, color: string | undefined): Run[] {
  const themes = theme === 'all' ? [...THEME_NAMES] : [oneOf('theme', theme, THEME_NAMES)]
  if (color !== undefined) { return themes.map(t => ({ theme: t, color: oneOf('color', color, ['truecolor', '256'] as const) })) }
  return [...themes.map(t => ({ theme: t, color: 'truecolor' as const })), ...(themes.includes('nord') ? [{ theme: 'nord' as const, color: '256' as const }] : [])]
}

// Claude Code V, installed once into <tmpdir>/mtty-cc-V and reused while it runs: its binary (on Windows, npm's .cmd
// shim, which only a shell runs). npm may skip the package's postinstall, which puts the native binary in place of its
// placeholder; then its install.cjs is run here.
function installClaude(v: string): string {
  const dir = join(tmpdir(), `mtty-cc-${v}`)
const  bin = join(dir, 'node_modules', '.bin', win ? 'claude.cmd' : 'claude')
  const pkg = join(dir, 'node_modules', '@anthropic-ai', 'claude-code')
  const works = () => existsSync(bin) && (spawnSync(bin, ['--version'], { encoding: 'utf8', shell: win, timeout: 60000 }).stdout ?? '').includes(v)
  if (works()) { return bin }
  const npm = spawnSync('npm', ['install', '--prefix', dir, `@anthropic-ai/claude-code@${v}`], { encoding: 'utf8', shell: win })
  if (npm.status !== 0) { throw new Error(`npm install @anthropic-ai/claude-code@${v} failed:\n${npm.stderr}`) }
  if (!works()) { spawnSync(process.execPath, [join(pkg, 'install.cjs')], { cwd: pkg, stdio: 'inherit' }) }
  if (!works()) { throw new Error(`claude ${v} does not run from ${bin}`) }
  return bin
}

// What a scenario gets: its session, its run, and its sandbox's config dir and temp dir.
type Ctx = { s: Session; run: Run; config: string; base: string; copied: string }
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
// The prompt line showing text. Claude Code follows ❯ with a no-break space, which \s matches, where a plain space would not.
const promptLine = (text: string) => new RegExp(`❯\\s${escape(text)}`)
// Types text at the prompt, waits until the prompt line shows it, then presses enter.
async function submit(s: Session, text: string): Promise<void> {
  await s.type(text)
  await s.waitFor(promptLine(text), 5000)
  await s.key('enter')
}
// Asks the mock's REPLY for, and waits until the screen shows its last prose line, then lets the drawing settle.
async function showDiagrams(s: Session): Promise<void> {
  await submit(s, 'Show the diagrams')
  await s.waitFor(/Unclosed:/, 30000)
  await sleep(500)
}

// One run of one scenario, in a sandbox of its own: a temp HOME, config dir and cwd, the mock, and the seeded config.
// Resolves to its problems, [] when it passes. Under --keep the sandbox stays, with screen.ansi in it, and keepUp leaves
// a tmux session up. With installed (A9.release), that config dir, where the plugin is installed, is the session's: the
// seeds are merged into its files, and the session starts without --plugin-dir.
async function runOne(claude: string, run: Run, driver: Driver, scenario: Scenario, keep: boolean, keepUp: boolean, installed?: string): Promise<string[]> {
  const base = await realpath(mkdtempSync(join(tmpdir(), 'mtty-')))
  const [home, cwd, bin] = ['home', 'cwd', 'bin'].map(d => join(base, d)) as [string, string, string]
  const config = installed ?? join(base, 'config')
  for (const d of [home, cwd, bin, ...(installed ? [] : [config])]) { mkdirSync(d) }
  // The clipboard stubs, first on PATH: the stored scenario's /copy writes to copied.
  const copied = join(base, 'copied.txt')
  for (const [name, script] of Object.entries(clipboardStubs(process.platform, copied))) {
    writeFileSync(join(bin, name), script)
    chmodSync(join(bin, name), 0o755)
  }
  const mock = await startMock()
  let s: Session | undefined
  try {
    const seed = (file: string, json: string) => writeFileSync(join(config, file), existsSync(join(config, file)) ? mergeJson(readFileSync(join(config, file), 'utf8'), json) : json)
    seed('.claude.json', seedConfig(cwd, 'dummy', process.platform))
    seed('settings.json', seedSettings(run.theme))
    const env = sessionEnv({ home, config, mockUrl: mock.url, platform: process.platform, color: run.color, driver, path: [bin, process.env.PATH ?? ''].join(delimiter) })
    s = await startSession({ driver, argv: installed ? [claude] : [claude, '--plugin-dir', repoRoot], cwd, env })
    await s.waitFor(/❯/, 15000)
    return await SCENARIO_RUN[scenario]({ s, run, config, base, copied })
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  } finally {
    if (s && keep) { writeFileSync(join(base, 'screen.ansi'), await s.ansi().catch(e => String(e))) }
    if (s && !keepUp) { await s.stop() }
    await mock.stop()
    // A sandbox left behind is a warning, not a problem of the run's, and ends no later run.
    const left = keep ? undefined : removeSandbox(base)
    if (left) { console.log(left) }
    if (keep) { console.log(`kept ${base}${keepUp ? `; attach with: tmux -L ${TMUX_SOCKET} attach -t mtty-e2e` : ''}`) }
  }
}

// REPLY's labels by role, its prose lines, and every line of its two drawn diagrams' source, which holds those labels too.
const LABELS = { '读取配置文件': 'node', '完成?': 'decision', '结束': 'node', User: 'node', ping: 'label' }
const PROSE = ['Here is the config flow:', 'And the handshake:', 'This one stays source:', 'Unclosed:']
const LEAD_SOURCE = fenceBody(REPLY_LEAD).split('\n')
const SOURCE = splitFences(REPLY).filter(f => f.kind === 'mermaid').slice(0, 2).flatMap(f => (f.kind === 'mermaid' ? f.body.split('\n') : []))
// The width the expected rows are drawn at: the session's (driver.ts's COLS). The replies' diagrams draw the same at any
// width from it down to well under it, so Claude Code's margins do not change them.
const DRAW_COLUMNS = 100
// The color a run's diagram rows must carry: none under mono (A3), else its color mode.
const colorOf = (r: Run): ColorCheck => (r.theme === 'mono' ? 'none' : r.color)
// A curated palette's role colors, as 0xRRGGBB; none for default, which follows the user's Claude Code theme, and mono.
function hexOf(r: Run): Record<string, number> | undefined {
  if (r.theme === 'default' || r.theme === 'mono') { return undefined }
  return Object.fromEntries(Object.entries(THEMES[r.theme].roles).map(([role, c]) => [role, parseInt(c!.slice(1), 16)]))
}
// The drawn screen's problems: REPLY's drawn diagrams' rows as the renderer draws them, in order, each label in its
// role's color, the prose once, and the fences left as source shown so.
async function drawnScreen({ s, run }: Ctx): Promise<string[]> {
  const diagrams = drawnDiagrams(REPLY, DRAW_COLUMNS, run.theme)
  const problems = checkDiagramScreen(await s.cells(), { labels: LABELS, prose: PROSE, diagrams, color: colorOf(run), hex: hexOf(run) })
  const text = await s.text()
  for (const line of ['flowchart-elk TD', 'X --> Y', 'A --> B']) { if (!text.includes(line)) { problems.push(`${line}: expected as source`) } }
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
const  problems: string[] = []
const  labels = Object.keys(LABELS)
  const asSource = (where: string, text: string) => {
    for (const line of SOURCE) { if (!text.includes(line)) { problems.push(`${where}: ${line} not shown`) } }
    for (const row of drawnRows(text, labels, SOURCE)) { problems.push(`${where}: drawn row ${JSON.stringify(row.trim())}`) }
  }
  await showDiagrams(s)
  await submit(s, '/mermaid-tty source')
  asSource('source', await s.waitFor(/showing diagrams as source/, 10000).then(() => sleep(500)).then(() => s.text()))
  await s.key('ctrl-o')
  asSource('ctrl+o', await s.waitFor(/detailed transcript/, 10000).then(() => sleep(500)).then(() => s.text()))
  await s.key('ctrl-o')
  await s.waitFor(/^(?![\s\S]*detailed transcript)/, 10000)
  await submit(s, '/mermaid-tty diagram')
  await s.waitFor(/drawing diagrams/, 10000)
  await s.waitFor(/^(?![\s\S]*A\[读取配置文件\])/, 10000)
  await sleep(500)
  return [...problems, ...await drawnScreen(c)]
}

// lead (D5): a reply that opens on its diagram draws it, not its source, and draws its bullet on no row of its own: no
// row between the prompt line and the diagram's first row holds only the bullet.
async function lead({ s, run }: Ctx): Promise<string[]> {
  await submit(s, 'lead')
  await s.waitFor(/After the diagram\./, 30000)
  await sleep(500)
  const cells = await s.cells()
const  text = await s.text()
const  rows = text.split('\n')
  const diagrams = drawnDiagrams(REPLY_LEAD, DRAW_COLUMNS, run.theme)
  const problems = checkDiagramScreen(cells, { labels: { '开始': 'node', '结束': 'node' }, prose: ['After the diagram.'], diagrams, color: colorOf(run), hex: hexOf(run) })
  problems.push(...sourceShown(text, LEAD_SOURCE))
  const from = rows.findIndex(r => promptLine('lead').test(r))
const  to = rows.findIndex(r => r.includes('开始'))
  if (from < 0 || to < from) { return [...problems, 'lead: prompt line or diagram not found'] }
  for (const r of rows.slice(from + 1, to)) { if (r.trim() === '⏺') { problems.push('lead: a row holds only the reply bullet (D5)') } }
  return problems
}

// The *.jsonl files under dir, at any depth; none when it does not exist.
function jsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) { return [] }
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? jsonlFiles(join(dir, e.name))
    : e.name.endsWith('.jsonl') ? [join(dir, e.name)] : []))
}

// Polls check every 100 ms for up to ms; resolves to its first truthy answer, or to undefined.
async function poll<T>(check: () => T | undefined | Promise<T | undefined>, ms: number): Promise<T | undefined> {
  for (const end = Date.now() + ms; ; await sleep(100)) {
    const v = await check()
    if (v || Date.now() >= end) { return v || undefined }
  }
}

// stored (R6, E5, E6): the stored transcript holds REPLY byte for byte, and /copy copies the first diagram's exact
// source, through the stubbed clipboard command or OSC 52.
async function stored({ s, config, copied }: Ctx): Promise<string[]> {
  const os = process.platform
const  want = fenceBody(REPLY)
const  problems: string[] = []
const  since = Date.now() - 1000
  await showDiagrams(s)
  // Only this run's transcripts: an installed config dir keeps earlier runs'.
  const files = () => jsonlFiles(join(config, 'projects')).filter(f => statSync(f).mtimeMs >= since)
  if (!await poll(() => files().some(f => findReply(readFileSync(f, 'utf8'), REPLY)), 5000)) {
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
    // One entry at a time, each move seen on screen before the next press: on a slow ConPTY a fixed pause let the presses
    // run past flowchart LR to "Always copy full response", which Enter then saved as a preference. The selection is read
    // only below the picker's header; a move not seen, or a header gone, stops with Escape rather than a guessed Enter.
    const at = (t: string) => { const h = t.lastIndexOf('Select content to copy'); return h < 0 ? undefined : /❯\s+(.*?)\s*$/m.exec(t.slice(h))?.[1] }
    let sel = at(await s.text())
let  why = sel === undefined ? 'no selection is visible' : ''
    for (let i = 0; i < 10 && !why && !/^flowchart LR\b/.test(sel!); i++) {
      const was = sel
      await s.key('down')
      sel = await poll(async () => { const v = at(await s.text()); return v !== undefined && v !== was ? v : undefined }, 3000)
      if (sel === undefined) { why = `the selection did not move from ${JSON.stringify(was)}` }
    }
    if (!why && !/^flowchart LR\b/.test(sel!)) { why = 'flowchart LR was not reached in 10 moves' }
    if (why) {
      problems.push(`stored: the /copy picker: ${why}; the screen:\n${await s.text()}`)
      await s.key('escape')
      return problems
    }
    await s.key('enter')
  }
  const exact = (t: string | undefined) => t === want || t === `${want}\n`
  const stub = () => (existsSync(copied) ? readFileSync(copied, 'utf8') : undefined)
  const via = await poll(async () => (exact(stub()) ? 'stub' : exact(await s.clipboard()) ? 'osc52' : undefined), 5000)
  if (via) { console.log(`stored: ran on ${os} via ${via}`) }
  else { problems.push(`stored: /copy copied ${JSON.stringify(stub() ?? await s.clipboard())}, not the fence body; the screen:\n${await s.text()}`) }
  return problems
}

const SCENARIO_RUN: Record<Scenario, (c: Ctx) => Promise<string[]>> = { harness, 'source-view': sourceView, stored, lead }

async function main(): Promise<number> {
  const { values: o } = parseArgs({ options: {
    'claude-version': { type: 'string' }, installed: { type: 'string' }, theme: { type: 'string', default: 'all' }, color: { type: 'string' },
    driver: { type: 'string', default: 'pty' }, scenario: { type: 'string', default: 'all' }, keep: { type: 'boolean', default: false },
  } })
  const version = o['claude-version'] ?? readFileSync(join(here, 'CLAUDE_VERSION'), 'utf8').trim()
  const driver = oneOf('driver', o.driver, ['pty', 'tmux'] as const)
const  runs = runsFor(o.theme, o.color)
  const scenarios = o.scenario === 'all' ? [...SCENARIOS] : [oneOf('scenario', o.scenario, SCENARIOS)]
  const claude = installClaude(version)
const  os = process.platform
const  total = runs.length * scenarios.length
  let failed = 0
let  n = 0
  for (const run of runs) { for (const scenario of scenarios) {
    const last = ++n === total
const  problems = await runOne(claude, run, driver, scenario, o.keep, o.keep && driver === 'tmux' && last, o.installed)
    if (problems.length) { failed++ }
    console.log(`${problems.length ? 'FAIL' : 'PASS'} ${os} ${run.theme} ${run.color} ${scenario}`)
    for (const p of problems) { console.log(`  ${p.replaceAll('\n', '\n  ')}`) }
  } }
  console.log(`e2e: ${total - failed} passed, ${failed} failed (${os}, ${driver}, claude ${version}, ${runs.map(r => `${r.theme}/${r.color}`).join(' ')})`)
  return failed ? 1 : 0
}

if (isMain(import.meta)) { process.exitCode = await main() }
