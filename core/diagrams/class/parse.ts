// Reads a classDiagram (plan C, T57; matrix, class) into its model: the classes, with their labels, annotations and members
// as Mermaid displays them, the relations, the notes and the namespaces. A statement outside the subset fails, so the fence
// draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Member } from '../../graph/members.ts'
import type { Dir } from '../../graph/model.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { unsupported } from '../../width.ts'

// A relation end: <| or |> triangle, * diamond, o odiamond, < or > arrow.
export type ClassEnd = 'none' | 'triangle' | 'diamond' | 'odiamond' | 'arrow'
// A class: label is its ["label"], else its name with ~T~ shown as <T>; annot is its annotation, null if none; members are in
// source order, as members.ts takes them. order: its index among the classes.
export type ClassBox = { id: string; label: string; annot: string | null; members: Member[]; order: number }
// A relation from its left class to its right one, with each end's cardinality; each text is null when the source gives none.
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
// end at a word boundary), nor one starting with o, which its aggregation rule reads.
const WORD = '(?!(?:classDiagram|style|classDef|namespace|class|cssClass|callback|link|click|note|href|call|_self|_blank|_parent|_top)\\b|o)\\w+'
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
const RELATION = re(`(${ID})\\s*(?:${QUOTED}\\s*)?(<\\||\\|>|\\*|o|<|>)?(--|\\.\\.)(<\\||\\|>|\\*|o|<|>)?\\s*(?:${QUOTED}\\s*)?(${ID})(?:\\s*:(${TEXT}))?`)
const MEMBER = re(`(${ID})\\s*:(${TEXT})`)
// As Mermaid's lexer reads it: a top-level line holding direction, then spaces (a line end too), then TB, BT, RL or LR, is
// only that direction statement. direction XX alone is drawn as one; any other such line fails.
const DIRECTION = /^direction\s+(TB|BT|RL|LR)$/
const DIRECTED = /direction(?:\s+(?:TB|BT|RL|LR)|$)/
// Styling, which draws nothing (common rule 4): the keyword, then a space.
const IGNORED = /^(?:style|classDef|cssClass)\s/
// click, link and callback, in each form Mermaid's grammar accepts; they draw nothing. A "tooltip" and a link target may follow.
const STR = '"[^"]+"', TIP = `(?:\\s*${STR})?`, TARGET = '(?:\\s*(?:_self|_blank|_parent|_top))?'
const CLICK = re(`(?:click\\s+${ID}\\s+(?:href\\s*${STR}${TIP}${TARGET}|call\\s+[^(\\s][^(]*\\([^)]*\\)${TIP})` +
  `|link\\s+${ID}\\s*${STR}${TIP}${TARGET}|callback\\s+${ID}\\s*${STR}${TIP})`)
// As Mermaid's lexer reads them: accTitle: and accDescr: run to the line's end, and accDescr { to its first }. Neither draws.
const ACC = /^acc(?:Title|Descr)\s*:/
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
    else if (!st.ns && ACC.test(t)) continue
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
  else if (IGNORED.test(t) || CLICK.test(t)) return
  else if (KEYWORD.test(t)) stop(`syntax:${n}`)
  else if ((m = ANNOTATION.exec(t))) annotate(declare(unquote(m[2]!), null, n, st), m[1]!, n)
  else if ((m = RELATION.exec(t))) relation(m, n, st)
  else if ((m = MEMBER.exec(t))) member(declare(unquote(m[1]!), null, n, st), m[2]!, n, false)
  else stop(`syntax:${n}`)
}

// A backtick name's text, else the id as written.
const unquote = (id: string): string => (id.startsWith('`') ? id.slice(1, -1) : id)

// class X, with its ~T~ or ["label"], <<annotation>> and {: declares X, in the open namespace if there is one.
function classStatement(m: RegExpExecArray, n: number, st: State): void {
  const [, id = '', generic = null, label = null, annot = null, open] = m
  const entry = declare(unquote(id), generic, n, st)
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
  const label = text(generic === null ? id : `${id}<${generic}>`, n)
  const box: ClassBox = { id, label, annot: null, members: [], order: st.model.classes.length }
  const entry: Entry = { box, generic, labelled: false, ns: null }
  st.classes.set(id, entry); st.model.classes.push(box)
  return entry
}

// Sets entry's label from a ["label"]. A class with a ~T~ fails 'syntax', as the subset gives a class one or the other; a
// second, different label fails 'repeat', as Mermaid keeps only one.
function relabel(entry: Entry, raw: string, n: number): void {
  const label = text(raw, n)
  if (entry.generic !== null) stop(`syntax:${n}`)
  if (entry.labelled && label !== entry.box.label) stop(`repeat:${n}`)
  entry.box.label = label; entry.labelled = true
}

