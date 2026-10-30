// Reads a state diagram (plan C, T54; matrix, state) into the graph model: states, transitions, start and end marks,
// choices, composites and notes. A statement it cannot read whole fails with its source line, so the fence draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Dir, GCluster, GEdge, GNode, Graph, Mark, NodeRow, Note } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { drawable, labelLines } from '../../text.ts'
import { unsupported } from '../../width.ts'

// The graph, the frontmatter title (the graph's own title stays null), and each note's id in source order, which keys follow.
export type StateModel = { graph: Graph; title: string | null; notes: string[] }

const HEADER = /^stateDiagram(?:-v2)?$/
// A state id: letters, digits, _ and -, with no - at either end (where Mermaid's lexer would read it as part of --> or --),
// and not root, the id of the document Mermaid draws no node for.
const WORD = String.raw`[\p{L}\p{N}_]`
const ID = String.raw`(?!root(?![\p{L}\p{N}_-]))${WORD}(?:[\p{L}\p{N}_-]*${WORD})?`
// A :::name class after an id or [*]; it draws nothing.
const CLASS = String.raw`(?::::\w+)?`
// One end of a transition: [*] (a start or end mark) or an id.
const END = String.raw`(\[\*\]|${ID})${CLASS}`
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^(?:${s})$`, 'u')
// A composite's opener: state id {, or state "description" as id {.
const OPEN = re(String.raw`state\s+(?:"([^"]*)"\s*as\s+)?(${ID})\s*\{`)
// A description given as state "description" as id.
const ALIAS = re(String.raw`state\s+"([^"]*)"\s*as\s+(${ID})`)
// A choice, fork or join: state id <<kind>>, or state id [[kind]].
const MARK = re(String.raw`state\s+(${ID})\s*(?:<<(choice|fork|join)>>|\[\[(choice|fork|join)\]\])`)
// A one-line note: note left of id : text, or right of.
const NOTE = re(String.raw`note\s+(left|right) of\s+([\p{L}\p{N}_]+)(?:\s:|:(?=\s))(.*)`)
// A multi-line note's opener; its lines follow, up to end note.
const NOTE_OPEN = re(String.raw`note\s+(left|right) of\s+([\p{L}\p{N}_]+)`)
const DIR = re(String.raw`direction\s+(TB|BT|RL|LR)`)
// Where Mermaid's lexer finds a direction, in any case and anywhere in a statement's line, it reads the whole line as one.
const DIR_ANY = /direction\s+(?:TB|BT|RL|LR)/i
// Styling, which draws nothing, at the root or in a body: classDef name styles, class ids name, style ids styles. Each needs
// its last part on its own line, or Mermaid's lexer reads the next line as it.
const STYLING = re(String.raw`(?:classDef\s+\w+|class\s+\w+(?:,\s*\w+)*|style\s+[\w,]+)\s+\S.*`)
// Lines that draw nothing at the root: hide empty description, scale N width, click id "url" "tip" or click id href "url",
// and accessibility with text (an empty one reads the next line as its text, so it reaches KEYWORD and fails). Mermaid's lexer knows them only there, and in a body reads their words as states: there they reach
// KEYWORD, and fail.
const ROOT_ONLY = re(String.raw`hide empty description|scale\s+\d+\s+width|click\s+${ID}\s+(?:"[^"]*"\s*"[^"]*"|href\s*"[^"]*")` +
  String.raw`|acc(?:Title|Descr)\s*:.*\S.*`)
// An accDescr {…} block's opener; its text runs to its first }, which must end its line.
const ACC_BLOCK = re(String.raw`accDescr\s*\{(.*)`)
// A line that starts with a keyword, in any case, even one that starts a longer word, but reads as none of its statements.
const KEYWORD = /^(?:direction|state|note|hide|scale|class|style|click|acc(?:title|descr))/i
// A transition: from --> to, and an optional : label.
const EDGE = re(String.raw`${END}\s*-->\s*${END}(?:\s*:(.*))?`)
// A bare id, which declares a state.
const BARE = re(String.raw`(${ID})${CLASS}`)
// A description: id : text.
const DESCR = re(String.raw`(${ID})${CLASS}\s*:(.*)`)

