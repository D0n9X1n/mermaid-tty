// Reads a flowchart's header, nodes, shapes, labels and links (plan A, T13, T14 and §7)
// into the graph model. A statement it cannot read whole fails, so the fence draws as source.
import { shapeFromName, type Shape } from '../../caps.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Dir, End, GEdge, GNode, Graph, NodeRow } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { unsupported } from '../../width.ts'

// `flowchart` or `graph`, alone (top-down, as in Mermaid) or with a direction.
const HEADER = /^(flowchart|graph)( (TD|TB|BT|LR|RL))?$/
// Letters, digits and _, joined by single . or -: A-->B reads A, -->, B.
const NAME = String.raw`[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*`
const ID = new RegExp(`^${NAME}`, 'u')
// A link in its basic form at lastIndex, with the spaces around it: an optional id@, then a
// tail mark, a line (two or more - or =, or - dots -) and a head mark, each mark optional;
// or three or more ~, with no marks. One |label| may follow (any "…" in it whole). Too short
// a line, -- or == with no head, is no link: it opens a text form.
const LINK = new RegExp(String.raw`\s*(?:(${NAME})@)?(?:([<ox])?(-{2,}|={2,}|-\.+-)([>ox])?|(~{3,}))\s*(?:\|((?:"[^"]*"|[^"|])*)\|\s*)?`, 'uy')
// A link in a text form at lastIndex, with the spaces around it: an optional id@, an opener,
// the text up to the first closer of the opener's kind (any "…" in it whole), then that
// closer and an optional head mark: -- t -->, == t ==>, -. t .->.
const TEXT = String.raw`((?:"[^"]*"|[^"])*?)`
const TEXTS = [String.raw`--${TEXT}(-{2,})([>ox])?`, String.raw`==${TEXT}(={2,})([>ox])?`, String.raw`-\.${TEXT}(-?\.+-)([>ox])?`]
  .map(form => new RegExp(String.raw`\s*(?:(${NAME})@)?${form}\s*`, 'uy'))
// The & between two nodes of a group, spaces around it: Mermaid reads A&B as one id.
const AMP = /\s+&\s+/y
// Each opener with each closer it pairs with, longest opener first. [/ and [\ pair
// with either slash, and the closer found first decides the shape.
const BRACKETS: readonly (readonly [open: string, close: string, shape: Shape])[] = [
  ['(((', ')))', 'dcircle'], ['([', '])', 'stadium'], ['[[', ']]', 'subroutine'], ['[(', ')]', 'cylinder'],
  ['((', '))', 'circle'], ['{{', '}}', 'hexagon'], ['[/', '/]', 'leanR'], ['[/', '\\]', 'trap'], ['[\\', '\\]', 'leanL'],
  ['[\\', '/]', 'trapInv'], ['(', ')', 'round'], ['[', ']', 'rect'], ['{', '}', 'diamond'], ['>', ']', 'asym'],
]
// One key: value pair of an @{…} body, from lastIndex: a key, then a "…" or '…' value, whose
// , ; { and } are text, or a bare one up to the next , { or }. A quote is one only where a
// value starts, as in YAML: `it's ok` is a bare value.
const PAIR = /\s*([\w-]+)\s*:\s*("[^"]*"|'[^']*'|[^"',{}][^,{}]*|)\s*/y

// A node as one mention writes it: shape and lines only if the mention gives them.
type Mention = { id: string; end: number; shape?: Shape; lines?: string[] }
// A node as the statements so far declare it.
type Decl = { id: string; shape: Shape; lines: string[]; order: number }
// A link as one statement writes it: what its edges draw, its id@ if it has one, and how far it reads.
type Link = { id?: string; end: number; style: GEdge['style']; tail: End; head: End; label: string | null; minlen: number }
// What the statements so far have declared: nodes by id, in first-mention order, and edges in source order.
type State = { nodes: Map<string, Decl>; edges: GEdge[] }

// The graph src declares, or why it cannot be drawn: 'header' (not flowchart or graph,
// alone or with a direction), 'syntax:<n>' (a statement on source line n not read
// whole), or a label's 'markdown-string', 'entity' or 'unsupported-char U+XXXX'.
export function parseFlowchart(src: Source): Graph | Fail {
  const head = HEADER.exec(src.header)
  // A header HEADER does not match, such as a bad direction (`flowchart XY`), fails 'header'.
  if (!head) return fail('header')
  const dir = (head[3] === undefined || head[3] === 'TD' ? 'TB' : head[3]) as Dir
  const st: State = { nodes: new Map(), edges: [] }
  for (const { n, text } of statements(src)) {
    const end = statement(text, st)
    if (isFail(end)) return end
    // Text left on a statement fails, with the statement's source line.
    if (end < text.length) return fail(`syntax:${n}`)
  }
  return { dir, title: src.title, nodes: [...st.nodes.values()].map(node), edges: st.edges, clusters: [] }
}

