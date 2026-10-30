// The gate before mmdc, apart from core's parser: core is no security boundary (a frontmatter themeCSS it accepts drew a
// local file into the PNG with every Chromium isolation flag on), so a source goes to mmdc only when it has no way to
// style, configure, fetch or load anything. unsafeReason gives the first rule a source breaks, or null:
//   frontmatter  a frontmatter block other than one with at most a plain-scalar title, or a fence line anywhere else
//   directive    %%{ anywhere
//   statement w  a line, or a ;-separated part of one, whose first word is style, classDef, linkStyle, class, cssClass or click
//   token t      url(, image(, image-set(, @import, file:, data:, javascript:, http:, https:, // or a backslash, anywhere
// All matching is case-blind. No Node, so the engine can load it.
const FENCE = /^[ \t]*-{3,}[ \t]*$/
const TITLE = /^title:[ \t]+([^ \t"'|>[\]{}&*!%@`#,?:-][^#]*)$/
const STATEMENTS = new Set(['style', 'classdef', 'linkstyle', 'class', 'cssclass', 'click'])
const TOKENS = ['url(', 'image-set(', 'image(', '@import', 'file:', 'data:', 'javascript:', 'https:', 'http:', '//', '\\']

export function unsafeReason(source: string): string | null {
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
  for (const line of lines.slice(body)) for (const part of line.split(';')) {
    const word = /^[ \t]*([A-Za-z]+)/.exec(part)?.[1]?.toLowerCase()
    if (word && STATEMENTS.has(word)) return `statement ${word}`
  }
  const token = TOKENS.find(t => lower.includes(t))
  return token ? `token ${token}` : null
}
