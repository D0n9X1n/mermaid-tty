// The quadrant module: a frame split by a cross into four quadrants, each its text centered in a title row over five
// point rows; each point a key in its cell; the axis texts around the frame; then the legend. It registers itself on
// import, as flowchart's does.
import { createCanvas, type Drawing } from '../../canvas.ts'
import { dec, floor, mul } from '../../charts/decimal.ts'
import { fieldKey, legendRows, pointKey, type LegendRow } from '../../charts/legend.ts'
import { heading, placed, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { junction } from '../../glyphs.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap } from '../../text.ts'
import { width } from '../../width.ts'
import { parseQuadrant, type Point, type Quadrant } from './parse.ts'

// A cell of the plot box. Its rows: the top border 0, the top half's title row 1 and point rows 2…6, the cross 7, the
// bottom half's title row 8 and point rows 9…13, the bottom border 14, then the x-axis texts' row 15. Its columns: the
// left border 0, the left half 1…q, the cross q + 1, the right half q + 2…2q + 1, the right border 2q + 2.
type Spot = { r: number; c: number }
const BOX = 15

// A point's cell: its column min(2q − 1, ⌊2q·x⌋) and its row min(9, ⌊10·y⌋) from the bottom, in exact decimals.
function spot(p: Point, q: number): Spot {
  const x = Math.min(2 * q - 1, floor(mul(dec(2 * q), p.x.value)))
  const y = Math.min(9, floor(mul(dec(10), p.y.value)))
  return { r: y >= 5 ? 11 - y : 13 - y, c: x < q ? x + 1 : x + 2 }
}

// A point key: its text, its first point's cell, from which it draws rightward, and the indices of the points it stands
// for.
type Key = { text: string; at: Spot; points: number[] }

// Points take keys in source order. A point whose key would sit in an existing key's cells, or next to them on its row,
// joins the lowest such key; any other takes the next key.
function group(spots: readonly Spot[]): Key[] {
  const keys: Key[] = []
  spots.forEach((s, i) => {
    const w = width(pointKey(keys.length))
    const k = keys.find((k) => k.at.r === s.r && s.c <= k.at.c + width(k.text) && s.c + w >= k.at.c)
    if (k) {
      k.points.push(i)
    } else {
      keys.push({ text: pointKey(keys.length), at: s, points: [i] })
    }
  })
  return keys
}

// Each point's key text, in source order.
function owned(keys: readonly Key[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    for (const i of k.points) {
      out[i] = k.text
    }
  }

  return out
}

// Whether a key runs into the cross or the frame: past the last cell of the half it starts in.
const collides = (k: Key, q: number): boolean => k.at.c + width(k.text) - 1 > (k.at.c <= q ? q : 2 * q + 1)

// The frame's own cell at (r, c) redrawn as the joint dirs, where the cross meets the top or bottom border.
// canvas.frame draws only corners and straight runs, and a divider's line there would break the frame (validate,
// frames), so the cell stays the frame's.
function tee(d: Drawing, r: number, c: number, dirs: number): void {
  const cell = d.cells[r]![c]!
  d.cells[r]![c] = { ...cell, ch: junction(dirs, 'light'), dirs }
}

// The plot box, q cells a half, then the x-axis texts' row when the source gives any. keyed draws each quadrant and
// x-axis text as its field key, fieldKey(i) for fields[i]. cells are the points' cells, in source order. Each point key
// is drawn once, owned by every point it stands for, and each point's key entry carries its own cell as at, which stack
// moves with the box. 'key-collision' if a key would run into the cross or the frame.
function plot(
  m: Quadrant,
  cells: readonly Spot[],
  keys: readonly Key[],
  q: number,
  keyed: boolean,
  columns: number,
): Drawing | Fail {
  if (keys.some((k) => collides(k, q))) {
    return fail('key-collision')
  }

  const cv = createCanvas(BOX + (m.x ? 1 : 0), 2 * q + 3, columns)
  const mid = q + 1
  const right = 2 * q + 2
  cv.frame(0, 0, BOX - 1, right, 'frame', 'plot')
  for (let c = 0; c <= right; c++) {
    let dirs = 10
    if (c === 0) {
      dirs = 7
    } else if (c === right) {
      dirs = 13
    }

    cv.line(7, c, dirs, 'light', 'frame', 'plot.1')
  }

  for (let r = 1; r < BOX - 1; r++) {
    cv.line(r, mid, 5, 'light', 'frame', 'plot.2')
  }

  const labels: { owner: string; text: string; at?: Spot }[] = []
  const keyAt = new Map<string, Spot>()
  // A field's text, or its key: drawn at column c of row r, or centered in the half from column c when centered. Either
  // states its cell, so a quadrant's text stays in its quadrant and an axis text at its end.
  const field = (owner: string, s: string, r: number, c: number, centered: boolean) => {
    const i = m.fields.findIndex((f) => f.owner === owner)
    const key = keyed ? fieldKey(i) : null
    const w = width(key ?? s)
    const at = centered ? c + Math.floor((q - w) / 2) : c
    if (key === null) {
      cv.text(r, at, s, 'label', owner)
      labels.push({ owner, text: s, at: { r, c: at } })
    } else {
      cv.key(r, at, key, 'label', owner, false)
      keyAt.set(owner, { r, c: at })
    }
  }
  // quadrant-1 top right, 2 top left, 3 bottom left, 4 bottom right.
  const places: readonly Spot[] = [
    { r: 1, c: mid + 1 },
    { r: 1, c: 1 },
    { r: 8, c: 1 },
    { r: 8, c: mid + 1 },
  ]
  m.quads.forEach((s, k) => {
    if (s !== null) {
      field(`q${k + 1}`, s, places[k]!.r, places[k]!.c, true)
    }
  })
  if (m.x) {
    field('x0', m.x[0], BOX, 1, false)
    if (m.x[1] !== null) {
      field('x1', m.x[1], BOX, mid + 1, false)
    }
  }

  for (const k of keys) {
    cv.key(
      k.at.r,
      k.at.c,
      k.text,
      's1',
      k.points.map((i) => `p${i}`),
      false,
    )
  }

  const of = owned(keys)
  const fieldKeys = keyed
    ? m.fields.map((f, i) => ({ key: fieldKey(i), item: f.owner, cls: 'field', at: keyAt.get(f.owner)! }))
    : []
  const pointKeys = cells.map((at, i) => ({ key: of[i]!, item: `p${i}`, cls: 'point', at }))
  const keyable = [
    ...m.points.map((_, i) => ({ item: `p${i}`, cls: 'point' })),
    ...m.fields.map((f) => ({ item: f.owner, cls: 'field' })),
  ]
  const d = cv.toDrawing({
    labels,
    edges: [],
    edgeLabels: [],
    frames: ['plot'],
    keys: [...fieldKeys, ...pointKeys],
    keyable,
  })
  tee(d, 0, mid, 14)
  tee(d, BOX - 1, mid, 11)
  return d
}

// The legend's rows, in the source order of their statements: a keyed field's `key text`, owned by the field, and each
// point's `key name (x, y)`, its coordinates as written. Fields of one x-axis line keep their order, left then right.
function legend(m: Quadrant, keys: readonly Key[], keyed: boolean): LegendRow[] {
  const of = owned(keys)
  const fields = keyed
    ? m.fields.map((f, i) => ({
        n: f.n,
        row: {
          key: fieldKey(i),
          keyInk: 'label',
          item: f.owner,
          cls: 'field',
          parts: [{ text: f.text, ink: 'label', owner: f.owner }],
        } as LegendRow,
      }))
    : []
  const points = m.points.map((p, i) => ({
    n: p.n,
    row: {
      key: of[i]!,
      keyInk: 's1',
      item: `p${i}`,
      cls: 'point',
      parts: [
        { text: p.name, ink: 'label', owner: `p${i}` },
        { text: `(${p.x.raw}, ${p.y.raw})`, ink: 'value', owner: `p${i}.v` },
      ],
    } as LegendRow,
  }))
  return [...fields, ...points].sort((a, b) => a.n - b.n).map((x) => x.row)
}

// glyph, then text wrapped at columns − 2 under it, owned by owner: a y-axis text's rows, which wrap like header rows.
// The glyph and text state their cells. 'word-too-wide' if a word is wider than its field.
function arrowed(glyph: string, text: string, owner: string, columns: number): Drawing | Fail {
  const ps = wrap(text, columns - 2)
  if (!ps) {
    return fail('word-too-wide')
  }

  const cv = createCanvas(ps.length, 2 + Math.max(0, ...ps.map((p) => width(p.text))), columns)
  cv.cap(0, 0, glyph, 'label', owner)
  ps.forEach((p, r) => cv.text(r, 2, p.text, 'label', owner, r > 0 ? p.join : undefined))
  return cv.toDrawing({
    labels: [placed(owner, text, ps, 0, 2)],
    edges: [],
    edgeLabels: [],
    frames: [],
    glyphs: [{ owner, ch: glyph, at: { r: 0, c: 0 } }],
  })
}

// natural: every quadrant and x-axis text in place, and 'too-wide' if one is wider than q. keyed: each is its field
// key. q = min(30, ⌊(columns − 3)/2⌋), and q < 8 fails 'too-wide'. Any other step fails 'step'.
function layout(m: Quadrant, step: Step, columns: number): Drawing | Fail {
  if (step !== 'natural' && step !== 'keyed') {
    return fail('step')
  }

  const q = Math.min(30, Math.floor((columns - 3) / 2))
  const keyed = step === 'keyed'
  if (q < 8 || (!keyed && m.fields.some((f) => width(f.text) > q))) {
    return fail('too-wide')
  }

  const cells = m.points.map((p) => spot(p, q))
  const keys = group(cells)
  const [bottom, top] = m.y ?? [null, null]
  const rows = legend(m, keys, keyed)
  const parts: (Drawing | Fail | null)[] = [
    m.title === null ? null : heading(m.title, 'title', 'title', columns),
    top ? arrowed('↑', top, 'y1', columns) : null,
    plot(m, cells, keys, q, keyed, columns),
    bottom ? arrowed('↓', bottom, 'y0', columns) : null,
    rows.length > 0 ? legendRows(rows, columns) : null,
  ]
  const drawn: Drawing[] = []
  for (const p of parts) {
    if (isFail(p)) {
      return p
    }

    if (p) {
      drawn.push(p)
    }
  }

  return stack(drawn, columns)
}

export const quadrant: DiagramModule<Quadrant> = {
  type: 'quadrant',
  parse: parseQuadrant,
  steps: () => ['natural', 'keyed'],
  layout,
}

register(quadrant as DiagramModule)
