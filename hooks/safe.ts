// Layer B, a cheap first gate before mmdc, apart from core's parser: a source goes to mmdc only when it has no way to
// style, configure, fetch or load anything. The authority is layer A (hooks/svg.ts), which checks the SVG mmdc draws;
// this gate keeps most such sources from reaching mmdc at all. unsafeReason gives the first rule a source breaks, or null:
//   char U+X     a character outside the safe set: Mermaid's entity-marker characters (U+FB02, U+00B6, U+00A7), any
//                whitespace but space, tab, LF and CR, and any control or format character but tab, LF and CR
//   marker       two degree signs in a row (the rest of Mermaid's entity markers)
//   entity #x;   a #name; or #123; entity, which Mermaid decodes after its own parse
//   frontmatter  a frontmatter block other than one with at most a plain-scalar title, or a fence line anywhere else
//   directive    %%{ anywhere
//   statement w  a part of a line (split at ;, { and }) whose first word is style, classDef, linkStyle, class,
//                cssClass, click, link, callback, call, href, accDescr or accTitle
//   color w      a sequence rect whose argument is not a #hex, rgb() or rgba() colour of numbers, or a box whose
//                argument does not start with one
//   token t      url(, image(, image-set(, @import, file:, data:, javascript:, http:, https:, // or a backslash, anywhere
// All matching is case-blind. Rejecting too much keeps a diagram as text, never worse. No Node, so the engine can load it.
const FL = String.fromCharCode(0xfb02), PIL = String.fromCharCode(0xb6), SECT = String.fromCharCode(0xa7), DEG = String.fromCharCode(0xb0)
const BAD_CHAR = new RegExp(`[${FL}${PIL}${SECT}]|[^\\S \\t\\n\\r]|(?![\\t\\n\\r])[\\p{Cc}\\p{Cf}]`, 'u')
const FENCE = /^\s*-{3,}\s*$/
const TITLE = /^title:[ \t]+([^ \t"'|>[\]{}&*!%@`#,?:-][^#]*)$/
const STATEMENTS = new Set(['style', 'classdef', 'linkstyle', 'class', 'cssclass', 'click', 'link', 'callback', 'call', 'href', 'accdescr', 'acctitle'])
const NUM = String.raw`\s*\d+(?:\.\d+)?%?\s*`
const COLOR = String.raw`(?:#[0-9a-f]{3,8}|rgba?\(${NUM}(?:,${NUM}){2,3}\))`
const RECT = new RegExp(`^${COLOR}$`, 'i'), BOX = new RegExp(`^(?:${COLOR}(?:\\s.*)?)?$`, 'i')
const TOKENS = ['url(', 'image-set(', 'image(', '@import', 'file:', 'data:', 'javascript:', 'https:', 'http:', '//', '\\']

export function unsafeReason(source: string): string | null {
  const bad = BAD_CHAR.exec(source)
  if (bad) return `char U+${bad[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
  if (source.includes(DEG + DEG)) return 'marker'
  const entity = /#\w+;/.exec(source)
  if (entity) return `entity ${entity[0]}`
  const lines = source.split(/\r\n|\r|\n/)
  let body = 0
  if (lines.length > 0 && FENCE.test(lines[0]!)) {
    const close = lines.findIndex((l, i) => i > 0 && FENCE.test(l))
    if (close < 0) return 'frontmatter'
    const inner = lines.slice(1, close).filter(l => l.trim() !== '')
    if (inner.length > 1 || (inner.length === 1 && !TITLE.test(inner[0]!.trimEnd()))) return 'frontmatter'
    body = close + 1
  }
  if (lines.slice(body).some(l => FENCE.test(l))) return 'frontmatter'
  const lower = source.toLowerCase()
  if (lower.includes('%%{')) return 'directive'
  for (const line of lines.slice(body)) for (const part of line.split(/[;{}]/)) {
    const m = /^\s*([A-Za-z]+)/.exec(part)
    if (!m) continue
    const word = m[1]!.toLowerCase(), rest = part.slice(m[0].length).trim()
    if (STATEMENTS.has(word)) return `statement ${word}`
    if (word === 'rect' && !RECT.test(rest)) return 'color rect'
    if (word === 'box' && !BOX.test(rest)) return 'color box'
  }
  const token = TOKENS.find(t => lower.includes(t))
  return token ? `token ${token}` : null
}
