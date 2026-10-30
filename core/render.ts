// The render entry point (plan A §6, T19): a fence body to colored rows, or null to fall back to its source.
import type { Cell, Drawing } from './canvas.ts'
import { BOLD, ITALIC } from './emphasis.ts'
import type { Fail } from './fail.ts'
import { fail, isFail } from './fail.ts'
import type { Step } from './fit.ts'
import { fitLadder } from './fit.ts'
import { createLru } from './lru.ts'
import { lookup, type DiagramModule } from './registry.ts'
import { readSource } from './source.ts'
import { drawable as drawableText } from './text.ts'
import type { Color, Ink, Palette, Role, SeriesKey } from './themes.ts'
import { palette } from './themes.ts'
// Imported for their side effect: the flowchart and sequence modules, then each Tier 1 type's (diagrams/all.ts), register
// themselves once registry.ts has run.
import './diagrams/flowchart/layout.ts'
import './diagrams/sequence/layout.ts'
import './diagrams/all.ts'

export type Span = { text: string; role?: Ink; color?: Color; backgroundColor?: Color; bold?: boolean; italic?: boolean; dimColor?: boolean }
export type Rows = Span[][]
export type Options = { columns: number; theme?: string }

// Whether columns is a width a drawing can have: a positive safe integer.
const drawable = (columns: number): boolean => Number.isSafeInteger(columns) && columns > 0

// The source's header picks its module; the module parses the rest; the fit ladder draws the model. The first Fail wins,
// after 'bad-columns' when o.columns is not drawable. A frontmatter title, in every type, is checked as Mermaid's sanitized
// title text with no <br> (docs/specs/2026-10-29-mermaid-tty-v1-text-ground-truth.md). explain never throws: a throw below
// it is a bug, which falls back as 'internal-error'.
export function explain(source: string, o: Options): { step: Step; drawing: Drawing } | Fail {
  if (!drawable(o.columns)) return fail('bad-columns')
  try {
    const p = parsed(source)
    return isFail(p) ? p : fitLadder(p.mod, p.model, o.columns)
  } catch {
    return fail('internal-error')
  }
}

// The source's module and model, or the first Fail of source, title, lookup and parse: explain before the fit ladder.
function parsed(source: string): { mod: DiagramModule; model: unknown } | Fail {
  const src = readSource(source)
  if (isFail(src)) return src
  const title = src.title === null ? null : drawableText(src.title, 'sanitized', 'none')
  if (title) return title
  const mod = lookup(src.header)
  if (isFail(mod)) return mod
  const model = mod.parse(src)
  return isFail(model) ? model : { mod, model }
}

// The Fail explain would give before the fit ladder, or null when the source parses: whether core accepts the diagram
// at any width. Never throws: a throw below it is 'internal-error'.
export function parseFail(source: string): Fail | null {
  try { const p = parsed(source); return isFail(p) ? p : null } catch { return fail('internal-error') }
}

// The rows inner draws of source, in o's theme ('default' when none is given), or its Fail.
function draw(source: string, o: Options, inner: typeof explain): Rows | Fail {
  const r = inner(source, o)
  return isFail(r) ? r : toRows(r.drawing, palette(o.theme ?? 'default'))
}

// The drawing as rows in the theme's palette, or null on any Fail.
export function renderMermaid(source: string, o: Options): Rows | null {
  const r = draw(source, o, explain)
  return isFail(r) ? null : r
}

// One cell's span: its role's color, or its series'. A node or decision pill's text and fill cells, when the palette
// fills, take that color as their background and onFill as their color; caps and C's key cells keep it as their color.
// Null colors are omitted, so mono's spans carry none. A title is bold; a text cell's em (core/emphasis.ts) sets bold and
// italic as Mermaid's <strong> and <em> show.
function cellSpan(cell: Cell, p: Palette): Span {
  const ink = (Object.hasOwn(p.series, cell.role) ? p.series[cell.role as SeriesKey] : p.roles[cell.role as Role]) ?? null
  const pill = p.fill && (cell.role === 'node' || cell.role === 'decision') && (cell.kind === 'text' || cell.kind === 'fill')
  const color = pill ? p.onFill : ink, backgroundColor = pill ? ink : null
  const span: Span = { text: cell.ch, role: cell.role }
  if (color !== null) span.color = color
  if (backgroundColor !== null) span.backgroundColor = backgroundColor
  if (cell.role === 'title' || (cell.em ?? 0) & BOLD) span.bold = true
  if ((cell.em ?? 0) & ITALIC) span.italic = true
  if ((p.dim as readonly Ink[]).includes(cell.role)) span.dimColor = true
  return span
}

const sameStyle = (a: Span, b: Span): boolean => a.role === b.role && a.color === b.color
  && a.backgroundColor === b.backgroundColor && a.bold === b.bold && a.italic === b.italic && a.dimColor === b.dimColor

// Each row as spans: cont cells skipped, each missing cell a blank space with no role, neighbours of one role and style
// merged, and trailing blank spans trimmed.
export function toRows(d: Drawing, p: Palette): Rows {
  return d.cells.map(row => {
    const spans: Span[] = []
    for (const cell of row) {
      if (cell?.kind === 'cont') continue
      const s: Span = cell ? cellSpan(cell, p) : { text: ' ' }
      const last = spans[spans.length - 1]
      if (last && sameStyle(last, s)) last.text += s.text
      else spans.push(s)
    }
    while (spans.length > 0 && spans[spans.length - 1]!.role === undefined) spans.pop()
    return spans
  })
}

// A renderer that caches each source's rows, or its Fail, in an LRU of capacity entries keyed by the source, the columns
// and the theme. inner draws a miss; onMiss gets a miss's Fail, and is never called on a hit. Columns that are not drawable
// fail 'bad-columns' uncached, so every key is lossless: JSON.stringify would key ±Infinity and NaN alike, as null.
export function createRenderer(capacity = 64, inner: typeof explain = explain):
  { render(s: string, o: Options, onMiss?: (f: Fail) => void): Rows | Fail; readonly size: number } {
  const cache = createLru<string, Rows | Fail>(capacity)
  return {
    render(s, o, onMiss) {
      if (!drawable(o.columns)) {
        const refused = fail('bad-columns')
        onMiss?.(refused)
        return refused
      }
      const key = JSON.stringify([s, o.columns, o.theme])
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      const v = draw(s, o, inner)
      cache.set(key, v)
      if (isFail(v)) onMiss?.(v)
      return v
    },
    get size() { return cache.size },
  }
}
