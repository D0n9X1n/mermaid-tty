// Reads a flowchart's header, nodes, shapes and labels (plan A, T13 and §7) into
// the graph model. A statement it cannot read whole fails, so the fence draws as source.
import { shapeFromName, type Shape } from '../../caps.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Dir, GNode, Graph, NodeRow } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { unsupported } from '../../width.ts'

// `flowchart` or `graph`, alone (top-down, as in Mermaid) or with a direction.
const HEADER = /^(flowchart|graph)( (TD|TB|BT|LR|RL))?$/
// Letters, digits and _, joined by single . or -: A-->B reads A, -->, B.
const ID = /^[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*/u
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
// What the statements so far have declared: nodes by id, in first-mention order.
type State = { nodes: Map<string, Decl> }

// The graph src declares, or why it cannot be drawn: 'header' (not flowchart or graph,
// alone or with a direction), 'syntax:<n>' (a statement on source line n not read
// whole), or a label's 'markdown-string', 'entity' or 'unsupported-char U+XXXX'.
export function parseFlowchart(src: Source): Graph | Fail {
  const head = HEADER.exec(src.header)
  // A header HEADER does not match, such as a bad direction (`flowchart XY`), fails 'header'.
  if (!head) return fail('header')
  const dir = (head[3] === undefined || head[3] === 'TD' ? 'TB' : head[3]) as Dir
  const st: State = { nodes: new Map() }
  for (const { n, text } of statements(src)) {
    const end = statement(text, st)
    if (isFail(end)) return end
    // Text left on a statement fails, with the statement's source line.
    if (end < text.length) return fail(`syntax:${n}`)
  }
  return { dir, title: src.title, nodes: [...st.nodes.values()].map(node), edges: [], clusters: [] }
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

// Reads one statement into st and returns how far it read; the caller fails on any
// text left. A statement is one node for now: links and keyword statements read here.
function statement(text: string, st: State): number | Fail {
  const m = mention(text, 0)
  if (m === null) return 0
  if (isFail(m)) return m
  declare(st, m)
  return m.end
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
        const lines = value.startsWith('`') ? fail('markdown-string') : textLines(value)
        if (isFail(lines)) return lines
        m.lines = lines
      }
    }
    return m
  }
  const open = BRACKETS.find(([o]) => text.startsWith(o, at))?.[0]
  if (open === undefined) return { id, end: at }
  const pairs = BRACKETS.filter(([o]) => o === open)
  const c = closer(text, at + open.length, pairs.map(([, close]) => close))
  if (!c) return null
  const lines = label(text.slice(at + open.length, c.at))
  if (isFail(lines)) return lines
  return { id, end: c.at + c.close.length, shape: pairs.find(([, close]) => close === c.close)![2], lines }
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

// A bracket label's lines: trimmed, one enclosing pair of "…" stripped ("…" keeps
// punctuation). A "`…`" markdown string fails.
function label(raw: string): string[] | Fail {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"`')) return fail('markdown-string')
  return textLines(trimmed.replace(/^"(.*)"$/s, '$1'))
}

// Label text split at <br>. A #…; entity or an unsupported character fails.
function textLines(text: string): string[] | Fail {
  // Mermaid decodes #name; and #123; as HTML entities.
  if (/#\w+;/.test(text)) return fail('entity')
  const bad = unsupported(text)
  if (bad) return fail(`unsupported-char ${bad}`)
  return labelLines(text)
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
