import { fail, type Fail } from './fail.ts'
import { unsupported } from './width.ts'

// What a parser reads from a fence body (matrix, Common rules 2 and 3): the
// header line, the frontmatter title, the frontmatter config scalars under
// dotted keys ('gitGraph.mainBranchName'), and the remaining lines as written,
// with their 1-based source line numbers.
export type Source = { header: string; title: string | null; config: Readonly<Record<string, string>>
  lines: readonly { n: number; text: string }[] }

// Fails with 'directive' (a `%%{` line, or `%%` after text outside double
// quotes), 'frontmatter' (no closing `---`, or frontmatter readConfig rejects),
// 'title' (a second frontmatter title), 'unsupported-char U+XXXX' (a title
// character no terminal draws reliably, checked here for every diagram type)
// or 'empty' (no header, or nothing after it).
export function readSource(text: string): Source | Fail {
  // The only line-ending normalization in the pipeline.
  const all = text.replace(/\r\n?/g, '\n').split('\n')
  let title: string | null = null
  let config: Record<string, string> = {}
  let start = 0
  // Frontmatter opens with `---` on line 1 and runs to the next `---` line.
  // Only an unindented `title:` and the `config:` block are read; every other key is ignored.
  if (all[0] === '---') {
    const end = all.indexOf('---', 1)
    if (end < 0) return fail('frontmatter')
    const front = all.slice(1, end)
    for (const line of front) {
      if (!line.startsWith('title:')) continue
      if (title !== null) return fail('title')
      title = line.slice('title:'.length).trim().replace(/^(["'])(.*)\1$/, '$2')
    }
    const bad = title === null ? null : unsupported(title)
    if (bad) return fail(`unsupported-char ${bad}`)
    const read = readConfig(front)
    if (!read) return fail('frontmatter')
    config = read
    start = end + 1
  }
  const kept: { n: number; text: string }[] = []
  for (let i = start; i < all.length; i++) {
    const line = all[i]!
    const t = line.trimStart()
    if (t.startsWith('%%{')) return fail('directive')
    if (t === '' || t.startsWith('%%')) continue
    if (t.replace(/"[^"]*"/g, '').includes('%%')) return fail('directive')
    kept.push({ n: i + 1, text: line })
  }
  const [head, ...lines] = kept
  if (!head || lines.length === 0) return fail('empty')
  return { header: head.text.trim().replace(/;$/, ''), title, config, lines }
}

// The first characters of a plain scalar or top-level key that could start
// another YAML node: a flow collection, an anchor, alias or tag, a block scalar,
// a directive, a comment, a quote, or `-`, `?` or `:` before a space, a tab or the end.
const NOT_PLAIN = /^(?:[[\]{},&*!|>%@#'"`]|[-?:](?:[ \t]|$))/

// The frontmatter's `config:` block as dotted keys, read as a strict YAML subset
// (plan C, T41): `<key>:` mappings, each indented deeper than its parent and at
// one indent throughout, down to one-line scalars. Null, so that the source
// falls back, for any other form: a flow collection, a sequence, an anchor, an
// alias or a tag, a block or multi-line scalar, a repeated or dotted key, a key
// with no value and no children, bad indentation, or a tab in a line's leading
// whitespace. Null too for frontmatter that could hold config another way: an
// indented first line, a second `config:`, or any other unindented line that
// starts with an indicator or is `config` with spaces or a value. Blank and
// comment lines are skipped, at any indent.
function readConfig(front: readonly string[]): Record<string, string> | null {
  const config: Record<string, string> = {}
  // The open mappings, innermost last: each one's indent, key path and keys so far.
  const frames: { indent: number; path: string[]; keys: Set<string> }[] = []
  // A key with no value, whose mapping opens on the next, deeper line.
  let pending: { indent: number; path: string[] } | null = null
  // Inside the block; a config: line seen; an unindented line seen.
  let inBlock = false, opened = false, top = false
  for (const raw of front) {
    const line = raw.replace(/[ \t]+$/, '')
    if (line === '') continue
    const indent = line.search(/[^ ]/)
    if (line[indent] === '\t') return null
    const body = line.slice(indent)
    if (body.startsWith('#')) continue
    // The top-level mapping starts unindented, or a `config:` could hide inside it.
    if (indent > 0 && !top) return null
    // An unindented line ends the block, and only the first `config:` opens it. One
    // that could spell config another way (`config :`, `config: {}`, or a quoted,
    // tagged, anchored or explicit key, a flow collection, a sequence) falls back.
    if (indent === 0) {
      if (pending) return null
      top = true
      inBlock = body === 'config:'
      if (inBlock && opened) return null
      if (inBlock) { opened = true; pending = { indent, path: [] } }
      else if (NOT_PLAIN.test(body) || /^config[ \t]*:/.test(body)) return null
      continue
    }
    if (!inBlock) continue
    const m = /^([A-Za-z_][\w-]*):/.exec(body)
    if (!m) return null
    const [head, key = ''] = m
    if (pending) {
      if (indent <= pending.indent) return null
      frames.push({ indent, path: pending.path, keys: new Set() })
      pending = null
    }
    while (frames.length > 0 && frames.at(-1)!.indent > indent) frames.pop()
    const frame = frames.at(-1)
    if (!frame || frame.indent !== indent || frame.keys.has(key)) return null
    frame.keys.add(key)
    const path = [...frame.path, key], rest = body.slice(head.length)
    if (rest === '') { pending = { indent, path }; continue }
    const value = rest.startsWith(' ') ? scalar(rest.replace(/^[ \t]+/, '')) : null
    if (value === null) return null
    config[path.join('.')] = value
  }
  return pending ? null : config
}

// One scalar after `<key>: `, or null for any other form. A double-quoted one
// escapes only `\"` and `\\`, and a single-quoted one writes `'` as `''`; either
// may be followed by spaces or tabs, then a comment. A plain one ends at the
// first `#` after a space or a tab, and holds no `:` before a space, a tab or its end.
function scalar(v: string): string | null {
  const quoted = /^"((?:[^"\\]|\\["\\])*)"|^'((?:[^']|'')*)'/.exec(v)
  if (quoted) {
    const [whole, dq, sq = ''] = quoted
    if (!/^(?:[ \t]+#|$)/.test(v.slice(whole.length))) return null
    return dq !== undefined ? dq.replace(/\\(["\\])/g, '$1') : sq.replace(/''/g, "'")
  }
  if (NOT_PLAIN.test(v)) return null
  const cut = v.search(/[ \t]#/)
  const plain = (cut < 0 ? v : v.slice(0, cut)).replace(/[ \t]+$/, '')
  return /:(?:[ \t]|$)/.test(plain) ? null : plain
}
