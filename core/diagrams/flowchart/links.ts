// Reads a flowchart link as Mermaid 12.2.0's lexer (flow.jison) and flowDb's destructLink read it: which ends it draws, its
// stroke and length, and its label's raw text. A link Mermaid cannot lex, or reads as INVALID, is null.
import type { End, GEdge } from '../../graph/model.ts'
import { misread } from './ids.ts'

// Letters, digits and _, joined by single . or -: A-->B reads A, -->, B.
export const NAME = String.raw`[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*`
// What a link's edges draw: ends, stroke and minlen.
export type Ends = { style: GEdge['style']; tail: End; head: End; minlen: number }
// A link as read: its id@ if any, how far it reads, its ends, and its label's raw text (|…| or a text form's), if any;
// pipe when that text is a |…| label, which Mermaid lexes as node text, not as a text form's edge text.
export type RawLink = Ends & { id?: string; end: number; raw?: string; pipe?: true }

// A basic link at lastIndex, as Mermaid's rules lex it, with the spaces around it: an optional id@, then a line with its
// marks (-- or ==, then one more of the line or a head mark; or - dots - with an optional head; or three or more ~); an
// optional |label| (any "…" in it whole). A dotted line needs its first -: Mermaid reads A.-B as one id.
const BASIC = new RegExp(String.raw`\s*(?:(${NAME})@)?([xo<]?(?:--+[-xo>]|==+[=xo>]|-\.+-[xo>]?)|~~~+)\s*(?:\|((?:"[^"]*"|[^"|])*)\|\s*)?`, 'uy')
// Each text form: its opener at lastIndex (an optional id@, a tail mark, -- == or -.), the closer that ends its text, and
// one character of the text, which can never be the line's own character twice (-- ends it) or once (= and .).
const FORMS = [[String.raw`[xo<]?--`, String.raw`[xo<]?--+[-xo>]`, /[^-]|-(?!-)/y], [String.raw`[xo<]?==`, String.raw`[xo<]?==+[=xo>]`, /[^=]/y],
  [String.raw`[xo<]?-\.`, String.raw`[xo<]?-?\.+-[xo>]?`, /[^.]/y]].map(([open, close, ch]) => ({
  open: new RegExp(String.raw`\s*(?:(${NAME})@)?(${open as string})\s*`, 'uy'), close: new RegExp(String.raw`\s*(${close as string})\s*`, 'y'), ch: ch as RegExp }))
// One string at lastIndex: "`…`" (Markdown) or "…", with text in it; a " right after it would start another.
const STRING = /"`[^`"]+`"|"[^"]+"(?!`)/y
// Mermaid caps an edge's length at 10.
const MAX_MINLEN = 10
// The end each type draws at the tail and the head (flowDb destructEdgeType).
const MARK: Readonly<Record<string, End>> = { point: 'arrow', circle: 'circle', cross: 'cross' }

// The link at `at`, as Mermaid reads it, or null.
export function readLink(text: string, at: number): RawLink | null {
  BASIC.lastIndex = at
  const b = BASIC.exec(text)
  // An id@ the lexer reads as a keyword first (end@, style.x@, default.x@) is no edge id.
  if (b && b[1] !== undefined && misread(b[1], '@', 'edge')) { return null }
  if (b) { return { id: b[1], end: BASIC.lastIndex, raw: b[3], ...(b[3] === undefined ? {} : { pipe: true as const }), ...ends(endLink(b[2]!)) } }
  for (const f of FORMS) {
    f.open.lastIndex = at
    const o = f.open.exec(text)
    if (!o) { continue }
    if (o[1] !== undefined && misread(o[1], '@', 'edge')) { return null }
    const t = edgeText(text, f.open.lastIndex, f.close, f.ch)
    if (!t) { return null }
    const s = startLink(o[2]!)
const  e = endLink(t.closer)
    // Mermaid's destructLink: strokes must match; an opener mark must match the closer's head, and then marks both ends.
    if (s.stroke !== e.stroke || (s.type !== 'open' && s.type !== e.type)) { return null }
    return { id: o[1], end: t.end, raw: t.raw, ...ends({ ...e, type: s.type === 'open' ? e.type : `double_${e.type}` }) }
  }
  return null
}

// A text form's text from i, as edgeText lexes it: one string first, if any, then text characters up to the first closer.
// Null if no closer comes, the text is empty, or a " comes after the first token.
function edgeText(text: string, i: number, close: RegExp, ch: RegExp): { raw: string; closer: string; end: number } | null {
  let j = i
  STRING.lastIndex = j
  if (STRING.test(text)) { j = STRING.lastIndex }
  for (;;) {
    if (text[j] === '"') { return null }
    close.lastIndex = j
    const c = close.exec(text)
    if (c) { return j > i ? { raw: text.slice(i, j), closer: c[1]!, end: close.lastIndex } : null }
    ch.lastIndex = j
    if (!ch.test(text)) { return null }
    j = ch.lastIndex
  }
}

// A link token as flowDb's destructEndLink reads it: its last character the head (x cross, > point, o circle, else open),
// double when the first character pairs with it; the line, less the head and any paired mark, then gives the stroke
// (= first thick, ~ first invisible, any dot dotted) and the length (dots, or the line's length less 1). An unpaired mark
// stays in the line: <==o is a normal line of length 2.
function endLink(token: string): { type: string; stroke: string; length: number } {
  const last = token.at(-1)!
const  type = last === 'x' ? 'cross' : last === '>' ? 'point' : last === 'o' ? 'circle' : 'open'
  const paired = type !== 'open' && token[0] === (last === '>' ? '<' : last)
  const line = token.slice(paired ? 1 : 0, -1)
const  dots = line.replace(/[^.]/g, '').length
  const stroke = dots ? 'dotted' : line[0] === '=' ? 'thick' : line[0] === '~' ? 'invisible' : 'normal'
  return { type: paired ? `double_${type}` : type, stroke, length: dots || line.length - 1 }
}

// A text form's opener as destructStartLink reads it: a leading <, x or o its type, and its stroke (= thick, . dotted).
function startLink(token: string): { type: string; stroke: string } {
  const t = token.trim()
const  type = t[0] === '<' ? 'point' : t[0] === 'x' ? 'cross' : t[0] === 'o' ? 'circle' : 'open'
  return { type, stroke: t.includes('.') ? 'dotted' : t.includes('=') ? 'thick' : 'normal' }
}

// What a read link draws (flowDb getData): a double type marks both ends, one type the head; open and invisible none.
function ends(l: { type: string; stroke: string; length: number }): Ends {
  const style = l.stroke === 'thick' ? 'thick' : l.stroke === 'dotted' ? 'dotted' : l.stroke === 'invisible' ? 'invisible' : 'solid'
  const mark = l.stroke === 'invisible' ? 'none' : MARK[l.type.replace('double_', '')] ?? 'none'
  return { style, tail: l.type.startsWith('double_') ? mark : 'none', head: mark, minlen: Math.min(MAX_MINLEN, l.length) }
}
