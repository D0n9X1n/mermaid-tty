// Reads an erDiagram (plan C, T60; matrix, ER) into its model: entities with their aliases and attributes, relations with
// their cardinalities, line and label, and subgraphs. A statement outside the subset fails, so the fence draws as source.
// Words are read as Mermaid's ER lexer (erDiagram.jison) reads them: in any case, by the first rule that matches, and a
// rule that ends in a letter or digit only before a word boundary.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Attr } from '../../graph/members.ts'
import type { Dir } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { oneParagraph } from '../../emphasis.ts'
import { drawable, labelLines, styled, type Br } from '../../text.ts'
import { unsupported } from '../../width.ts'

// An entity: its id, the alias or else the id it draws, its attributes from all its blocks in order, and its first mention's index.
export type ErEntity = { id: string; label: string; attrs: Attr[]; order: number }
// A cardinality as the matrix prints it.
export type Card = '0..1' | '1' | '0..*' | '1..*'
// Relation r<k>, k its index: from its first entity to its second, the left and right ends' cardinalities, a solid line if
// identifying, else dotted, and its label, '' for "". from and to may name a subgraph.
export type ErRelation = {
  id: string
  from: string
  to: string
  left: Card
  right: Card
  line: 'solid' | 'dotted'
  label: string
  order: number
}
// A subgraph: its title and direction, null if it gives none, and the entities and subgraphs directly in it, in order.
export type ErSubgraph = { id: string; title: string | null; dir: Dir | null; entities: string[]; subgraphs: string[] }
// A text a legend may key: a non-blank comment, owner `<entity>.a<k>.comment`, or relation label, owner `r<k>:label`.
export type Keyable = { owner: string; text: string }
// Subgraphs are in the order they open; keyable texts in source order.
export type ErModel = {
  dir: Dir
  title: string | null
  entities: ErEntity[]
  relations: ErRelation[]
  subgraphs: ErSubgraph[]
  keyable: Keyable[]
}