// Each line's statements, trimmed, with the line's number; empty ones drop.
function statements(src: Source): { n: number; text: string }[] {
  return src.lines.flatMap(({ n, text }) => split(text).map(s => ({ n, text: s.trim() })).filter(s => s.text))
}

// A line's runs that ; or the line's end closes. A "…" is one span, and so is an @{…} whose
// body reads whole, quotes and all; a " with no partner runs to the end of the line. Only
// " quotes outside @{…}: A[it's] is an apostrophe.
function split(line: string): string[] {
  const runs: string[] = []
  let start = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      const close = line.indexOf('"', i + 1)
      if (close < 0) break
      i = close
    } else if (line.startsWith('@{', i)) {
      const d = data(line, i + 2)
      if (d) i = d.end - 1
    } else if (line[i] === ';') {
      runs.push(line.slice(start, i))
      start = i + 1
    }
  }
  return [...runs, line.slice(start)]
}

// The pairs of the @{…} body that starts at i, in source order, and the index just past its
// }. null unless the body reads whole: pairs split by commas, one trailing comma at most,
// spaces, then }; and each key once.
function data(text: string, i: number): { pairs: [key: string, value: string][]; end: number } | null {
  const pairs: [string, string][] = []
  for (;;) {
    PAIR.lastIndex = i
    const m = PAIR.exec(text)
    if (!m) break
    const [, key = '', value = ''] = m
    if (pairs.some(([k]) => k === key)) return null
    pairs.push([key, value])
    i = PAIR.lastIndex
    if (text[i] !== ',') break
    i++
  }
  i += /^\s*/.exec(text.slice(i))![0].length
  return text[i] === '}' ? { pairs, end: i + 1 } : null
}

// Reads one statement into st and returns how far it read; the caller fails on any text
// left. A statement is G0 L1 G1 L2 G2 …: each G one node or several joined by &, and each
// link joins every node of the group before it to every node of the group after it.
function statement(text: string, st: State): number | Fail {
  let g = group(text, 0, st)
  if (g === null) return 0
  if (isFail(g)) return g
  for (;;) {
    const l = link(text, g.end)
    if (l === null) return g.end
    if (isFail(l)) return l
    const next = group(text, l.end, st)
    if (next === null) return g.end
    if (isFail(next)) return next
    connect(st, g.ids, next.ids, l)
    g = next
  }
}

// The nodes at `at`, one or several joined by " & ", each declared into st: their ids, and
// how far they read. null if no node starts there or after an &; a label's Fail if one fails.
function group(text: string, at: number, st: State): { ids: string[]; end: number } | Fail | null {
  const ids: string[] = []
  for (;;) {
    const m = mention(text, at)
    if (m === null || isFail(m)) return m
    declare(st, m)
    ids.push(m.id)
    AMP.lastIndex = m.end
    if (!AMP.test(text)) return { ids, end: m.end }
    at = AMP.lastIndex
  }
}

// The link at `at`: a basic form, or else a text form. null if none starts there; its
// label's Fail if that fails.
function link(text: string, at: number): Link | Fail | null {
  LINK.lastIndex = at
  const b = LINK.exec(text)
  if (b) {
    const [, id, tail, line, head, tildes = '', raw] = b
    const s = stroke(line ?? tildes, head)
    if (s.minlen > 0) {
      const lbl = raw === undefined ? null : label(raw)
      if (isFail(lbl)) return lbl
      return { id, end: LINK.lastIndex, ...s, tail: endOf(tail), head: endOf(head), label: lbl }
    }
  }
  for (const form of TEXTS) {
    form.lastIndex = at
    const t = form.exec(text)
    if (!t) continue
    const [, id, raw = '', line = '', head] = t
    const s = stroke(line, head)
    if (s.minlen < 1) return null
    const lbl = label(raw)
    if (isFail(lbl)) return lbl
    return { id, end: form.lastIndex, ...s, tail: 'none', head: endOf(head), label: lbl }
  }
  return null
}

// What a link's line draws: = thick, a dot dotted, ~ invisible, - solid; and minlen, 1 plus
// the line's length over its form's base: -- or == with a head, --- or === without, ~~~, or one dot.
function stroke(line: string, head?: string): { style: GEdge['style']; minlen: number } {
  if (line.includes('.')) return { style: 'dotted', minlen: line.replace(/[^.]/g, '').length }
  const style = line[0] === '=' ? 'thick' : line[0] === '~' ? 'invisible' : 'solid'
  return { style, minlen: line.length - (head ? 1 : 2) }
}

