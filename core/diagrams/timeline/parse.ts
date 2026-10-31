// Reads a timeline (plan C, T82; matrix, timeline) into its model: the header's direction, the title, whether periods
// take a color each, and the periods grouped by section, in source order. A statement outside the subset fails, so the
// fence draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

// Each text is trimmed. A period's text, its events and a section's name keep every <br> as written: Mermaid 12.2.0
// splits them only at an exact lowercase <br>, and T83's layout splits there and nowhere else, so <BR>, <br/> and
// <br /> draw as written.
export type Period = { text: string; events: string[] }
// A section's name is null for the one section that holds every period of a timeline with no section statement.
export type Section = { name: string | null; periods: Period[] }
// multicolor is false under disableMulticolor; it matters only with no section statement (matrix, timeline).
export type Timeline = { dir: 'LR' | 'TD'; title: string | null; multicolor: boolean; sections: Section[] }

const HEADER = /^timeline( (LR|TD))?$/
// The statements, each a whole trimmed line: a title; a section; an accTitle or accDescr line; an accDescr { block, whose
// text runs to its first }, which must end its line; and a period or event line, which entry reads.
const TITLE = /^title[ \t]+(.+)$/
const SECTION = /^section[ \t]+(.+)$/
const ACC = /^(?:accTitle|accDescr)[ \t]*:/
// An empty accTitle: or accDescr: fails: Mermaid's lexer then reads the next line as its text (12.2.0, verified).
const ACC_BLOCK = /^accDescr[ \t]*\{(.*)$/
// Mermaid's lexer reads its keywords in any case and at the start of a longer word, so a line that starts with one but is
// no statement falls back (common rule 5).
const KEYWORD = /^(?:timeline|title|section|accTitle|accDescr)/i
// A ':' before a space splits a line into events, and Mermaid's lexer splits at a ':' before any whitespace or the
// line's end too. Only ': ' is read, so a ':' before other whitespace, or at the end, falls back.
const AMBIGUOUS = /:(?:[^\S ]|$)/

// The walk's state: the timeline so far; the last period, which takes the events of a line that starts with ':'; and
// the line of the first period before any section statement, or 0.
type State = { tl: Timeline; last: Period | null; loose: number }

// Ends the walk: parseTimeline returns this Fail.
function stop(reason: string): never {
  throw fail(reason)
}

// t, if it draws as Mermaid 12.2.0 shows it in its field (text ground truth): a period, event or section name shows
// text as written and splits only at lowercase <br> ('plain', 'lower'); a title is sanitized and cannot split
// ('sanitized', 'none'). Else the walk fails: 'entity', 'html' or 'unsupported-char U+XXXX'.
function checked(t: string, mode: Mode, br: Br): string {
  const f = drawable(t, mode, br)
  if (f) {
    stop(f.reason)
  }
  const bad = unsupported(t)
  return bad ? stop(`unsupported-char ${bad}`) : t
}
const plain = (t: string): string => checked(t, 'plain', 'lower')

export function parseTimeline(src: Source): Timeline | Fail {
  try {
    return walk(src)
  } catch (e) {
    if (isFail(e)) {
      return e
    }
    throw e
  }
}

function walk(src: Source): Timeline {
  const head = HEADER.exec(src.header) ?? stop('header')
  // Mermaid's renderer tests disableMulticolor by JS truthiness, so a quoted "false" disables multicolor too.
  const tl: Timeline = {
    dir: head[2] === 'TD' ? 'TD' : 'LR',
    title: src.title,
    multicolor: !src.config['timeline.disableMulticolor'],
    sections: [],
  }
  const st: State = { tl, last: null, loose: 0 }
  let open = 0 // the line an open accDescr { block starts on, or 0
  for (const { n, text } of src.lines) {
    const t = text.trim()
    const block = open ? t : ACC_BLOCK.exec(t)?.[1]
    if (block === undefined) {
      statement(st, t, n)
      continue
    }
    // Accessibility text is not drawn.
    const end = block.indexOf('}')
    if (end >= 0 && block.slice(end + 1).trim()) {
      stop(`syntax:${n}`)
    }
    open = end >= 0 ? 0 : open || n
  }
  if (open) {
    stop(`syntax:${open}`)
  }
  return tl
}

// Reads the trimmed line t, source line n, into st. Accessibility text is not drawn, so a # or : in it is read as text.
// Anywhere else, a # fails: Mermaid's lexer starts a comment there.
function statement(st: State, t: string, n: number): void {
  if (ACC.test(t)) {
    if (!t.replace(ACC, '').trim()) {
      stop(`syntax:${n}`)
    }
    return
  }
  if (t.includes('#')) {
    stop(`syntax:${n}`)
  }
  const title = TITLE.exec(t)?.[1]
  if (title !== undefined) {
    if (st.tl.title !== null) {
      stop(`repeat:${n}`)
    }
    st.tl.title = checked(title, 'sanitized', 'none')
    return
  }
  const name = SECTION.exec(t)?.[1]
  if (name === undefined) {
    return KEYWORD.test(t) ? stop(`syntax:${n}`) : entry(st, t, n)
  }
  // Mermaid's lexer ends a section name at a ':' and reads the rest as an event.
  if (name.includes(':')) {
    stop(`syntax:${n}`)
  }
  // Mermaid drops a period before the first section, so it fails on its own line.
  if (st.loose) {
    stop(`section:${st.loose}`)
  }
  if (st.tl.sections.some((s) => s.name === name)) {
    stop(`repeat:${n}`)
  }
  st.tl.sections.push({ name: plain(name), periods: [] })
}

// A period line, '<period>[ : <event>]…', or a line that starts with ':', whose events go to the last period. Split at
// ': ' only, so '10:30' stays whole; a ':' left in the period fails, as Mermaid's lexer ends a period at any ':'. An
// empty event, or a line starting ':' with none, fails too. Its syntax is checked before its text.
function entry(st: State, t: string, n: number): void {
  const parts = t.split(': ').map((s) => s.trim())
  if (parts[0]!.includes(':') || AMBIGUOUS.test(t) || parts.slice(1).includes('')) {
    stop(`syntax:${n}`)
  }
  if (parts[0] === '' && !st.last) {
    stop(`syntax:${n}`)
  }
  const [text = '', ...events] = parts.map(plain)
  if (text === '') {
    st.last!.events.push(...events)
    return
  }
  const sections = st.tl.sections
  if (sections.length === 0) {
    sections.push({ name: null, periods: [] })
    st.loose = n
  }
  st.last = { text, events }
  sections.at(-1)!.periods.push(st.last)
}
