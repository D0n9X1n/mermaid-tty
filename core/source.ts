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
// quotes), 'frontmatter' (a block frontmatter() rejects, frontmatter readConfig
// rejects, or a title scalar() rejects), 'title' (a second frontmatter title, one js-yaml
// would read another way, or one that is true or numeric), 'unsupported-char
// U+XXXX' (a title character no terminal draws reliably, checked here for every
// diagram type), 'config:<dotted key>' (a numeric-looking plain config scalar
// that is not a safe integer or a finite plain decimal) or 'empty' (no header, or nothing after it).
// Mermaid's encodeEntities (utils.ts), before any diagram parses, drops the last ; of whatever matches style…:…#…; or
// classDef…:…#…; on a line, wherever it sits, label text included. Each kept line is read as Mermaid's parser reads it.
const encodeColours = (t: string): string =>
  t.replace(/style.*:\S*#.*;/g, s => s.slice(0, -1)).replace(/classDef.*:\S*#.*;/g, s => s.slice(0, -1))

// Mermaid's cleanupText (preprocess.ts), over the whole text before anything else: CRLF and lone CR become LF, and
// each tag's double-quoted attribute values become single-quoted, frontmatter included. Neither changes the line count.
const cleanup = (t: string): string => t.replace(/\r\n?/g, '\n')
  .replace(/<(\w+)([^>]*)>/g, (_, tag: string, attrs: string) => `<${tag}${attrs.replace(/="([^"]*)"/g, "='$1'")}>`)

export function readSource(text: string): Source | Fail {
  // The only line-ending normalization in the pipeline.
  const all = cleanup(text).split('\n')
  let title: string | null = null
  const config: Record<string, Scalar> = {}
  let start = 0
  // A first line Mermaid's frontMatterRegex could open a block on. Only an unindented `title:` and the `config:`
  // block are read; every other key is ignored.
  if (/^\s*---\s*$/.test(all[0]!)) {
    const block = frontmatter(all)
    if (isFail(block)) return block
    const { front, end } = block
    const found = readTitle(front)
    if (isFail(found)) return found
    title = found
    const read = readConfig(front)
    if (!read) return fail('frontmatter')
    // Typed only once the whole block reads, so a block T41 rejects still falls back as frontmatter.
    for (const [key, raw] of Object.entries(read)) {
      const value = raw.quoted ? raw.text : typed(raw.text)
      if (value === undefined) return fail(`config:${key}`)
      // X4. Mermaid 12.2.0 reads htmlLabels and flowchart.htmlLabels (getEffectiveHtmlLabels); any value but true draws
      // SVG text through markdownToLines, which drops tokens every drawn-text mode keeps. Any other *.htmlLabels falls
      // back too, to be safe.
      if (/(?:^|\.)htmlLabels$/.test(key) && value !== true) return fail('config:htmlLabels')
      put(config, key, value)
    }
    start = end + 1
  }
  const kept: { n: number; text: string }[] = []
  for (let i = start; i < all.length; i++) {
    const line = all[i]!
    const t = line.trimStart()
    // Mermaid's directiveRegex runs over the whole text, so a %%{ in a comment or in quotes still sets config (X4).
    if (line.includes('%%{')) return fail('directive')
    if (t === '' || t.startsWith('%%')) continue
    if (t.replace(/"[^"]*"/g, '').includes('%%')) return fail('directive')
    kept.push({ n: i + 1, text: encodeColours(line) })
  }
  const [head, ...lines] = kept
  if (!head || lines.length === 0) return fail('empty')
  if (oddWhitespace([all[head.n - 1]!.trimStart(), ...all.slice(head.n)])) return fail('whitespace')
  // A's grammars end a statement at ;, so their headers lose a trailing one. Any other type keeps it: Mermaid's TITLE
  // terminal reads `pie title Fruit;` as "Fruit;", and a header that takes no ; then fails its own parser.
  const h = head.text.trim(), header = /^(flowchart|graph|sequenceDiagram)\b/.test(h) ? h.replace(/;$/, '') : h
  return { header, title, config, lines }
}

// X4. Whitespace that is not space, tab or a line break: JS's \s, which trim() and Jison's \s skip, less those.
const ODD_WS = /[^\S \t\n]/
// Headers whose Jison grammar skips ODD_WS in the header line, blank lines and indents as \s, verified against Mermaid
// 12.2.0 (docs/specs/2026-10-29-mermaid-tty-v1-text-ground-truth.md, X4).
const JISON_WS = new Set(['flowchart', 'graph', 'sequenceDiagram', 'stateDiagram', 'stateDiagram-v2', 'classDiagram',
  'classDiagram-v2', 'erDiagram', 'gantt', 'journey', 'timeline', 'xychart', 'xychart-beta'])
// Langium grammars (gitGraph, pie) hide only [ \t]+ and newlines, so their lexer rejects ODD_WS anywhere outside a
// string.
const LANGIUM = new Set(['gitGraph', 'pie'])

// Whether Mermaid's lexer for the header's type could reject, or read otherwise, ODD_WS in body (the source from the
// header line on; Mermaid's trimStart drops it before the header). In a Langium type, any outside double quotes; in a
// type outside JISON_WS (mindmap, quadrantChart reject it), any in the header line or a blank line.
function oddWhitespace(body: readonly string[]): boolean {
  const kw = (/\S+/.exec(body[0]!)?.[0] ?? '').replace(/:$/, '')
  if (JISON_WS.has(kw)) return false
  if (LANGIUM.has(kw)) return body.some(l => ODD_WS.test(l.replace(/"[^"]*"/g, '')))
  return body.some((l, i) => (i === 0 || l.trim() === '') && ODD_WS.test(l))
}

// The block Mermaid's frontMatterRegex finds (diagram-api/regexes.ts, matchFrontMatter): `---` on line 1, then the
// lines up to the first `---` line after them, each fence followed only by whitespace and a line break. Returns the
// YAML js-yaml reads, from the first line that is not all whitespace and with one leading BOM dropped, as js-yaml
// drops it, and the closing fence's index. Fails with 'frontmatter' for any other block: an indented fence, no
// closing fence, adjacent fences (Mermaid finds no block, so `---` is read as the diagram), a body of whitespace
// before a later fence (Mermaid's body then starts at this fence), or a body line that is `---` or `...` (which ends
// the document), holds a character js-yaml rejects as non-printable, or leaves a quoted scalar or flow collection open.
function frontmatter(all: readonly string[]): { front: string[]; end: number } | Fail {
  // Mermaid's closing fence must be followed by a line break, so the last line never closes.
  const fence = (i: number) => i < all.length - 1 && /^---\s*$/.test(all[i]!)
  const end = all.findIndex((_, i) => i >= 2 && fence(i))
  if (!/^---\s*$/.test(all[0]!) || end < 0) return fail('frontmatter')
  const from = all.findIndex((l, i) => i >= 1 && !/^\s*$/.test(l))
  if (from === end && all.some((_, i) => i > end && fence(i))) return fail('frontmatter')
  const front = all.slice(from, end), [first = ''] = front
  if (first.startsWith('﻿')) front[0] = first.slice(1)
  const bad = (l: string) => /^(?:---|\.\.\.)(?:\s|$)/.test(l) || NON_PRINTABLE.test(l) || opens(l)
  return front.some(bad) ? fail('frontmatter') : { front, end }
}

// js-yaml 4.3.0's PATTERN_NON_PRINTABLE (loader.js): C0 and C1 controls but tab, LF, CR and NEL, U+FFFE, U+FFFF, and
// a lone surrogate. A NUL anywhere is rejected too.
const NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/

// Whether a frontmatter line leaves a quoted scalar or a flow collection open at its end, so that js-yaml reads the
// next lines, `title:` ones included, inside it. A quote or bracket counts only where a node starts: at the line's
// start, after `: `, `- `, `? `, a tag or an anchor, or inside a flow collection, where every `:` and `,` is taken as
// a separator, which fails closed. A `#` at the start or after a space or a tab ends the line.
function opens(line: string): boolean {
  const sep = (j: number) => j >= line.length || line[j] === ' ' || line[j] === '\t'
  let depth = 0, node = true
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === ' ' || c === '\t') continue
    if (c === '#' && (i === 0 || sep(i - 1))) break
    if (node && (c === '"' || c === "'")) {
      i = quoteEnd(line, i)
      if (i < 0) return true
      node = false
    } else if (node && (c === '!' || c === '&')) {
      while (!sep(i + 1)) i++
    } else if ((node || depth > 0) && (c === '[' || c === '{')) { depth++; node = true }
    else if (depth > 0 && (c === ']' || c === '}')) { depth--; node = false }
    else if (c === ':' ? depth > 0 || sep(i + 1) : depth > 0 && c === ',') node = true
    else node = node && (c === '-' || c === '?') && sep(i + 1)
  }
  return depth > 0
}

// The index of the quote that closes the quoted scalar opening at i, or -1 if it is still open at the line's end. In
// double quotes `\` escapes the next character; in single quotes `''` is one quote.
function quoteEnd(line: string, i: number): number {
  const q = line[i]
  for (let j = i + 1; j < line.length; j++) {
    if (q === '"' && line[j] === '\\') j++
    else if (line[j] === q && q === "'" && line[j + 1] === "'") j++
    else if (line[j] === q) return j
  }
  return -1
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
// comment lines are skipped, at any indent. Null too for a key keyOk rejects, at
// the top level or at any depth of the block. Each value is kept as scalar() reads
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
      else if (NOT_PLAIN.test(body) || /^config[ \t]*:/.test(body) || !keyOk(/^(.*?):(?:[ \t]|$)/.exec(body)?.[1] ?? '')) return null
      continue
    }
    if (!inBlock) continue
    const m = /^([A-Za-z_][\w-]*):/.exec(body)
    if (!m) return null
    const [head, key = ''] = m
    if (!keyOk(key)) return null
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
    put(config, path.join('.'), value)
  }
  return pending ? null : config
}

