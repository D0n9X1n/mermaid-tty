// Joins an @{ … } that a flowchart writes over several lines into its one-line form, where Mermaid 12.2.0 reads both alike.
// Mermaid's lexer keeps an @{ body's line breaks, and flowDb then reads a body with one as a YAML block mapping, not as the
// flow mapping { … } a one-line body is. Only a body whose block and flow readings agree is joined: one key: value per line,
// every line at one indent of spaces; each value a "…" or '…' with no escape, or a bare word of letters, digits, _, spaces,
// . and -, none of which YAML reads otherwise in either form; then a line that starts with }. Any other body stays split,
// and its first line then fails to read, as before.
type Line = { readonly n: number; readonly text: string }

// One key: value line, its indent captured.
const PAIR_LINE = /^( *)([A-Za-z_][\w-]*): *("[^"\\]*"|'[^']*'|[\p{L}\p{N}_][\p{L}\p{N}_ .-]*) *$/u

// lines, each block that a line ending in @{ opens joined into that line, as `@{ k: v, … }` and the closing line's rest. A
// joined line keeps its first line's number. Lines between them must follow each other in the source: a blank or %% line
// dropped there could change the YAML.
export function joinData(lines: readonly Line[]): Line[] {
  const out: Line[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!, end = opensData(l.text) ? blockEnd(lines, i) : -1
    if (end < 0) {
      out.push(l)
      continue
    }
    const pairs = lines.slice(i + 1, end).map(p => p.text.trim())
    out.push({ n: l.n, text: `${l.text.trimEnd()} ${pairs.join(', ')} ${lines[end]!.text.trimStart()}` })
    i = end
  }
  return out
}

// The index of the } line that closes the block line i opens, or -1 if its body is not one PAIR_LINE joinData can join.
function blockEnd(lines: readonly Line[], i: number): number {
  let indent: string | null = null
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j]!
    if (l.n !== lines[j - 1]!.n + 1) return -1
    if (l.text.trimStart().startsWith('}')) return j > i + 1 ? j : -1
    const m = PAIR_LINE.exec(l.text)
    if (!m || (indent !== null && m[1] !== indent)) return -1
    indent = m[1]!
  }
  return -1
}

// Whether a line ends in an @{ that Mermaid's lexer reads as metadata: right after an id, outside any "…", bracket or
// acc statement. An @{ inside a quoted or bracketed label is text, so its line is left alone (and fails to read).
function opensData(text: string): boolean {
  const t = text.trimEnd()
  if (!/[\p{L}\p{N}_]@\{$/u.test(t) || /^\s*acc(?:Title|Descr)\b/.test(t)) return false
  const bare = t.replace(/"[^"]*"/g, ''), n = (ch: string) => bare.split(ch).length - 1
  return !bare.includes('"') && n('[') === n(']') && n('(') === n(')') && n('{') === n('}') + 1
}

// What one @{ … } value is, as Mermaid 12.2.0 reads it (its shape-data lexer, then js-yaml's JSON_SCHEMA): a string and
// its text, or some other scalar (a bool, null or number), or null where it cannot tell or Mermaid fails. A "…" holds no
// \ (an escape); a '…' no '' escape, }, ^ (the lexer protects only "…": } ends the body, ^ is no token) or lone "; a bare
// string starts with a letter or _ and holds none of the characters YAML or the lexer reads otherwise. An empty string is
// null: Mermaid keeps the label it had.
export function yamlValue(raw: string): { kind: 'string'; text: string } | { kind: 'other' } | null {
  const v = raw.trim()
  if (/^"[^"\\]+"$/.test(v)) return { kind: 'string', text: v.slice(1, -1) }
  if (/^'[^'}^]+'$/.test(v)) return (v.split('"').length - 1) % 2 === 0 ? { kind: 'string', text: v.slice(1, -1) } : null
  if (/^(?:true|True|TRUE|false|False|FALSE|null|Null|NULL|~|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)$/.test(v)) return { kind: 'other' }
  return /^[\p{L}_][^:#{}[\]^"&*!|>%@`,]*$/u.test(v) ? { kind: 'string', text: v } : null
}
