// The quadrant model and its parser: the title, the axis and quadrant texts, and the points in source order, each
// coordinate kept as written with its exact value.
import { parseDec, type Dec } from '../../charts/decimal.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable } from '../../text.ts'
import { unsupported } from '../../width.ts'

// A coordinate: its text as written, which prints, and its exact value.
export type Num = { raw: string; value: Dec }
// A point, and a quadrant or x-axis text, its owner q1…q4, x0 (left) or x1 (right). n is the statement's source line,
// which orders the legend.
export type Point = { name: string; x: Num; y: Num; n: number }
export type Field = { owner: string; text: string; n: number }
// x: left, then right; y: bottom, then top; quads: quadrant-1…4's texts. Each is null when the source gives none.
// fields lists the quadrant and x-axis texts in source order, an axis's left one first.
export type Quadrant = {
  title: string | null
  x: [string, string | null] | null
  y: [string, string | null] | null
  quads: (string | null)[]
  points: Point[]
  fields: Field[]
}

// A text: "…", or unquoted: letters, digits, spaces, non-ASCII and !#$%&'*+,./=?\_-, not starting with - and ending on
// no space. A coordinate: 0, 1 or 0.<digits>, as Mermaid's point pattern; so 1.0 and .5 are no coordinate.
const CH = String.raw`A-Za-z0-9!#$%&'*+,./=?\\_\u{80}-\u{10FFFF}-`
const TEXT = String.raw`(?:"[^"]*"|(?!-)[${CH}](?:[ ${CH}]*[${CH}])?)`
const COORD = String.raw`(0|1|0\.\d+)`
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^${s}$`, 'u')
const TITLE = /^title[ \t]+(.+)$/
const AXIS = re(String.raw`([xy])-axis[ \t]+(${TEXT})(?:[ \t]*-->[ \t]*(${TEXT}))?`)
const QUAD = re(String.raw`quadrant-([1-4])[ \t]+(${TEXT})`)
// A point: its text, an optional :::name, a colon and [x, y].
const POINT = re(String.raw`(${TEXT})(?::::[\w-]+)?[ \t]*:[ \t]*\[[ \t]*${COORD}[ \t]*,[ \t]*${COORD}[ \t]*\]`)
// A keyword, in any case, where a run of ASCII letters starts: Mermaid's lexer ignores case, and reads Titled as title.
const KEYWORD = /(?:^|[^A-Za-z])(?:title|x-axis|y-axis|quadrant-[1-4]|classdef|quadrantchart)/i
// Parsed and ignored: classDef; accTitle: and accDescr:, to the line's end; accDescr {, to its first }.
const CLASS_DEF = /^classDef[ \t]+\S/
const ACC = /^acc(?:Title|Descr)\s*:/
// An empty accTitle: or accDescr: fails: Mermaid's lexer then reads the next line as its text (12.2.0, verified).
const ACC_BLOCK = /^accDescr\s*\{/

// Ends the walk: parseQuadrant returns this Fail.
function stop(reason: string): never {
  throw fail(reason)
}

// The model src's statements build, or why it cannot be drawn: 'header' (not quadrantChart alone), 'syntax:<n>' (a line
// on source line n outside the subset: a point style, a lone -->, a markdown string, another coordinate, a keyword in
// another case or starting a longer word; or an accDescr { there with no }), 'repeat:<n>' (a second title, from
// frontmatter or a statement, x-axis, y-axis or quadrant-N), 'entity' or 'html' (text Mermaid shows otherwise) or
// 'unsupported-char U+XXXX'.
export function parseQuadrant(src: Source): Quadrant | Fail {
  try {
    return walk(src)
  } catch (e) {
    if (isFail(e)) {
      return e
    }

    throw e
  }
}

function walk(src: Source): Quadrant {
  if (src.header !== 'quadrantChart') {
    stop('header')
  }

  const q: Quadrant = { title: src.title, x: null, y: null, quads: [null, null, null, null], points: [], fields: [] }
  // title, x-axis, y-axis and quadrant-N, once each has come: a frontmatter title is the first title.
  const seen = new Set<string>(src.title === null ? [] : ['title'])
  let descr = 0 // the line of an accDescr { whose } has not come, else 0
  for (const { n, text: raw } of src.lines) {
    const t = raw.trim()
    if (descr) {
      if (closes(t, n)) {
        descr = 0
      }

      continue
    }

    if (ACC.test(t) && !t.replace(ACC, '').trim()) {
      stop(`syntax:${n}`)
    }

    if (ACC.test(t) || CLASS_DEF.test(t)) {
      continue
    }

    if (ACC_BLOCK.test(t)) {
      if (!closes(t.replace(ACC_BLOCK, ''), n)) {
        descr = n
      }

      continue
    }

    statement(t, n, q, seen)
  }

  if (descr) {
    stop(`syntax:${descr}`)
  }

  return q
}

// Whether an accDescr block's text closes in rest: at its first }, after which the line must end.
function closes(rest: string, n: number): boolean {
  const i = rest.indexOf('}')
  if (i < 0) {
    return false
  }

  if (rest.slice(i + 1).trim()) {
    stop(`syntax:${n}`)
  }

  return true
}

// Reads trimmed source line n into q.
function statement(t: string, n: number, q: Quadrant, seen: Set<string>): void {
  const once = (key: string) => {
    if (seen.has(key)) {
      stop(`repeat:${n}`)
    }

    seen.add(key)
  }
  let m: RegExpExecArray | null
  if ((m = TITLE.exec(t))) {
    once('title')
    q.title = shown(m[1]!.trim())
  } else if ((m = AXIS.exec(t))) {
    once(m[1]!)
    const pair: [string, string | null] = [text(m[2]!, n), m[3] === undefined ? null : text(m[3], n)]
    if (m[1] === 'y') {
      q.y = pair
      return
    }

    q.x = pair
    q.fields.push({ owner: 'x0', text: pair[0], n })
    if (pair[1] !== null) {
      q.fields.push({ owner: 'x1', text: pair[1], n })
    }
  } else if ((m = QUAD.exec(t))) {
    const k = Number(m[1])
    const s = text(m[2]!, n)
    once(`q${k}`)
    q.quads[k - 1] = s
    q.fields.push({ owner: `q${k}`, text: s, n })
  } else if ((m = POINT.exec(t))) {
    q.points.push({ name: text(m[1]!, n), x: num(m[2]!), y: num(m[3]!), n })
  } else {
    stop(`syntax:${n}`)
  }
}

// A text's content, each run of spaces one space. A "…" is trimmed, and a "`…`" markdown string fails; an unquoted text
// fails if a keyword starts a run of its letters.
function text(s: string, n: number): string {
  const quoted = s.startsWith('"')
  const t = quoted ? s.slice(1, -1).trim() : s
  if (quoted ? s.startsWith('"`') : KEYWORD.test(s)) {
    stop(`syntax:${n}`)
  }

  return shown(t).replace(/ +/g, ' ')
}

// t, if it can be drawn. Mermaid sanitizes every quadrant text (quadrantDb's textSanitizer; a title by
// setDiagramTitle), so text it shows otherwise fails as drawable says for a sanitized field with no <br>: 'entity' for
// a marker, 'html' for any <. Unquoted text cannot hold a <, as quadrant.jison reads it.
function shown(t: string): string {
  const f = drawable(t, 'sanitized', 'none')
  if (f) {
    throw f
  }

  const bad = unsupported(t)
  return bad ? stop(`unsupported-char ${bad}`) : t
}

// COORD has matched raw, so it parses.
const num = (raw: string): Num => ({ raw, value: parseDec(raw)! })