// One statement as pass 1 reads it, with its source line n. text: what it draws (a description or title, a transition's
// label, a note's lines), as written until pass 1 checks it.
type Stmt = { n: number } & (
  | { kind: 'open'; id: string; text: string | null; regions: boolean }
  | { kind: 'close' }
  | { kind: 'divider' }
  | { kind: 'dir'; dir: Dir }
  | { kind: 'mark'; id: string; mark: Mark }
  | { kind: 'state'; id: string; text: string | null }
  | { kind: 'edge'; from: string; to: string; text: string | null }
  | { kind: 'note'; id: string; side: Note['side']; text: string })
type NoteStmt = Extract<Stmt, { kind: 'note' }>

// Pass 1: each line read whole as one statement (a multi-line note is one, from its opener to end note), and every
// composite the source opens, with the body its first block opens in ('' the root's, else its composite's id), so that
// pass 2 knows a composite at its first mention, even one whose block opens later. Each opener learns whether a --
// divides its body into regions. Fails with the first line it cannot read, or the first block's opener that has no }.
function read(src: Source): { stmts: Stmt[]; composites: Map<string, string> } | Fail {
  const stmts: Stmt[] = [], composites = new Map<string, string>(), open: Extract<Stmt, { kind: 'open' }>[] = []
  // A multi-line note whose end note has not come, its lines so far, each trimmed, and the last one's source line; the line
  // of an open accDescr {, or 0.
  let note: { stmt: NoteStmt; lines: string[]; last: number } | null = null, acc = 0
  for (const { n, text } of src.lines) {
    const t = text.trim()
    if (note) {
      // Mermaid ends a note at a line that starts end note in any case, and reads the rest of it as statements.
      if (t.toLowerCase().startsWith('end note')) {
        if (t !== 'end note') return fail(`syntax:${n}`)
        if (note.lines.length === 0) return fail(`syntax:${note.stmt.n}`)
        const d = drawText(note.lines.join('<br>'))
        if (isFail(d)) return d
        stmts.push({ ...note.stmt, text: d }); note = null
        continue
      }
      // Mermaid's lexer reads an opener and a first line that starts with : as a one-line note, and the lines after it as
      // statements, up to an end note it then cannot read.
      if (note.lines.length === 0 && t.startsWith(':')) return fail(`syntax:${note.stmt.n}`)
      // A line skipped between two of the note's lines (blank, or a %% comment) would be a blank line in it.
      if (note.lines.length > 0 && n !== note.last + 1) return fail('label-blank-line')
      note.lines.push(t); note.last = n
      continue
    }
    if (acc) {
      const c = closes(t)
      if (c === false) return fail(`syntax:${n}`)
      if (c) acc = 0
      continue
    }
    // A line Mermaid reads as a direction is only that statement.
    if (DIR_ANY.test(t) && !DIR.test(t)) return fail(`syntax:${n}`)
    const opener = NOTE_OPEN.exec(t)
    if (opener) {
      note = { stmt: { n, kind: 'note', id: opener[2]!, side: opener[1] as Note['side'], text: '' }, lines: [], last: n }
      continue
    }
    if (STYLING.test(t) || (!open.length && ROOT_ONLY.test(t))) continue
    const block = open.length ? null : ACC_BLOCK.exec(t)
    if (block) {
      const c = closes(block[1]!)
      if (c === false) return fail(`syntax:${n}`)
      if (c === null) acc = n
      continue
    }
    const s = statement(t, n)
    if (!s) return fail(`syntax:${n}`)
    if ('text' in s && s.text !== null) {
      const d = drawText(s.text)
      if (isFail(d)) return d
      // A blank "" description: Mermaid's lexer reads no text in it, and fails.
      if (d === '') return fail(`syntax:${n}`)
      s.text = d
    }
    if (s.kind === 'open') { if (!composites.has(s.id)) composites.set(s.id, open.at(-1)?.id ?? ''); open.push(s) }
    // A } with no block open, and a -- outside a composite, are no statements.
    if (s.kind === 'close' && !open.pop()) return fail(`syntax:${n}`)
    if (s.kind === 'divider') {
      const o = open.at(-1)
      if (!o) return fail(`syntax:${n}`)
      o.regions = true
    }
    stmts.push(s)
  }
  // A note with no end note swallows the rest of the source, any } too, so it fails first; then an accDescr { with no }.
  if (note) return fail(`syntax:${note.stmt.n}`)
  if (acc) return fail(`syntax:${acc}`)
  if (open[0]) return fail(`syntax:${open[0].n}`)
  return { stmts, composites }
}

