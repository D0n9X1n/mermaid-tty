// Markdown bold and italic as Mermaid 12.2.0 shows them. Its markdownToHTML (rendering-util/handle-markdown-text.ts)
// lexes a markdown label with marked 16.4.2 (gfm) and emits strong as <strong>, em as <em>, text and inline HTML as
// written. This is a literal port of marked's inline lexer (inlineTokens' masking, emStrong, inlineText) on a
// fail-closed alphabet: no control character, \, `, [, ], ~, @, ://, www., entity-like &, < or > outside a <br>, nor a
// leading or trailing space; and no block start (heading, quote, list, rule, HTML). There marked reads nothing but
// text, <br> tags, strong and em. tests/core/emphasis_test.ts checks it against Mermaid's output.
//
// A marked string carries its style inline: a marker before each styled character that takes a column, BOLD for bold,
// ITALIC for italic, BOTH for both; a space or a zero-width character never has one. width() counts a marker 0 columns,
// so measuring and wrapping work on a marked string as they do on the text it shows, and canvas.text() turns each
// marker into its cell's em.
import { width } from './width.ts'

export const BOLD = 1
export const ITALIC = 2
const MARKS = ['', String.fromCharCode(1), String.fromCharCode(2), String.fromCharCode(3)] as const
const MARK = /[\x01-\x03]/g

// The marker for em (BOLD, ITALIC or both), '' for none.
export const marker = (em: number): string => MARKS[em & 3]!
// The em a marker stands for, 0 for any other character.
export const emOf = (ch: string): number => {
  const i = MARKS.indexOf(ch as (typeof MARKS)[number])
  return i > 0 ? i : 0
}
// The text a marked string shows.
export const plain = (s: string): string => s.replace(MARK, '')

// marked's inline rules (gfm), with ~ out of the alphabet so its gfm and plain variants agree.
const P = '[\\p{P}\\p{S}]'
const S = '[\\s\\p{P}\\p{S}]'
const N = '[^\\s\\p{P}\\p{S}]'
const LDELIM = new RegExp(`^(?:\\*+(?:((?!\\*)${P})|[^\\s*]))|^_+(?:((?!_)${P})|([^\\s_]))`, 'u')
const RDELIM_AST = new RegExp(
  `^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)${P}(\\*+)(?=[\\s]|$)|${N}(\\*+)(?!\\*)(?=${S}|$)` +
    `|(?!\\*)${S}(\\*+)(?=${N})|[\\s](\\*+)(?!\\*)(?=${P})|(?!\\*)${P}(\\*+)(?!\\*)(?=${P})|${N}(\\*+)(?=${N})`,
  'gu',
)
const RDELIM_UND = new RegExp(
  `^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)${P}(_+)(?=[\\s]|$)|${N}(_+)(?!_)(?=${S}|$)` +
    `|(?!_)${S}(_+)(?=${N})|[\\s](_+)(?!_)(?=${P})|(?!_)${P}(_+)(?!_)(?=${P})`,
  'gu',
)
const PUNCTUATION = new RegExp(`^((?![*_])${S})`, 'u')
const ALNUM = /[\p{L}\p{N}]/u
// blockSkip's html part: each tag is masked as [aa…] before delimiters are read.
const SKIP = /<(?! )[^<>]*?>/g
// marked's tag rule, on the only tags the alphabet lets through.
const TAG = /^<br *\/?>/i
const PROTOCOL = '[hH][tT][tT][pP][sS]?|[fF][tT][pP]'
const EMAIL = "[a-zA-Z0-9.!#$%&'*+\\/=?_`{\\|}~-]"
const TEXT = new RegExp(
  `^([\`~]+|[^\`~])(?:(?= {2,}\\n)|(?=${EMAIL}+@)|[\\s\\S]*?(?:(?=[\\\\<!\\[\`*~_]|\\b_|${PROTOCOL}:\\/\\/|www\\.|$)` +
    `|[^ ](?= {2,}\\n)|[^a-zA-Z0-9.!#$%&'*+\\/=?_\`{\\|}~-](?=${EMAIL}+@)))`,
)

// Text marked would read as more than text, <br>, strong and em, or that starts a block other than a paragraph.
const OUTSIDE = /[\x00-\x1f\x7f\\`[\]~@]|:\/\/|www\./i
const ENTITYISH = /&[#A-Za-z]/
const BLOCK = /^(?:#{1,6}(?:\s|$)|>|<|(?:[*+-]|\d{1,9}[.)])(?:\s|$)|(?:-\s*){3,}$|(?:_\s*){3,}$|(?:\*\s*){3,}$)/

// common.ts lineBreakRegex: each spelling Mermaid 12.2.0 turns into a newline in an edge, transition or relation label
// before marked runs (JSDOM: A -->|"`a<br>- **b**`"| B shows <p>a</p>- **b**; a node label keeps its <br>).
const LINE_BREAK = /<\/?br\s*\/?>/gi
// A line that, after such a newline, starts a block: a heading, quote, HTML, fence, list item or rule; or one that
// underlines a heading or delimits a table, made only of =, -, :, | and spaces.
const BLOCK_LINE =
  /^\s*(?:#{1,6}(?:\s|$)|>|<|```|~~~|(?:[*+-]|\d{1,9}[.)])(?:\s|$)|(?:-\s*){3,}$|(?:_\s*){3,}$|(?:\*\s*){3,}$)/
