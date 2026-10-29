// Reads an xychart (plan C, T71; matrix, xychart) into its model: the header's orientation, the title, the axes and the
// series, each number kept as written with its exact value. A statement outside the subset fails, so the fence draws
// as source.
import { cmp, dec, parseDec, type Dec } from '../../charts/decimal.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { unsupported } from '../../width.ts'

// A source number: its text as written, which prints, and its exact value.
export type Num = { raw: string; value: Dec }
// A bar or line series: its name, null if unnamed, and one value per group.
export type Series = { kind: 'bar' | 'line'; name: string | null; values: Num[] }
// Each text is null when the source gives none; categories are null without an x-axis list, and range without a
// y-axis range.
export type Xy = { orientation: 'vertical' | 'horizontal'; title: string | null; xTitle: string | null; categories: string[] | null
  yTitle: string | null; range: { lo: Num; hi: Num } | null; series: Series[] }

const HEADER = /^(xychart-beta|xychart)( vertical| horizontal)?$/
// A number, as Mermaid's lexer and parseDec read one.
const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`
// A text: "…", or one unquoted word, since Mermaid joins several words without their spaces. An axis title's word has
// no digit: in an axis statement, Mermaid's lexer reads one as a number.
const TEXT = String.raw`(?:"[^"]*"|[A-Za-z0-9&+=*.#_-]+)`
const AXIS_TEXT = String.raw`(?:"[^"]*"|[A-Za-z&+=*.#_-]+)`
// A keyword, in any case, where a run of letters starts (matrix, xychart: barley falls back). Mermaid's lexer ignores
// case and can read a keyword there, as bar in a1bar.
const KEYWORD = /(?:^|[^A-Za-z])(?:bar|line|title|x-axis|y-axis|vertical|horizontal|xychart)/i
// A [a, b, …] list; its items, without the brackets, are a group.
const list = (item: string) => String.raw`\[\s*(${item}(?:\s*,\s*${item})*)\s*\]`
// A pattern that must match a whole trimmed line.
const re = (s: string) => new RegExp(`^${s}$`)
const TITLE = re(String.raw`title\s+(${TEXT})`)
// An axis: a title alone, or a list (x) or a range (y) with an optional title before it.
const X_AXIS = re(String.raw`x-axis\s+(?:(${AXIS_TEXT})|(?:(${AXIS_TEXT})\s*)?${list(TEXT)})`)
const Y_AXIS = re(String.raw`y-axis\s+(?:(${AXIS_TEXT})|(?:(${AXIS_TEXT})\s+)?(${NUM})\s*-->\s*(${NUM}))`)
const SERIES = re(String.raw`(bar|line)\s+(?:(${TEXT})\s*)?${list(NUM)}`)
// As Mermaid's lexer reads them: accTitle: and accDescr: run to the line's end, and accDescr { to its first }. Neither draws.
const ACC = /^acc(?:Title|Descr)\s*:/
const ACC_BLOCK = /^accDescr\s*\{/
// A list's items, in order.
const TEXTS = new RegExp(TEXT, 'g'), NUMS = new RegExp(NUM, 'g')
const ZERO = dec(0)
const below = (a: Dec, b: Dec): boolean => cmp(a, b) < 0

// Ends the walk: parseXy returns this Fail.
function stop(reason: string): never { throw fail(reason) }

// The model src's statements build, or why it cannot be drawn: 'header' (not xychart-beta or xychart, alone or with
// vertical or horizontal), 'syntax:<n>' (a statement on source line n outside the subset, or an accDescr { there with no
// }), 'repeat:<n>' (a second title, from frontmatter or a statement, x-axis or y-axis, or a repeated category, on line
// n), 'entity' (a #…; entity in a text), 'unsupported-char U+XXXX' (a text character no terminal draws reliably), 'length' (a series without one value per
// group), 'series' (more than 8 line series or 26 bar series) or 'domain' (no y range that holds every value: see domain).
export function parseXy(src: Source): Xy | Fail {
  try { return walk(src) } catch (e) { if (isFail(e)) return e; throw e }
}

function walk(src: Source): Xy {
  const head = HEADER.exec(src.header) ?? stop('header')
  const xy: Xy = { orientation: head[2] === ' horizontal' ? 'horizontal' : 'vertical', title: src.title,
    xTitle: null, categories: null, yTitle: null, range: null, series: [] }
  // title, x-axis and y-axis, once each has come: a frontmatter title is the first title (common rule 3).
  const seen = new Set<string>(src.title === null ? [] : ['title'])
  // The line of an accDescr { whose } has not come, else 0.
  let descr = 0
  for (const { n, text: raw } of src.lines) {
    const t = raw.trim()
    if (descr) { if (closes(t, n)) descr = 0; continue }
    if (ACC.test(t)) continue
    if (ACC_BLOCK.test(t)) { if (!closes(t.replace(ACC_BLOCK, ''), n)) descr = n; continue }
    statement(t, n, xy, seen)
  }
  if (descr) stop(`syntax:${descr}`)
  lengths(xy); counts(xy); domain(xy)
  return xy
}

// Whether an accDescr block's text closes in rest: at its first }, after which the line must end.
function closes(rest: string, n: number): boolean {
  const i = rest.indexOf('}')
  if (i < 0) return false
  if (rest.slice(i + 1).trim()) stop(`syntax:${n}`)
  return true
}

// Reads trimmed source line n into xy.
function statement(t: string, n: number, xy: Xy, seen: Set<string>): void {
  // A second title, x-axis or y-axis fails on its line.
  const once = (key: string) => { if (seen.has(key)) stop(`repeat:${n}`); seen.add(key) }
  let m: RegExpExecArray | null
  if ((m = TITLE.exec(t))) {
    once('title'); xy.title = text(m[1]!, n)
  } else if ((m = X_AXIS.exec(t))) {
    once('x-axis'); xy.xTitle = optText(m[1] ?? m[2], n); xy.categories = m[3] === undefined ? null : categories(m[3], n)
  } else if ((m = Y_AXIS.exec(t))) {
    once('y-axis'); xy.yTitle = optText(m[1] ?? m[2], n); xy.range = m[3] === undefined ? null : { lo: num(m[3], n), hi: num(m[4]!, n) }
  } else if ((m = SERIES.exec(t))) {
    xy.series.push({ kind: m[1] as Series['kind'], name: optText(m[2], n), values: [...m[3]!.matchAll(NUMS)].map(v => num(v[0], n)) })
  } else stop(`syntax:${n}`)
}

// A text's content. A "…" is trimmed, as Mermaid's xychart database trims each text; a "`…`" markdown string fails, and
// so does one blank once trimmed, as "" does in Mermaid. A word fails if a keyword starts a run of its letters. A #…;
// entity fails 'entity': Mermaid encodes it in the body and its SVG decodes it, so it would draw as other text.
function text(s: string, n: number): string {
  const quoted = s.startsWith('"'), t = quoted ? s.slice(1, -1).trim() : s
  if (quoted ? s.startsWith('"`') || t === '' : KEYWORD.test(s)) stop(`syntax:${n}`)
  if (/#\w+;/.test(t)) stop('entity')
  const bad = unsupported(t)
  return bad ? stop(`unsupported-char ${bad}`) : t
}
const optText = (s: string | undefined, n: number): string | null => (s === undefined ? null : text(s, n))

// An x-axis list's categories, in order. A repeated one fails on line n.
function categories(items: string, n: number): string[] {
  const cs = [...items.matchAll(TEXTS)].map(c => text(c[0], n))
  if (new Set(cs).size < cs.length) stop(`repeat:${n}`)
  return cs
}

// A number as written, with its exact value.
function num(raw: string, n: number): Num {
  const value = parseDec(raw)
  return value ? { raw, value } : stop(`syntax:${n}`)
}

// Each series has one value per group: per category or, with no categories, per value of the first series.
function lengths(xy: Xy): void {
  const groups = xy.categories?.length ?? xy.series[0]?.values.length ?? 0
  if (xy.series.some(s => s.values.length !== groups)) stop('length')
}

// More than 8 line series (their markers would repeat) or 26 bar series fail.
function counts(xy: Xy): void {
  const k = (kind: Series['kind']) => xy.series.filter(s => s.kind === kind).length
  if (k('line') > 8 || k('bar') > 26) stop('series')
}

// The y range: the explicit one, else y0 = min(0, smallest value) and y1 = max(0, largest). It must hold every value
// and have y0 < y1; with a bar series, y0 ≥ 0 too, since bars grow from y0 and a zero bar must draw nothing.
function domain(xy: Xy): void {
  const values = xy.series.flatMap(s => s.values.map(v => v.value))
  const y0 = xy.range?.lo.value ?? values.reduce((a, v) => (below(v, a) ? v : a), ZERO)
  const y1 = xy.range?.hi.value ?? values.reduce((a, v) => (below(a, v) ? v : a), ZERO)
  const outside = values.some(v => below(v, y0) || below(y1, v))
  const bars = xy.series.some(s => s.kind === 'bar')
  if (outside || !below(y0, y1) || (bars && below(y0, ZERO))) stop('domain')
}
