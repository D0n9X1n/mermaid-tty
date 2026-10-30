// Reads a classDiagram (plan C, T57; matrix, class) into its model: the classes, with their labels, annotations and members
// as Mermaid displays them, the relations, the notes and the namespaces. A statement outside the subset fails, so the fence
// draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Member } from '../../graph/members.ts'
import type { Dir } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { drawable, labelLines, styled, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

// A relation end: <| or |> triangle, * diamond, o odiamond, < or > arrow.
export type ClassEnd = 'none' | 'triangle' | 'diamond' | 'odiamond' | 'arrow'
// A class: label is its ["label"], else its name with ~T~ shown as <T>; annot is its annotation, null if none; members are in
// source order, as members.ts takes them. order: its index among the classes.
export type ClassBox = { id: string; label: string; annot: string | null; members: Member[]; order: number }
// A relation from its left class to its right one, with each end's cardinality; each text is null when the source gives none.
// order, on a relation and a note: its index among the relations and notes together, in source order (keys follow it).
export type Relation = { id: string; from: string; to: string; tail: ClassEnd; head: ClassEnd; line: 'solid' | 'dotted'
  label: string | null; tailLabel: string | null; headLabel: string | null; order: number }
// A note, for a class or none; its text breaks lines at <br>.
export type ClassNote = { id: string; for: string | null; text: string; order: number }
// A namespace: its label, else its name, and the ids of the classes and notes its blocks hold, in order.
export type Namespace = { id: string; label: string; classes: string[]; notes: string[] }
export type ClassModel = { dir: Dir; title: string | null; classes: ClassBox[]; relations: Relation[]; notes: ClassNote[]
  namespaces: Namespace[] }

const HEADER = /^classDiagram(?:-v2)?$/
// An id: letters, digits, _ and -, or a `backtick name`. A ~ in a backtick name fails: Mermaid reads it as a generic there.
const ID = '(?:[\\p{L}\\p{N}_-]+|`[^`~]+`)'
// An annotation or a :::name, as Mermaid's lexer reads one word: \w+, but not a word a keyword rule reads first (keywords
// end at a word boundary), nor a lone o, which its aggregation rule (\s*o\b) reads.
const WORD = '(?!(?:classDiagram|style|classDef|namespace|class|cssClass|callback|link|click|note|href|call|_self|_blank|_parent|_top)\\b|o\\b)\\w+'
const QUOTED = '"([^"]*)"'
// A relation label or X : member text: no : or ;, but for a #…; entity, which Mermaid encodes before it reads the line.
const TEXT = '(?:[^:;]|#\\w+;)*'
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^${s}$`, 'u')
// class X, then one of ~T~ (a generic with no comma) and ["label"], then one of :::name and <<annotation>>, then an optional {.
const CLASS = re(`class\\s+(${ID})(?:~([^~,]+)~|\\[${QUOTED}\\])?(?:\\s*:::\\s*${WORD}|\\s*<<\\s*(${WORD})\\s*>>)?(\\s*\\{)?`)
const NAMESPACE = re(`namespace\\s+(${ID})(?:\\[${QUOTED}\\])?\\s*\\{`)
const NOTE = re(`note(?:\\s+for\\s+(${ID}))?\\s+${QUOTED}`)
const ANNOTATION = re(`<<\\s*(${WORD})\\s*>>\\s*(${ID})`)
// X ["c"] <end><line><end> ["c"] Y [: label]: each end <|, |>, *, o, < or > (matrix: on either side), and -- or .. between.
// As Mermaid's lexer reads it, o is an end only before a word boundary (\\w is ASCII there too): --orange is -- then orange.
const END_RE = '(<\\||\\|>|\\*|o(?!\\w)|<|>)?'
const RELATION = re(`(${ID})\\s*(?:${QUOTED}\\s*)?${END_RE}(--|\\.\\.)${END_RE}\\s*(?:${QUOTED}\\s*)?(${ID})(?:\\s*:(${TEXT}))?`)
const MEMBER = re(`(${ID})\\s*:(${TEXT})`)
// As Mermaid's lexer reads it: a top-level line holding direction, then spaces (a line end too), then TB, BT, RL or LR, is
// only that direction statement. direction XX alone is drawn as one; any other such line fails.
const DIRECTION = /^direction\s+(TB|BT|RL|LR)$/
const DIRECTED = /direction(?:\s+(?:TB|BT|RL|LR)|$)/
// Styling, which draws nothing (common rule 4), in the grammar's shapes: STYLE ALPHA stylesOpt, CLASSDEF classList stylesOpt
// and CSSCLASS STR ALPHA. A style is pieces Mermaid's lexer reads outside a block, spaces between: a word (ALPHA), :text to
// the next : (LABEL, which takes commas), a : not starting ::: (COLON), # or a lone %; styles are comma-separated. No piece
// holds a ; (source.ts drops the one encodeEntities drops), nor a -, . or quote, which the grammar takes nowhere here.
const STYLE_WORD = `(?!acc(?:Title|Descr)\\s*[:{])${WORD}(?!\\w)`
const PIECE = `(?:${STYLE_WORD}|:[^:;]+(?![^:;])|:(?!::)(?![^:;])|#|%(?!%))`
const STYLES = `${PIECE}(?:\\s*${PIECE})*(?:\\s*,\\s*${PIECE}(?:\\s*${PIECE})*)*`
const STYLING = re(`(?:(?:style\\s+${STYLE_WORD}|classDef\\s+${STYLE_WORD}(?:\\s*,\\s*${STYLE_WORD})*)\\s*${STYLES}` +
  `|cssClass\\s*"[^"]+"\\s*${STYLE_WORD})`)
// click, link and callback, in each form Mermaid's grammar accepts; they draw nothing. A "tooltip" and a link target may follow.
const STR = '"[^"]+"', TIP = `(?:\\s*${STR})?`, TARGET = '(?:\\s*(?:_self|_blank|_parent|_top))?'
const CLICK_ID = new RegExp(`^(?:click|link|callback)\\s+(${ID})`, 'u')
const CLICK = re(`(?:click\\s+${ID}\\s+(?:href\\s*${STR}${TIP}${TARGET}|call\\s+[^(\\s][^(]*\\([^)]*\\)${TIP})` +
  `|link\\s+${ID}\\s*${STR}${TIP}${TARGET}|callback\\s+${ID}\\s*${STR}${TIP})`)
// As Mermaid's lexer reads them: accTitle: and accDescr: run to the line's end, and accDescr { to its first }. Neither draws.
const ACC = /^acc(?:Title|Descr)\s*:/
// An empty accTitle: or accDescr: fails: Mermaid's lexer then reads the next line as its text (12.2.0, verified).
const ACC_BLOCK = /^accDescr\s*\{/
// A keyword, in any case, starting a line: such a line is only that keyword's statement (common rule 5), so one no
// statement pattern matches, a keyword in another case, or one that starts a longer word, fails.
const KEYWORD = /^(?:class|cssClass|namespace|note|direction|style|click|link|callback|acc(?:Title|Descr))/i
// A method, as Mermaid's pattern reads one, without a second ( or ), which that pattern reads past.
const METHOD = /^([#+~-])?([^()]+)\(([^()]*)\)([^()]*)$/
const END: Record<string, ClassEnd> = { '<|': 'triangle', '|>': 'triangle', '*': 'diamond', o: 'odiamond', '<': 'arrow', '>': 'arrow' }

// A class's model entry, its ~T~ (null if none), whether a ["label"] set its label, and its namespace's id, null if none.
type Entry = { box: ClassBox; generic: string | null; labelled: boolean; ns: string | null }
// The model so far, its classes by id, the class whose { } is open, the namespace whose { } is open, each with the line
// it opened on (a namespace's filled once a statement comes), the line of an accDescr { whose } has not come (else 0), and each note's class, with the note's line.
type State = { model: ClassModel; classes: Map<string, Entry>; body: { entry: Entry; n: number } | null
  ns: { space: Namespace; n: number; filled: boolean } | null; descr: number; targets: { id: string; n: number }[] }

// Ends the walk: parseClass returns this Fail.
function stop(reason: string): never { throw fail(reason) }

// The model src's statements build, or why it cannot be drawn: 'header' (not classDiagram or classDiagram-v2), 'syntax:<n>'
// (a statement on source line n outside the subset, such as a lollipop, a nested or dotted namespace or a bare X line; a {
// or an accDescr { there with no }, or a namespace's } with no statement before it; a line Mermaid reads as a direction
// but for direction XX alone; a blank text; or a note for a class nothing declares), 'repeat:<n>' (a second
// annotation, another label or generic, or another namespace for one class, or another label for one namespace),
// 'label-blank-line' (a blank line in a text), 'entity' (a #…; entity in a text), 'unsupported-char U+XXXX' (a text
// character no terminal draws reliably) or 'id-collision' (two classes, notes, relations or namespaces with one id).
export function parseClass(src: Source): ClassModel | Fail {
  try { return walk(src) } catch (e) { if (isFail(e)) return e; throw e }
}

function walk(src: Source): ClassModel {
  if (!HEADER.test(src.header)) stop('header')
  const model: ClassModel = { dir: 'TB', title: src.title, classes: [], relations: [], notes: [], namespaces: [] }
  const st: State = { model, classes: new Map(), body: null, ns: null, descr: 0, targets: [] }
  for (const { n, text: raw } of src.lines) {
    const t = raw.trim()
    if (st.descr) { if (closes(t, n)) st.descr = 0 }
    else if (st.body && t === '}') st.body = null
    else if (st.body) member(st.body.entry, t, n, true)
    // Mermaid's grammar holds a namespace's { } to at least one statement.
    else if (st.ns && t === '}') { if (!st.ns.filled) stop(`syntax:${n}`); st.ns = null }
    else if (!st.ns && DIRECTED.test(t)) st.model.dir = (DIRECTION.exec(t) ?? stop(`syntax:${n}`))[1] as Dir
    else if (!st.ns && ACC.test(t)) { if (!t.replace(ACC, '').trim()) stop(`syntax:${n}`) }
    else if (!st.ns && ACC_BLOCK.test(t)) { if (!closes(t.replace(ACC_BLOCK, ''), n)) st.descr = n }
    else statement(t, n, st)
  }
  // An unclosed block fails at the line that opened it, the innermost first.
  const open = st.descr || st.body?.n || st.ns?.n
  if (open) stop(`syntax:${open}`)
  ends(st)
  return model
}

// Whether an accDescr block's text closes in rest: at its first }, after which the line must end.
function closes(rest: string, n: number): boolean {
  const i = rest.indexOf('}')
  if (i < 0) return false
  if (rest.slice(i + 1).trim()) stop(`syntax:${n}`)
  return true
}

// Reads trimmed source line n, outside a class's { }, into st. In a namespace's { }, only class and note statements come.
function statement(t: string, n: number, st: State): void {
  let m: RegExpExecArray | null
  if (st.ns && (CLASS.test(t) || NOTE.test(t))) st.ns.filled = true
  if ((m = CLASS.exec(t))) classStatement(m, n, st)
  else if ((m = NOTE.exec(t))) note(m[1], m[2]!, n, st)
  else if (st.ns) stop(`syntax:${n}`)
  else if ((m = NAMESPACE.exec(t))) namespace(m[1]!, m[2], n, st)
  else if (STYLING.test(t)) return
  else if (CLICK.test(t)) name(CLICK_ID.exec(t)![1]!, n)
  else if (KEYWORD.test(t)) stop(`syntax:${n}`)
  else if ((m = ANNOTATION.exec(t))) annotate(declare(name(m[2]!, n), null, n, st), m[1]!, n)
  else if ((m = RELATION.exec(t))) relation(m, n, st)
  else if ((m = MEMBER.exec(t))) member(declare(name(m[1]!, n), null, n, st), m[2]!, n, false)
  else stop(`syntax:${n}`)
}

// A backtick name's text, else the id as written. An unquoted id with a standalone o (- and the ends are boundaries, \w is
// ASCII) fails on line n: Mermaid's lexer reads that o as aggregation, so `class o-X` is no class statement.
function name(id: string, n: number): string {
  if (id.startsWith('`')) return id.slice(1, -1)
  return /\bo\b/.test(id) ? stop(`syntax:${n}`) : id
}

// class X, with its ~T~ or ["label"], <<annotation>> and {: declares X, in the open namespace if there is one.
function classStatement(m: RegExpExecArray, n: number, st: State): void {
  const [, id = '', generic = null, label = null, annot = null, open] = m
  const entry = declare(name(id, n), generic, n, st)
  if (label !== null) relabel(entry, label, n)
  if (annot !== null) annotate(entry, annot, n)
  if (st.ns) enter(entry, st.ns.space, n)
  if (open) st.body = { entry, n }
}

// X's entry, declared at its first mention, with generic, its ~T~ or null. A later mention with another ~T~ fails, as
// Mermaid keeps only the first.
function declare(id: string, generic: string | null, n: number, st: State): Entry {
  const had = st.classes.get(id)
  if (had) {
    if (generic !== null && generic !== had.generic) stop(`repeat:${n}`)
    return had
  }
  check(id, NAME); if (generic !== null) check(generic, NAME)
  const label = text(generic === null ? id : `${id}<${generic}>`, n, BUILT)
  const box: ClassBox = { id, label, annot: null, members: [], order: st.model.classes.length }
  const entry: Entry = { box, generic, labelled: false, ns: null }
  st.classes.set(id, entry); st.model.classes.push(box)
  return entry
}

// Sets entry's label from a ["label"]. A class with a ~T~ fails 'syntax', as the subset gives a class one or the other; a
// second, different label fails 'repeat', as Mermaid keeps only one.
function relabel(entry: Entry, raw: string, n: number): void {
  const label = text(raw, n, LINES)
  if (entry.generic !== null) stop(`syntax:${n}`)
  if (entry.labelled && label !== entry.box.label) stop(`repeat:${n}`)
  entry.box.label = label; entry.labelled = true
}

// Sets entry's annotation; a second fails, as Mermaid draws only the first.
function annotate(entry: Entry, raw: string, n: number): void {
  if (entry.box.annot !== null) stop(`repeat:${n}`)
  entry.box.annot = text(raw, n, NAME)
}

// Puts entry's class in space. A class in two namespaces fails, as Mermaid draws it only in the last.
function enter(entry: Entry, space: Namespace, n: number): void {
  if (entry.ns === space.id) return
  if (entry.ns !== null) stop(`repeat:${n}`)
  entry.ns = space.id; space.classes.push(entry.box.id)
}

// A member line of entry's class: as Mermaid's addMember reads one, a line from << to >> annotates it, inside { } (only
// there, in the subset); a line with ( … ) is a method; any other is an attribute.
function member(entry: Entry, raw: string, n: number, braced: boolean): void {
  const t = raw.trim()
  const annot = t.startsWith('<<') && t.endsWith('>>')
  if (annot && braced) return annotate(entry, t.slice(2, -2), n)
  if (annot || t === '' || /[{}]/.test(t)) stop(`syntax:${n}`)
  check(t, MEMBER_TEXT)
  entry.box.members.push(t.includes(')') ? method(t, n) : attribute(t, n))
}

// An attribute as Mermaid shows it: its visibility, then its text with ~T~ as <T>, then a trailing $ or *.
function attribute(t: string, n: number): Member {
  const vis = /^[#+~-]/.test(t) ? t[0]! : '', cls = /[$*]$/.test(t) && t.length > vis.length ? t.at(-1)! : ''
  return { text: text(vis + generics(spaced(t.slice(vis.length, t.length - cls.length)), n) + cls, n, BUILT), method: false }
}

// A method as Mermaid shows it: `vis name(params) : return`, each ~T~ as <T>, then its $ or *, just after the ) or at the
// return's end, kept last.
function method(t: string, n: number): Member {
  const m = /^([#+~-])?([^()]+)\(([^()]*)\)([^()]*)$/.exec(t) ?? stop(`syntax:${n}`)
  const [, vis = '', name = '', params = '', rest = ''] = m
  let cls = /^[$*]/.test(rest) ? rest[0]! : '', ret = (cls ? rest.slice(1) : rest).trim()
  if (!cls && /[$*]$/.test(ret)) { cls = ret.at(-1)!; ret = ret.slice(0, -1).trim() }
  const sig = `${vis}${generics(spaced(name), n)}(${generics(params.trim(), n)})`
  return { text: text(sig + (ret ? ` : ${generics(ret, n)}` : '') + cls, n, BUILT), method: true }
}

// A member's name trimmed, as Mermaid keeps it: one space after its visibility if it had any.
const spaced = (s: string): string => (/^\s/.test(s) ? ' ' : '') + s.trim()

// t with each ~T~ shown as <T>, nesting included: as Mermaid pairs them, each comma-separated piece's ~ pair from the
// outside in. A piece with an odd number of ~ holds a generic with a comma, which fails.
function generics(t: string, n: number): string {
  return t.split(',').map(piece => {
    const at: number[] = []
    for (let i = piece.indexOf('~'); i >= 0; i = piece.indexOf('~', i + 1)) at.push(i)
    if (at.length % 2) stop(`syntax:${n}`)
    const out = piece.split('')
    for (let k = 0; k < at.length / 2; k++) { out[at[k]!] = '<'; out[at[at.length - 1 - k]!] = '>' }
    return out.join('')
  }).join(',')
}

// How a field's text reaches the screen (docs/specs/2026-10-29-mermaid-tty-v1-text-ground-truth.md): a label, note or
// relation label is a markdown HTML label each <br> splits; a name or annotation a markdown HTML label on one line; a
// namespace title or cardinality a plain HTML label (createLabel) on one line; a member, member text. BUILT: text this
// parser builds from fields already checked, such as Box<T>.
type Field = readonly [Mode, Br]
const LINES: Field = ['markdown', 'any'], NAME: Field = ['markdown', 'none'], LINE: Field = ['html', 'none']
// A relation label: LINES, but Mermaid makes each <br> a newline before marked (styled's breaks).
const EDGE_LINES: Field = ['markdown', 'any']
const MEMBER_TEXT: Field = ['member', 'none'], BUILT: Field = ['plain', 'literal']

// Fails as drawable says ('entity' or 'html') when Mermaid would show s, in field, as other text.
function check(s: string, field: Field): void { const f = drawable(s, ...field); if (f) throw f }

// Drawn text of field, trimmed. A blank one fails on line n; then text Mermaid shows otherwise (check); then a blank line
// in it, from <br><br> or a <br> at an end. A LINES field (a label, note or relation label) draws its bold and italic
// marked, as styled says.
function text(s: string, n: number, field: Field): string {
  const t = s.trim()
  if (t === '') stop(`syntax:${n}`)
  if (field === LINES || field === EDGE_LINES) {
    const d = styled(t, 'any', { breaks: field === EDGE_LINES })
    if (isFail(d)) throw d
    return labelLines(d).some(l => !l.trim()) ? stop('label-blank-line') : d
  }
  check(t, field)
  if (labelLines(t).some(l => !l.trim())) stop('label-blank-line')
  const bad = unsupported(t)
  return bad ? stop(`unsupported-char ${bad}`) : t
}

// X ["c"] <end><line><end> ["c"] Y [: label]: declares X, then Y, and adds the relation.
function relation(m: RegExpExecArray, n: number, st: State): void {
  const [, from = '', tailRaw, left, line, right, headRaw, to = '', labelRaw] = m
  const tail = declare(name(from, n), null, n, st).box.id, head = declare(name(to, n), null, n, st).box.id
  const opt = (s: string | undefined, f: Field): string | null => (s === undefined ? null : text(s, n, f))
  // A cardinality "none", once trimmed, is hidden: Mermaid's own word for no cardinality.
  const card = (s: string | undefined): string | null => (s?.trim() === 'none' ? null : opt(s, LINE))
  const end = (s: string | undefined): ClassEnd => (s === undefined ? 'none' : END[s]!)
  const rels = st.model.relations
  rels.push({ id: `rel${rels.length}`, from: tail, to: head, tail: end(left), head: end(right), line: line === '..' ? 'dotted' : 'solid',
    label: opt(labelRaw, EDGE_LINES), tailLabel: card(tailRaw), headLabel: card(headRaw), order: rels.length + st.model.notes.length })
}

// note "t" or note for X "t", with id note<k>: its text as written, which only a <br> breaks (a literal \n Mermaid shows as
// written). X must be a class by the end.
function note(target: string | undefined, raw: string, n: number, st: State): void {
  const notes = st.model.notes, id = `note${notes.length}`, cls = target === undefined ? null : name(target, n)
  notes.push({ id, for: cls, text: text(raw, n, LINES), order: notes.length + st.model.relations.length })
  if (cls !== null) st.targets.push({ id: cls, n })
  if (st.ns) st.ns.space.notes.push(id)
}

// namespace N or N["l"] {: opens N, whose first block adds it; a later block adds to it, and another label fails.
function namespace(rawId: string, raw: string | undefined, n: number, st: State): void {
  const id = name(rawId, n), label = raw === undefined ? null : text(raw, n, LINE)
  let space = st.model.namespaces.find(s => s.id === id)
  if (!space) { space = { id, label: label ?? text(id, n, LINE), classes: [], notes: [] }; st.model.namespaces.push(space) }
  else if (label !== null && label !== space.label) stop(`repeat:${n}`)
  st.ns = { space, n, filled: false }
}

// Each note for X has a class X, and no two classes, notes, relations or namespaces share an id: each id owns what it draws.
function ends(st: State): void {
  for (const t of st.targets) if (!st.classes.has(t.id)) stop(`syntax:${t.n}`)
  const m = st.model, ids = [...m.classes, ...m.notes, ...m.relations, ...m.namespaces].map(x => x.id)
  if (new Set(ids).size < ids.length) stop('id-collision')
}