const UNDERLINE = /^[\s|:=-]*[=-][\s|:=-]*$/

// Whether text, each <br> spelling a newline, is one paragraph to marked, whose lines markdownToHTML shows as <br/>: no
// line starts a block or underlines one (BLOCK_LINE, UNDERLINE), and none before another ends in a hard break (two
// spaces or a \). blank: a blank line passes (a caller that fails blank lines on its own); else it fails.
export function oneParagraph(text: string, blank = false): boolean {
  const lines = text.split(LINE_BREAK)
  return (
    lines.length < 2 ||
    lines.every((l, i) => {
      if (l.trim() === '') {
        return blank
      }

      const next = lines[i + 1]
      return (
        !BLOCK_LINE.test(l) &&
        !UNDERLINE.test(l) &&
        !(next !== undefined && next.trim() !== '' && /(?: {2,}|\\)$/.test(l))
      )
    })
  )
}

type Run = { type: 'strong' | 'em'; raw: string; tokens: Tok[] }
type Tok = { type: 'text'; text: string } | { type: 'html'; text: string } | Run

// marked's emStrong at src, where masked is the masked text of the run src is the tail of, and prev the character
// before src (marked's prevChar): its strong or em token, undefined where marked reads none there, or null where its
// content fails.
function emStrong(src: string, masked: string, prev: string): Run | null | undefined {
  let r = LDELIM.exec(src)
  if (!r || (r[3] && ALNUM.test(prev))) {
    return undefined
  }
  // A run that opens before punctuation opens only at the start, or after a space or punctuation.
  if ((r[1] || r[2]) && prev && !PUNCTUATION.exec(prev)) {
    return undefined
  }

  const s = [...r[0]].length - 1
  let p = s
  let u = 0
  const c = r[0][0] === '*' ? RDELIM_AST : RDELIM_UND
  c.lastIndex = 0
  const tail = masked.slice(-1 * src.length + s)
  while ((r = c.exec(tail)) !== null) {
    const a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6]
    if (!a) {
      continue
    }

    let o = [...a].length
    if (r[3] || r[4]) {
      p += o
      continue
    }

    if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
      u += o
      continue
    }

    p -= o
    if (p > 0) {
      continue
    }

    o = Math.min(o, o + p + u)
    const h = src.slice(0, s + r.index + [...r[0]][0]!.length + o)
    const em = Math.min(s, o) % 2 === 1
    const tokens = inline(em ? h.slice(1, -1) : h.slice(2, -2))
    return tokens && ({ type: em ? 'em' : 'strong', raw: h, tokens } as Run)
  }

  return undefined
}

// marked's inlineTokens on the alphabet: <br> tags, emStrong, then text, adjacent texts merged.
function inline(src: string): Tok[] | null {
  const masked = src.replace(SKIP, (m) => '[' + 'a'.repeat(m.length - 2) + ']')
  const out: Tok[] = []
  let keep = false
  let prev = ''
  while (src) {
    if (!keep) {
      prev = ''
    }

    keep = false
    const t = TAG.exec(src)
    if (t) {
      out.push({ type: 'html', text: t[0] })
      src = src.slice(t[0].length)
      continue
    }

    const e = emStrong(src, masked, prev)
    if (e === null) {
      return null
    }

    if (e) {
      out.push(e)
      src = src.slice(e.raw.length)
      continue
    }

    const x = TEXT.exec(src)
    if (!x) {
      return null
    } // marked throws here; the alphabet never gets here

    src = src.slice(x[0].length)
    if (!x[0].endsWith('_')) {
      prev = x[0].slice(-1)
    }

    keep = true
    const last = out.at(-1)
    if (last?.type === 'text') {
      last.text += x[0]
    } else {
      out.push({ type: 'text', text: x[0] })
    }
  }

  return out
}

// The marked string text shows, or null where this port cannot say: text outside the alphabet, or a style nested in
// itself (<strong> in <strong>, <em> in <em>), which a terminal cannot draw apart from one. breaks: an edge label,
// where each <br> is a newline to marked (LINE_BREAK); the text must then be one paragraph, and each newline, with the
// spaces after it (markdownToHTML's /\n */), shows as one <br>.
export function emphasize(text: string, breaks = false): string | null {
  if (OUTSIDE.test(text) || ENTITYISH.test(text) || text !== text.trim() || BLOCK.test(text)) {
    return null
  }

  if (breaks) {
    if (!oneParagraph(text)) {
      return null
    }

    text = text.replace(LINE_BREAK, '\n')
  }

  if (/[<>]/.test(text.replace(/<br *\/?>/gi, ''))) {
    return null
  }

  let out = ''
  const put = (toks: readonly Tok[], em: number): boolean =>
    toks.every((t) => {
      if (t.type === 'html') {
        out += t.text
        return true
      }

      if (t.type === 'text') {
        for (const ch of t.text.replace(/\n */g, '\n')) {
          out += ch === '\n' ? '<br>' : (em && !/\s/.test(ch) && width(ch) > 0 ? marker(em) : '') + ch
        }

        return true
      }

      const bit = t.type === 'strong' ? BOLD : ITALIC
      return (em & bit) === 0 && put(t.tokens, em | bit)
    })
  const toks = inline(text)
  return toks && put(toks, 0) ? out : null
}
