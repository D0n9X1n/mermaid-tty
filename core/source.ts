import { fail, isFail, type Fail } from './fail.ts'
import { unsupported } from './width.ts'

// A frontmatter scalar, typed as Mermaid's frontmatter.ts types it: js-yaml with JSON_SCHEMA.
export type Scalar = string | number | boolean | null

// What a parser reads from a fence body: the header line, the frontmatter title, the frontmatter config scalars under
// dotted keys ('gitGraph.mainBranchName'), and the remaining lines as written, with their 1-based source line numbers.
export type Source = {
  header: string
  title: string | null
  config: Readonly<Record<string, Scalar>>
  lines: readonly { n: number; text: string }[]
}

// Fails with 'directive' (a `%%{` line that is not a whole directive() reads, or `%%` after text outside double
// quotes), 'frontmatter' (a block frontmatter() rejects, frontmatter readConfig rejects, or a title scalar() rejects),
// 'title' (a second frontmatter title, one js-yaml would read another way, or one that is true or numeric),
// 'unsupported-char U+XXXX' (a title character no terminal draws reliably, checked here for every diagram type),
// 'config:<dotted key>' (a numeric-looking plain config scalar that is not a safe integer or a finite plain decimal, or
// a setting allowed() refuses) or 'empty' (no header, or nothing after it). Mermaid's encodeEntities (utils.ts), before
// any diagram parses, drops the last ; of whatever matches style…:…#…; or classDef…:…#…; on a line, wherever it sits,
// label text included. Each kept line is read as Mermaid's parser reads it.
const encodeColours = (t: string): string =>
  t.replace(/style.*:\S*#.*;/g, (s) => s.slice(0, -1)).replace(/classDef.*:\S*#.*;/g, (s) => s.slice(0, -1))

// Mermaid's cleanupText (preprocess.ts), over the whole text before anything else: CRLF and lone CR become LF, and each
// tag's double-quoted attribute values become single-quoted, frontmatter included. Neither changes the line count.
const cleanup = (t: string): string =>
  t
    .replace(/\r\n?/g, '\n')
    .replace(/<(\w+)([^>]*)>/g, (_, tag: string, attrs: string) => `<${tag}${attrs.replace(/="([^"]*)"/g, "='$1'")}>`)

export function readSource(text: string): Source | Fail {
  const src = scanSource(text)
  if (isFail(src)) {
    return src
  }

  for (const [key, value] of Object.entries(src.config)) {
    const why = allowed(key, value)
    if (why) {
      return fail(why)
    }
  }

  return src
}

// readSource before it checks each setting: every scalar the frontmatter config and the directives set, merged as
// Mermaid merges them. Exported for the tests of the scanner itself.
export function scanSource(text: string): Source | Fail {
  // The only line-ending normalization in the pipeline.
  const all = cleanup(text).split('\n')
  let title: string | null = null
  const config: Record<string, Scalar> = {}
  let start = 0
  // A first line Mermaid's frontMatterRegex could open a block on. Only an unindented `title:` and the `config:` block
  // are read; every other key is ignored.
  if (/^\s*---\s*$/.test(all[0]!)) {
    const block = frontmatter(all)
    if (isFail(block)) {
      return block
    }

    const { front, end } = block
    const found = readTitle(front)
    if (isFail(found)) {
      return found
    }

    title = found
    const read = readConfig(front)
    if (!read) {
      return fail('frontmatter')
    }
    // Typed only once the whole block reads, so a block T41 rejects still falls back as frontmatter.
    for (const [key, raw] of Object.entries(read)) {
      const value = raw.quoted ? raw.text : typed(raw.text)
      if (value === undefined) {
        return fail(`config:${key}`)
      }

      put(config, key, value)
    }
    // processFrontmatter sets a top-level displayMode as gantt.displayMode, over the config block's.
    const mode = front.find((l) => /^displayMode[ \t]*:/.test(l))
    if (mode !== undefined) {
      put(config, 'gantt.displayMode', mode.slice(mode.indexOf(':') + 1).trim())
    }

    start = end + 1
  }

  const kept: { n: number; text: string }[] = []
  // Each init directive's settings, in order, and whether a %%{wrap}%% was seen.
  const inits: Record<string, Scalar>[] = []
  let wrap = false
  for (let i = start; i < all.length; i++) {
    const line = all[i]!
    const t = line.trimStart()
    // Mermaid's directiveRegex runs over the whole text, so a %%{ in a comment or in quotes still sets config (X4).
    // Only a line that is one whole directive is read; Mermaid removes it, leaving a blank line.
    if (line.includes('%%{')) {
      const d = directive(line)
      if (!d) {
        return fail('directive')
      }

      if (d === 'wrap') {
        wrap = true
      } else {
        inits.push(d)
      }

      all[i] = ''
      continue
    }

    if (t === '' || t.startsWith('%%')) {
      continue
    }

    if (t.replace(/"[^"]*"/g, '').includes('%%')) {
      return fail('directive')
    }

    kept.push({ n: i + 1, text: encodeColours(line) })
  }
  // processDirectives sets wrap after merging the inits, and cleanAndMerge lays the lot over the frontmatter config.
  for (const d of [...inits, ...(wrap ? [{ wrap: true }] : [])]) {
    for (const [key, value] of Object.entries(d)) {
      if (Object.keys(config).some((k) => k.startsWith(`${key}.`) || key.startsWith(`${k}.`))) {
        return fail('directive')
      }

      put(config, key, value)
    }
  }

  const [head, ...lines] = kept
  if (!head || lines.length === 0) {
    return fail('empty')
  }

  if (oddWhitespace([all[head.n - 1]!.trimStart(), ...all.slice(head.n)])) {
    return fail('whitespace')
  }
  // A's grammars end a statement at ;, so their headers lose a trailing one. Any other type keeps it: Mermaid's TITLE
  // terminal reads `pie title Fruit;` as "Fruit;", and a header that takes no ; then fails its own parser.
  const h = head.text.trim()
  const header = /^(flowchart|graph|sequenceDiagram)\b/.test(h) ? h.replace(/;$/, '') : h
  return { header, title, config, lines }
}

// Why setting key, value cannot be drawn, or null. A setting draws only if a renderer here honours it, or if Mermaid
// 12.2.0 was seen (JSDOM, every ok fixture type but mindmap) to change only pixels with it, its value of a type Mermaid
// takes; any other falls back as 'config:<key>'. X4: Mermaid reads htmlLabels and flowchart.htmlLabels
// (getEffectiveHtmlLabels); any value but true draws SVG text through markdownToLines, which drops tokens every
// drawn-text mode keeps, so any *.htmlLabels but those two set true falls back 'config:htmlLabels'.
function allowed(key: string, value: Scalar): string | null {
  if (/(?:^|\.)htmlLabels$/.test(key)) {
    return (key === 'htmlLabels' || key === 'flowchart.htmlLabels') && value === true ? null : 'config:htmlLabels'
  }

  const ok = Object.hasOwn(ALLOW, key) && ALLOW[key]!(value)
  return ok ? null : `config:${key}`
}

const bool = (v: Scalar): boolean => typeof v === 'boolean'
const any = (): boolean => true
// A number in [lo, hi].
const range =
  (lo: number, hi: number) =>
  (v: Scalar): boolean =>
    typeof v === 'number' && v >= lo && v <= hi
// A px length in [lo, hi], as a string.
const px =
  (lo: number, hi: number) =>
  (v: Scalar): boolean =>
    typeof v === 'string' && /^\d+(?:\.\d+)?px$/.test(v) && parseFloat(v) >= lo && parseFloat(v) <= hi
// Each setting by its dotted key, and the values it may take.
const ALLOW: Readonly<Record<string, (v: Scalar) => boolean>> = {
  // Read here: the gitGraph, mindmap and timeline parsers check and use these as Mermaid does.
  'gitGraph.mainBranchName': any,
  'gitGraph.mainBranchOrder': any,
  'mindmap.colorBy': any,
  'timeline.disableMulticolor': any,
  // Mermaid's defaults, which these drawings show: branch names, commit labels. showDataLabel only toggles text over
  // Mermaid's bars; xychart's value rows print what Mermaid encodes as bar heights and line points either way (PM
  // ruling, vr-C-xychart), so any boolean draws.
  'gitGraph.showBranches': (v) => v === true,
  'gitGraph.showCommitLabel': (v) => v === true,
  'xyChart.showDataLabel': bool,
  // Seen to change only pixels: theme colours and gradients, and log output. Any other theme name, or a number, Mermaid
  // ignores, so it falls back.
  theme: (v) => ['default', 'base', 'dark', 'forest', 'neutral'].includes(v as string),
  logLevel: (v) =>
    typeof v === 'number'
      ? Number.isInteger(v) && v >= 0 && v <= 5
      : ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(v as string),
  // Pie slice labels sit at textPosition of the radius: at 0 they all meet at the centre, past 1 they leave the chart.
  // From 0.5 (two thirds of the default 0.75's distance) to 1 none was seen to meet another or leave the viewBox.
  'pie.textPosition': range(0.5, 1),
  // Below Mermaid's default 500 more quadrant texts overlap (5 pairs at 400, 19 at 200, 100 at 100, against 3); from
  // 500 to 2000 no more than at 500, and every text stays in the viewBox.
  'quadrantChart.chartWidth': range(500, 2000),
  'quadrantChart.chartHeight': range(500, 2000),
  // &nbsp; for a Markdown label's spaces: only where a line breaks, which the drawing chooses anyway. A wrapping width
  // (flowchart.wrappingWidth, mindmap.maxNodeWidth) falls back: JSDOM lays out no text, so what a narrow one hides is
  // unverified.
  markdownAutoWrap: bool,
  // The pie's slice and outer ring strokes, up to Mermaid's 2px default. Slice labels are drawn after them, but wider
  // black strokes cover more of a thin slice's label (a 1% slice beside a 90% one: 21% of its box at 2px, 52% at 5px,
  // all of it at 20px, where the ring also reaches the title). Every colour falls back: any one can match the colour
  // drawn under or over it (base's primaryTextColor equal to its primaryColor; a mainBkg of #333 under the default's
  // #28253D text), so text vanishes. Text sizes fall back too: 0px hides text, and wrapLabel measures with them.
  'themeVariables.pieStrokeWidth': px(0.5, 2),
  'themeVariables.pieOuterStrokeWidth': px(0.5, 2),
}

// A line that is one whole directive as Mermaid 12.2.0 reads it (detectDirective, detectInit, processDirectives):
// `%%{wrap}%%` gives 'wrap'; `%%{init: {…}}%%` or `%%{initialize: {…}}%%`, in lowercase, its JSON object's settings
// under dotted keys, as frontmatter config gives them. Mermaid makes every ' a " before JSON.parse, as here, and drops
// every init when one fails to parse ({"a": "it's"} among them). Null, so that the source falls back, for any other
// line:
// another directive type, text around the directive, a %% inside it, a body JSON.parse rejects or that is not an
// object, a "config" key (which detectInit moves under the diagram type), or a setting flat() rejects. readSource then
// checks each setting as frontmatter config's.
function directive(line: string): Record<string, Scalar> | 'wrap' | null {
  const t = line.trim()
  if (/^%%\{\s*wrap\s*\}%%$/.test(t)) {
    return 'wrap'
  }

  const m = /^%%\{\s*(?:init|initialize)\s*:\s*(\{.*\})\s*\}%%$/.exec(t)
  if (!m || m[1]!.includes('%%')) {
    return null
  }

  let body: unknown
  try {
    body = JSON.parse(m[1]!.replaceAll("'", '"'))
  } catch {
    return null
  }

  if (!plainObject(body) || Object.hasOwn(body, 'config')) {
    return null
  }

  const out: Record<string, Scalar> = {}
  return flat(body, '', out) ? out : null
}

const plainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Puts each leaf of o into out under its dotted key, prefix first. False for a key that is not a plain name (or is
// __proto__), an empty object, an array, null (which sanitizeDirective deletes), or a number that is not finite.
function flat(o: Record<string, unknown>, prefix: string, out: Record<string, Scalar>): boolean {
  const keys = Object.keys(o)
  if (keys.length === 0 && prefix) {
    return false
  }

  for (const k of keys) {
    if (!/^[A-Za-z_][\w-]*$/.test(k) || k === '__proto__') {
      return false
    }

    const key = prefix + k
    const v = o[k]
    if (plainObject(v)) {
      if (!flat(v, `${key}.`, out)) {
        return false
      }

      continue
    }

    if (typeof v !== 'string' && typeof v !== 'boolean' && !(typeof v === 'number' && Number.isFinite(v))) {
      return false
    }

    put(out, key, v)
  }

  return true
}

// X4. Whitespace that is not space, tab or a line break: JS's \s, which trim() and Jison's \s skip, less those.
const ODD_WS = /[^\S \t\n]/
// Headers whose Jison grammar skips ODD_WS in the header line, blank lines and indents as \s, verified against Mermaid
// 12.2.0 in Chrome.
const JISON_WS = new Set([
  'flowchart',
  'graph',
  'sequenceDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'classDiagram',
  'classDiagram-v2',
  'erDiagram',
  'gantt',
  'journey',
  'timeline',
  'xychart',
  'xychart-beta',
])
// Langium grammars (gitGraph, pie) hide only [ \t]+ and newlines, so their lexer rejects ODD_WS anywhere outside a
// string.
const LANGIUM = new Set(['gitGraph', 'pie'])

// Whether Mermaid's lexer for the header's type could reject, or read otherwise, ODD_WS in body (the source from the
// header line on; Mermaid's trimStart drops it before the header). In a Langium type, any outside double quotes; in a
// type outside JISON_WS (mindmap, quadrantChart reject it), any in the header line or a blank line.
function oddWhitespace(body: readonly string[]): boolean {
  const kw = (/\S+/.exec(body[0]!)?.[0] ?? '').replace(/:$/, '')
  if (JISON_WS.has(kw)) {
    return false
  }

  if (LANGIUM.has(kw)) {
    return body.some((l) => ODD_WS.test(l.replace(/"[^"]*"/g, '')))
  }

  return body.some((l, i) => (i === 0 || l.trim() === '') && ODD_WS.test(l))
}

// The block Mermaid's frontMatterRegex finds (diagram-api/regexes.ts, matchFrontMatter): `---` on line 1, then the
// lines up to the first `---` line after them, each fence followed only by whitespace and a line break. Returns the
// YAML js-yaml reads, from the first line that is not all whitespace and with one leading BOM dropped, as js-yaml drops
// it, and the closing fence's index. Fails with 'frontmatter' for any other block: an indented fence, no closing fence,
// adjacent fences (Mermaid finds no block, so `---` is read as the diagram), a body of whitespace before a later fence
// (Mermaid's body then starts at this fence), or a body line that is `---` or `...` (which ends the document), holds a
// character js-yaml rejects as non-printable, or leaves a quoted scalar or flow collection open.
function frontmatter(all: readonly string[]): { front: string[]; end: number } | Fail {
  // Mermaid's closing fence must be followed by a line break, so the last line never closes.
  const fence = (i: number) => i < all.length - 1 && /^---\s*$/.test(all[i]!)
  const end = all.findIndex((_, i) => i >= 2 && fence(i))
  if (!/^---\s*$/.test(all[0]!) || end < 0) {
    return fail('frontmatter')
  }

  const from = all.findIndex((l, i) => i >= 1 && !/^\s*$/.test(l))
  if (from === end && all.some((_, i) => i > end && fence(i))) {
    return fail('frontmatter')
  }

  const front = all.slice(from, end)
  const [first = ''] = front
  if (first.startsWith('﻿')) {
    front[0] = first.slice(1)
  }

  const bad = (l: string) => /^(?:---|\.\.\.)(?:\s|$)/.test(l) || NON_PRINTABLE.test(l) || opens(l)
  return front.some(bad) ? fail('frontmatter') : { front, end }
}

// js-yaml 4.3.0's PATTERN_NON_PRINTABLE (loader.js): C0 and C1 controls but tab, LF, CR and NEL, U+FFFE, U+FFFF, and a
// lone surrogate. A NUL anywhere is rejected too.
const NON_PRINTABLE =
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/

// Whether a frontmatter line leaves a quoted scalar or a flow collection open at its end, so that js-yaml reads the
// next lines, `title:` ones included, inside it. A quote or bracket counts only where a node starts: at the line's
// start, after `: `, `- `, `? `, a tag or an anchor, or inside a flow collection, where every `:` and `,` is taken as a
// separator, which fails closed. A `#` at the start or after a space or a tab ends the line.
function opens(line: string): boolean {
  const sep = (j: number) => j >= line.length || line[j] === ' ' || line[j] === '\t'
  let depth = 0
  let node = true
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === ' ' || c === '\t') {
      continue
    }

    if (c === '#' && (i === 0 || sep(i - 1))) {
      break
    }

    if (node && (c === '"' || c === "'")) {
      i = quoteEnd(line, i)
      if (i < 0) {
        return true
      }

      node = false
    } else if (node && (c === '!' || c === '&')) {
      while (!sep(i + 1)) {
        i++
      }
    } else if ((node || depth > 0) && (c === '[' || c === '{')) {
      depth++
      node = true
    } else if (depth > 0 && (c === ']' || c === '}')) {
      depth--
      node = false
    } else if (c === ':' ? depth > 0 || sep(i + 1) : depth > 0 && c === ',') {
      node = true
    } else {
      node = node && (c === '-' || c === '?') && sep(i + 1)
    }
  }

  return depth > 0
}

// The index of the quote that closes the quoted scalar opening at i, or -1 if it is still open at the line's end. In
// double quotes `\` escapes the next character; in single quotes `''` is one quote.
function quoteEnd(line: string, i: number): number {
  const q = line[i]
  for (let j = i + 1; j < line.length; j++) {
    if (q === '"' && line[j] === '\\') {
      j++
    } else if (line[j] === q && q === "'" && line[j + 1] === "'") {
      j++
    } else if (line[j] === q) {
      return j
    }
  }

  return -1
}

// The unindented `title:` line's scalar, read as a config value is, then printed as Mermaid's frontmatter.ts prints it:
// `if (parsed.title) metadata.title = parsed.title.toString()`. So null, false and '' give no title. Fails with 'title'
// for a second title line; for a title js-yaml would read another way: a title key with spaces or a tab before its
// colon, or a title line whose next line, past blank and comment lines, starts with a space, since js-yaml continues
// the title there (readConfig rejects one that starts with a tab); or for a true or numeric value (`007` would print
// 7). Fails with 'frontmatter' for a value scalar() rejects, or 'unsupported-char U+XXXX'. A tab may separate the value
// from `title:`, as in js-yaml.
function readTitle(front: readonly string[]): string | null | Fail {
  const [line, second] = front.filter((l) => /^title[ \t]*:/.test(l))
  if (second !== undefined) {
    return fail('title')
  }

  if (line === undefined) {
    return null
  }

  const next = front.slice(front.indexOf(line) + 1).find((l) => !/^[ \t]*(?:#|$)/.test(l))
  if (!line.startsWith('title:') || next?.startsWith(' ')) {
    return fail('title')
  }

  const rest = line.slice('title:'.length).replace(/[ \t]+$/, '')
  if (rest === '') {
    return null
  }

  const raw = /^[ \t]/.test(rest) ? scalar(rest.replace(/^[ \t]+/, '')) : null
  if (raw === null) {
    return fail('frontmatter')
  }

  const value = raw.quoted ? raw.text : typed(raw.text)
  if (value === undefined || value === true || typeof value === 'number') {
    return fail('title')
  }

  const bad = value ? unsupported(value) : null
  return bad ? fail(`unsupported-char ${bad}`) : value || null
}

// The first characters of a plain scalar or top-level key that could start another YAML node: a flow collection, an
// anchor, alias or tag, a block scalar, a directive, a comment, a quote, or `-`, `?` or `:` before a space, a tab or
// the end.
const NOT_PLAIN = /^(?:[[\]{},&*!|>%@#'"`]|[-?:](?:[ \t]|$))/

// The frontmatter's `config:` block as dotted keys, read as a strict YAML subset
//: `<key>:` mappings, each indented deeper than its parent and at
// one indent throughout, down to one-line scalars. Null, so that the source falls back, for any other form: a flow
// collection, a sequence, an anchor, an alias or a tag, a block or multi-line scalar, a repeated or dotted key, a key
// with no value and no children, bad indentation, or a tab in a line's leading whitespace. Null too for frontmatter
// that could hold config another way: an indented first line, a second `config:`, or any other unindented line that
// starts with an indicator or is `config` with spaces or a value. Blank and comment lines are skipped, at any indent.
// Null too for a key keyOk rejects, at the top level or at any depth of the block. Each value is kept as scalar() reads
// it, for readSource to type.
function readConfig(front: readonly string[]): Record<string, Raw> | null {
  const config: Record<string, Raw> = {}
  // The open mappings, innermost last: each one's indent, key path and keys so far.
  const frames: { indent: number; path: string[]; keys: Set<string> }[] = []
  // A key with no value, whose mapping opens on the next, deeper line.
  let pending: { indent: number; path: string[] } | null = null
  // Inside the block; a config: line seen; an unindented line seen.
  let inBlock = false
  let opened = false
  let top = false
  for (const raw of front) {
    const line = raw.replace(/[ \t]+$/, '')
    if (line === '') {
      continue
    }

    const indent = line.search(/[^ ]/)
    if (line[indent] === '\t') {
      return null
    }

    const body = line.slice(indent)
    if (body.startsWith('#')) {
      continue
    }
    // The top-level mapping starts unindented, or a `config:` could hide inside it.
    if (indent > 0 && !top) {
      return null
    }
    // An unindented line ends the block, and only the first `config:` opens it. One that could spell config another way
    // (`config :`, `config: {}`, or a quoted, tagged, anchored or explicit key, a flow collection, a sequence) falls
    // back.
    if (indent === 0) {
      if (pending) {
        return null
      }

      top = true
      inBlock = body === 'config:'
      if (inBlock && opened) {
        return null
      }

      if (inBlock) {
        opened = true
        pending = { indent, path: [] }
      } else if (
        NOT_PLAIN.test(body) ||
        /^config[ \t]*:/.test(body) ||
        !keyOk(/^(.*?):(?:[ \t]|$)/.exec(body)?.[1] ?? '')
      ) {
        return null
      }

      continue
    }

    if (!inBlock) {
      continue
    }

    const m = /^([A-Za-z_][\w-]*):/.exec(body)
    if (!m) {
      return null
    }

    const [head, key = ''] = m
    if (!keyOk(key)) {
      return null
    }

    if (pending) {
      if (indent <= pending.indent) {
        return null
      }

      frames.push({ indent, path: pending.path, keys: new Set() })
      pending = null
    }

    while (frames.length > 0 && frames.at(-1)!.indent > indent) {
      frames.pop()
    }

    const frame = frames.at(-1)
    if (!frame || frame.indent !== indent || frame.keys.has(key)) {
      return null
    }

    frame.keys.add(key)
    const path = [...frame.path, key]
    const rest = body.slice(head.length)
    if (rest === '') {
      pending = { indent, path }
      continue
    }

    const value = rest.startsWith(' ') ? scalar(rest.replace(/^[ \t]+/, '')) : null
    if (value === null) {
      return null
    }

    put(config, path.join('.'), value)
  }

  return pending ? null : config
}

// Whether js-yaml's JSON_SCHEMA reads a plain mapping key as the string it spells. A null, bool or number key (`True`,
// `~`, `1`, `.inf`) could repeat another that resolves to the same value (`true`), which js-yaml rejects as a
// duplicated mapping key. A key that only looks like a number (`1a`) falls back too, which fails closed. `__proto__`
// falls back so that it can never reach config.
const keyOk = (k: string): boolean =>
  k !== '__proto__' &&
  !/^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE)$/.test(k) &&
  !/^[-+]?\.?\d|^[-+]?\.(?:inf|Inf|INF)$|^\.(?:nan|NaN|NAN)$/.test(k)

// Sets an own property, so that no key can reach a setter on Object.prototype.
const put = <T>(o: Record<string, T>, k: string, v: T): void => {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
}

// A scalar as written: a quoted one's text with its escapes decoded, or a plain one's text.
type Raw = { quoted: boolean; text: string }

// One scalar after `<key>: `, or null for any other form. A double-quoted one escapes only `\"` and `\\`, and a
// single-quoted one writes `'` as `''`; either may be followed by spaces or tabs, then a comment. A plain one ends at
// the first `#` after a space or a tab, and holds no `:` before a space, a tab or its end.
function scalar(v: string): Raw | null {
  const quoted = /^"((?:[^"\\]|\\["\\])*)"|^'((?:[^']|'')*)'/.exec(v)
  if (quoted) {
    const [whole, dq, sq = ''] = quoted
    if (!/^(?:[ \t]+#|$)/.test(v.slice(whole.length))) {
      return null
    }

    return { quoted: true, text: dq !== undefined ? dq.replace(/\\(["\\])/g, '$1') : sq.replace(/''/g, "'") }
  }

  if (NOT_PLAIN.test(v)) {
    return null
  }

  const cut = v.search(/[ \t]#/)
  const plain = (cut < 0 ? v : v.slice(0, cut)).replace(/[ \t]+$/, '')
  return /:(?:[ \t]|$)/.test(plain) ? null : { quoted: false, text: plain }
}

// A plain scalar's value as js-yaml's JSON_SCHEMA resolves it: null, a bool, a decimal integer that is safe (`-0` gives
// 0, as in js-yaml), or a finite plain decimal with an optional exponent (`0.5`, `-0.0` gives -0, `2.5e3`), which
// js-yaml 4.3.0's float type reads as parseFloat does; else its text. Undefined, so that the source falls back, for any
// other numeric-looking text:
// a sign, a digit or `.`, then only word characters, `.`, `+` and `-`. That covers every other float (`1e3`, `.5`,
// `1.`, `+1.5`, `.inf`, `.nan`, `1.5e400`) and every hex, octal, binary, signed, leading-zero or unsafe integer js-yaml
// reads, and fails closed on some it reads as strings, such as `-x`, `1.2.3` and `1_000` (a string in js-yaml 4.3.0,
// 1000 in 4.1.0). `2024 Roadmap` and `50%` stay strings.
function typed(text: string): Scalar | undefined {
  if (/^(?:~|null|Null|NULL)$/.test(text)) {
    return null
  }

  if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(text)) {
    return text.toLowerCase() === 'true'
  }

  const n = Number(text)
  if (/^-?(?:0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(n)) {
    return n || 0
  }

  if (/^-?(?:0|[1-9]\d*)\.\d+(?:[eE][-+]?\d+)?$/.test(text) && Number.isFinite(n)) {
    return n
  }

  return /^[-+.\d][\w.+-]*$/.test(text) ? undefined : text
}
