// The journey model and its parser (plan C T65; matrix, journey): the title, and the tasks grouped by section in source
// order. Tasks before the first section form a first group with no name.
import { cmp, dec, parseDec, type Dec } from '../../charts/decimal.ts'
import { fail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

// A task: its name, its score as an exact decimal and as written, and its actors, each trimmed.
export type Task = { name: string; score: Dec; raw: string; actors: string[] }
export type Journey = { title: string | null; groups: { name: string | null; tasks: Task[] }[] }

// The statements, each a whole trimmed line: a title; a section; an accTitle or accDescr line; an accDescr { block,
// whose
// text runs to its first }, which must end its line; and a task, which task reads.
const TITLE = /^title[ \t]+(.+)$/
const SECTION = /^section[ \t]+(.+)$/
const ACC = /^(?:accTitle|accDescr)[ \t]*:/
// An empty accTitle: or accDescr: fails: Mermaid's lexer then reads the next line as its text (12.2.0, verified).
const ACC_BLOCK = /^accDescr[ \t]*\{(.*)$/
// Outside accessibility text, Mermaid's lexer skips # to the line's end, has no rule for ;, and reads %% as a comment
// even
// in quotes, since journey has no strings. It reads its keywords in any case and at the start of a longer word, so a
// line
// that starts with one but is no statement falls back (common rule 5).
const UNREAD = /[#;]|%%/
const KEYWORD = /^(?:title|section|journey|accTitle|accDescr)/i
const MIN = dec(1)
const MAX = dec(5)

// Why texts, in a field of mode and br, cannot be drawn, or null: text Mermaid shows otherwise fails as drawable says,
// and
// so does an unsupported character. A task or section never splits, each <br> drawn as written (plain, literal); an
// actor
// shows a <br> as a space, so any <br falls back (plain, none); a title is sanitized, with no <br>.
function undrawable(mode: Mode, br: Br, ...texts: string[]): Fail | null {
  for (const t of texts) {
    const f = drawable(t, mode, br)
    if (f) {
      return f
    }

    const bad = unsupported(t)
    if (bad) {
      return fail(`unsupported-char ${bad}`)
    }
  }

  return null
}

// The journey src declares, or why it cannot be drawn: 'header' (a header other than journey alone), 'syntax:<n>' (a
// line
// that is no statement: a #, ; or %% outside accessibility text, a keyword in another case or starting a longer word, a
// ':' in a section, a task without exactly two ':', an empty name or actor, or an accDescr { block left open or not
// ending
// its line), 'domain:<n>' (a score that is no decimal from 1 to 5), 'repeat:<n>' (an actor twice in one task, or a
// second
// title), 'entity' or 'html' (text Mermaid shows otherwise), 'unsupported-char U+XXXX' (text that cannot be drawn), or
// 'empty' (no task).
export function parseJourney(src: Source): Journey | Fail {
  if (src.header !== 'journey') {
    return fail('header')
  }
  // A frontmatter title is the first title (common rule 3); readSource has checked its characters.
  const journey: Journey = { title: src.title, groups: [] }
  let open = 0 // the line an open accDescr { block starts on, or 0
  for (const { n, text } of src.lines) {
    const t = text.trim()
    const block = open ? t : ACC_BLOCK.exec(t)?.[1]
    if (block === undefined) {
      const f = statement(journey, t, n)
      if (f) {
        return f
      }

      continue
    }
    // Accessibility text is not drawn.
    const end = block.indexOf('}')
    if (end >= 0 && block.slice(end + 1).trim()) {
      return fail(`syntax:${n}`)
    }

    open = end >= 0 ? 0 : open || n
  }

  if (open) {
    return fail(`syntax:${open}`)
  }

  return journey.groups.some((g) => g.tasks.length > 0) ? journey : fail('empty')
}

// Reads the statement t on line n into journey: null, or why it fails. Accessibility text is not drawn, so a # or ; in
// it
// is no comment.
function statement(journey: Journey, t: string, n: number): Fail | null {
  if (ACC.test(t)) {
    return t.replace(ACC, '').trim() ? null : fail(`syntax:${n}`)
  }

  if (UNREAD.test(t)) {
    return fail(`syntax:${n}`)
  }

  const title = TITLE.exec(t)?.[1]
  if (title !== undefined) {
    if (journey.title !== null) {
      return fail(`repeat:${n}`)
    }

    journey.title = title.trim()
    return undrawable('sanitized', 'none', journey.title)
  }

  const section = SECTION.exec(t)?.[1]?.trim()
  if (section !== undefined) {
    if (section.includes(':')) {
      return fail(`syntax:${n}`)
    }

    journey.groups.push({ name: section, tasks: [] })
    return undrawable('plain', 'literal', section)
  }

  return KEYWORD.test(t) ? fail(`syntax:${n}`) : task(journey, t, n)
}

// Adds the task t on line n, '<name>: <score>: <actor>[, <actor>…]', to journey's last group, or to a first group with
// no
// name: null, or why it fails.
function task(journey: Journey, t: string, n: number): Fail | null {
  const parts = t.split(':').map((s) => s.trim())
  if (parts.length !== 3) {
    return fail(`syntax:${n}`)
  }

  const [name, raw, list] = parts as [string, string, string]
  const actors = list.split(',').map((a) => a.trim())
  if (!name || actors.includes('')) {
    return fail(`syntax:${n}`)
  }

  const score = parseDec(raw)
  if (!score || cmp(score, MIN) < 0 || cmp(score, MAX) > 0) {
    return fail(`domain:${n}`)
  }

  if (new Set(actors).size < actors.length) {
    return fail(`repeat:${n}`)
  }

  const bad = undrawable('plain', 'literal', name) ?? undrawable('plain', 'none', ...actors)
  if (bad) {
    return bad
  }

  if (journey.groups.length === 0) {
    journey.groups.push({ name: null, tasks: [] })
  }

  journey.groups.at(-1)!.tasks.push({ name, score, raw, actors })
  return null
}
