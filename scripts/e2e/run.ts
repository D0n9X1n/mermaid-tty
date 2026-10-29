// node scripts/e2e/run.ts [--claude-version V] [--theme default|nord|dracula|gruvbox|solarized|mono|all]
//   [--color truecolor|256] [--driver pty|tmux] [--scenario harness|source-view|lead|all] [--keep]
// The e2e scenarios (A9): a real Claude Code, installed from npm at the pinned version, loads this repo with --plugin-dir
// in a fresh config against the mock Messages API, and each scenario reads its screen. Each run is one theme, color and
// scenario in a session of its own. Prints PASS|FAIL <os> <theme> <color> <scenario> per run, each run's problems under
// it, and a summary line; exits 1 on any FAIL. --keep keeps each run's temp dir, with screen.ansi in it, and under tmux
// leaves the last run's session up to attach to.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { THEMES, type ThemeName } from '../../core/themes.ts'
import { checkDiagramScreen, drawnRows, type ColorCheck } from './assert.ts'
import { startSession, TMUX_SOCKET, type Session } from './driver.ts'
import { sessionEnv, seedConfig, seedSettings, type Color, type Driver } from './env.ts'
import { startMock } from './mock.ts'
import { REPLY } from './reply.ts'
import { splitFences } from '../../hooks/fences.ts'
import { isMain } from '../lib/is-main.ts'

const here = dirname(fileURLToPath(import.meta.url)), repoRoot = join(here, '..', '..'), win = process.platform === 'win32'
const THEME_NAMES = ['default', 'nord', 'dracula', 'gruvbox', 'solarized', 'mono'] as const
const SCENARIOS = ['harness', 'source-view', 'lead'] as const
type Scenario = typeof SCENARIOS[number]
type Run = { theme: ThemeName; color: Color }

// v, when it is one of allowed; else exits 2 saying what --name takes.
function oneOf<T extends string>(name: string, v: string, allowed: readonly T[]): T {
  if (allowed.includes(v as T)) return v as T
  console.error(`--${name} ${v}: expected ${allowed.join('|')}`)
  process.exit(2)
}

// The runs: --theme's themes, each in --color; by default each in truecolor, plus one 256-color run under nord.
function runsFor(theme: string, color: string | undefined): Run[] {
  const themes = theme === 'all' ? [...THEME_NAMES] : [oneOf('theme', theme, THEME_NAMES)]
  if (color !== undefined) return themes.map(t => ({ theme: t, color: oneOf('color', color, ['truecolor', '256'] as const) }))
  return [...themes.map(t => ({ theme: t, color: 'truecolor' as const })), ...(themes.includes('nord') ? [{ theme: 'nord' as const, color: '256' as const }] : [])]
}

// Claude Code V, installed once into <tmpdir>/mtty-cc-V and reused while it runs: its binary (on Windows, npm's .cmd
// shim, which only a shell runs). npm may skip the package's postinstall, which puts the native binary in place of its
// placeholder; then its install.cjs is run here.
function installClaude(v: string): string {
  const dir = join(tmpdir(), `mtty-cc-${v}`), bin = join(dir, 'node_modules', '.bin', win ? 'claude.cmd' : 'claude')
  const pkg = join(dir, 'node_modules', '@anthropic-ai', 'claude-code')
  const works = () => existsSync(bin) && (spawnSync(bin, ['--version'], { encoding: 'utf8', shell: win, timeout: 60000 }).stdout ?? '').includes(v)
  if (works()) return bin
  const npm = spawnSync('npm', ['install', '--prefix', dir, `@anthropic-ai/claude-code@${v}`], { encoding: 'utf8', shell: win })
  if (npm.status !== 0) throw new Error(`npm install @anthropic-ai/claude-code@${v} failed:\n${npm.stderr}`)
  if (!works()) spawnSync(process.execPath, [join(pkg, 'install.cjs')], { cwd: pkg, stdio: 'inherit' })
  if (!works()) throw new Error(`claude ${v} does not run from ${bin}`)
  return bin
}

// What a scenario gets: its session, its run, and its sandbox's config dir and temp dir.
type Ctx = { s: Session; run: Run; config: string; base: string }
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
// a tmux session up.
async function runOne(claude: string, run: Run, driver: Driver, scenario: Scenario, keep: boolean, keepUp: boolean): Promise<string[]> {
  const base = await realpath(mkdtempSync(join(tmpdir(), 'mtty-')))
  const [home, config, cwd] = ['home', 'config', 'cwd'].map(d => join(base, d)) as [string, string, string]
  for (const d of [home, config, cwd]) mkdirSync(d)
  const mock = await startMock()
  let s: Session | undefined
  try {
    writeFileSync(join(config, '.claude.json'), seedConfig(cwd, 'dummy', process.platform))
    writeFileSync(join(config, 'settings.json'), seedSettings(run.theme))
    const env = sessionEnv({ home, config, mockUrl: mock.url, platform: process.platform, color: run.color, driver, path: process.env.PATH ?? '' })
    s = await startSession({ driver, argv: [claude, '--plugin-dir', repoRoot], cwd, env })
    await s.waitFor(/❯/, 15000)
    return await SCENARIO_RUN[scenario]({ s, run, config, base })
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  } finally {
    if (s && keep) writeFileSync(join(base, 'screen.ansi'), await s.ansi().catch(e => String(e)))
    if (s && !keepUp) await s.stop()
    await mock.stop()
    if (!keep) rmSync(base, { recursive: true, force: true })
    else console.log(`kept ${base}${keepUp ? `; attach with: tmux -L ${TMUX_SOCKET} attach -t mtty-e2e` : ''}`)
  }
}