// Sets entry's annotation; a second fails, as Mermaid draws only the first.
function annotate(entry: Entry, raw: string, n: number): void {
  if (entry.box.annot !== null) stop(`repeat:${n}`)
  entry.box.annot = text(raw, n)
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
  entry.box.members.push(t.includes(')') ? method(t, n) : attribute(t, n))
}

// An attribute as Mermaid shows it: its visibility, then its text with ~T~ as <T>, then a trailing $ or *.
function attribute(t: string, n: number): Member {
  const vis = /^[#+~-]/.test(t) ? t[0]! : '', cls = /[$*]$/.test(t) && t.length > vis.length ? t.at(-1)! : ''
  return { text: text(vis + generics(spaced(t.slice(vis.length, t.length - cls.length)), n) + cls, n), method: false }
}

// A method as Mermaid shows it: `vis name(params) : return`, each ~T~ as <T>, then its $ or *, just after the ) or at the
// return's end, kept last.
function method(t: string, n: number): Member {
  const m = /^([#+~-])?([^()]+)\(([^()]*)\)([^()]*)$/.exec(t) ?? stop(`syntax:${n}`)
  const [, vis = '', name = '', params = '', rest = ''] = m
  let cls = /^[$*]/.test(rest) ? rest[0]! : '', ret = (cls ? rest.slice(1) : rest).trim()
  if (!cls && /[$*]$/.test(ret)) { cls = ret.at(-1)!; ret = ret.slice(0, -1).trim() }
  const sig = `${vis}${generics(spaced(name), n)}(${generics(params.trim(), n)})`
  return { text: text(sig + (ret ? ` : ${generics(ret, n)}` : '') + cls, n), method: true }
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

// Drawn text, trimmed. A blank one fails on line n; a blank line in it, from <br><br> or a <br> at an end, fails. A #…;
// entity fails 'entity': Mermaid encodes it in the body and its SVG decodes it, so it would draw as other text.
function text(s: string, n: number): string {
  const t = s.trim()
  if (t === '') stop(`syntax:${n}`)
  if (labelLines(t).some(l => !l.trim())) stop('label-blank-line')
  if (/#\w+;/.test(t)) stop('entity')
  const bad = unsupported(t)
  return bad ? stop(`unsupported-char ${bad}`) : t
}

// X ["c"] <end><line><end> ["c"] Y [: label]: declares X, then Y, and adds the relation.
function relation(m: RegExpExecArray, n: number, st: State): void {
  const [, from = '', tailRaw, left, line, right, headRaw, to = '', labelRaw] = m
  const tail = declare(unquote(from), null, n, st).box.id, head = declare(unquote(to), null, n, st).box.id
  const opt = (s: string | undefined): string | null => (s === undefined ? null : text(s, n))
  // A cardinality "none", once trimmed, is hidden: Mermaid's own word for no cardinality.
  const card = (s: string | undefined): string | null => (s?.trim() === 'none' ? null : opt(s))
  const end = (s: string | undefined): ClassEnd => (s === undefined ? 'none' : END[s]!)
  const rels = st.model.relations
  rels.push({ id: `rel${rels.length}`, from: tail, to: head, tail: end(left), head: end(right), line: line === '..' ? 'dotted' : 'solid',
    label: opt(labelRaw), tailLabel: card(tailRaw), headLabel: card(headRaw), order: rels.length })
}

// note "t" or note for X "t", with id note<k>: \n and <br> break its lines, as <br>. X must be a class by the end.
function note(target: string | undefined, raw: string, n: number, st: State): void {
  const notes = st.model.notes, id = `note${notes.length}`, cls = target === undefined ? null : unquote(target)
  notes.push({ id, for: cls, text: text(raw.replace(/\\n|<br\s*\/?>/gi, '<br>'), n), order: notes.length })
  if (cls !== null) st.targets.push({ id: cls, n })
  if (st.ns) st.ns.space.notes.push(id)
}

// namespace N or N["l"] {: opens N, whose first block adds it; a later block adds to it, and another label fails.
function namespace(rawId: string, raw: string | undefined, n: number, st: State): void {
  const id = unquote(rawId), label = raw === undefined ? null : text(raw, n)
  let space = st.model.namespaces.find(s => s.id === id)
  if (!space) { space = { id, label: label ?? text(id, n), classes: [], notes: [] }; st.model.namespaces.push(space) }
  else if (label !== null && label !== space.label) stop(`repeat:${n}`)
  st.ns = { space, n, filled: false }
}

// Each note for X has a class X, and no two classes, notes, relations or namespaces share an id: each id owns what it draws.
function ends(st: State): void {
  for (const t of st.targets) if (!st.classes.has(t.id)) stop(`syntax:${t.n}`)
  const m = st.model, ids = [...m.classes, ...m.notes, ...m.relations, ...m.namespaces].map(x => x.id)
  if (new Set(ids).size < ids.length) stop('id-collision')
}