// An unquoted name, as Mermaid's lexer reads one: never cut short, so that a cardinality cannot take its last letters. A * or
// ` in one is read, so that it fails as Markdown. A class name has neither.
const WORD = String.raw`[\p{L}\p{N}_*\x60-]+(?![\p{L}\p{N}_*\x60-])`
const CLASS_WORD = String.raw`[\p{L}\p{N}_-]+(?![\p{L}\p{N}_*\x60-])`
// A quoted name, as Mermaid's ENTITY_NAME reads one.
const QNAME = String.raw`"[^"%\\\r\n\v\x08]+"`
const NAME = `(?:${QNAME}|${WORD})`
// Each end's cardinality forms; where one form starts another, the longer comes first. A word form ends at a word boundary.
const WORDS = String.raw`(?:one or zero|zero or one|one or more|one or many|many\(1\)|1\+|zero or more|zero or many|many\(0\)|0\+|many|only one|one)(?![A-Za-z0-9_])`
// Mermaid's lexer reads a 1 as a cardinality only before what its lookaheads allow; elsewhere it is an entity name.
const LEFT = String.raw`(?<left>\|o|\|\||\}o|\}\||${WORDS}|1(?=\s+[a-z]|--|\.\.|\.-|-\.))`
const RIGHT = String.raw`(?<right>o\||\|\||o\{|\|\{|${WORDS}|1(?=\s+[A-Za-z0-9_"]))`
const LINE = String.raw`(?<line>--|\.\.|\.-|-\.|(?:optionally )?to(?![A-Za-z0-9_]))`
// What each form prints.
const CARD: Readonly<Record<string, Card>> = {
  '|o': '0..1',
  'o|': '0..1',
  'one or zero': '0..1',
  'zero or one': '0..1',
  '||': '1',
  '1': '1',
  one: '1',
  'only one': '1',
  '}o': '0..*',
  'o{': '0..*',
  '0+': '0..*',
  many: '0..*',
  'many(0)': '0..*',
  'zero or more': '0..*',
  'zero or many': '0..*',
  '}|': '1..*',
  '|{': '1..*',
  '1+': '1..*',
  'many(1)': '1..*',
  'one or more': '1..*',
  'one or many': '1..*',
}
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^${s}$`, 'u')
// An optional :::class list, in group g. It draws nothing.
const cls = (g: string) => String.raw`(?:\s*:::\s*(?<${g}>${CLASS_WORD}(?:\s*,\s*${CLASS_WORD})*))?`
const REL = re(
  String.raw`(?<from>${NAME})${cls('c1')}\s*${LEFT}\s*${LINE}\s*${RIGHT}\s*(?<to>${NAME})${cls('c2')}\s*:\s*(?<label>"[^"]*"|${WORD})`,
)
// block: { opens one; { } is an empty one.
const ENTITY = re(String.raw`(?<name>${NAME})(?:\s*\[\s*(?<alias>${NAME})\s*\])?${cls('c1')}\s*(?<block>\{\s*\}|\{)?`)
const SUBGRAPH = re(String.raw`subgraph\s+(?<id>${NAME})(?:\s*\[(?<title>[^\]]*)\])?`)
const DIRECTION = /^direction\s+(TB|BT|LR|RL)$/
// Where Mermaid's lexer finds a direction statement: in any case, anywhere in a line, which it then reads whole as one.
const DIRECTION_ANY = /direction\s+(?:TB|BT|RL|LR)/i
// Styling, which draws nothing; accTitle: and accDescr:, whose text runs to the line's end; accDescr {, to its first }.
const IGNORED = /^(?:style|classDef|class)\s/ // no click: Mermaid's ER grammar has none, so a click line is a syntax error there
const ACC = /^acc(?:Title|Descr)\s*:/
// An empty accTitle: or accDescr: fails: Mermaid's lexer then reads the next line as its text (12.2.0, verified).
const ACC_BLOCK = /^accDescr\s*\{/
// A keyword where a line starts, in any case, alone or starting a longer word: it is only its own statement (common rule 5).
const KEYWORD = /^(?:erDiagram|direction|subgraph|end|style|classDef|class|click|accTitle|accDescr)/i
// An attribute: type, name, keys and comment. The type may end in ? and hold (…), [] and a comma, as decimal(10,2); the name
// may start with *. Either may hold ~, which inBlock checks as Mermaid's lexer reads it. Both are narrower than Mermaid's
// ATTRIBUTE_WORD, so a backtick word fails.
const TYPE = String.raw`[\p{L}_~][\p{L}\p{N}_\-\[\]().,~]*\??`
const A_NAME = String.raw`\*?[\p{L}_][\p{L}\p{N}_\-\[\]().~]*`
const KEY = '(?:PK|FK|UK)'
const ATTR = re(
  String.raw`(?<type>${TYPE})\s+(?<name>${A_NAME})(?:\s+(?<keys>${KEY}(?:\s*,\s*${KEY})*))?(?:\s*(?<comment>"[^"]*"))?`,
)
// In a block, Mermaid's lexer reads PK, FK or UK, in any case, before a word boundary, as a key wherever a word starts.
const KEY_WORD = /^(?:pk|fk|uk)(?![A-Za-z0-9_])/i
// Where a word starts, Mermaid's lexer reads these, in any case and before a word boundary, as something other than a name:
// a keyword, a cardinality word or the line word to; o before | or {, and u before -, as cardinality marks. only is not
// one, but Mermaid reads only one as a cardinality, which a name only cannot then be.
const TOKEN =
  /^(?:acctitle|accdescr|erdiagram|style|classdef|class|subgraph|end|one|many|only|to)(?![A-Za-z0-9_])|^o$|^u-/i
// Mermaid's lexer reads zero or more as one cardinality, though none of its words is one.
const ZERO_OR_MORE = /zero or more(?![A-Za-z0-9_])/i
// A subgraph title's words, from lastIndex.
const TITLE_WORD = new RegExp(String.raw`\s*(${NAME})`, 'uy')
// Markdown: a * or `, or a _ at either end of a word.
const MARKDOWN = /[*\x60]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u

// Ends the walk: parseEr returns this Fail.
function stop(reason: string): never {
  throw fail(reason)
}

// The model src's statements build, or why it cannot be drawn: 'header' (not erDiagram), 'syntax:<n>' (a statement on source
// line n outside the subset, or a block or subgraph opened there and never closed), 'markdown:<n>' (Markdown in a name,
// alias, label or title there) or 'repeat:<n>' (a second alias, an entity in two subgraphs, or an id for both an entity and a
// subgraph, there), or 'generic' (an entity label or attribute column whose ~…~ pairs Mermaid shows as a <br>).
export function parseEr(src: Source): ErModel | Fail {
  try {
    return walk(src)
  } catch (e) {
    if (isFail(e)) {
      return e
    }
    throw e
  }
}

// The walk's state: the model; each entity by id, and those given an alias; each subgraph by id, and those closed; the
// subgraph each entity or closed subgraph sits directly in; the open subgraphs, innermost last, with their header lines;
// and the entity whose block is open, with its line, else null.
type State = {
  m: ErModel
  byId: Map<string, ErEntity>
  aliased: Set<string>
  subs: Map<string, ErSubgraph>
  closed: Set<string>
  parent: Map<string, string>
  open: { sub: ErSubgraph; n: number }[]
  block: { e: ErEntity; n: number } | null
}
// A match's named groups.
type Groups = Record<string, string | undefined>

function walk(src: Source): ErModel {
  if (src.header !== 'erDiagram') {
    stop('header')
  }
  const st: State = {
    m: { dir: 'TB', title: src.title, entities: [], relations: [], subgraphs: [], keyable: [] },
    byId: new Map(),
    aliased: new Set(),
    subs: new Map(),
    closed: new Set(),
    parent: new Map(),
    open: [],
    block: null,
  }
  // The line of an accDescr { whose } has not come, else 0.
  let descr = 0
  for (const { n, text } of src.lines) {
    const t = text.trim()
    if (descr) {
      if (closes(t, n)) {
        descr = 0
      }
    } else if (st.block) {
      inBlock(t, n, st)
    } else if (ACC_BLOCK.test(t)) {
      if (!closes(t.replace(ACC_BLOCK, ''), n)) {
        descr = n
      }
    } else {
      statement(t, n, st)
    }
  }
  // Source lines start at 1, so 0 is none.
  const unclosed = descr || st.block?.n || st.open.at(-1)?.n
  if (unclosed) {
    stop(`syntax:${unclosed}`)
  }
  // erBox draws an entity with attributes through addText, which shows ~…~ as <…>; one with none is a plain label.
  for (const e of st.m.entities) {
    if (e.attrs.length > 0) {
      e.label = generic(e.label)
    }
  }
  return st.m
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

// Reads trimmed source line n, outside a block, into st. As in Mermaid's lexer, accTitle: and accDescr: come first, then a
// direction found anywhere, which must be the whole line.
function statement(t: string, n: number, st: State): void {
  let m: RegExpExecArray | null
  if (ACC.test(t)) {
    if (!t.replace(ACC, '').trim()) {
      stop(`syntax:${n}`)
    }
    return
  }
  if ((m = DIRECTION.exec(t))) {
    const sub = st.open.at(-1)?.sub
    if (sub) {
      sub.dir = m[1] as Dir
    } else {
      st.m.dir = m[1] as Dir
    }
  } else if (DIRECTION_ANY.test(t)) {
    stop(`syntax:${n}`)
  } else if (IGNORED.test(t)) {
    return
  } else if (t === 'end') {
    close(n, st)
  } else if ((m = SUBGRAPH.exec(t))) {
    open(m.groups!, n, st)
  } else if (KEYWORD.test(t)) {
    stop(`syntax:${n}`)
  } else if ((m = REL.exec(t))) {
    relation(m.groups!, n, st)
  } else if ((m = ENTITY.exec(t))) {
    entity(m.groups!, n, st)
  } else {
    stop(`syntax:${n}`)
  }
}

// Reads trimmed line n of an open block: } closes it, and any other line is one attribute.
function inBlock(t: string, n: number, st: State): void {
  if (t === '}') {
    st.block = null
    return
  }
  const m = ATTR.exec(t) ?? stop(`syntax:${n}`)
  const g = m.groups!
  if (KEY_WORD.test(g.type!) || KEY_WORD.test(g.name!) || misread(t, g)) {
    stop(`syntax:${n}`)
  }
  const e = st.block!.e
  const a = attribute(g)
  if (a.comment.trim()) {
    st.m.keyable.push({ owner: `${e.id}.a${e.attrs.length}.comment`, text: a.comment })
  }
  e.attrs.push(a)
}

// An entity statement on line n: its name, an optional alias and classes, and an optional block, which opens unless empty.
function entity(g: Groups, n: number, st: State): void {
  const e = mention(g.name!, n, st)
  classes(g.c1, n)
  if (g.alias !== undefined) {
    if (st.aliased.has(e.id)) {
      stop(`repeat:${n}`)
    }
    st.aliased.add(e.id)
    e.label = name(g.alias, n, 'none', true, true)
  }
  if (g.block === '{') {
    st.block = { e, n }
  }
}

// A relation statement on line n. Its ends are entities, or subgraphs closed before it; a non-blank label is keyable.
function relation(g: Groups, n: number, st: State): void {
  const from = end(g.from!, n, st)
  const to = end(g.to!, n, st)
  const k = st.m.relations.length
  classes(g.c1, n)
  classes(g.c2, n)
  const label = name(g.label!, n, 'any', false, true)
  st.m.relations.push({
    id: `r${k}`,
    from,
    to,
    left: CARD[g.left!]!,
    right: CARD[g.right!]!,
    line: g.line === '--' || g.line === 'to' ? 'solid' : 'dotted',
    label,
    order: k,
  })
  if (label.trim()) {
    st.m.keyable.push({ owner: `r${k}:label`, text: label })
  }
}

// A :::class list on line n, if any: each class must lex as a name, though none draws.
function classes(list: string | undefined, n: number): void {
  for (const c of (list ?? '').split(',')) {
    if (c.trim() && !plain(c.trim(), false)) {
      stop(`syntax:${n}`)
    }
  }
}

// A relation end's id: a closed subgraph, which joins the open subgraph if it sat outside every one, or else an entity.
function end(raw: string, n: number, st: State): string {
  const id = unquote(raw)
  if (!st.closed.has(id)) {
    return mention(raw, n, st).id
  }
  member(id, n, st)
  return id
}

// The entity a name on line n mentions, added at its first mention. An id a subgraph has fails.
function mention(raw: string, n: number, st: State): ErEntity {
  const id = name(raw, n)
  if (st.subs.has(id)) {
    stop(`repeat:${n}`)
  }
  let e = st.byId.get(id)
  if (!e) {
    e = { id, label: id, attrs: [], order: st.m.entities.length }
    st.byId.set(id, e)
    st.m.entities.push(e)
  }
  member(id, n, st)
  return e
}

// Puts an entity or closed subgraph in the innermost open subgraph, at its first mention there. One that already sits in
// another subgraph fails: Mermaid keeps only the first.
function member(id: string, n: number, st: State): void {
  const sub = st.open.at(-1)?.sub
  if (!sub) {
    return
  }
  const at = st.parent.get(id)
  if (at === sub.id) {
    return
  }
  if (at !== undefined) {
    stop(`repeat:${n}`)
  }
  st.parent.set(id, sub.id)
  ;(st.subs.has(id) ? sub.subgraphs : sub.entities).push(id)
}

// A subgraph header on line n. An id an entity or another subgraph has fails.
function open(g: Groups, n: number, st: State): void {
  const id = name(g.id!, n)
  if (st.subs.has(id) || st.byId.has(id)) {
    stop(`repeat:${n}`)
  }
  const sub: ErSubgraph = {
    id,
    title: g.title === undefined ? null : title(g.title, n),
    dir: null,
    entities: [],
    subgraphs: [],
  }
  st.subs.set(id, sub)
  st.m.subgraphs.push(sub)
  st.open.push({ sub, n })
}

// end on line n closes the innermost subgraph, which then sits in the one around it.
function close(n: number, st: State): void {
  const { sub } = st.open.pop() ?? stop(`syntax:${n}`)
  st.closed.add(sub.id)
  member(sub.id, n, st)
}

// A subgraph title's text on line n: its words, each a name, joined by one space as Mermaid joins them.
function title(raw: string, n: number): string {
  const words: string[] = []
  let at = 0
  let w: RegExpExecArray | null
  TITLE_WORD.lastIndex = 0
  while ((w = TITLE_WORD.exec(raw))) {
    words.push(word(w[1]!, n, true))
    at = TITLE_WORD.lastIndex
  }
  if (words.length === 0 || raw.slice(at).trim() !== '' || ZERO_OR_MORE.test(raw.replace(/"[^"]*"/g, '"'))) {
    stop(`syntax:${n}`)
  }
  return text(words.join(' '), n, 'none', true)
}

// A name without its quotes.
const unquote = (raw: string): string => (raw.startsWith('"') ? raw.slice(1, -1) : raw)

// A name, alias or label on line n, as it draws, its <br>s as br says; a label cannot be a number.
const name = (raw: string, n: number, br: Br = 'none', digits = true, shown = false): string =>
  text(word(raw, n, digits), n, br, shown)

// A word's text on line n. An unquoted one must lex as a name. A quoted one must not start or end with a space: Mermaid trims
// a subgraph id but not an entity name, so " s " would name two things.
function word(raw: string, n: number, digits: boolean): string {
  const s = unquote(raw)
  if (raw.startsWith('"') ? s !== s.trim() : !plain(s, digits)) {
    stop(`syntax:${n}`)
  }
  return s
}

// Whether Mermaid's lexer reads unquoted word s whole as a name: not as a TOKEN, and, if it starts with a digit, as a number
// (where digits allows one) other than 1, which can be a cardinality.
function plain(s: string, digits: boolean): boolean {
  if (TOKEN.test(s)) {
    return false
  }
  return !/^[0-9]/.test(s) || (digits && /^[0-9]+$/.test(s) && s !== '1')
}

// A name, alias, label or title on line n, as it draws. Markdown in a name (an entity's id) fails, since Mermaid renders it.
// In shown text (an alias, relation label or subgraph title) its bold and italic draw as styled says; Markdown that
// changes no style there (a code span, say) still fails, as Mermaid shows it otherwise.
function text(s: string, n: number, br: Br = 'none', shown = false): string {
  if (!MARKDOWN.test(s)) {
    return drawn(s, br)
  }
  if (!shown) {
    stop(`markdown:${n}`)
  }
  let d: string
  try {
    d = drawn(s, br, true)
  } catch (e) {
    throw isFail(e) && e.reason === 'markdown' ? fail(`markdown:${n}`) : e
  }
  return d === s ? stop(`markdown:${n}`) : d
}

// A text that draws as written. Every ER text is a markdown HTML label (labelType 'markdown', and erBox's createText with
// markdown on for each attribute column), so text Mermaid shows otherwise fails as drawable says ('entity', 'html',
// 'markdown', 'icon' or 'math'). br: 'any' for a relation label, which splits at each <br>; 'none' elsewhere, as an
// entity's label, an attribute's row and a subgraph's title draw on one line. A blank line among two or more, from
// <br><br> or a leading or trailing <br>, fails label-blank-line, as in a flowchart. With emphasis (shown text and an
// attribute's comment) its bold and italic draw marked, as styled says. A ~…~ pair is drawn as written here; generic() then
// shows it as erBox does where it applies.
function drawn(s: string, br: Br = 'none', emphasis = false): string {
  // erBox runs parseGenericTypes before marked; how a ~…~ pair and bold or italic then mix is unverified, so both fail.
  if (emphasis && tildes(s) > 1 && MARKDOWN.test(s)) {
    stop('generic')
  }
  let d = s
  // A relation label (br 'any') is an edge label: Mermaid makes each <br> a newline before marked.
  if (br === 'any' && !oneParagraph(s, true)) {
    stop('markdown')
  }
  if (emphasis) {
    const r = styled(s, br, { breaks: br === 'any' })
    if (isFail(r)) {
      throw r
    }
    d = r
  } else {
    const f = drawable(s, 'markdown', br)
    if (f) {
      throw f
    }
    const bad = unsupported(s)
    if (bad) {
      stop(`unsupported-char ${bad}`)
    }
  }
  const lines = labelLines(d)
  if (lines.length > 1 && lines.some((l) => !l.trim())) {
    stop('label-blank-line')
  }
  return d
}

// An attribute line's columns, each as erBox's addText shows it: its ~…~ as <…>.
function attribute(g: Groups): Attr {
  return {
    type: generic(drawn(g.type!)),
    name: generic(drawn(g.name!)),
    keys: (g.keys ?? '')
      .split(/\s*,\s*/)
      .filter(Boolean)
      .join(', '),
    comment: generic(drawn(unquote(g.comment ?? ''), 'none', true)),
  }
}

const tildes = (s: string): number => (s.match(/~/g) ?? []).length

// Whether Mermaid's lexer reads attribute line t, with columns g, otherwise than ATTR does. Where a word starts, its
// ([^\s]*)[~].*[~]([^\s]*) rule comes before a plain word or a "…" comment: once a line holds two ~, a word whose run
// holds a ~ is read through the last ~ on the line, and the run after it. So a ~ in the type or name must be every ~ on
// the line, at least two, with no " after it in its run; and a comment's first run must hold no ~.
function misread(t: string, g: Groups): boolean {
  const all = tildes(t)
  if (all < 2) {
    return all === 1 && tildes(g.type! + g.name!) === 1
  }
  const word = [g.type!, g.name!].find((w) => w.includes('~'))
  if (word !== undefined) {
    return tildes(word) !== all || /~\S*"/.test(t)
  }
  return /^"\S*~/.test(g.comment ?? '')
}

// Mermaid 12.2.0's parseGenericTypes, as addText runs it: s split at commas, a piece with one ~ joined to a next with
// one; in each piece with two or more ~, the first and last ~ become < and > until no pair is left, a leading ~ held
// out when the count is odd. A result that spells a <br> falls back 'generic', as no field here splits there.
function generic(s: string): string {
  const sets = s.split(/(,)/)
  const out: string[] = []
  for (let i = 0; i < sets.length; i++) {
    let set = sets[i]!
    if (set === ',' && i > 0 && i + 1 < sets.length && tildes(sets[i - 1]!) === 1 && tildes(sets[i + 1]!) === 1) {
      set = `${sets[i - 1]},${sets[i + 1]}`
      i++
      out.pop()
    }
    out.push(pairs(set))
  }
  const shown = out.join('')
  if (/<\/?br/i.test(shown)) {
    stop('generic')
  }
  return shown
}

// One parseGenericTypes set with each ~ pair, from the outside in, as < and >.
function pairs(set: string): string {
  const n = tildes(set)
  if (n <= 1) {
    return set
  }
  const lead = n % 2 !== 0 && set.startsWith('~')
  const cs = [...(lead ? set.slice(1) : set)]
  for (
    let a = cs.indexOf('~'), b = cs.lastIndexOf('~');
    a !== -1 && a !== b;
    a = cs.indexOf('~'), b = cs.lastIndexOf('~')
  ) {
    cs[a] = '<'
    cs[b] = '>'
  }
  return (lead ? '~' : '') + cs.join('')
}
