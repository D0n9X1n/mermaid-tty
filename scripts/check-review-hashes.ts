// The review verdict hash check: each docs/reviews/<date>-<scope>.md records a verdict and the
// SHA-256 of every file it reviewed, and this proves those files have not changed since.
// Usage: node scripts/check-review-hashes.ts                    (checks every record's hashes)
//        node scripts/check-review-hashes.ts --require-pass     (and that each scope in required.json has a pass for each path)
//        node scripts/check-review-hashes.ts --table <path>...  (prints Files rows to paste into a record)
// Exits 1 on any problem or parse error.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { isMain } from './lib/is-main.ts'

export type ReviewFile = { path: string; sha256: string }
export type ReviewRecord = { path: string; scope: string; verdict: 'pass' | 'fail'; date: string; reviewers: string[]; files: ReviewFile[] }

// A scope slug: vr-A, vr-C-<type>, beauty, translation, …
const SLUG = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/

// Whether s is a real calendar date written YYYY-MM-DD: 2026-02-30 is not.
function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return !!m && new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toISOString().slice(0, 10) === s
}

// The names in a reviewers list, [a, b, …], or null unless it has one or more and none is empty.
function names(list: string): string[] | null {
  const items = /^\[(.*)\]$/.exec(list)?.[1]!.split(',').map(s => s.trim())
  return items?.every(Boolean) ? items : null
}

// The acceptance doc's reviewers: the PM reviews every scope; a cross-family:<model id> reviews every scope but
// beauty, which is the PM's review of the rendered GitHub page alone.
const CROSS_FAMILY = /^cross-family:[\w.-]+$/

// Each front matter key, in order, and whether a value is valid for it.
const VALID: Record<string, (value: string) => boolean> = {
  scope: v => SLUG.test(v),
  verdict: v => v === 'pass' || v === 'fail',
  date: isDate,
  reviewers: v => names(v) !== null,
}
const KEYS = Object.keys(VALID)

// The trimmed cells of a table row: | a | b | gives ['a', 'b'].
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
const HEX64 = /^[0-9a-f]{64}$/
// A GFM table's delimiter row, with or without outer pipes, each cell one or more hyphens between optional alignment
// colons: --- | ---, |:-:|--:|, or a single column's --- | or :---.
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

// Whether a line belongs to a table: a row that starts with |, or a delimiter row, in a blockquote too (its > markers
// stripped). Hyphens alone are a rule or a setext underline, never a delimiter row, so a delimiter row needs a | or a :.
function tableLine(line: string): boolean {
  const s = line.replace(/^(\s*>)+/, '')
  return line.trimStart().startsWith('|') || (DELIMITER.test(s) && /[|:]/.test(s))
}

// The files of the record's one ## Files table. Every non-blank line from that heading to the next ## heading
// is the table: | path | sha256 |, a |---|---| row, then one | <path> | <64 lowercase hex> | row per reviewed
// file, each path once. Any table anywhere else, a line tableLine finds, or a second ## Files heading fails the record.
function filesTable(path: string, lines: string[]): ReviewFile[] | { error: string } {
  const start = lines.indexOf('## Files')
  if (start < 0) return { error: `${path}: no ## Files table` }
  if (lines.indexOf('## Files', start + 1) >= 0) return { error: `${path}: more than one ## Files heading` }
  const next = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  const stop = next < 0 ? lines.length : next
  const stray = lines.find((l, i) => (i < start || i >= stop) && tableLine(l))
  if (stray) return { error: `${path}: table row outside ## Files ${JSON.stringify(stray)}` }
  const [header, rule, ...rows] = lines.slice(start + 1, stop).filter(l => l.trim() !== '')
  if (JSON.stringify(cells(header ?? '')) !== '["path","sha256"]' || !cells(rule ?? '').every(c => /^:?-+:?$/.test(c)))
    return { error: `${path}: the Files table must start with | path | sha256 | and a |---|---| row` }
  const files: ReviewFile[] = []
  for (const row of rows) {
    const [file, hash, ...rest] = cells(row)
    if (!file || !HEX64.test(hash ?? '') || rest.length) return { error: `${path}: bad Files row ${JSON.stringify(row)}` }
    if (files.some(f => f.path === file)) return { error: `${path}: ${file} appears twice in ## Files` }
    files.push({ path: file, sha256: hash! })
  }
  return files
}

// Raw HTML: a < that opens a tag (<table>), a closing tag (</td>), a comment or declaration (<!-- -->) or a
// processing instruction (<?x ?>). A record is plain prose, list items and the one Files table: raw HTML could show a
// reader files the check never reads, or hide rows it does.
const RAW_HTML = /<[A-Za-z/!?]/