// The end a mark draws: < or > an arrow, o a circle, x a cross; no mark, none.
const endOf = (mark?: string): End => (mark === 'o' ? 'circle' : mark === 'x' ? 'cross' : mark ? 'arrow' : 'none')

// Adds an edge for each pair of from × to, in source order. As Mermaid gives ids, the link's
// id@ names the edge from the last of from to the first of to unless an edge has it already;
// any other edge is L_<from>_<to>_<n>, n 0 for the pair's first edge, then its count so far plus 1.
function connect(st: State, from: string[], to: string[], l: Link): void {
  for (const f of from) {
    for (const t of to) {
      const pair = st.edges.filter(e => e.from === f && e.to === t).length
      const id = l.id !== undefined && f === from.at(-1) && t === to[0] && !st.edges.some(e => e.id === l.id)
        ? l.id : `L_${f}_${t}_${pair === 0 ? 0 : pair + 1}`
      st.edges.push({ id, from: f, to: t, style: l.style, tail: l.tail, head: l.head, label: l.label, minlen: l.minlen, order: st.edges.length })
    }
  }
}

// A node at `at`: its id, then at most one bracket shape or @{…}. null if no id
// starts there, or its opener has no closer.
function mention(text: string, at: number): Mention | Fail | null {
  const id = ID.exec(text.slice(at))?.[0]
  if (id === undefined) return null
  at += id.length
  if (text.startsWith('@{', at)) {
    const d = data(text, at + 2)
    if (!d) return null
    const m: Mention = { id, end: d.end }
    for (const [key, raw] of d.pairs) {
      // As YAML reads it: one pair of matching quotes, "…" or '…', is not part of the value.
      const value = raw.trim().replace(/^(["'])(.*)\1$/s, '$2')
      if (key === 'shape') m.shape = shapeFromName(value)
      else if (key === 'label') {
        const t = value.startsWith('`') ? fail('markdown-string') : checked(value)
        if (isFail(t)) return t
        m.lines = labelLines(t)
      }
    }
    return m
  }
  const open = BRACKETS.find(([o]) => text.startsWith(o, at))?.[0]
  if (open === undefined) return { id, end: at }
  const pairs = BRACKETS.filter(([o]) => o === open)
  const c = closer(text, at + open.length, pairs.map(([, close]) => close))
  if (!c) return null
  const t = label(text.slice(at + open.length, c.at))
  if (isFail(t)) return t
  return { id, end: c.at + c.close.length, shape: pairs.find(([, close]) => close === c.close)![2], lines: labelLines(t) }
}

// The first of closes at or after i, outside "…": where it starts and which it is.
function closer(text: string, i: number, closes: readonly string[]): { at: number; close: string } | null {
  for (let quoted = false; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    else if (!quoted) {
      const close = closes.find(c => text.startsWith(c, i))
      if (close !== undefined) return { at: i, close }
    }
  }
  return null
}

// A bracket or edge label's text: trimmed, one enclosing pair of "…" stripped ("…" keeps
// punctuation). A "`…`" markdown string fails. Its <br> stay: a node splits them into
// lines, and an edge label keeps them for layout to split with labelLines.
function label(raw: string): string | Fail {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"`')) return fail('markdown-string')
  return checked(trimmed.replace(/^"(.*)"$/s, '$1'))
}

// Label text as written, if it can be drawn: a #…; entity or an unsupported character fails.
function checked(text: string): string | Fail {
  // Mermaid decodes #name; and #123; as HTML entities.
  if (/#\w+;/.test(text)) return fail('entity')
  const bad = unsupported(text)
  if (bad) return fail(`unsupported-char ${bad}`)
  return text
}

// Declares m's node at its first mention; a later mention's shape or label replaces the one before.
function declare(st: State, m: Mention): void {
  const d: Decl = st.nodes.get(m.id) ?? { id: m.id, shape: 'rect', lines: [m.id], order: st.nodes.size }
  if (m.shape) d.shape = m.shape
  if (m.lines) d.lines = m.lines
  st.nodes.set(m.id, d)
}

// A declared node in the graph model: a diamond is a decision, and each label line a centered row.
function node(d: Decl): GNode {
  const role = d.shape === 'diamond' ? 'decision' : 'node'
  return { id: d.id, shape: d.shape, role, rows: d.lines.map((text): NodeRow => ({ text, role, align: 'center' })), order: d.order }
}