// Whether js-yaml's JSON_SCHEMA reads a plain mapping key as the string it spells. A null, bool or number key (`True`,
// `~`, `1`, `.inf`) could repeat another that resolves to the same value (`true`), which js-yaml rejects as a
// duplicated mapping key. A key that only looks like a number (`1a`) falls back too, which fails closed. `__proto__`
// falls back so that it can never reach config.
const keyOk = (k: string): boolean => k !== '__proto__' && !/^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE)$/.test(k) &&
  !/^[-+]?\.?\d|^[-+]?\.(?:inf|Inf|INF)$|^\.(?:nan|NaN|NAN)$/.test(k)

// Sets an own property, so that no key can reach a setter on Object.prototype.
const put = <T>(o: Record<string, T>, k: string, v: T): void => {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
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

// A plain scalar's value as js-yaml's JSON_SCHEMA resolves it: null, a bool, a
// decimal integer that is safe (`-0` gives 0, as in js-yaml), or a finite plain
// decimal with an optional exponent (`0.5`, `-0.0` gives -0, `2.5e3`), which
// js-yaml 4.3.0's float type reads as parseFloat does; else its text.
// Undefined, so that the source falls back, for any other numeric-looking text:
// a sign, a digit or `.`, then only word characters, `.`, `+` and `-`. That covers
// every other float (`1e3`, `.5`, `1.`, `+1.5`, `.inf`, `.nan`, `1.5e400`) and every
// hex, octal, binary, signed, leading-zero or unsafe integer js-yaml reads, and
// fails closed on some it reads as strings, such as `-x`, `1.2.3` and `1_000`
// (a string in js-yaml 4.3.0, 1000 in 4.1.0). `2024 Roadmap` and `50%` stay strings.
function typed(text: string): Scalar | undefined {
  if (/^(?:~|null|Null|NULL)$/.test(text)) return null
  if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(text)) return text.toLowerCase() === 'true'
  const n = Number(text)
  if (/^-?(?:0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(n)) return n || 0
  if (/^-?(?:0|[1-9]\d*)\.\d+(?:[eE][-+]?\d+)?$/.test(text) && Number.isFinite(n)) return n
  return /^[-+.\d][\w.+-]*$/.test(text) ? undefined : text
}
