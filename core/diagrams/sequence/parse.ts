import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, labelLines, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

// The sequence model (matrix, sequence): participants in column order, the boxes
// around them, and the statements in source order, each frame holding its own.
// Not in the plan: a note's side keeps its source words; an absent condition or box label is null.
export type Participant = { id: string; kind: 'participant' | 'actor'; label: string }
export type Box = { label: string | null; ids: string[] }
export type Msg = { kind: 'msg'; from: string; to: string; line: 'solid' | 'dotted'; tail: 'none' | 'arrow'
  head: 'arrow' | 'open' | 'cross' | 'async'; text: string; activate: boolean; deactivate: boolean }
export type Note = { kind: 'note'; side: 'left of' | 'right of' | 'over'; ids: string[]; text: string }
export type Frame = { kind: 'frame'; type: 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break' | 'rect'; sections: { cond: string | null; items: Item[] }[] }
export type Mark = { kind: 'create' | 'destroy' | 'activate' | 'deactivate'; id: string }
export type Item = Msg | Note | Frame | Mark
export type Seq = { title: string | null; participants: Participant[]; boxes: Box[]; autonumber: { start: number; step: number } | null; items: Item[] }

// An id: letters, digits, _ and .
const ID = String.raw`[\p{L}\p{N}_.]+`
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^${s}$`, 'u')
const DECLARE = re(String.raw`(create\s+)?(participant|actor)\s+(${ID})(?:\s+as\s+(.*))?`)
const MARK = re(String.raw`(activate|deactivate|destroy)\s+(${ID})`)
const NOTE = re(String.raw`Note\s+(left of|right of|over)\s+(${ID})(?:\s*,\s*(${ID}))?\s*:(.*)`)
const FRAME = re(String.raw`(alt|opt|loop|par|critical|break)(?:\s+(.*))?`)
const SECTION = re(String.raw`(else|and|option)(?:\s+(.*))?`)
// The frame each section keyword divides.
const DIVIDES: Record<string, Frame['type']> = { else: 'alt', and: 'par', option: 'critical' }
const RECT = re(String.raw`rect\s+.+`)
const BOX = re(String.raw`box(?:\s+(.*))?`)
const AUTONUMBER = re(String.raw`autonumber(?:\s+(off)|\s+(\d+)(?:\s+(\d+))?)?`)
const TITLE = re(String.raw`title\s+(.*)`)
// accTitle: and accDescr: lines, and accDescr { … } blocks, are parsed and not drawn.
const ACC = re(String.raw`(?:accTitle|accDescr)\s*:.*`)
const ACC_BLOCK = re(String.raw`accDescr\s*\{(.*)`)
// The words Mermaid's lexer reads as keywords, in any case and before any character but a-z, 0-9 and _ (jison's word
// boundary); it fails on an id made of one. par_over, off and sequenceDiagram are Mermaid keywords too.
const KEYWORDS = `participant actor note over end loop alt else opt par and rect critical break option activate deactivate autonumber
  title box create destroy link links properties details accTitle accDescr par_over off sequenceDiagram`.split(/\s+/)
const KEYWORD = new RegExp(`^(?:${KEYWORDS.join('|')})(?![A-Za-z0-9_])`, 'i')
// Mermaid's lexer reads an id such as 42 or 1.5 as a number when a space follows it, and fails: such an id fails id.
const NUMBER = /^(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$/
// The 148 CSS named colors (CSS Color 4), matched in any case.
const NAMED = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
  darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
  lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey
  snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/))
// A box's leading color, then a space or the line end: a word (boxLabel checks it is named or transparent) or #hex.
// Mermaid reads the # of a #hex as a comment, so it draws box #abc G untitled; the plan drops the color and titles the box G.
const COLOR = /^(?:([a-zA-Z]+)|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))(?:\s+|$)/
// Not in the plan: the strict subset of rgb(), rgba(), hsl() and hsla() box colors. rgb() and rgba() take three integers
// 0-255 or three percentages 0-100%; hsl() and hsla() take a hue, a number with an optional deg, grad, rad or turn, then two
// percentages. An optional alpha, a number 0-1 or a percentage, follows a comma, or a / when the parts are space-separated.
// Spaces are free inside the parentheses.
const BYTE = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`
const PERCENT = String.raw`(?:100(?:\.0+)?|[1-9]?\d(?:\.\d+)?|\.\d+)%`
const ALPHA = String.raw`(?:1(?:\.0+)?|0?\.\d+|0|${PERCENT})`
const HUE = String.raw`(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn)?`
const SP = String.raw`[ \t]*`
// Three parts, comma-separated with an optional , alpha, or space-separated with an optional / alpha.
const parts = (a: string, b: string, c: string) =>
  String.raw`(?:${a}${SP},${SP}${b}${SP},${SP}${c}(?:${SP},${SP}${ALPHA})?|${a}[ \t]+${b}[ \t]+${c}(?:${SP}/${SP}${ALPHA})?)`
const COLOR_FN = new RegExp(String.raw`^(?:rgba?\(${SP}(?:${parts(BYTE, BYTE, BYTE)}|${parts(PERCENT, PERCENT, PERCENT)})` +
  String.raw`|hsla?\(${SP}${parts(HUE, PERCENT, PERCENT)})${SP}\)$`)
// A message: the sender's id, the first arrow (longest first) that starts the rest, an optional + or -, the
// target's id, a colon and the text. Not in the plan: spaces may separate the parts, as in Mermaid's lexer.
const FROM = new RegExp(String.raw`^(${ID})\s*`, 'u')
const TO = new RegExp(String.raw`^\s*([+-]?)\s*(${ID})\s*:(.*)$`, 'u')
const ARROWS: [string, Msg['line'], Msg['tail'], Msg['head']][] = [['<<-->>', 'dotted', 'arrow', 'arrow'], ['<<->>', 'solid', 'arrow', 'arrow'],
  ['-->>', 'dotted', 'none', 'arrow'], ['->>', 'solid', 'none', 'arrow'], ['--x', 'dotted', 'none', 'cross'], ['-x', 'solid', 'none', 'cross'],
  ['--)', 'dotted', 'none', 'async'], ['-)', 'solid', 'none', 'async'], ['-->', 'dotted', 'none', 'open'], ['->', 'solid', 'none', 'open']]

// Ends the walk: parseSequence returns this Fail.
function stop(reason: string): never { throw fail(reason) }

// Drawn text, trimmed: every label line of it must be supported. Mermaid reads a # as the start of a comment, or of
// an entity such as #9829;, so it would draw other text; and text it shows otherwise in a field of mode and br fails as
// drawable says. A message or note splits each <br>; an alias, condition or box label draws on one line (br 'none'); a
// title, statement or frontmatter, is sanitized with no <br>, as Mermaid shows title a<!--c-->b as ab.
function text(s: string, mode: Mode, br: Br): string {
  const t = s.trim()
  if (t.includes('#')) stop('hash')
  const f = drawable(t, mode, br)
  if (f) stop(f.reason)
  for (const line of labelLines(t)) { const u = unsupported(line); if (u) stop(`unsupported-char ${u}`) }
  return t
}
// Mermaid reads a wrap: or nowrap: at the start of a message, note, condition, alias or box label as a directive, not
// text; a title keeps it. The fit ladder wraps anyway, so the directive is dropped.
function unwrap(s: string): string { return s.trim().replace(/^:?(?:no)?wrap:/, '') }
// A condition or box label, after any directive: null if absent or empty. A box label is sanitized, a condition plain.
function optText(s: string | null | undefined, mode: Mode): string | null {
  return s === null || s === undefined ? null : text(unwrap(s), mode, 'none') || null
}

// Whether an accDescr { block closes in rest. Not in the plan: its first } closes it, and must end the line.
function closes(rest: string, n: number): boolean {
  const i = rest.indexOf('}')
  if (i < 0) return false
  if (rest.slice(i + 1).trim()) stop(`syntax:${n}`)
  return true
}

export function parseSequence(src: Source): Seq | Fail {
  try { return walk(src) } catch (e) { if (isFail(e)) return e; throw e }
}

function walk(src: Source): Seq {
  const seq: Seq = { title: src.title, participants: [], boxes: [], autonumber: null, items: [] }
  // A frontmatter title is drawn, so it is checked like any label.
  if (src.title !== null) text(src.title, 'sanitized', 'none')
  const frames: Frame[] = [], destroyed = new Set<string>()
  // Each participant's activation depth: Mermaid fails on deactivating one that is not active.
  const depth = new Map<string, number>()
  // accFrom: the line of an open accDescr { block, or 0. sent: whether a message has come yet.
  let box: Box | null = null, creating: string[] = [], destroying: string[] = [], accFrom = 0, sent = false
  // A statement goes into the innermost open frame's last section, or the top level.
  const add = (item: Item) => void (frames.at(-1)?.sections.at(-1)?.items ?? seq.items).push(item)
  // Naming a participant declares it if it is new; naming a keyword, a number or a destroyed participant fails.
  const mention = (id: string) => {
    if (KEYWORD.test(id)) stop('keyword')
    if (NUMBER.test(id)) stop('id')
    if (destroyed.has(id)) stop('destroyed')
    if (!seq.participants.some(p => p.id === id)) seq.participants.push({ id, kind: 'participant', label: id })
  }
  // Starts (1) or ends (-1) an activation of id.
  const activation = (id: string, by: 1 | -1) => {
    const d = (depth.get(id) ?? 0) + by
    if (d < 0) stop('inactive')
    depth.set(id, d)
  }
  const open = (type: Frame['type'], cond: string | null) => {
    const f: Frame = { kind: 'frame', type, sections: [{ cond, items: [] }] }
    add(f); frames.push(f)
  }
  for (const { n, text: raw } of src.lines) {
    const t = raw.trim()
    // Mermaid ends a statement at a ;, so it would draw other text or fail.
    if (t.includes(';')) stop('semicolon')
    if (accFrom) { if (closes(t, n)) accFrom = 0; continue }
    let m: RegExpExecArray | null
    // An open box holds only participant and actor lines, up to its end.
    if (box && t === 'end') {
      contiguous(seq, box); box = null
    } else if ((m = DECLARE.exec(t)) && !(box && m[1])) {
      const id = m[3]!, known = seq.participants.some(p => p.id === id)
      mention(id)
      // Not in the plan: as in Mermaid, only a new participant can be created.
      if (m[1] && known) stop('create')
      // Not in the plan: as in Mermaid, declaring a known participant again changes it only with an as alias.
      const p = seq.participants.find(q => q.id === id)!
      if (!known || m[4] !== undefined) { p.kind = m[2] as Participant['kind']; p.label = m[4] === undefined ? id : text(unwrap(m[4]), 'plain', 'none') }
      if (box) {
        // Not in the plan: as in Mermaid, a participant belongs to one box.
        if (seq.boxes.some(b => b !== box && b.ids.includes(id))) stop('box-split')
        if (!box.ids.includes(id)) box.ids.push(id)
      }
      if (m[1]) { add({ kind: 'create', id }); creating.push(id) }
    } else if (box) {
      stop(`syntax:${n}`)
    } else if ((m = MARK.exec(t))) {
      const kind = m[1] as Mark['kind'], id = m[2]!
      mention(id)
      if (kind === 'activate') activation(id, 1)
      if (kind === 'deactivate') activation(id, -1)
      if (kind === 'destroy') destroying.push(id)
      add({ kind, id })
    } else if ((m = NOTE.exec(t))) {
      // Not in the plan: as in Mermaid's grammar, only over takes two participants.
      if (m[3] && m[1] !== 'over') stop(`syntax:${n}`)
      const ids = m[3] ? [m[2]!, m[3]] : [m[2]!]
      ids.forEach(mention); add({ kind: 'note', side: m[1] as Note['side'], ids, text: text(unwrap(m[4]!), 'plain', 'any') })
    } else if ((m = FRAME.exec(t))) {
      open(m[1] as Frame['type'], optText(m[2], 'plain'))
    } else if (RECT.test(t)) {
      open('rect', null)
    } else if ((m = SECTION.exec(t))) {
      const f = frames.at(-1)
      if (!f || f.type !== DIVIDES[m[1]!]) stop(`syntax:${n}`)
      f.sections.push({ cond: optText(m[2], 'plain'), items: [] })
    } else if ((m = BOX.exec(t))) {
      // Not in the plan: a box sits in no rect, however deep, but may sit in another frame.
      if (frames.some(f => f.type === 'rect')) stop(`syntax:${n}`)
      box = { label: optText(boxLabel(m[1] ?? ''), 'sanitized'), ids: [] }; seq.boxes.push(box)
    } else if (t === 'end') {
      if (!frames.pop()) stop(`syntax:${n}`)
    } else if ((m = AUTONUMBER.exec(t))) {
      // Mermaid numbers the messages after an autonumber statement, counting those before it, and reads a 0 start or
      // step as unset. The model numbers every message, so a second autonumber, off, one after a message or a 0 fails.
      const start = Number(m[2] ?? 1), step = Number(m[3] ?? 1)
      if (seq.autonumber || m[1] || sent || start === 0 || step === 0) stop('autonumber')
      seq.autonumber = { start, step }
    } else if ((m = TITLE.exec(t))) {
      if (seq.title !== null) stop('title')
      seq.title = text(m[1]!, 'sanitized', 'none')
    } else if (ACC.test(t)) {
      // Accessibility text is not drawn.
    } else if ((m = ACC_BLOCK.exec(t))) {
      if (!closes(m[1]!, n)) accFrom = n
    } else {
      const msg = message(t) ?? stop(`syntax:${n}`)
      mention(msg.from); mention(msg.to)
      // The message after create X targets X; the one after destroy X has X at one end.
      if (creating.some(id => id !== msg.to)) stop('create')
      if (destroying.some(id => id !== msg.from && id !== msg.to)) stop('destroy')
      // + activates the target; - deactivates the sender.
      if (msg.activate) activation(msg.to, 1)
      if (msg.deactivate) activation(msg.from, -1)
      for (const id of destroying) destroyed.add(id)
      creating = []; destroying = []; sent = true
      add(msg)
    }
  }
  if (accFrom) stop(`syntax:${accFrom}`)
  if (frames.length || box) stop('unclosed-frame')
  // Not in the plan: a create or destroy with no message after it falls back.
  if (creating.length) stop('create')
  if (destroying.length) stop('destroy')
  return seq
}

function message(t: string): Msg | null {
  const from = FROM.exec(t)
  if (!from) return null
  const rest = t.slice(from[0].length)
  const arrow = ARROWS.find(([a]) => rest.startsWith(a))
  if (!arrow) return null
  const to = TO.exec(rest.slice(arrow[0].length))
  if (!to) return null
  const [, line, tail, head] = arrow
  return { kind: 'msg', from: from[1]!, to: to[2]!, line, tail, head, text: text(unwrap(to[3]!), 'plain', 'any'), activate: to[1] === '+', deactivate: to[1] === '-' }
}

// A box's label: its text after a leading CSS color, which is not drawn; null if none is left. As in Mermaid, a lowercase
// rgb(, rgba(, hsl( or hsla( starts a color that runs to the label's last ). Not in the plan: Mermaid drops that color only if
// the browser reads it as one, and else titles the box with the whole label, so one outside the strict subset fails box-color.
function boxLabel(s: string): string | null {
  if (/^(?:rgba?|hsla?)\(/.test(s)) {
    const color = s.slice(0, s.lastIndexOf(')') + 1)
    if (!COLOR_FN.test(color)) stop('box-color')
    return s.slice(color.length) || null
  }
  const c = COLOR.exec(s), name = c?.[1]?.toLowerCase()
  return (c && (name === undefined || name === 'transparent' || NAMED.has(name)) ? s.slice(c[0].length) : s) || null
}

// A box's participants must be adjacent in column order. Not in the plan: an empty box, with no columns, is kept.
function contiguous(seq: Seq, box: Box) {
  const cols = box.ids.map(id => seq.participants.findIndex(p => p.id === id))
  if (cols.length && Math.max(...cols) - Math.min(...cols) + 1 !== cols.length) stop('box-split')
}
