// Joins an @{ … } that a flowchart writes over several lines into its one-line form, where Mermaid 12.2.0 reads both alike.
// Mermaid's lexer keeps an @{ body's line breaks, and flowDb then reads a body with one as a YAML block mapping, not as the
// flow mapping { … } a one-line body is. Only a body whose block and flow readings agree is joined: one key: value per line,
// every line at one indent of spaces; each value a "…" or '…' with no escape, or a bare word of letters, digits, _, spaces,
// . and -, none of which YAML reads otherwise in either form; then a line that starts with }. Any other body stays split,
// and its first line then fails to read, as before.
import { NAME } from './links.ts'

type Line = { readonly n: number; readonly text: string }

// One key: value line, its indent captured.
const PAIR_LINE = /^( *)([A-Za-z_][\w-]*): +("[^"\\]*"|'[^']*'|[\p{L}\p{N}_][\p{L}\p{N}_ .-]*) *$/u

// lines, each block that a line ending in @{ opens joined into that line, as `@{ k: v, … }` and the closing line's rest. A
// joined line keeps its first line's number. Lines between them must follow each other in the source: a blank or %% line
// dropped there could change the YAML.
export function joinData(lines: readonly Line[]): Line[] {
  const out: Line[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    const end = opensData(l.text) ? blockEnd(lines, i) : -1
    if (end < 0) {
      out.push(l)
      continue
    }
    const pairs = lines.slice(i + 1, end).map((p) => p.text.trim())
    out.push({
      n: l.n,
      text: `${l.text.replace(/[ \t]+$/, '')} ${pairs.join(', ')} ${lines[end]!.text.replace(/^[ \t]+/, '')}`,
    })
    i = end
  }
  return out
}

// The index of the } line that closes the block line i opens, or -1 if its body is not one PAIR_LINE joinData can join.
function blockEnd(lines: readonly Line[], i: number): number {
  let indent: string | null = null
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j]!
    if (l.n !== lines[j - 1]!.n + 1) {
      return -1
    }
    if (/^[ \t]*\}/.test(l.text)) {
      return j > i + 1 ? j : -1
    }
    const m = PAIR_LINE.exec(l.text)
    if (!m || (indent !== null && m[1] !== indent)) {
      return -1
    }
    indent = m[1]!
  }
  return -1
}

// Whether a line opens a block joinData may join: it is only a node id and @{, with spaces or tabs around. Only those are
// trimmed when joining: YAML reads other whitespace, such as NBSP, as text. Any other line ending in
// @{ (after a link, in edge text, in an acc statement or a label) is left alone, and fails to read.
const OPENS = new RegExp(String.raw`^[ \t]*${NAME}@\{[ \t]*$`, 'u')
function opensData(text: string): boolean {
  return OPENS.test(text)
}

// What one @{ … } value is, as Mermaid 12.2.0 reads it (its shape-data lexer, then js-yaml's JSON_SCHEMA): a string and
// its text, or some other scalar (a bool, null or number), or null where it cannot tell or Mermaid fails. A "…" holds no
// \ (an escape); a '…' no '' escape, }, ^ (the lexer protects only "…": } ends the body, ^ is no token) or lone "; a bare
// string starts with a letter or _ and holds none of the characters YAML or the lexer reads otherwise. An empty string is
// null: Mermaid keeps the label it had.
export function yamlValue(raw: string): { kind: 'string'; text: string } | { kind: 'other' } | null {
  const v = raw.trim()
  if (/^"[^"\\]+"$/.test(v)) {
    return { kind: 'string', text: v.slice(1, -1) }
  }
  if (/^'[^'}^]+'$/.test(v)) {
    return (v.split('"').length - 1) % 2 === 0 ? { kind: 'string', text: v.slice(1, -1) } : null
  }
  if (/^(?:true|True|TRUE|false|False|FALSE|null|Null|NULL|~|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)$/.test(v)) {
    return { kind: 'other' }
  }
  return /^[\p{L}_][^:#{}[\]^"&*!|>%@`,]*$/u.test(v) ? { kind: 'string', text: v } : null
}