// The statement trimmed line t on source line n reads as, or null if it reads as none.
function statement(t: string, n: number): Stmt | null {
  let m: RegExpExecArray | null
  if (t === '}') return { n, kind: 'close' }
  if (t === '--') return { n, kind: 'divider' }
  if ((m = DIR.exec(t))) return { n, kind: 'dir', dir: m[1] as Dir }
  if ((m = OPEN.exec(t))) return { n, kind: 'open', id: m[2]!, text: m[1] ?? null, regions: false }
  if ((m = ALIAS.exec(t))) return { n, kind: 'state', id: m[2]!, text: m[1]! }
  if ((m = MARK.exec(t))) return { n, kind: 'mark', id: m[1]!, mark: (m[2] ?? m[3]) === 'choice' ? 'choice' : 'bar' }
  if ((m = NOTE.exec(t))) {
    return NOTE_TEXT.test(unentity(m[3]!)) ? { n, kind: 'note', id: m[2]!, side: m[1] as Note['side'], text: m[3]! } : null
  }
  if (KEYWORD.test(t)) return null
  if ((m = EDGE.exec(t))) {
    const ok = m[3] === undefined || COLON_TEXT.test(unentity(m[3]))
    return ok ? { n, kind: 'edge', from: m[1]!, to: m[2]!, text: m[3] ?? null } : null
  }
  if ((m = BARE.exec(t))) return { n, kind: 'state', id: m[1]!, text: null }
  if ((m = DESCR.exec(t))) return COLON_TEXT.test(unentity(m[2]!)) ? { n, kind: 'state', id: m[1]!, text: m[2]! } : null
  return null
}

