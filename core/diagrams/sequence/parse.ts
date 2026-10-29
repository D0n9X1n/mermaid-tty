import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { unsupported } from '../../width.ts'

// The sequence model (matrix, sequence): participants in column order, the boxes
// around them, and the statements in source order, each frame holding its own.
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
const AUTONUMBER = re(String.raw`autonumber(?:\s+(\d+)(?:\s+(\d+))?)?`)
const TITLE = re(String.raw`title\s+(.*)`)
// accTitle: and accDescr: lines, and accDescr { … } blocks, are parsed and not drawn.
const ACC = re(String.raw`(?:accTitle|accDescr)\s*:.*`)
const ACC_BLOCK = re(String.raw`accDescr\s*\{(.*)`)
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
// A box's leading color, then a space or the line end: a word (boxLabel checks it is named or transparent), #hex,
// or a lowercase rgb(), rgba(), hsl() or hsla().
const COLOR = /^(?:([a-zA-Z]+)|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})|(?:rgba?|hsla?)\([^()]*\))(?:\s+|$)/
// A message: the sender's id, the first arrow (longest first) that starts the rest, an optional + or -, the
// target's id, a colon and the text. As in Mermaid's lexer, spaces may separate the parts.
const FROM = new RegExp(String.raw`^(${ID})\s*`, 'u')
const TO = new RegExp(String.raw`^\s*([+-]?)\s*(${ID})\s*:(.*)$`, 'u')
const ARROWS: [string, Msg['line'], Msg['tail'], Msg['head']][] = [['<<-->>', 'dotted', 'arrow', 'arrow'], ['<<->>', 'solid', 'arrow', 'arrow'],
  ['-->>', 'dotted', 'none', 'arrow'], ['->>', 'solid', 'none', 'arrow'], ['--x', 'dotted', 'none', 'cross'], ['-x', 'solid', 'none', 'cross'],
  ['--)', 'dotted', 'none', 'async'], ['-)', 'solid', 'none', 'async'], ['-->', 'dotted', 'none', 'open'], ['->', 'solid', 'none', 'open']]

// Ends the walk: parseSequence returns this Fail.
function stop(reason: string): never { throw fail(reason) }

// Drawn text, trimmed: every label line of it must be supported.
function text(s: string): string {
  const t = s.trim()
  for (const line of labelLines(t)) { const u = unsupported(line); if (u) stop(`unsupported-char ${u}`) }
  return t
}
// Drawn text that may be absent.
function optText(s: string | null | undefined): string | null { return s === null || s === undefined ? null : text(s) }

// Whether an accDescr { block closes in rest: its first } closes it, and must end the line.
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
  if (src.title !== null) text(src.title)
  const frames: Frame[] = [], destroyed = new Set<string>()
  // accFrom: the line of an open accDescr { block, or 0.
  let box: Box | null = null, creating: string[] = [], destroying: string[] = [], accFrom = 0
  // A statement goes into the innermost open frame's last section, or the top level.
  const add = (item: Item) => void (frames.at(-1)?.sections.at(-1)?.items ?? seq.items).push(item)
  // Naming a participant declares it if it is new; naming a destroyed one fails.
  const mention = (id: string) => {
    if (destroyed.has(id)) stop('destroyed')
    if (!seq.participants.some(p => p.id === id)) seq.participants.push({ id, kind: 'participant', label: id })
  }
  const open = (type: Frame['type'], cond: string | null) => {
    const f: Frame = { kind: 'frame', type, sections: [{ cond, items: [] }] }
    add(f); frames.push(f)
  }
  for (const { n, text: raw } of src.lines) {
    const t = raw.trim()
    if (accFrom) { if (closes(t, n)) accFrom = 0; continue }
    let m: RegExpExecArray | null
    // An open box holds only participant and actor lines, up to its end.
    if (box && t === 'end') {
      contiguous(seq, box); box = null
    } else if ((m = DECLARE.exec(t)) && !(box && m[1])) {
      const id = m[3]!, known = seq.participants.some(p => p.id === id)
      mention(id)
      // Only a new participant can be created.
      if (m[1] && known) stop('create')
      // As in Mermaid, declaring a known participant again changes it only with an as alias.
      const p = seq.participants.find(q => q.id === id)!
      if (!known || m[4] !== undefined) { p.kind = m[2] as Participant['kind']; p.label = m[4] === undefined ? id : text(m[4]) }
      if (box) {
        // A participant belongs to one box.
        if (seq.boxes.some(b => b !== box && b.ids.includes(id))) stop('box-split')
        if (!box.ids.includes(id)) box.ids.push(id)
      }
      if (m[1]) { add({ kind: 'create', id }); creating.push(id) }
    } else if (box) {
      stop(`syntax:${n}`)
    } else if ((m = MARK.exec(t))) {
      const kind = m[1] as Mark['kind'], id = m[2]!
      mention(id); add({ kind, id })
      if (kind === 'destroy') destroying.push(id)
    } else if ((m = NOTE.exec(t))) {
      if (m[3] && m[1] !== 'over') stop(`syntax:${n}`)
      const ids = m[3] ? [m[2]!, m[3]] : [m[2]!]
      ids.forEach(mention); add({ kind: 'note', side: m[1] as Note['side'], ids, text: text(m[4]!) })
    } else if ((m = FRAME.exec(t))) {
      open(m[1] as Frame['type'], optText(m[2]))
    } else if (RECT.test(t)) {
      open('rect', null)
    } else if ((m = SECTION.exec(t))) {
      const f = frames.at(-1)
      if (!f || f.type !== DIVIDES[m[1]!]) stop(`syntax:${n}`)
      f.sections.push({ cond: optText(m[2]), items: [] })
    } else if ((m = BOX.exec(t))) {
      if (frames.some(f => f.type === 'rect')) stop(`syntax:${n}`)
      box = { label: optText(boxLabel(m[1] ?? '')), ids: [] }; seq.boxes.push(box)
    } else if (t === 'end') {
      if (!frames.pop()) stop(`syntax:${n}`)
    } else if ((m = AUTONUMBER.exec(t))) {
      seq.autonumber = { start: Number(m[1] ?? 1), step: Number(m[2] ?? 1) }
    } else if ((m = TITLE.exec(t))) {
      if (seq.title !== null) stop('title')
      seq.title = text(m[1]!)
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
      for (const id of destroying) destroyed.add(id)
      creating = []; destroying = []
      add(msg)
    }
  }
  if (accFrom) stop(`syntax:${accFrom}`)
  if (frames.length || box) stop('unclosed-frame')
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
  return { kind: 'msg', from: from[1]!, to: to[2]!, line, tail, head, text: text(to[3]!), activate: to[1] === '+', deactivate: to[1] === '-' }
}

// A box's label: its text after a leading CSS color, which is not drawn; null if none is left.
function boxLabel(s: string): string | null {
  const c = COLOR.exec(s), name = c?.[1]?.toLowerCase()
  return (c && (name === undefined || name === 'transparent' || NAMED.has(name)) ? s.slice(c[0].length) : s) || null
}

// A box's participants must be adjacent in column order.
function contiguous(seq: Seq, box: Box) {
  const cols = box.ids.map(id => seq.participants.findIndex(p => p.id === id))
  if (cols.length && Math.max(...cols) - Math.min(...cols) + 1 !== cols.length) stop('box-split')
}
