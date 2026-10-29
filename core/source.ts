import { fail, isFail, type Fail } from './fail.ts'
import { unsupported } from './width.ts'

// A frontmatter scalar, typed as Mermaid's frontmatter.ts types it: js-yaml with JSON_SCHEMA.
export type Scalar = string | number | boolean | null

// What a parser reads from a fence body (matrix, Common rules 2 and 3): the
// header line, the frontmatter title, the frontmatter config scalars under
// dotted keys ('gitGraph.mainBranchName'), and the remaining lines as written,
// with their 1-based source line numbers.
export type Source = { header: string; title: string | null; config: Readonly<Record<string, Scalar>>
  lines: readonly { n: number; text: string }[] }

// Fails with 'directive' (a `%%{` line, or `%%` after text outside double
// quotes), 'frontmatter' (no closing `---`, frontmatter readConfig rejects, or a
// title scalar() rejects), 'title' (a second frontmatter title, one js-yaml
// would read another way, or one that is true or numeric), 'unsupported-char
// U+XXXX' (a title character no terminal draws reliably, checked here for every
// diagram type), 'config:<dotted key>' (a numeric-looking plain config scalar
// that is not a safe integer) or 'empty' (no header, or nothing after it).
export function readSource(text: string): Source | Fail {
  // The only line-ending normalization in the pipeline.
  const all = text.replace(/\r\n?/g, '\n').split('\n')
  let title: string | null = null
  const config: Record<string, Scalar> = {}
  let start = 0
  // Frontmatter opens with `---` on line 1 and runs to the next `---` line.
  // Only an unindented `title:` and the `config:` block are read; every other key is ignored.
  if (all[0] === '---') {
    const end = all.indexOf('---', 1)
    if (end < 0) return fail('frontmatter')
    const front = all.slice(1, end)
    const found = readTitle(front)
    if (isFail(found)) return found
    title = found
    const read = readConfig(front)
    if (!read) return fail('frontmatter')
    // Typed only once the whole block reads, so a block T41 rejects still falls back as frontmatter.
    for (const [key, raw] of Object.entries(read)) {
      const value = raw.quoted ? raw.text : typed(raw.text)
      if (value === undefined) return fail(`config:${key}`)
      config[key] = value
    }
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

// The unindented `title:` line's scalar, read as a config value is, then printed
// as Mermaid's frontmatter.ts prints it: `if (parsed.title) metadata.title =
// parsed.title.toString()`. So null, false and '' give no title. Fails with
// 'title' for a second title line; for a title js-yaml would read another way: a
// title key with spaces or a tab before its colon, or a title line whose next
// line, past blank and comment lines, starts with a space, since js-yaml
// continues the title there (readConfig rejects one that starts with a tab); or
// for a true or numeric value (`007` would print 7). Fails with 'frontmatter'
// for a value scalar() rejects, or 'unsupported-char U+XXXX'. A tab may separate
// the value from `title:`, as in js-yaml.
function readTitle(front: readonly string[]): string | null | Fail {
  const [line, second] = front.filter(l => /^title[ \t]*:/.test(l))
  if (second !== undefined) return fail('title')
  if (line === undefined) return null
  const next = front.slice(front.indexOf(line) + 1).find(l => !/^[ \t]*(?:#|$)/.test(l))
  if (!line.startsWith('title:') || next?.startsWith(' ')) return fail('title')
  const rest = line.slice('title:'.length).replace(/[ \t]+$/, '')
  if (rest === '') return null
  const raw = /^[ \t]/.test(rest) ? scalar(rest.replace(/^[ \t]+/, '')) : null
  if (raw === null) return fail('frontmatter')
  const value = raw.quoted ? raw.text : typed(raw.text)
  if (value === undefined || value === true || typeof value === 'number') return fail('title')
  const bad = value ? unsupported(value) : null
  return bad ? fail(`unsupported-char ${bad}`) : value || null
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
// comment lines are skipped, at any indent. Each value is kept as scalar() reads
// it, for readSource to type.
function readConfig(front: readonly string[]): Record<string, Raw> | null {
  const config: Record<string, Raw> = {}
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

// A scalar as written: a quoted one's text with its escapes decoded, or a plain one's text.
type Raw = { quoted: boolean; text: string }

// One scalar after `<key>: `, or null for any other form. A double-quoted one
// escapes only `\"` and `\\`, and a single-quoted one writes `'` as `''`; either
// may be followed by spaces or tabs, then a comment. A plain one ends at the
// first `#` after a space or a tab, and holds no `:` before a space, a tab or its end.
function scalar(v: string): Raw | null {
  const quoted = /^"((?:[^"\\]|\\["\\])*)"|^'((?:[^']|'')*)'/.exec(v)
  if (quoted) {
    const [whole, dq, sq = ''] = quoted
    if (!/^(?:[ \t]+#|$)/.test(v.slice(whole.length))) return null
    return { quoted: true, text: dq !== undefined ? dq.replace(/\\(["\\])/g, '$1') : sq.replace(/''/g, "'") }
  }
  if (NOT_PLAIN.test(v)) return null
  const cut = v.search(/[ \t]#/)
  const plain = (cut < 0 ? v : v.slice(0, cut)).replace(/[ \t]+$/, '')
  return /:(?:[ \t]|$)/.test(plain) ? null : { quoted: false, text: plain }
}

// A plain scalar's value as js-yaml's JSON_SCHEMA resolves it: null, a bool, or
// a decimal integer that is safe (`-0` gives 0, as in js-yaml); else its text.
// Undefined, so that the source falls back, for any other numeric-looking text:
// a sign, a digit or `.`, then only word characters, `.`, `+` and `-`. That covers
// every float and every hex, octal, binary, signed, leading-zero or unsafe integer
// js-yaml reads, and fails closed on some it reads as strings, such as `-x`,
// `1.2.3` and `1_000` (a string in js-yaml 4.3.0, 1000 in 4.1.0). `2024 Roadmap`
// and `50%` stay strings.
function typed(text: string): Scalar | undefined {
  if (/^(?:~|null|Null|NULL)$/.test(text)) return null
  if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(text)) return text.toLowerCase() === 'true'
  const n = Number(text)
  if (/^-?(?:0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(n)) return n || 0
  return /^[-+.\d][\w.+-]*$/.test(text) ? undefined : text
}
