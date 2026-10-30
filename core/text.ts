import { emOf, emphasize } from './emphasis.ts'
import { fail, isFail, type Fail } from './fail.ts'
import { isWide, unsupported, width } from './width.ts'

// How a field's text reaches the screen in Mermaid 12.2.0 (docs/specs/2026-10-29-mermaid-tty-v1-text-ground-truth.md):
// html, an HTML label; markdown, an HTML label marked renders (labelType 'markdown'); plain, text as written; sanitized,
// DOMPurify's output; escaped, < and > escaped; member, a class member (an HTML label marked renders, too).
export type Mode = 'html' | 'markdown' | 'plain' | 'sanitized' | 'escaped' | 'member'
// What a <br> does there: any spelling splits; only lowercase <br> splits; each is drawn as written; or none can be drawn.
export type Br = 'any' | 'lower' | 'literal' | 'none'

// Every mode: Mermaid encodes #name; and #123; as entities, and its ﬂ°, ¶ß markers become & and ;, so text holding one
// shows other text.
const ENTITY = /#\w+;|ﬂ°|¶ß/
// A <br>, <br/> or <br />, in any case, with only HTML's whitespace (space, tab, newline, form feed, return) before the
// slash: HTML ends a tag name nowhere else, so <br /> is other markup.
const BR = String.raw`<br[ \t\n\f\r]*\/?>`
const BR_ANY = new RegExp(BR, 'gi')
// A break Mermaid's own splitter finds (common.ts lineBreakRegex): JS's \s, and </br> too. Where a <br> splits, one that
// BR_ANY leaves would split there but draw here as written.
const BR_MERMAID = /<\/?br\s*\/?>/i
// The text each mode shows differently, and why.
const RULES: Readonly<Record<Mode, readonly (readonly [RegExp, string])[]>> = {
  plain: [],
  html: [[/<[A-Za-z/!?]/, 'html'], [/&(?:#|[A-Za-z]{2})/, 'entity']],
  markdown: [[/<[A-Za-z/!?]/, 'html'], [/&(?:#|[A-Za-z]{2})/, 'entity']],
  sanitized: [[/</, 'html']],
  escaped: [[/[<>]/, 'html']],
  member: [[/</, 'html'], [/&(?:#|\p{L}{2})/u, 'entity']],
}

// Why text, in a field of mode and br, would draw other text than Mermaid shows: 'entity' or 'html'; null if it draws as
// written. Each <br> that splits becomes a line break first, so the text on either side is checked on its own.
export function drawable(text: string, mode: Mode, br: Br): Fail | null {
  if (ENTITY.test(text)) return fail('entity')
  if (br === 'none' && /<\/?br/i.test(text)) return fail('html')
  const t = br === 'any' ? text.replace(BR_ANY, '\n') : br === 'lower' ? text.replaceAll('<br>', '\n') : text
  if (br === 'any' && BR_MERMAID.test(t)) return fail('html')
  const hit = RULES[mode].find(([re]) => re.test(t))
  if (hit) return fail(hit[1])
  return mode === 'html' || mode === 'markdown' || mode === 'member' ? rendered(text, mode) : null
}

// X5. The names Mermaid 12.2.0 was seen to show as their character (rendered under JSDOM); any other name falls back.
const NAMED: Readonly<Record<string, string>> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", copy: '©', reg: '®', trade: '™',
  hearts: '♥', deg: '°', hellip: '…', mdash: '—', ndash: '–', larr: '←', rarr: '→', times: '×', divide: '÷', plusmn: '±',
  middot: '·', bull: '•', euro: '€' }
const CODE = /#(\w+);/g

// The character a #…; code shows, or null: a decimal code for a scalar value that is not a control, whitespace or a
// surrogate (the browser shows U+FFFD or a space there); or a name NAMED knows.
function codeChar(name: string): string | null {
  if (!/^\d+$/.test(name)) return Object.hasOwn(NAMED, name) ? NAMED[name]! : null
  const n = Number(name)
  if (n < 0x20 || (n >= 0x7f && n <= 0x9f) || (n >= 0xd800 && n <= 0xdfff) || n > 0x10ffff) return null
  const ch = String.fromCodePoint(n)
  return /\s/.test(ch) ? null : ch
}

// X5. The text a field of mode and br shows once Mermaid decodes its #…; codes (encodeEntities, then the browser), or why
// it cannot be drawn. Text with no code is drawable's. Otherwise every code must show one character, as codeChar says; the
// text with each code masked must pass drawable; and so must each piece between <br>s, decoded, as written: a decoded &, <,
// *, fa: or \n counts as the text it shows, and can never make a <br>.
export function decoded(text: string, mode: Mode, br: Br): string | Fail {
  if (!/#\w+;/.test(text)) return drawable(text, mode, br) ?? text
  let bad = false
  const out = text.replace(CODE, (_, name: string) => codeChar(name) ?? ((bad = true), ''))
  if (bad) return fail('entity')
  const f = drawable(text.replace(CODE, '\u{E000}'), mode, br)
  if (f) return f
  for (const piece of br === 'any' ? text.split(BR_ANY) : [text]) {
    const g = drawable(piece.replace(CODE, (_, name: string) => codeChar(name)!), mode, 'literal')
    if (g) return g
  }
  return out
}

// X3. A markdown field's text as Mermaid shows it, or why it cannot be drawn: the text itself, or with decode its #…;
// codes decoded (as decoded says), when marked shows it as written; else the marked string core/emphasis.ts makes of
// its bold and italic. Every other Fail drawable gives stands, and so does 'markdown' where the port cannot match
// Mermaid, or where the text also has a #…; code or, in a field no <br> splits, a <. An unsupported character fails as
// 'unsupported-char U+XXXX', checked before any marker is written, so no marker comes from the source.
export function styled(text: string, br: Br, decode = false): string | Fail {
  const d = decode ? decoded(text, 'markdown', br) : (drawable(text, 'markdown', br) ?? text)
  if (isFail(d) && d.reason !== 'markdown') return d
  const bad = unsupported(isFail(d) ? text : d)
  if (bad) return fail(`unsupported-char ${bad}`)
  if (!isFail(d) || /#\w+;/.test(text) || (br !== 'any' && text.includes('<'))) return d
  return emphasize(text) ?? d
}

// X3. What createText (Mermaid 12.2.0) does to every HTML label's raw text: replaceIconSubstring swaps an icon token
// (/(fa[bklrs]?):fa-([\w-]+)/; fad too, to be safe) for an icon, and a $$…$$ makes the whole label KaTeX. A markdown label
// goes through marked, which drops a \ before ASCII punctuation and renders * and _ emphasis; a plain one shows a literal
// \n as a <br />. Code, links, headings and lists marked leaves as written (markdownToHTML emits their raw text).
const ICON = /fa[bdklrs]?:fa-[\w-]/, MATH = /\$\$[^]*?\$\$/
function rendered(text: string, mode: 'html' | 'markdown' | 'member'): Fail | null {
  if (ICON.test(text)) return fail('icon')
  if (MATH.test(text)) return fail('math')
  if (mode === 'html') return /\\n/.test(text) ? fail('newline') : null
  return marked(text) ? fail('markdown') : null
}

// Whether marked may render text otherwise: a \ before ASCII punctuation; two or more *; or two or more _ in runs that
// touch a non-letter, non-digit (or an end), as emphasis can only open or close there. A lone * or _, and _ inside a
// word (snake_case), stay as written.
function marked(text: string): boolean {
  if (/\\[!-/:-@[-`{-~]/.test(text) || (text.match(/\*/g) ?? []).length > 1) return true
  const word = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
  const edge = [...text.matchAll(/_+/g)].reduce((k, m) =>
    k + (word(text[m.index - 1]) && word(text[m.index + m[0].length]) ? 0 : m[0].length), 0)
  return edge > 1
}

// One piece of a wrapped line, and how it attaches to the previous piece: '' after
// a split between W/F characters, ' ' after a split at spaces. The first piece of
// every label line after the first joins with '\n', which the drawing code sets.
export type Piece = { text: string; join: '' | ' ' | '\n' }

// A label's lines: it breaks at <br>, <br/> or <br />, in any case, with only HTML whitespace before the slash. Two
// breaks in a row, or a break at the end, keep a blank line, as Mermaid's HTML does.
export function labelLines(label: string): string[] {
  return label.split(BR_ANY)
}

// Fills line greedily into pieces at most max columns wide (matrix, common rule 6).
// A token is a run of non-space characters, split only between two adjacent W/F
// characters, so a narrow character stays with its neighbors. A run of spaces is
// one space, and leading and trailing spaces drop. The result is never empty: a blank
// line is one empty piece, so every label line takes a row. null only if a token is
// wider than max.
export function wrap(line: string, max: number): Piece[] | null {
  // Each token, and whether a space came before it.
  const toks: { t: string; sp: boolean }[] = []
  let cur = '', sp = false, prevWide = false
  let mark = ''                                    // an emphasis marker, held until the character it styles
  for (const ch of line) {
    if (emOf(ch)) { mark = ch; continue }
    if (ch === ' ') {
      if (cur) toks.push({ t: cur, sp })
      cur = ''; sp = true; prevWide = false
      continue
    }
    const w = isWide(ch.codePointAt(0)!)
    if (w && prevWide && cur) { toks.push({ t: cur, sp }); cur = ''; sp = false }
    cur += mark + ch; prevWide = w; mark = ''
  }
  if (cur) toks.push({ t: cur, sp })
  const out: Piece[] = []
  for (const k of toks) {
    if (width(k.t) > max) return null
    const last = out.at(-1), sep = k.sp ? ' ' : ''
    if (last && width(last.text + sep + k.t) <= max) last.text += sep + k.t
    else out.push({ text: k.t, join: out.length ? sep : '' })
  }
  return out.length ? out : [{ text: '', join: '' }]
}
