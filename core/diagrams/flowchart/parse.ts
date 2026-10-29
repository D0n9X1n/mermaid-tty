// Reads a flowchart's header, nodes, shapes, labels, links and subgraphs (plan A, T13, T14, T15 and §7) into the
// graph model; its styling and accessibility directives draw nothing. A statement it cannot read whole fails, so the
// fence draws as source.
import { shapeFromName, type Shape } from '../../caps.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Dir, End, GCluster, GEdge, GNode, Graph, NodeRow } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { unsupported } from '../../width.ts'

// `flowchart` or `graph`, alone (top-down, as in Mermaid) or with a direction.
const HEADER = /^(flowchart|graph)( (TD|TB|BT|LR|RL))?$/
// Where Mermaid's lexer finds a direction statement: anywhere in a line, which it then reads whole as that
// statement; global, for matchAll. DIR_LINE: a line that is only one, with spaces and one ; after it.
const DIR_IN = /direction\s+(?:TB|BT|RL|LR|TD)/g
const DIR_LINE = /^direction\s+(TB|BT|RL|LR|TD)\s*;?$/
// As Mermaid's lexer reads them: an accTitle: or accDescr: statement, whose value runs to the line's end, and the
// opener of an accDescr {…} block, whose text runs to its first }, across lines. Both draw nothing. Sticky: matchAt
// tries each where a statement starts.
const ACC_LINE = /acc(?:Title|Descr)\s*:/y
const ACC_BLOCK = /accDescr\s*\{/y
// One space, as trim reads spaces.
const SPACE = /\s/
// A styling statement, which draws nothing: classDef, class, style, linkStyle or click, then a space.
const DIRECTIVE = /^(?:classDef|class|style|linkStyle|click)\s/
// Letters, digits and _, joined by single . or -: A-->B reads A, -->, B.
const NAME = String.raw`[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*`
const ID = new RegExp(`^${NAME}`, 'u')
// A subgraph header: subgraph and spaces, then an id and what follows it, or a "title" alone.
const SUBGRAPH = new RegExp(String.raw`^subgraph +(?:(${NAME}) *(.*)|("[^"]*"))$`, 'u')
// A :::name class at lastIndex, after a node's id or shape. It draws nothing.
const CLASS = new RegExp(String.raw`:::${NAME}`, 'uy')
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
// The head mark each tail mark pairs with: Mermaid draws both ends only of <…>, o…o and x…x.
const PARTNER: Readonly<Record<string, string>> = { '<': '>', o: 'o', x: 'x' }
// Mermaid caps an edge's length at 10.
const MAX_MINLEN = 10
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

// A node as one mention writes it: shape and lines only if the mention gives them; data if it has an @{…}.
type Mention = { id: string; end: number; shape?: Shape; lines?: string[]; data?: true }
// A node as the statements so far declare it; bare while no mention has given it a shape, a label or an @{…}.
type Decl = { id: string; shape: Shape; lines: string[]; bare: boolean }
// A link as one statement writes it: what its edges draw, its id@ if it has one, and how far it reads.
type Link = { id?: string; end: number; style: GEdge['style']; tail: End; head: End; label: string | null; minlen: number }
// An open subgraph: its cluster, and each id its block mentions, in order: its statements' nodes and the subgraphs closed in it.
type Block = { cluster: GCluster; ids: string[] }
// What the statements so far declare: nodes by id, in first-mention order; edges in source order; clusters in the order their
// subgraphs open; the subgraphs still open, innermost last; the cluster that took each id a closed subgraph's block mentions;
// and the line of an accDescr { whose } has not come, else null.
type State = { nodes: Map<string, Decl>; edges: GEdge[]; clusters: GCluster[]; open: Block[]; parent: Map<string, string>; descr: number | null }

// The graph src declares, or why it cannot be drawn: 'header' (not flowchart or graph,
// alone or with a direction), 'syntax:<n>' (a statement on source line n not read
// whole), 'unclosed-subgraph', 'id-collision' (an edge id that a node, a cluster or an earlier edge also has),
// 'invisible-label' (a label on a ~~~ link), or a label's 'markdown-string', 'entity' or 'unsupported-char U+XXXX'.
export function parseFlowchart(src: Source): Graph | Fail {
  const head = HEADER.exec(src.header)
  // A header HEADER does not match, such as a bad direction (`flowchart XY`), fails 'header'.
  if (!head) return fail('header')
  const dir = (head[3] === undefined || head[3] === 'TD' ? 'TB' : head[3]) as Dir
  const st: State = { nodes: new Map(), edges: [], clusters: [], open: [], parent: new Map(), descr: null }
  for (const { n, text } of src.lines) {
    const f = line(text.trim(), st, n)
    // A step that fails 'syntax' fails with its statement's source line.
    if (f) return f.reason === 'syntax' ? fail(`syntax:${n}`) : f
  }
  // An accDescr { with no } fails with its line.
  if (st.descr !== null) return fail(`syntax:${st.descr}`)
  if (st.open.length > 0) return fail('unclosed-subgraph')
  const g = graph(dir, src.title, st)
  // An edge id that a node, a cluster or an earlier edge has would give two drawn things one owner, whichever came first.
  const ids = new Set([...g.nodes, ...g.clusters].map(x => x.id))
  for (const e of g.edges) {
    if (ids.has(e.id)) return fail('id-collision')
    ids.add(e.id)
  }
  return g
}

// Reads trimmed source line n into st: null, or why it fails. In an open accDescr {…} block, the line is text up to its
// first }, after which it reads on. As Mermaid's lexer reads them, an accTitle: or accDescr: statement runs to the line's
// end and accDescr { opens a block, wherever a statement starts; and elsewhere, a line where it finds `direction X` is only
// that statement: there, it sets the innermost open subgraph's direction, TD as TB. Where a block closes, the rest of the
// line reads as a line of its own. One pass, left to right, from p: no recursion, so a line of many blocks cannot overflow
// the stack, and time linear in the line's length.
function line(t: string, st: State, n: number): Fail | null {
  // The start of the line's last direction X: the rest of the line from p has one iff lastDir >= p. No match of DIR_IN
  // can overlap another, so matchAll finds every start.
  let lastDir = -1
  for (const m of t.matchAll(DIR_IN)) lastDir = m.index!
  // fresh: p starts the line, or the rest of it after a block closed, where a direction X makes the rest one statement.
  let p = 0, fresh = true
  for (;;) {
    if (st.descr !== null) {
      const brace = t.indexOf('}', p)
      if (brace < 0) return null
      st.descr = null
      p = skipSpace(t, brace + 1)
      fresh = true
      continue
    }
    if (p >= t.length) return null
    if (fresh && matchAt(ACC_LINE, t, p) < 0 && matchAt(ACC_BLOCK, t, p) < 0 && lastDir >= p) {
      const d = DIR_LINE.exec(t.slice(p))?.[1], b = st.open.at(-1)
      if (d === undefined || !b) return fail('syntax')
      b.cluster.dir = (d === 'TD' ? 'TB' : d) as Dir
      return null
    }
    fresh = false
    // The run from p: an accTitle: or accDescr: statement ends the line; an accDescr { opens a block, read from p on.
    const q = skipSpace(t, p)
    if (matchAt(ACC_LINE, t, q) >= 0) return null
    const open = matchAt(ACC_BLOCK, t, q)
    if (open >= 0) {
      st.descr = n
      p = skipSpace(t, open)
      continue
    }
    const end = runEnd(t, p), s = t.slice(p, end).trim()
    const f = s ? stmt(s, st) : null
    if (f) return f
    p = end + 1
  }
}

// Reads one statement into st: a styling directive or an id@{…} of a known edge, which draw nothing; `end`; a subgraph
// header; or nodes and links read whole. null, or why it fails.
function stmt(s: string, st: State): Fail | null {
  if (DIRECTIVE.test(s) || edgeData(s, st)) return null
  if (s === 'end') return closeSubgraph(st)
  // Mermaid's lexer reads subgraph as a keyword even where a longer word starts with it.
  if (s.startsWith('subgraph')) return openSubgraph(s, st)
  const end = statement(s, st)
  if (isFail(end)) return end
  return end < s.length ? fail('syntax') : null
}

// Whether s is only id@{…}, its body read whole, for an id an edge already has. Mermaid then sets that edge's animation or
// curve, which this renderer does not draw, and adds no node.
function edgeData(s: string, st: State): boolean {
  const id = ID.exec(s)?.[0]
  return id !== undefined && st.edges.some(e => e.id === id) && s.startsWith('@{', id.length) && data(s, id.length + 2)?.end === s.length
}

// Opens the subgraph header s declares: `subgraph id`, `subgraph id [title]` (title "…" or not), or `subgraph "title"`, whose
// title is also its id. null, or why it fails: 'syntax' for any other form, a blank title, or an id that a subgraph or a
// node with a shape, a label or an @{…} already has; or the title's label Fail.
function openSubgraph(s: string, st: State): Fail | null {
  const m = SUBGRAPH.exec(s)
  if (!m) return fail('syntax')
  const [, name, rest = '', quoted] = m
  const c = rest.startsWith('[') ? closer(rest, 1, [']']) : null
  if (rest && c?.at !== rest.length - 1) return fail('syntax')
  const title = label(name === undefined ? quoted! : c ? rest.slice(1, c.at) : name)
  if (isFail(title)) return title
  const id = name ?? title, d = st.nodes.get(id)
  if (!title.trim() || st.clusters.some(k => k.id === id) || (d && !d.bare)) return fail('syntax')
  const cluster: GCluster = { id, title, dir: null, nodes: [], clusters: [] }
  st.clusters.push(cluster)
  st.open.push({ cluster, ids: [] })
  return null
}

// Closes the innermost open subgraph. As in Mermaid's flowDb, it takes each id its block mentions that no subgraph closed
// before it took, but its own; and its id joins the block it closed in. null, or 'syntax' for an `end` with nothing open,
// or a cluster it would take that holds it.
function closeSubgraph(st: State): Fail | null {
  const b = st.open.pop()
  if (!b) return fail('syntax')
  const id = b.cluster.id
  for (const m of b.ids) {
    if (m === id || st.parent.has(m)) continue
    for (let p: string | undefined = id; p !== undefined; p = st.parent.get(p)) if (p === m) return fail('syntax')
    st.parent.set(m, id)
  }
  st.open.at(-1)?.ids.push(id)
  return null
}

// The graph st declares. Each id a cluster took is a member cluster if a subgraph has it, else a member node. A node whose
// id a cluster has is that cluster, as an edge end, and no node; order counts the nodes that remain.
function graph(dir: Dir, title: string | null, st: State): Graph {
  const ids = new Set(st.clusters.map(c => c.id))
  for (const [m, p] of st.parent) {
    const c = st.clusters.find(k => k.id === p)!
    if (ids.has(m)) c.clusters.push(m)
    else c.nodes.push(m)
  }
  const nodes = [...st.nodes.values()].filter(d => !ids.has(d.id)).map(node)
  return { dir, title, nodes, edges: st.edges, clusters: st.clusters }
}

// The end of the run that starts at i in line: the index of the ; that closes it, or the line's length. A "…" is one
// span, and so is an @{…} whose body reads whole, quotes and all; a " with no partner runs to the end of the line. Only
// " quotes outside @{…}: A[it's] is an apostrophe.
function runEnd(line: string, i: number): number {
  for (; i < line.length; i++) {
    if (line[i] === '"') {
      const close = line.indexOf('"', i + 1)
      if (close < 0) return line.length
      i = close
    } else if (line.startsWith('@{', i)) {
      const d = data(line, i + 2)
      if (d) i = d.end - 1
    } else if (line[i] === ';') return i
  }
  return line.length
}

// The index just past sticky re's match at i in text, or -1 when it does not match there.
function matchAt(re: RegExp, text: string, i: number): number {
  re.lastIndex = i
  return re.test(text) ? re.lastIndex : -1
}

// The first index from i in text that is not a space, or text's length.
function skipSpace(text: string, i: number): number {
  while (i < text.length && SPACE.test(text[i]!)) i++
  return i
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
    const f = declare(st, m)
    if (f) return f
    ids.push(m.id)
    st.open.at(-1)?.ids.push(m.id)
    AMP.lastIndex = m.end
    if (!AMP.test(text)) return { ids, end: m.end }
    at = AMP.lastIndex
  }
}