// REPLY's labels by role, its prose lines, and every line of its two drawn diagrams' source, which holds those labels too.
const LABELS = { '读取配置文件': 'node', '完成?': 'decision', '结束': 'node', User: 'node', ping: 'label' }
const PROSE = ['Here is the config flow:', 'And the handshake:', 'This one stays source:', 'Unclosed:']
const SOURCE = splitFences(REPLY).filter(f => f.kind === 'mermaid').slice(0, 2).flatMap(f => (f.kind === 'mermaid' ? f.body.split('\n') : []))
// The color a run's diagram rows must carry: none under mono (A3), else its color mode.
const colorOf = (r: Run): ColorCheck => (r.theme === 'mono' ? 'none' : r.color)
// A curated palette's role colors, as 0xRRGGBB; none for default, which follows the user's Claude Code theme, and mono.
function hexOf(r: Run): Record<string, number> | undefined {
  if (r.theme === 'default' || r.theme === 'mono') return undefined
  return Object.fromEntries(Object.entries(THEMES[r.theme].roles).map(([role, c]) => [role, parseInt(c!.slice(1), 16)]))
}
// The drawn screen's problems: each label in its role's color, the prose once, and the fences left as source shown so.
async function drawnScreen({ s, run }: Ctx): Promise<string[]> {
  const problems = checkDiagramScreen(await s.cells(), { labels: LABELS, prose: PROSE, color: colorOf(run), hex: hexOf(run) })
  const text = await s.text()
  for (const line of ['flowchart-elk TD', 'X --> Y', 'A --> B']) if (!text.includes(line)) problems.push(`${line}: expected as source`)
  for (const line of SOURCE.filter(l => /[[(>]/.test(l))) if (text.includes(line)) problems.push(`${line}: drawn diagram shown as source`)
  return problems
}

// harness: REPLY's diagrams drawn in the run's colors, the prose intact, the other fences as source.
async function harness(c: Ctx): Promise<string[]> {
  await showDiagrams(c.s)
  return drawnScreen(c)
}

// source-view: /mermaid-tty source shows each diagram's source, on screen and under ctrl+o; /mermaid-tty diagram draws
// them again, on the reply already on screen too.
async function sourceView(c: Ctx): Promise<string[]> {
  const { s } = c, problems: string[] = [], labels = Object.keys(LABELS)
  const asSource = (where: string, text: string) => {
    for (const line of SOURCE) if (!text.includes(line)) problems.push(`${where}: ${line} not shown`)
    for (const row of drawnRows(text, labels, SOURCE)) problems.push(`${where}: drawn row ${JSON.stringify(row.trim())}`)
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

// lead (D5): a reply that opens on its diagram draws its bullet on no row of its own: no row between the prompt line
// and the diagram's first row holds only the bullet.
async function lead({ s, run }: Ctx): Promise<string[]> {
  await submit(s, 'lead')
  await s.waitFor(/After the diagram\./, 30000)
  await sleep(500)
  const cells = await s.cells(), rows = (await s.text()).split('\n')
  const problems = checkDiagramScreen(cells, { labels: { '开始': 'node', '结束': 'node' }, prose: ['After the diagram.'], color: colorOf(run), hex: hexOf(run) })
  const from = rows.findIndex(r => promptLine('lead').test(r)), to = rows.findIndex(r => r.includes('开始'))
  if (from < 0 || to < from) return [...problems, 'lead: prompt line or diagram not found']
  for (const r of rows.slice(from + 1, to)) if (r.trim() === '⏺') problems.push('lead: a row holds only the reply bullet (D5)')
  return problems
}

const SCENARIO_RUN: Record<Scenario, (c: Ctx) => Promise<string[]>> = { harness, 'source-view': sourceView, lead }

async function main(): Promise<number> {
  const { values: o } = parseArgs({ options: {
    'claude-version': { type: 'string' }, theme: { type: 'string', default: 'all' }, color: { type: 'string' },
    driver: { type: 'string', default: 'pty' }, scenario: { type: 'string', default: 'all' }, keep: { type: 'boolean', default: false },
  } })
  const version = o['claude-version'] ?? readFileSync(join(here, 'CLAUDE_VERSION'), 'utf8').trim()
  const driver = oneOf('driver', o.driver, ['pty', 'tmux'] as const), runs = runsFor(o.theme, o.color)
  const scenarios = o.scenario === 'all' ? [...SCENARIOS] : [oneOf('scenario', o.scenario, SCENARIOS)]
  const claude = installClaude(version), os = process.platform, total = runs.length * scenarios.length
  let failed = 0, n = 0
  for (const run of runs) for (const scenario of scenarios) {
    const last = ++n === total, problems = await runOne(claude, run, driver, scenario, o.keep, o.keep && driver === 'tmux' && last)
    if (problems.length) failed++
    console.log(`${problems.length ? 'FAIL' : 'PASS'} ${os} ${run.theme} ${run.color} ${scenario}`)
    for (const p of problems) console.log(`  ${p.replaceAll('\n', '\n  ')}`)
  }
  console.log(`e2e: ${total - failed} passed, ${failed} failed (${os}, ${driver}, claude ${version}, ${runs.map(r => `${r.theme}/${r.color}`).join(' ')})`)
  return failed ? 1 : 0
}

if (isMain(import.meta)) process.exitCode = await main()
