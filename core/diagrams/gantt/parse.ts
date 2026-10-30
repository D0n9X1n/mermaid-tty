// Reads a gantt chart (plan C T68; matrix, gantt) into its model: the title, the sections, the axis format, and each task's
// name, section, tags, timing as written, and start and end, naive UTC ms (time.ts). A statement outside the subset, or a
// time Mermaid would not resolve exactly so, fails, so the fence draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { unsupported } from '../../width.ts'
import { parseAxisFormat, parseDate, parseDateFormat, parseDuration, type AxisFmt, type DateFmt } from './time.ts'

export type Tag = 'done' | 'active' | 'crit' | 'milestone'
// section: the index of the task's section, −1 before the first. timing: its written start and end items, trimmed and
// joined by ' · ', or its end alone. start and end: naive UTC ms. line: its 1-based source line.
export type GanttTask = { name: string; section: number; tags: Tag[]; start: number; end: number; timing: string; line: number }
// dated: the dateFormat has a date, not only a time. axis: the axisFormat's tokens.
export type Gantt = { title: string | null; dated: boolean; axis: AxisFmt; sections: string[]; tasks: GanttTask[] }

// The statements, each a whole trimmed line; a value runs to the line's end. Mermaid's lexer ends an axisFormat at # or ;,
// so one with either falls back (a dateFormat's # or ; fails its token check).
const TITLE = /^title\s+(.+)$/, SECTION = /^section\s+(.+)$/, DATE_FORMAT = /^dateFormat\s+(.+)$/, AXIS_FORMAT = /^axisFormat\s+([^#;]+)$/
// Statements that draw nothing. As Mermaid's lexer reads them, accTitle: and accDescr: run to the line's end, and
// accDescr { to its first }.
const ACC = /^acc(?:Title|Descr)\s*:/, ACC_BLOCK = /^accDescr\s*\{/
// An empty accTitle: or accDescr: fails: Mermaid's lexer then reads the next line as its text (12.2.0, verified).
// A click as Mermaid's grammar reads one on its line: click, an id, then href "<url>", call <name>(<args>), or both in
// either order. Mermaid reads a call with no ( on to the next ( in the chart, so one falls back.
const HREF = String.raw`href\s+"[^"\n]+"`, CALL = String.raw`call\s+[^\s(][^(\n]*\([^)\n]*\)`
const CLICK = new RegExp(String.raw`^click\s+\S+\s+(?:${HREF}(?:\s*${CALL})?|${CALL}(?:\s*${HREF})?)$`)
// Mermaid's gantt keywords, which its lexer reads in any case and some at any word end. A line that starts with one and
// that no statement above reads (another case, a longer word, or a statement outside the subset) falls back (common rule 5).
const KEYWORD = /^(?:title|section|dateformat|axisformat|todaymarker|click|acctitle|accdescr|gantt|excludes|includes|weekday|weekend|tickinterval|topaxis|inclusiveenddates)/i
// A task name Mermaid's lexer reads as something else: % first or second (a comment), a leading YYYY-MM-DD (a date), call
// as its first word (a callback), or href then a " (a link), in any case.
const BAD_NAME = /^.?%|^\d{4}-\d{2}-\d{2}|^call(?:\s|$)|^href\s+"/i
// The tags Mermaid reads before a task's other items; vert falls back.
const TAGS: readonly string[] = ['done', 'active', 'crit', 'milestone', 'vert']
const ID = /^[A-Za-z0-9_-]+$/
// after and until, then ids one or more spaces apart.
const IDS = '[A-Za-z0-9_-]+(?: +[A-Za-z0-9_-]+)*'
const AFTER = new RegExp(String.raw`^after\s+(${IDS})$`), UNTIL = new RegExp(String.raw`^until\s+(${IDS})$`)

// A task as its line writes it: id null where it has none, start null where it has no start item.
type Row = { name: string; section: number; tags: Tag[]; id: string | null; start: string | null; end: string; line: number }
// When a task starts: at the previous task's end, at the latest end of the tasks after names, or at a date; and when it
// ends: at the earliest start of the tasks until names, at a date, or a duration after its start. Tasks are row indexes.
type Start = { prev: true } | { after: number[] } | { at: number }
type End = { until: number[] } | { at: number } | { dur: number }
type Spec = { start: Start; end: End; line: number }

// Ends the walk: parseGantt returns this Fail.
function stop(reason: string): never { throw fail(reason) }

// The model src's statements build, or why it cannot be drawn: 'header' (not gantt), 'syntax:<n>' (a statement on source
// line n outside the subset, or an accDescr { there with no }), 'repeat:<n>' (a repeated id, or a second title, from
// frontmatter or a statement), 'ref:<n>' (an unknown id), 'start:<n>' (a first task with no start), 'date:<n>' (a start
// that is neither after nor a date, or an end past the Date range), 'order:<n>' (an end before its start), 'cycle' (a
// task whose time depends on itself), 'ref-order:<n>' (a task Mermaid's passes time differently, reading a reference
// before its task resolves), a drawn text's 'entity' or 'unsupported-char U+XXXX', or the dateFormat's or
// axisFormat's Fail.
export function parseGantt(src: Source): Gantt | Fail {
  try { return walk(src) } catch (e) { if (isFail(e)) return e; throw e }
}

function walk(src: Source): Gantt {
  if (src.header !== 'gantt') stop('header')
  let title = src.title, dateFormat = 'YYYY-MM-DD', axisFormat: string | null = null, descr = 0
  const sections: string[] = [], rows: Row[] = []
  for (const { n, text } of src.lines) {
    const t = text.trim()
    if (descr) { if (closes(t, n)) descr = 0; continue }
    let m: RegExpExecArray | null
    if ((m = TITLE.exec(t))) { if (title !== null) stop(`repeat:${n}`); title = drawn(m[1]!) }
    else if ((m = SECTION.exec(t))) sections.push(drawn(m[1]!))
    else if ((m = DATE_FORMAT.exec(t))) dateFormat = m[1]!
    else if ((m = AXIS_FORMAT.exec(t))) axisFormat = m[1]!
    else if (ACC_BLOCK.test(t)) { if (!closes(t.replace(ACC_BLOCK, ''), n)) descr = n }
    else if (ACC.test(t)) { if (!t.replace(ACC, '').trim()) stop(`syntax:${n}`) }
    else if (t === 'todayMarker off' || CLICK.test(t)) continue
    else if (KEYWORD.test(t)) stop(`syntax:${n}`)
    else rows.push(row(t, n, sections.length - 1))
  }
  if (descr) stop(`syntax:${descr}`)
  // Mermaid reads every task under the last dateFormat, wherever it stands, and draws under the last axisFormat.
  const fmt = parseDateFormat(dateFormat)
  if (isFail(fmt)) stop(fmt.reason)
  const dated = fmt.includes('YYYY'), axis = parseAxisFormat(axisFormat ?? '%Y-%m-%d', dated)
  if (isFail(axis)) stop(axis.reason)
  const time = resolve(classify(rows, fmt))
  return { title, dated, axis, sections, tasks: rows.map((r, i) => ({ name: r.name, section: r.section, tags: r.tags,
    start: time[2 * i]!, end: time[2 * i + 1]!, timing: r.start === null ? r.end : `${r.start} · ${r.end}`, line: r.line })) }
}

// Whether an accDescr block's text closes in rest: at its first }, after which the line must end.
function closes(rest: string, n: number): boolean {
  const i = rest.indexOf('}')
  if (i < 0) return false
  if (rest.slice(i + 1).trim()) stop(`syntax:${n}`)
  return true
}

// Text s draws as written: a body title, a section or a task name. A #…; entity fails 'entity': Mermaid's Diagram.fromText
// encodes it in the body and its SVG decodes it, so #9829; would show ♥. An undrawable character fails too.
function drawn(s: string): string {
  if (/#\w+;/.test(s)) stop('entity')
  const bad = unsupported(s)
  return bad ? stop(`unsupported-char ${bad}`) : s
}

// Task line t, `<name> :<items>`, on source line n in section `section`, split at its first :. Fails syntax:<n> for no :
// or no name, a name Mermaid's lexer reads as something else, a vert tag, no item or more than 3 after the tags, or a bad
// id: __proto__ too, as Mermaid keeps ids as keys of a plain object, where that one is no key. A repeated tag counts once.
function row(t: string, n: number, section: number): Row {
  const colon = t.indexOf(':'), name = t.slice(0, colon).trim()
  if (colon < 0 || !name || BAD_NAME.test(name)) stop(`syntax:${n}`)
  const items = t.slice(colon + 1).split(',').map(s => s.trim()), tags: Tag[] = []
  while (items.length > 0 && TAGS.includes(items[0]!)) {
    const tag = items.shift() as Tag | 'vert'
    if (tag === 'vert') stop(`syntax:${n}`)
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (items.length === 0 || items.length > 3) stop(`syntax:${n}`)
  const end = items.pop()!, start = items.pop() ?? null, id = items.pop() ?? null
  if (id !== null && (!ID.test(id) || id === '__proto__')) stop(`syntax:${n}`)
  return { name: drawn(name), section, tags, id, start, end, line: n }
}

// Each row's start and end, read under fmt in source order. As in Mermaid, a task with no id is task<n>, n counting such
// tasks. Fails repeat:<n> for an id an earlier task has, start:<n> for a first task with no start item, ref:<n> for an id
// no task has, date:<n> for a start that is neither after nor a date, and syntax:<n> for an end that is neither until, a
// date nor a duration.
function classify(rows: readonly Row[], fmt: DateFmt): Spec[] {
  const index = new Map<string, number>()
  let auto = 0
  rows.forEach((r, i) => {
    const id = r.id ?? `task${++auto}`
    if (index.has(id)) stop(`repeat:${r.line}`)
    index.set(id, i)
  })
  const refs = (ids: string, n: number) => ids.split(/ +/).map(id => index.get(id) ?? stop(`ref:${n}`))
  return rows.map((r, i): Spec => {
    const n = r.line, after = r.start === null ? null : AFTER.exec(r.start), until = UNTIL.exec(r.end)
    const start: Start = r.start === null ? (i > 0 ? { prev: true } : stop(`start:${n}`))
      : after ? { after: refs(after[1]!, n) } : { at: parseDate(r.start, fmt) ?? stop(`date:${n}`) }
    const at = parseDate(r.end, fmt), dur = parseDuration(r.end)
    const end: End = until ? { until: refs(until[1]!, n) } : at !== null ? { at } : dur !== null ? { dur } : stop(`syntax:${n}`)
    return { start, end, line: n }
  })
}

// Each task's start and end, ms: node 2i is task i's start and 2i + 1 its end. A memoized depth-first walk, kept on a
// stack so a long chain cannot overflow the call stack. after takes the latest end of its tasks, and until the earliest
// start. Fails cycle for a time that depends on itself, and order:<n> for an end before its start.
function resolve(specs: readonly Spec[]): number[] {
  const deps = (v: number): number[] => {
    const i = v >> 1, s = specs[i]!
    if (v % 2 === 0) return 'prev' in s.start ? [2 * i - 1] : 'after' in s.start ? s.start.after.map(j => 2 * j + 1) : []
    return 'until' in s.end ? s.end.until.map(j => 2 * j) : 'dur' in s.end ? [2 * i] : []
  }
  const time: number[] = [], value = (v: number): number => {
    const i = v >> 1, s = specs[i]!
    if (v % 2 === 0) {
      return 'at' in s.start ? s.start.at : 'prev' in s.start ? time[2 * i - 1]!
        : s.start.after.reduce((t, j) => Math.max(t, time[2 * j + 1]!), -Infinity)
    }
    if ('at' in s.end) return s.end.at
    if ('until' in s.end) return s.end.until.reduce((t, j) => Math.min(t, time[2 * j]!), Infinity)
    // Day.js adds a duration only within the Date range, ±8.64e15 ms; past it, Mermaid draws the task with no length.
    const end = time[2 * i]! + s.end.dur
    return Math.abs(end) <= 8.64e15 ? end : stop(`date:${s.line}`)
  }
  // state: 1 while a node's dependencies are walked, so meeting it again is a cycle; 2 once its time is set.
  const state: number[] = []
  for (let root = 0; root < 2 * specs.length; root++) {
    const stack = [root]
    while (stack.length > 0) {
      const v = stack.at(-1)!
      if (state[v] === 2) { stack.pop(); continue }
      if (state[v] === 1) { time[v] = value(v); state[v] = 2; stack.pop(); continue }
      state[v] = 1
      for (const d of deps(v)) {
        if (state[d] === 1) stop('cycle')
        if (state[d] !== 2) stack.push(d)
      }
    }
  }
  specs.forEach((s, i) => { if (time[2 * i + 1]! < time[2 * i]!) stop(`order:${s.line}`) })
  const theirs = mermaidTimes(specs), bad = specs.findIndex((_, i) => theirs[2 * i] !== time[2 * i] || theirs[2 * i + 1] !== time[2 * i + 1])
  if (bad >= 0) stop(`ref-order:${specs[bad]!.line}`)
  return time
}

// Each task's start and end as Mermaid 12.2.0's ganttDb sets them, undefined where it sets none: up to 11 passes over the
// tasks in source order, until each has an end. A pass reads a task it has not resolved yet as no time: after and until
// take their first task's time, then any later one's that is strictly later (after) or earlier (until).
function mermaidTimes(specs: readonly Spec[]): (number | undefined)[] {
  const t: (number | undefined)[] = [], done: boolean[] = []
  const pick = (ts: (number | undefined)[], better: (a: number, b: number) => boolean) =>
    ts.reduce((a, b) => (a !== undefined && b !== undefined && better(b, a) ? b : a))
  for (let pass = 0; pass < 11; pass++) {
    specs.forEach((s, i) => {
      if ('prev' in s.start) t[2 * i] = t[2 * i - 1]
      else {
        const start = 'at' in s.start ? s.start.at : pick(s.start.after.map(j => t[2 * j + 1]), (a, b) => a > b)
        if (start !== undefined) t[2 * i] = start
      }
      const start = t[2 * i]
      if (start === undefined) return
      t[2 * i + 1] = 'at' in s.end ? s.end.at : 'until' in s.end ? pick(s.end.until.map(j => t[2 * j]), (a, b) => a < b) : start + s.end.dur
      if (t[2 * i + 1] !== undefined) done[i] = true
    })
    if (specs.every((_, i) => done[i])) break
  }
  return t
}