// The record in text, found at path, or { error } naming the first way it breaks the record format.
export function parseRecord(path: string, text: string): ReviewRecord | { error: string } {
  // CommonMark's line endings, LF, CRLF and a lone CR, so every rule sees the lines GitHub renders.
  const lines = text.split(/\r\n|\r|\n/)
  const raw = lines.find(l => RAW_HTML.test(l))
  if (raw) return { error: `${path}: raw HTML ${JSON.stringify(raw)}` }
  const end = lines.indexOf('---', 1)
  if (lines[0] !== '---' || end < 0) return { error: `${path}: no front matter between --- lines` }
  const keys: string[] = [], meta: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const m = /^(\w+):(.*)$/.exec(line)
    if (!m) return { error: `${path}: bad front matter line ${JSON.stringify(line)}` }
    keys.push(m[1]!); meta[m[1]!] = m[2]!.trim()
  }
  if (keys.length !== KEYS.length || !KEYS.every(k => keys.includes(k)))
    return { error: `${path}: front matter keys must be exactly ${KEYS.join(', ')}; got ${JSON.stringify(keys)}` }
  const bad = KEYS.find(k => !VALID[k]!(meta[k]!))
  if (bad) return { error: `${path}: bad ${bad} ${JSON.stringify(meta[bad])}` }
  const reviewers = names(meta.reviewers!)!, crossFamily = meta.scope !== 'beauty'
  if (!reviewers.includes('PM') || (crossFamily && !reviewers.some(r => CROSS_FAMILY.test(r))))
    return { error: `${path}: reviewers must include PM${crossFamily ? ' and a cross-family:<model id>' : ''}; got ${JSON.stringify(meta.reviewers)}` }
  const files = filesTable(path, lines)
  if (!Array.isArray(files)) return files
  return { path, scope: meta.scope!, verdict: meta.verdict as 'pass' | 'fail', date: meta.date!, reviewers, files }
}

// The SHA-256 of the raw bytes, never normalized: .gitattributes keeps them LF on every OS.
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// A problem for each file a record lists that read(path) finds missing (null) or whose bytes hash otherwise.
export function checkRecords(records: ReviewRecord[], read: (path: string) => string | Uint8Array | null): string[] {
  return records.flatMap(r => r.files.flatMap(f => {
    const bytes = read(f.path)
    if (bytes === null) return [`${f.path}: missing`]
    const actual = sha256(bytes)
    return actual === f.sha256 ? [] : [`${f.path}: recorded ${f.sha256} actual ${actual}`]
  }))
}

// <scope>: <path> for each path of each required scope that no verdict: pass record of that scope lists.
export function requirePass(records: ReviewRecord[], required: Record<string, string[]>): string[] {
  return Object.entries(required).flatMap(([scope, paths]) => {
    const passed = new Set(records.filter(r => r.scope === scope && r.verdict === 'pass').flatMap(r => r.files.map(f => f.path)))
    return paths.filter(p => !passed.has(p)).map(p => `${scope}: ${p}`)
  })
}

// The '/'-separated paths of the files at or under rel, a path from root; none when nothing is there.
function walk(root: string, rel: string): string[] {
  const stat = statSync(join(root, rel), { throwIfNoEntry: false })
  if (!stat) return []
  if (!stat.isDirectory()) return [normalize(rel).split(sep).join('/')]
  return readdirSync(join(root, rel)).flatMap(name => walk(root, `${rel}/${name}`))
}

// The paths a scope's globs name, from root: a path as given, present or not, or <dir>/** for each
// file under dir, sorted, and none when dir is absent. No other glob is supported.
export function expandGlobs(globs: string[], root = '.'): string[] {
  return globs.flatMap(g => {
    if (g.endsWith('/**') && !g.slice(0, -3).includes('*')) return walk(root, g.slice(0, -3)).sort()
    if (g.includes('*')) throw new Error(`unsupported glob ${JSON.stringify(g)}: use a path or <dir>/**`)
    return [g]
  })
}

const DIR = 'docs/reviews'

// A reviewed file's raw bytes, or null when it is not a file.
function readBytes(path: string): Uint8Array | null {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ? readFileSync(path) : null
}

// The paths each scope in docs/reviews/required.json needs a passing record for, its globs expanded.
function required(): Record<string, string[]> {
  const globs = JSON.parse(readFileSync(`${DIR}/required.json`, 'utf8')) as Record<string, string[]>
  return Object.fromEntries(Object.entries(globs).map(([scope, g]) => [scope, expandGlobs(g)]))
}

// Prints a Files row, | <path> | <SHA-256 of its raw bytes> |, for each file at or under each of
// paths, sorted by path, for a reviewer to paste into a record. Fails on a path with no files.
function table(paths: string[]): number {
  const found = paths.map(p => [p, walk('.', p)] as const)
  for (const [p, files] of found) if (!files.length) console.error(`${p}: no files`)
  for (const f of found.flatMap(([, files]) => files).sort()) console.log(`| ${f} | ${sha256(readFileSync(f))} |`)
  return found.some(([, files]) => !files.length) ? 1 : 0
}

const USAGE = 'usage: node scripts/check-review-hashes.ts [--require-pass | --table <path>...]'

function main(): number {
  const args = process.argv.slice(2)
  if (args[0] === '--table') return table(args.slice(1))
  const requirePassing = args.length === 1 && args[0] === '--require-pass'
  if (args.length && !requirePassing) { console.error(USAGE); return 1 }
  const mds = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.md')).sort() : []
  const parsed = mds.map(f => parseRecord(`${DIR}/${f}`, readFileSync(`${DIR}/${f}`, 'utf8')))
  const records = parsed.filter((p): p is ReviewRecord => !('error' in p))
  const problems = [...parsed.flatMap(p => ('error' in p ? [p.error] : [])), ...checkRecords(records, readBytes),
    ...(requirePassing ? requirePass(records, required()).map(m => `${m}: no passing verdict`) : [])]
  for (const p of problems) console.error(p)
  if (problems.length) return 1
  console.log(`check-review-hashes: ${records.length} record(s); every reviewed file matches its SHA-256${requirePassing ? '; every required path has a passing verdict' : ''}`)
  return 0
}

// main() runs only when node runs this file, not when a test imports parseRecord.
if (isMain(import.meta)) process.exitCode = main()