// The text after a description's or label's :, as Mermaid's lexer reads it whole, and as written: not blank, with no ;,
// and no : that is doubled or ends it (both split it), or starts it (Mermaid strips a second leading :). A one-line note's
// text has no : or ; at all.
const COLON_TEXT = /^(?!\s*:)(?:[^:;]|:[^:;])+$/
const NOTE_TEXT = /^[^:;]*[^:;\s][^:;]*$/
// Mermaid encodes each #…; before its lexer runs, so an entity's ; ends nothing; drawText then fails it as an entity.
const unentity = (s: string) => s.replace(/#\w+;/g, '#')

// Whether an accDescr {…} block closes in rest: null with no } in it, else whether its first } ends the line.
function closes(rest: string): boolean | null {
  const i = rest.indexOf('}')
  return i < 0 ? null : rest.slice(i + 1).trim() === ''
}

// Text a statement draws, trimmed, or why it cannot be drawn: 'entity', 'html', 'markdown', 'icon' or 'math' where
// Mermaid's markdown HTML label (labelType 'markdown' on every state text), each <br> splitting, shows other text (docs/specs/2026-10-29-mermaid-tty-v1-text-ground-truth.md); 'semicolon' for a ;, where
// Mermaid starts a new statement; 'unsupported-char U+XXXX' for a character no terminal draws reliably; and
// 'label-blank-line' for a blank line among two or more (from <br><br>, or a <br> at either end).
function drawText(raw: string): string | Fail {
  const t = raw.trim()
  const f = drawable(t, 'markdown', 'any')
  if (f) return f
  if (t.includes(';')) return fail('semicolon')
  const bad = unsupported(t)
  if (bad) return fail(`unsupported-char ${bad}`)
  const ls = labelLines(t)
  return ls.length > 1 && ls.some(l => !l.trim()) ? fail('label-blank-line') : t
}

// A state as the statements so far declare it: its mark and its note; a bar's span, once every transition is read.
type Decl = { id: string; mark?: Mark; span?: number; note?: Note }
// An open composite: its cluster, and while a -- divides its body, its current region's cluster and index.
type Frame = { cluster: GCluster; region: GCluster | null; k: number }
// Why a statement fails, before its line is added.
type Why = 'syntax' | 'scope' | 'repeat' | 'mark-label'

// Pass 2: the graph the statements declare, but its title. Each id belongs to the body it is first mentioned in, the root's
// or a composite's (a composite's own id to its parent's), and takes the innermost open scope: the current region of the
// innermost open composite, else that composite; at the root, none. Fails 'scope:<n>' for an id mentioned in another body,
// 'repeat:<n>' for a second description, note or body, 'mark-label:<n>' for a description on a mark, and 'syntax:<n>' for
// an empty region, a mark that is not its id's first mention (Mermaid keeps the shape of the first), or a note on no state;
// and 'id-collision' for a transition id t<k> that a state or composite also has.
function walk(stmts: Stmt[], composites: Map<string, string>): Omit<Graph, 'title'> | Fail {
  const nodes = new Map<string, Decl>(), descrs = new Map<string, string>(), notes = new Map<string, NoteStmt>()
  // The body each id belongs to (a start or end mark's is its own id), and the composites whose block has opened.
  const home = new Map<string, string>(), opened = new Set<string>()
  // The scope each id was first mentioned in ('' the root), which places it.
  const where = new Map<string, string>()
  const clusters: GCluster[] = [], edges: GEdge[] = [], open: Frame[] = []
  // The root's direction, and the count of transitions so far, which names the next.
  let dir: Dir = 'TB', t = 0
  const body = () => open.at(-1)?.cluster.id ?? ''
  const scope = (): GCluster | null => { const f = open.at(-1); return f ? f.region ?? f.cluster : null }
  const here = () => scope()?.id ?? ''
  const place = (id: string, member: 'nodes' | 'clusters') => scope()?.[member].push(id)
  // Declares id at its first mention; false for an id another body has, or another region of its body (Mermaid moves a
  // state to the region of its last mention, which this parser would not follow).
  const mention = (id: string): boolean => {
    const h = home.get(id) ?? composites.get(id) ?? body()
    if (h !== body()) return false
    if (home.has(id)) return where.get(id) === here()
    home.set(id, h); where.set(id, here())
    if (composites.has(id)) place(id, 'clusters')
    else { nodes.set(id, { id }); place(id, 'nodes') }
    return true
  }
  // The innermost open scope's start or end mark, declared at its first use: each region has its own.
  const ends = (kind: 'start' | 'end') => {
    const id = `${kind}:${scope()?.id ?? 'root'}`
    if (!home.has(id)) { home.set(id, id); nodes.set(id, { id, mark: kind }); place(id, 'nodes') }
    return id
  }
  // A transition's end: [*] is a mark, else a state mentioned here; null for one another body has.
  const end = (id: string, kind: 'start' | 'end') => (id === '[*]' ? ends(kind) : mention(id) ? id : null)
  // Gives id its description, if the statement has one.
  const describe = (id: string, descr: string | null): Why | null => {
    if (!mention(id)) return 'scope'
    if (descr === null) return null
    if (nodes.get(id)?.mark) return 'mark-label'
    if (descrs.has(id)) return 'repeat'
    descrs.set(id, descr)
    return null
  }
  // Opens f's next region: a frameless member cluster of its composite.
  const region = (f: Frame) => {
    f.region = { id: `${f.cluster.id}:r${f.k}`, title: null, dir: null, nodes: [], clusters: [], frameless: true }
    clusters.push(f.region); f.cluster.clusters.push(f.region.id)
  }
  // A transition: solid, with an arrow head. A region chain: invisible, with none.
  const edge = (id: string, from: string, to: string, label: string | null, style: 'solid' | 'invisible') =>
    edges.push({ id, from, to, style, tail: 'none', head: style === 'solid' ? 'arrow' : 'none', label, minlen: 1, order: edges.length })
  // Applies one statement: null, or why it fails.
  const step = (s: Stmt): Why | null => {
    switch (s.kind) {
      case 'open': {
        const why = describe(s.id, s.text)
        if (why) return why
        if (opened.has(s.id)) return 'repeat'
        opened.add(s.id)
        const f: Frame = { cluster: { id: s.id, title: null, dir: null, nodes: [], clusters: [] }, region: null, k: 0 }
        clusters.push(f.cluster); open.push(f)
        if (s.regions) region(f)
        return null
      }
      // A region with no state or composite of its own, from a -- at either end of a body or two together, draws nothing.
      case 'close': { const f = open.pop()!; return f.region && empty(f.region) ? 'syntax' : null }
      case 'divider': {
        // Pass 1 reads a -- only in an open composite, whose first region opened with it.
        const f = open.at(-1)!, from = f.region!
        if (empty(from)) return 'syntax'
        const id = `${f.cluster.id}:chain${f.k++}`
        region(f); edge(id, from.id, f.region!.id, null, 'invisible')
        return null
      }
      case 'dir': { const c = scope(); if (c) c.dir = s.dir; else dir = s.dir; return null }
      case 'mark': {
        if (home.has(s.id) || composites.has(s.id)) return 'syntax'
        mention(s.id); nodes.get(s.id)!.mark = s.mark
        return null
      }
      case 'state': return describe(s.id, s.text)
      case 'edge': {
        const from = end(s.from, 'start'), to = from === null ? null : end(s.to, 'end')
        if (from === null || to === null) return 'scope'
        edge(`t${t++}`, from, to, s.text, 'solid')
        return null
      }
      case 'note': {
        if (notes.has(s.id)) return 'repeat'
        // A note mentions its state in source order, as Mermaid reads it: its first mention declares it here. On a state
        // mentioned before, it may stand at the root, where Mermaid leaves the state in place, or in the state's own scope.
        if (!home.has(s.id) ? !mention(s.id) : here() !== '' && where.get(s.id) !== here()) return 'scope'
        notes.set(s.id, s)
        return null
      }
    }
  }
  for (const s of stmts) {
    const why = step(s)
    if (why) return fail(`${why}:${s.n}`)
  }
  // A note goes on a state or mark declared anywhere; on a composite, or an id nothing else mentions, it has no place.
  for (const [id, s] of notes) {
    const d = nodes.get(id)
    if (!d) return fail(`syntax:${s.n}`)
    d.note = { id: `${id}:note`, text: s.text, side: s.side }
  }
  // A bar spans max(3, 2·max(in, out) − 1) cells across the flow: its transitions are counted once all are read.
  const ins = new Map<string, number>(), outs = new Map<string, number>()
  for (const e of edges) if (e.style === 'solid') { ins.set(e.to, (ins.get(e.to) ?? 0) + 1); outs.set(e.from, (outs.get(e.from) ?? 0) + 1) }
  for (const d of nodes.values()) if (d.mark === 'bar') d.span = Math.max(3, 2 * Math.max(ins.get(d.id) ?? 0, outs.get(d.id) ?? 0) - 1)
  // A composite's title draws on its frame, on one line: a markdown HTML label no <br> may split.
  for (const c of clusters) {
    if (c.frameless) continue
    c.title = descrs.get(c.id) ?? c.id
    const f = drawable(c.title, 'markdown', 'none')
    if (f) return f
  }
  // A state with no description shows its id, a markdown HTML label too.
  for (const d of nodes.values()) {
    const f = d.mark || descrs.has(d.id) ? null : drawable(d.id, 'markdown', 'none')
    if (f) return f
  }
  // A transition's id t<k> that a state or composite also has would give two drawn things one owner.
  const ids = new Set([...nodes.keys(), ...clusters.map(c => c.id)])
  if (edges.some(e => ids.has(e.id))) return fail('id-collision')
  return { dir, nodes: [...nodes.values()].map((d, i) => node(d, i, descrs.get(d.id))), edges, clusters }
}

// The model src declares, or why it cannot be drawn: 'header' (not stateDiagram or stateDiagram-v2, alone); pass 1's
// 'syntax:<n>', or drawText's Fail; or pass 2's Fail.
export function parseState(src: Source): StateModel | Fail {
  if (!HEADER.test(src.header)) return fail('header')
  const r = read(src)
  if (isFail(r)) return r
  const g = walk(r.stmts, r.composites)
  if (isFail(g)) return g
  const notes = r.stmts.flatMap(s => (s.kind === 'note' ? [`${s.id}:note`] : []))
  return { graph: { ...g, title: null }, title: src.title, notes }
}

// Whether a region holds no state and no composite of its own.
const empty = (c: GCluster) => c.nodes.length === 0 && c.clusters.length === 0

// A declared state as a graph node, order its index: a mark is a glyph with no rows, a choice a decision; a state draws its
// description's lines, or else its id, as centered rows.
function node(d: Decl, order: number, descr: string | undefined): GNode {
  const role = d.mark === 'choice' ? 'decision' : 'node'
  const rows = d.mark ? [] : labelLines(descr ?? d.id).map((text): NodeRow => ({ text, role, align: 'center' }))
  return { id: d.id, shape: 'round', role, rows, order, ...(d.mark && { mark: d.mark }), ...(d.span !== undefined && { span: d.span }),
    ...(d.note && { note: d.note }) }
}
