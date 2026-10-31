import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, labelLines, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

// The sequence model (matrix, sequence): participants in column order, the boxes
// around them, and the statements in source order, each frame holding its own.
// Not in the plan: a note's side keeps its source words; an absent condition or box label is null.
export type Participant = { id: string; kind: 'participant' | 'actor'; label: string }
export type Box = { label: string | null; ids: string[] }
export type Msg = {
  kind: 'msg'
  from: string
  to: string
  line: 'solid' | 'dotted'
  tail: 'none' | 'arrow'
  head: 'arrow' | 'open' | 'cross' | 'async'
  text: string
  activate: boolean
  deactivate: boolean
  num: number | null
}
export type Note = { kind: 'note'; side: 'left of' | 'right of' | 'over'; ids: string[]; text: string }
export type Frame = {
  kind: 'frame'
  type: 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break' | 'rect'
  sections: { cond: string | null; items: Item[] }[]
}
export type Mark = { kind: 'create' | 'destroy' | 'activate' | 'deactivate'; id: string }
export type Item = Msg | Note | Frame | Mark
// Not in the plan: each message carries its autonumber, or null if numbers are off when it comes.
export type Seq = { title: string | null; participants: Participant[]; boxes: Box[]; items: Item[] }

// An id: letters, digits, _ and .
const ID = String.raw`[\p{L}\p{N}_.]+`
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^${s}$`, 'u')
const DECLARE = re(String.raw`(create\s+)?(participant|actor)\s+(${ID})(?:\s+as\s+(.*))?`)
const MARK = re(String.raw`(activate|deactivate|destroy)\s+(${ID})`)
// Groups: side, first id, what follows it, second id, what follows that, text.
const NOTE = re(String.raw`Note\s+(left of|right of|over)\s+(${ID})((?:\s*,\s*(${ID}))?(\s*:(.*)))`)
const FRAME = re(String.raw`(alt|opt|loop|par|critical|break)(?:\s+(.*))?`)
const SECTION = re(String.raw`(else|and|option)(?:\s+(.*))?`)
// The frame each section keyword divides.
const DIVIDES: Record<string, Frame['type']> = { else: 'alt', and: 'par', option: 'critical' }
const RECT = re(String.raw`rect(?:\s+.*)?`)
const BOX = re(String.raw`box(?:\s+(.*))?`)
const AUTONUMBER = re(String.raw`autonumber(?:\s+(off)|\s+(\d+)(?:\s+(\d+))?)?`)
const TITLE = re(String.raw`title\s+(.*)`)
// accTitle: and accDescr: lines, and accDescr { … } blocks, are parsed and not drawn.
const ACC = re(String.raw`(?:accTitle|accDescr)\s*:.*`)
const ACC_BLOCK = re(String.raw`accDescr\s*\{(.*)`)
// Where a message or note names a participant, Mermaid 12.2.0's lexer reads these words as keywords, in any case and before
// any character but a-z, 0-9 and _ (jison's word boundary), and fails on an id made of one. After participant, actor,
// create, activate, deactivate or destroy it reads any id.
const KEYWORDS =
  `participant actor note over end loop alt else opt par and rect critical break option activate deactivate autonumber
  box create destroy par_over off sequenceDiagram`.split(/\s+/)
const KEYWORD = new RegExp(`^(?:${KEYWORDS.join('|')})(?![A-Za-z0-9_])`, 'i')
// Words Mermaid reads as keywords only before what follows here: title x, title: x, accTitle: x, accDescr: x or {. Before
// an arrow, a bare colon or a comma they are ids, as link, links, properties and details always are there.
const SOFT: ReadonlyMap<string, RegExp> = new Map([
  ['title', /^(?:\s|:\s|:$)/],
  ['acctitle', /^\s*:/],
  ['accdescr', /^\s*[:{]/],
  ['link', /$^/],
  ['links', /$^/],
  ['properties', /$^/],
  ['details', /$^/],
])
// Mermaid's lexer reads an id such as 42 or 1.5 as a number when a space follows it, and fails: such an id fails id.
const NUMBER = /^(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$/
// The 148 CSS named colors (CSS Color 4), matched in any case.
const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
  darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
  lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey
  snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  ),
)
// Words a browser also reads as a color, each to its own support: currentColor, the CSS-wide keywords, and the CSS Color 4
// system colors, deprecated ones included. A box label led by one fails box-color.
const OTHER_COLORS = new Set(
  `currentcolor inherit initial unset revert accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas
  canvastext field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext activeborder activecaption
  appworkspace background buttonhighlight buttonshadow captiontext inactiveborder inactivecaption inactivecaptiontext infobackground infotext menu
  menutext scrollbar threeddarkshadow threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext`.split(
    /\s+/,
  ),
)
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
const COLOR_FN = new RegExp(
  String.raw`^(?:rgba?\(${SP}(?:${parts(BYTE, BYTE, BYTE)}|${parts(PERCENT, PERCENT, PERCENT)})` +
    String.raw`|hsla?\(${SP}${parts(HUE, PERCENT, PERCENT)})${SP}\)$`,
)
// A message: the sender's id, the first arrow (longest first) that starts the rest, an optional + or -, the
// target's id, a colon and the text. Not in the plan: spaces may separate the parts, as in Mermaid's lexer.
const FROM = new RegExp(String.raw`^(${ID})\s*`, 'u')
const TO = new RegExp(String.raw`^\s*([+-]?)\s*(${ID})(\s*:(.*))$`, 'u')
const ARROWS: [string, Msg['line'], Msg['tail'], Msg['head']][] = [
  ['<<-->>', 'dotted', 'arrow', 'arrow'],
  ['<<->>', 'solid', 'arrow', 'arrow'],
  ['-->>', 'dotted', 'none', 'arrow'],
  ['->>', 'solid', 'none', 'arrow'],
  ['--x', 'dotted', 'none', 'cross'],
  ['-x', 'solid', 'none', 'cross'],
  ['--)', 'dotted', 'none', 'async'],
  ['-)', 'solid', 'none', 'async'],
  ['-->', 'dotted', 'none', 'open'],
  ['->', 'solid', 'none', 'open'],
]

// Ends the walk: parseSequence returns this Fail.
function stop(reason: string): never {
  throw fail(reason)
}

// Drawn text, trimmed: every label line of it must be supported. Mermaid reads a # as the start of a comment, or of
// an entity such as #9829;, so it would draw other text; and text it shows otherwise in a field of mode and br fails as
// drawable says. A message or note splits each <br>; an alias, condition or box label draws on one line (br 'none'); a
// title, statement or frontmatter, is sanitized with no <br>, as Mermaid shows title a<!--c-->b as ab.
function text(s: string, mode: Mode, br: Br): string {
  const t = s.trim()
  if (t.includes('#')) {
    stop('hash')
  }
  const f = drawable(t, mode, br)
  if (f) {
    stop(f.reason)
  }
  for (const line of labelLines(t)) {
    const u = unsupported(line)
    if (u) {
      stop(`unsupported-char ${u}`)
    }
  }
  return t
}
// Mermaid reads a wrap: or nowrap: at the start of a message, note, condition, alias or box label as a directive, not
// text; a title keeps it. The fit ladder wraps anyway, so the directive is dropped.
function unwrap(s: string): string {
  return s.trim().replace(/^:?(?:no)?wrap:/, '')
}
// A condition or box label, after any directive: null if absent or empty. A box label is sanitized, a condition plain.
function optText(s: string | null | undefined, mode: Mode): string | null {
  return s === null || s === undefined ? null : text(unwrap(s), mode, 'none') || null
}

// Whether an accDescr { block closes in rest. Not in the plan: its first } closes it, and must end the line.
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

// A statement as Mermaid's lexer reads it: its line, its text, and what ends it: a ;, a # (the rest of the line is a
// comment) or the line end ('').
type Stmt = { n: number; raw: string; cut: string }
// Not in the plan: as in Mermaid 12.2.0, a ; ends a statement and a # starts a comment that runs to the line end.
// Accessibility text runs to the line end, an accDescr { block to its }, whatever it holds. encodeEntities turns an entity
// such as #9829; into other text before the lexer runs, so one fails hash.
function* statements(lines: Source['lines']): Generator<Stmt> {
  let accFrom = 0
  for (const { n, text } of lines) {
    if (accFrom) {
      if (closes(text.trim(), n)) {
        accFrom = 0
      }
      continue
    }
    let rest = text.trimStart()
    while (rest.trim()) {
      const block = ACC_BLOCK.exec(rest.trim())
      if (block || ACC.test(rest.trim())) {
        yield { n, raw: rest, cut: '' }
        if (block && !closes(block[1]!, n)) {
          accFrom = n
        }
        break
      }
      if (/#\w+;/.test(rest)) {
        stop('hash')
      }
      const i = rest.search(/[;#]/)
      const cut = i < 0 ? '' : rest[i]!
      const raw = i < 0 ? rest : rest.slice(0, i)
      if (raw.trim()) {
        yield { n, raw, cut }
      }
      if (cut !== ';') {
        break
      }
      rest = rest.slice(i + 1).trimStart()
    }
  }
  if (accFrom) {
    stop(`syntax:${accFrom}`)
  }
}

export function parseSequence(src: Source): Seq | Fail {
  try {
    return walk(src)
  } catch (e) {
    if (isFail(e)) {
      return e
    }
    throw e
  }
}

function walk(src: Source): Seq {
  const seq: Seq = { title: src.title, participants: [], boxes: [], items: [] }
  // A frontmatter title is drawn, so it is checked like any label.
  if (src.title !== null) {
    text(src.title, 'sanitized', 'none')
  }
  // marked: the ids activate, deactivate or destroy names, which Mermaid does not declare.
  const frames: Frame[] = []
  const destroyed = new Set<string>()
  const marked = new Set<string>()
  // Each participant's activation depth: Mermaid fails on deactivating one that is not active.
  const depth = new Map<string, number>()
  // Mermaid 12.2.0's renderer numbers messages in source order: an index from 1, a step of 1, shown once autonumber is on.
  const num = { index: 1, step: 1, shown: false }
  let box: Box | null = null
  let creating: string[] = []
  let destroying: string[] = []
  // A statement goes into the innermost open frame's last section, or the top level.
  const add = (item: Item) => void (frames.at(-1)?.sections.at(-1)?.items ?? seq.items).push(item)
  // Naming a participant declares it if it is new; naming a destroyed one fails. A message or note naming it passes what
  // follows the id in the statement: a keyword there, or a number before a space, fails as Mermaid's lexer does.
  const mention = (id: string, after?: string) => {
    if (after !== undefined && (KEYWORD.test(id) || SOFT.get(id.toLowerCase())?.test(after))) {
      stop('keyword')
    }
    if (after !== undefined && NUMBER.test(id) && after.startsWith(' ')) {
      stop('id')
    }
    if (destroyed.has(id)) {
      stop('destroyed')
    }
    if (!seq.participants.some((p) => p.id === id)) {
      seq.participants.push({ id, kind: 'participant', label: id })
    }
  }
  // Starts (1) or ends (-1) an activation of id.
  const activation = (id: string, by: 1 | -1) => {
    const d = (depth.get(id) ?? 0) + by
    if (d < 0) {
      stop('inactive')
    }
    depth.set(id, d)
  }
  const open = (type: Frame['type'], cond: string | null) => {
    const f: Frame = { kind: 'frame', type, sections: [{ cond, items: [] }] }
    add(f)
    frames.push(f)
  }
  for (const { n, raw, cut } of statements(src.lines)) {
    const t = raw.trim()
    // A message, note, frame, section, end or autonumber may end at a #, as Mermaid reads it; any other statement
    // that does would show other text, so it fails hash, as does one that does not parse.
    const hash = cut === '#'
    const bad: () => never = () => stop(hash ? 'hash' : `syntax:${n}`)
    let m: RegExpExecArray | null
    // An open box holds only participant and actor lines, up to its end.
    if (box && t === 'end') {
      contiguous(seq, box)
      box = null
    } else if ((m = DECLARE.exec(t)) && !(box && m[1])) {
      if (hash) {
        stop('hash')
      }
      const id = m[3]!
      const known = seq.participants.some((p) => p.id === id)
      mention(id)
      // Not in the plan: as in Mermaid, only a new participant can be created.
      if (m[1] && (known || marked.has(id))) {
        stop('create')
      }
      // Not in the plan: as in Mermaid, declaring a known participant again changes it only with an as alias.
      const p = seq.participants.find((q) => q.id === id)!
      if (!known || m[4] !== undefined) {
        p.kind = m[2] as Participant['kind']
        p.label = m[4] === undefined ? id : text(unwrap(m[4]), 'plain', 'none')
      }
      if (box) {
        // Not in the plan: as in Mermaid, a participant belongs to one box.
        if (seq.boxes.some((b) => b !== box && b.ids.includes(id))) {
          stop('box-split')
        }
        if (!box.ids.includes(id)) {
          box.ids.push(id)
        }
      }
      if (m[1]) {
        add({ kind: 'create', id })
        creating.push(id)
      }
    } else if (box) {
      bad()
    } else if ((m = MARK.exec(t))) {
      if (hash) {
        stop('hash')
      }
      const kind = m[1] as Mark['kind']
      const id = m[2]!
      // As in Mermaid 12.2.0, a mark does not declare its id, so it does not set column order. Mermaid fails on one nothing
      // else declares; one that a message could not name, a keyword or number, falls back here.
      if (!seq.participants.some((p) => p.id === id) && (KEYWORD.test(id) || SOFT.has(id.toLowerCase()))) {
        stop('keyword')
      }
      if (!seq.participants.some((p) => p.id === id) && NUMBER.test(id)) {
        stop('id')
      }
      if (destroyed.has(id)) {
        stop('destroyed')
      }
      marked.add(id)
      if (kind === 'activate') {
        activation(id, 1)
      }
      if (kind === 'deactivate') {
        activation(id, -1)
      }
      if (kind === 'destroy') {
        destroying.push(id)
      }
      add({ kind, id })
    } else if ((m = NOTE.exec(t))) {
      // Not in the plan: as in Mermaid's grammar, only over takes two participants.
      if (m[4] && m[1] !== 'over') {
        bad()
      }
      const ids = m[4] ? [m[2]!, m[4]] : [m[2]!]
      const body = text(unwrap(m[6]!), 'plain', 'any')
      mention(m[2]!, m[3]!)
      if (m[4]) {
        mention(m[4], m[5]!)
      }
      add({ kind: 'note', side: m[1] as Note['side'], ids, text: body })
    } else if ((m = FRAME.exec(t))) {
      open(m[1] as Frame['type'], optText(m[2], 'plain'))
    } else if (RECT.test(t)) {
      open('rect', null)
    } else if ((m = SECTION.exec(t))) {
      const f = frames.at(-1)
      if (!f || f.type !== DIVIDES[m[1]!]) {
        bad()
      }
      f.sections.push({ cond: optText(m[2], 'plain'), items: [] })
    } else if ((m = BOX.exec(t))) {
      // Not in the plan: a box sits in no rect, however deep, but may sit in another frame.
      if (frames.some((f) => f.type === 'rect')) {
        bad()
      }
      box = { label: optText(boxLabel(m[1] ?? ''), 'sanitized'), ids: [] }
      seq.boxes.push(box)
    } else if (t === 'end') {
      if (!frames.pop()) {
        bad()
      }
    } else if ((m = AUTONUMBER.exec(t))) {
      // Mermaid's NUM token needs a space or line break after it, so autonumber 10; or 10\t5 fails.
      if (/\d(?![\d \n])/.test(raw + (cut || '\n'))) {
        stop(`syntax:${n}`)
      }
      // Its \s+ also eats the line break after trailing whitespace, and the next statement then fails.
      if (!cut && /\s$/.test(raw)) {
        stop(`syntax:${n}`)
      }
      // As in Mermaid: off hides the numbers, anything else shows them; a start sets the index and, with no step of its
      // own, a step of 1; a 0 start or step keeps the one before. Not in the plan: an unsafe start or step fails.
      num.shown = !m[1]
      if (m[2] !== undefined) {
        num.index = Number(m[2]) || num.index
        num.step = Number(m[3] ?? 1) || num.step
      }
      if (!Number.isSafeInteger(num.index) || !Number.isSafeInteger(num.step)) {
        stop('autonumber')
      }
    } else if ((m = TITLE.exec(t))) {
      if (hash) {
        stop('hash')
      }
      if (seq.title !== null) {
        stop('title')
      }
      seq.title = text(m[1]!, 'sanitized', 'none')
    } else if (ACC.test(t) || ACC_BLOCK.test(t)) {
      // Mermaid's accTitle: and accDescr: tokens end in \s*, so an empty one takes the next line as its text.
      if (ACC.test(t) && !t.slice(t.indexOf(':') + 1).trim()) {
        stop(`syntax:${n}`)
      }
      // Accessibility text is not drawn; statements() skips an accDescr { block's lines.
    } else {
      const [msg, after] = message(t) ?? bad()
      mention(msg.from, t.slice(msg.from.length))
      mention(msg.to, after)
      // The message after create X targets X; the one after destroy X has X at one end.
      if (creating.some((id) => id !== msg.to)) {
        stop('create')
      }
      if (destroying.some((id) => id !== msg.from && id !== msg.to)) {
        stop('destroy')
      }
      // + activates the target; - deactivates the sender.
      if (msg.activate) {
        activation(msg.to, 1)
      }
      if (msg.deactivate) {
        activation(msg.from, -1)
      }
      for (const id of destroying) {
        destroyed.add(id)
      }
      creating = []
      destroying = []
      // Every message, shown or not, steps the index, rounded to 2 places as Mermaid does. A shown number must be safe.
      if (num.shown && !Number.isSafeInteger(num.index)) {
        stop('autonumber')
      }
      add({ ...msg, num: num.shown ? num.index : null })
      num.index = Math.round((num.index + num.step) * 100) / 100
    }
  }
  if (frames.length || box) {
    stop('unclosed-frame')
  }
  // Not in the plan: a create or destroy with no message after it falls back.
  if (creating.length) {
    stop('create')
  }
  if (destroying.length) {
    stop('destroy')
  }
  if ([...marked].some((id) => !seq.participants.some((p) => p.id === id))) {
    stop('undeclared')
  }
  return seq
}

// A message, and what follows its target's id.
function message(t: string): [Msg, string] | null {
  const from = FROM.exec(t)
  if (!from) {
    return null
  }
  const rest = t.slice(from[0].length)
  const arrow = ARROWS.find(([a]) => rest.startsWith(a))
  if (!arrow) {
    return null
  }
  const to = TO.exec(rest.slice(arrow[0].length))
  if (!to) {
    return null
  }
  const [, line, tail, head] = arrow
  return [
    {
      kind: 'msg',
      from: from[1]!,
      to: to[2]!,
      line,
      tail,
      head,
      text: text(unwrap(to[4]!), 'plain', 'any'),
      activate: to[1] === '+',
      deactivate: to[1] === '-',
      num: null,
    },
    to[3]!,
  ]
}

// A box's label, cut at any # by statements(): its text after a leading CSS color, which is not drawn; null if none is left. As in Mermaid, a lowercase
// rgb(, rgba(, hsl( or hsla( starts a color that runs to the label's last ). Not in the plan: Mermaid drops that color only if
// the browser reads it as one, and else titles the box with the whole label, so one outside the strict subset fails box-color.
function boxLabel(s: string): string | null {
  if (/^(?:rgba?|hsla?)\(/.test(s)) {
    const color = s.slice(0, s.lastIndexOf(')') + 1)
    if (!COLOR_FN.test(color)) {
      stop('box-color')
    }
    return s.slice(color.length) || null
  }
  // As in Mermaid 12.2.0's parseBoxData: the color is the label's first run of word characters, wherever it ends.
  const word = /^\w*/.exec(s)![0]
  const name = word.toLowerCase()
  if (OTHER_COLORS.has(name)) {
    stop('box-color')
  }
  return (name === 'transparent' || NAMED.has(name) ? s.slice(word.length) : s).trim() || null
}

// A box's participants must be adjacent in column order. Not in the plan: an empty box, with no columns, is kept.
function contiguous(seq: Seq, box: Box) {
  const cols = box.ids.map((id) => seq.participants.findIndex((p) => p.id === id))
  if (cols.length && Math.max(...cols) - Math.min(...cols) + 1 !== cols.length) {
    stop('box-split')
  }
}
