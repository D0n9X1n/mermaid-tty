// The pie model and its parser (plan C T63; matrix, pie): the title, and the slices in source order, each with its
// value
// as written and as an exact decimal.
import { parseDec, type Dec } from '../../charts/decimal.ts'
import { fail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

// A slice: its label, its value as written and as an exact decimal, and its source index.
export type Slice = { label: string; raw: string; value: Dec; order: number }
export type Pie = { title: string | null; slices: Slice[] }

// The header: pie, then showData, then a title, each optional, on one line.
const HEADER = /^pie( showData)?( title (.+))?$/
// The statements, each a whole trimmed line: a title; an accTitle or accDescr line; an accDescr { block, whose text
// runs to
// its first }, which must end its line; and a slice: a "…" or '…' label, a colon with spaces or tabs around it, and the
// rest.
const TITLE = /^title[ \t]+(.+)$/
const ACC = /^(?:accTitle|accDescr)[ \t]*:/
const ACC_BLOCK = /^accDescr[ \t]*\{(.*)$/
const SLICE = /^(?:"([^"]*)"|'([^']*)')[ \t]*:[ \t]*(.*)$/
// A value token; the matrix's subset of them, positive with no sign and no leading 0 on an integer.
const TOKEN = /^[+-]?\d+(\.\d+)?$/
const POSITIVE = /^(?:[1-9]\d*|\d+\.\d+)$/

// Why text cannot be drawn, or null: text Mermaid shows otherwise in a field of mode and br fails as drawable says, and
// so
// does an unsupported character. A slice is plain, each <br> drawn as written; a title is sanitized, with no <br>.
function undrawable(text: string, mode: Mode, br: Br): Fail | null {
  const f = drawable(text, mode, br)
  if (f) {
    return f
  }

  const bad = unsupported(text)
  return bad ? fail(`unsupported-char ${bad}`) : null
}

// The pie src declares, or why it cannot be drawn: 'header' (a header outside the subset), 'syntax:<n>' (a line that is
// no statement, a label with a backslash, a value that is no token, or an accDescr { block left open or not ending its
// line), 'domain:<n>' (a token outside the subset: 0, a sign or a leading 0), 'repeat:<n>' (a label seen before, or a
// second title), 'repeat:header' (a header title after a frontmatter one: Source numbers neither line), 'entity',
// 'html' or
// 'unsupported-char U+XXXX' (text that cannot be drawn), or 'empty' (no slice).
export function parsePie(src: Source): Pie | Fail {
  const head = HEADER.exec(src.header)
  if (!head) {
    return fail('header')
  }
  // A frontmatter title is no body text, so Mermaid does not encode it; readSource has checked its characters.
  const pie: Pie = { title: src.title, slices: [] }
  const f = head[3] === undefined ? null : titled(pie, head[3], 'header')
  if (f) {
    return f
  }

  let open = 0 // the line an open accDescr { block starts on, or 0
  for (const { n, text } of src.lines) {
    const t = text.trim()
    const block = open ? t : ACC_BLOCK.exec(t)?.[1]
    if (block === undefined) {
      const g = statement(pie, t, n)
      if (g) {
        return g
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

  return pie.slices.length > 0 ? pie : fail('empty')
}

// Reads the statement t on line n into pie: null, or why it fails.
function statement(pie: Pie, t: string, n: number): Fail | null {
  const title = TITLE.exec(t)
  if (title) {
    return titled(pie, title[1]!, n)
  }

  if (ACC.test(t)) {
    return null
  } // accessibility text is not drawn

  const m = SLICE.exec(t)
  return m ? slice(pie, m, n) : fail(`syntax:${n}`)
}

// Sets pie's title to text, trimmed, read at where: its line, or 'header'. Fails 'repeat:<where>' if pie has a title.
function titled(pie: Pie, text: string, where: number | 'header'): Fail | null {
  if (pie.title !== null) {
    return fail(`repeat:${where}`)
  }

  const t = text.trim()
  const bad = undrawable(t, 'sanitized', 'none')
  if (bad) {
    return bad
  }

  pie.title = t
  return null
}

// Adds the slice m reads on line n to pie: null, or why it fails.
function slice(pie: Pie, m: RegExpExecArray, n: number): Fail | null {
  const label = m[1] ?? m[2]!
  const raw = m[3]!
  if (label.includes('\\') || !TOKEN.test(raw)) {
    return fail(`syntax:${n}`)
  }

  const value = POSITIVE.test(raw) ? parseDec(raw) : null
  if (!value || value.n <= 0n) {
    return fail(`domain:${n}`)
  }

  if (pie.slices.some((s) => s.label === label)) {
    return fail(`repeat:${n}`)
  }

  const bad = undrawable(label, 'plain', 'literal')
  if (bad) {
    return bad
  }

  pie.slices.push({ label, raw, value, order: pie.slices.length })
  return null
}