// The link at `at`: a basic form, or else a text form. null if none starts there, or if its tail mark has no partner head
// (<…>, o…o, x…x): Mermaid draws only the head of <--o, o--> or <---. Its label's Fail if that fails, and 'invisible-label'
// for a label on ~~~, as how Mermaid draws one is unknown (only the basic form makes ~~~).
function link(text: string, at: number): Link | Fail | null {
  LINK.lastIndex = at
  const b = LINK.exec(text)
  if (b) {
    const [, id, tail, line, head, tildes = '', raw] = b
    if (tail !== undefined && head !== PARTNER[tail]) return null
    const s = stroke(line ?? tildes, head)
    if (s.minlen > 0) {
      const lbl = raw === undefined ? null : edgeLabel(raw)
      if (isFail(lbl)) return lbl
      if (s.style === 'invisible' && lbl !== null) return fail('invisible-label')
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
    const lbl = edgeLabel(raw)
    if (isFail(lbl)) return lbl
    return { id, end: form.lastIndex, ...s, tail: 'none', head: endOf(head), label: lbl }
  }
  return null
}

// What a link's line draws: = thick, a dot dotted, ~ invisible, - solid; and minlen, 1 plus the line's length over its
// form's base (-- or == with a head, --- or === without, ~~~, or one dot), at most MAX_MINLEN.
function stroke(line: string, head?: string): { style: GEdge['style']; minlen: number } {
  if (line.includes('.')) return { style: 'dotted', minlen: Math.min(MAX_MINLEN, line.replace(/[^.]/g, '').length) }
  const style = line[0] === '=' ? 'thick' : line[0] === '~' ? 'invisible' : 'solid'
  return { style, minlen: Math.min(MAX_MINLEN, line.length - (head ? 1 : 2)) }
}

// The end a mark draws: < or > an arrow, o a circle, x a cross; no mark, none.
const endOf = (mark?: string): End => (mark === 'o' ? 'circle' : mark === 'x' ? 'cross' : mark ? 'arrow' : 'none')

// Adds an edge for each pair of from × to, in source order. As Mermaid gives ids, the link's
// id@ names the edge from the last of from to the first of to; any other edge is L_<from>_<to>_<n>,
// n 0 for the pair's first edge, then its count so far plus 1. An id@ is never renamed: where Mermaid
// renames one that an edge already has, parseFlowchart fails it as id-collision.
function connect(st: State, from: string[], to: string[], l: Link): void {
  for (const f of from) {
    for (const t of to) {
      const pair = st.edges.filter(e => e.from === f && e.to === t).length
      const id = l.id !== undefined && f === from.at(-1) && t === to[0] ? l.id : `L_${f}_${t}_${pair === 0 ? 0 : pair + 1}`
      st.edges.push({ id, from: f, to: t, style: l.style, tail: l.tail, head: l.head, label: l.label, minlen: l.minlen, order: st.edges.length })
    }
  }
}

// A node at `at`: its id, then at most one bracket shape or @{…}; a :::name class may follow the id or its shape.
// null if no id starts there, or its opener has no closer.
function mention(text: string, at: number): Mention | Fail | null {
  const id = ID.exec(text.slice(at))?.[0]
  if (id === undefined) return null
  at += id.length
  if (text.startsWith('@{', at)) {
    const d = data(text, at + 2)
    if (!d) return null
    const m: Mention = { id, end: d.end, data: true }
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
  if (open === undefined) return { id, end: classEnd(text, at) }
  const pairs = BRACKETS.filter(([o]) => o === open)
  const c = closer(text, at + open.length, pairs.map(([, close]) => close))
  if (!c) return null
  const t = label(text.slice(at + open.length, c.at))
  if (isFail(t)) return t
  return { id, end: classEnd(text, c.at + c.close.length), shape: pairs.find(([, close]) => close === c.close)![2], lines: labelLines(t) }
}

// The index past a :::name class at i, else i.
function classEnd(text: string, i: number): number {
  CLASS.lastIndex = i
  return CLASS.test(text) ? CLASS.lastIndex : i
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

// A bracket or edge label's text, or a subgraph title: trimmed, one enclosing pair of "…" stripped ("…" keeps
// punctuation). A "`…`" markdown string fails; so does, as 'syntax', a label with a " that no one "…" enclosing it
// all accounts for: Mermaid draws "a" b as a b, and this parser fails closed. Its <br> stay: a node splits them into
// lines, and an edge label keeps them for layout to split with labelLines.
function label(raw: string): string | Fail {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"`')) return fail('markdown-string')
  if (trimmed.includes('"') && !/^"[^"]*"$/.test(trimmed)) return fail('syntax')
  return checked(trimmed.replace(/^"(.*)"$/s, '$1'))
}

// An edge label as label reads it, but null if it is blank: a blank label would draw no cells.
function edgeLabel(raw: string): string | null | Fail {
  const t = label(raw)
  return isFail(t) || t.trim() ? t : null
}

// Label text as written, if it can be drawn: a #…; entity or an unsupported character fails.
function checked(text: string): string | Fail {
  // Mermaid decodes #name; and #123; as HTML entities.
  if (/#\w+;/.test(text)) return fail('entity')
  const bad = unsupported(text)
  if (bad) return fail(`unsupported-char ${bad}`)
  return text
}

// Declares m's node at its first mention; a later mention's shape or label replaces the one before. null, or 'syntax' for a
// mention with a shape, a label or an @{…} of an id a subgraph has.
function declare(st: State, m: Mention): Fail | null {
  const bare = !m.shape && !m.lines && !m.data
  if (!bare && st.clusters.some(c => c.id === m.id)) return fail('syntax')
  const d: Decl = st.nodes.get(m.id) ?? { id: m.id, shape: 'rect', lines: [m.id], bare: true }
  if (m.shape) d.shape = m.shape
  if (m.lines) d.lines = m.lines
  d.bare &&= bare
  st.nodes.set(m.id, d)
  return null
}

// A declared node in the graph model, order its index: a diamond is a decision, and each label line a centered row.
function node(d: Decl, order: number): GNode {
  const role = d.shape === 'diamond' ? 'decision' : 'node'
  return { id: d.id, shape: d.shape, role, rows: d.lines.map((text): NodeRow => ({ text, role, align: 'center' })), order }
}
