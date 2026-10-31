// The mindmap module (plan C T77; matrix, mindmap): the root leftmost, each child group to its parent's right, the
// first
// child on its parent's first row and the rest on a │ trunk; narrower, the groups pack, the labels wrap, then an
// indented
// outline. Each connector is the line cells of an edge m<k>:link from node k's parent to it, which the validator
// traces, so
// a node drawn under the wrong parent fails. It registers itself on import.
import { createCanvas, type Canvas, type Drawing } from '../../canvas.ts'
import { CAPS } from '../../caps.ts'
import { heading, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap, type Piece } from '../../text.ts'
import type { Ink, SeriesKey } from '../../themes.ts'
import { validate } from '../../validate.ts'
import { width } from '../../width.ts'
import { parseMindmap, type Mindmap, type MNode } from './parse.ts'

// A node as drawn: its label's rows (wrap's pieces, a later line's first joining '\n'), its pill's width, caps
// included,
// the rows its subtree takes, its ink, its children, its parent and its next sibling.
type Pill = {
  node: MNode
  depth: number
  ink: Ink
  rows: Piece[]
  width: number
  sub: number
  kids: Pill[]
  parent: Pill | null
  next: Pill | null
}
// A pill's top-left cell.
type At = { p: Pill; r: number; c: number }

const series = (n: number): SeriesKey => `s${(n % 8) + 1}` as SeriesKey
const link = (p: Pill): string => `m${p.node.k}:link`

// The pills of node's subtree, the i-th child of parent, labels wrapped at max; 'too-wide' if a word is wider than max.
// The root inks node; under colorBy branch each top-level branch the next series, under depth each depth its own.
function pills(m: Mindmap, node: MNode, parent: Pill | null, i: number, max: number): Pill | Fail {
  const depth = parent ? parent.depth + 1 : 0
  const ink: Ink = !parent ? 'node' : m.colorBy === 'depth' ? series(depth - 1) : depth === 1 ? series(i) : parent.ink
  const rows: Piece[] = []
  for (const [j, line] of node.lines.entries()) {
    const ps = wrap(line, max)
    if (!ps) {
      return fail('too-wide')
    }

    ps.forEach((p, n) => rows.push(n > 0 ? p : { text: p.text, join: j > 0 ? '\n' : '' }))
  }

  const [l, r] = CAPS[node.shape]
  const inner = Math.max(...rows.map((p) => width(p.text)))
  const pill: Pill = {
    node,
    depth,
    ink,
    rows,
    width: l.length + r.length + 2 + inner,
    sub: 0,
    kids: [],
    parent,
    next: null,
  }
  for (const [n, child] of node.children.entries()) {
    const kid = pills(m, child, pill, n, max)
    if (isFail(kid)) {
      return kid
    }

    const prev = pill.kids.at(-1)
    if (prev) {
      prev.next = kid
    }

    pill.kids.push(kid)
  }

  pill.sub = Math.max(
    rows.length,
    pill.kids.reduce((s, k) => s + k.sub, 0),
  )
  return pill
}

// A pill at (r, c): on each row its caps, a pad cell each side and its text, all owned by m<k> in its ink.
function drawPill(cv: Canvas, { p, r, c }: At): void {
  const [l, rc] = CAPS[p.node.shape]
  const id = `m${p.node.k}`
  const inner = p.width - l.length - rc.length - 2
  p.rows.forEach((piece, j) => {
    cv.cap(r + j, c, l, p.ink, id)
    cv.fill(r + j, c + l.length, 1, p.ink, id)
    const w = cv.text(r + j, c + l.length + 1, piece.text, p.ink, id, j > 0 ? piece.join : undefined)
    cv.fill(r + j, c + l.length + 1 + w, inner - w + 1, p.ink, id)
    cv.cap(r + j, c + p.width - rc.length, rc, p.ink, id)
  })
}

// The link into child p, as line cells (r, c, dirs): in p's ink, owned by p's link, so the validator traces it from p's
// parent to p. Siblings' links share their trunk cells, which merge into ┬, │ and ├.
const con = (cv: Canvas, p: Pill, path: readonly (readonly [number, number, number])[]): void =>
  path.forEach(([r, c, dirs]) => cv.line(r, c, dirs, 'light', p.ink, link(p)))
// The cells (r, c, dirs) of a straight run from (r, c): n cells across (10, ─) or down (5, │).
const across = (r: number, c: number, n: number) => Array.from({ length: n }, (_, i) => [r, c + i, 10] as const)
const down = (r: number, c: number, n: number) => Array.from({ length: n }, (_, i) => [r + i, c, 5] as const)

// The tree: the root at (0, 0); each child group starts 3 columns past its column, the first child on its parent's
// first
// row under ─── or ─┬─, the rest under ├─ or └─ on a │ trunk below the ┬, each after the subtrees above it. natural: a
// depth's column is as wide as its widest pill, and connectors stretch to the next; compact: right after the parent.
function tree(cv: Canvas | null, root: Pill, step: 'natural' | 'compact'): number {
  const widest: number[] = []
  const start = [0]
  const measure = (p: Pill): void => {
    widest[p.depth] = Math.max(widest[p.depth] ?? 0, p.width)
    p.kids.forEach(measure)
  }
  measure(root)
  for (let d = 1; d < widest.length; d++) {
    start[d] = start[d - 1]! + widest[d - 1]! + 3
  }

  let right = 0
  const place = (p: Pill, r: number, c: number): void => {
    if (cv) {
      drawPill(cv, { p, r, c })
    }

    right = Math.max(right, c + p.width)
    const e = c + p.width
    const kc = step === 'natural' ? start[p.depth + 1]! : e + 3
    const t = kc - 2
    let rr = r
    p.kids.forEach((kid, i) => {
      // ─── into a lone child; else ─┬─ into the first, and ─┐, the │ trunk, └─ into each later one.
      if (cv) {
        con(
          cv,
          kid,
          p.kids.length === 1 || i === 0
            ? across(r, e, kc - e)
            : [...across(r, e, t - e), [r, t, 12], ...down(r + 1, t, rr - r - 1), [rr, t, 3], [rr, t + 1, 10]],
        )
      }

      place(kid, rr, kc)
      rr += kid.sub
    })
  }
  place(root, 0, 0)
  return right
}

// The outline: the root, then each node in preorder on its own rows, at 3 columns per depth below the root's children:
// │ or blank per ancestor below the root, by whether a sibling follows it, then ├─ or └─, a continuation row │ or
// blank.
function outline(cv: Canvas | null, root: Pill): number {
  let right = 0
  let r = 0
  const below = new Map<Pill, number>() // each pill's first row past its own rows
  const visit = (p: Pill): void => {
    const c = p.depth === 0 ? 0 : 3 * (p.depth - 1) + 2
    // The link: from the row below its parent, │ down its column to └─ on its own row; a later sibling's makes it ├ and
    // the
    // │ beside this subtree's rows.
    if (cv && p.parent) {
      con(cv, p, [...down(below.get(p.parent)!, c - 2, r - below.get(p.parent)!), [r, c - 2, 3], [r, c - 1, 10]])
    }

    if (cv) {
      drawPill(cv, { p, r, c })
    }

    below.set(p, r + p.rows.length)
    right = Math.max(right, c + p.width)
    r += p.rows.length
    p.kids.forEach(visit)
  }
  visit(root)
  return right
}

// The drawing of one form at one wrap width, the title stacked above: 'too-wide' for a word wider than max or a row
// wider
// than columns.
function draw(m: Mindmap, form: 'natural' | 'compact' | 'outline', max: number, columns: number): Drawing | Fail {
  const root = pills(m, m.root, null, 0, max)
  if (isFail(root)) {
    return root
  }

  const lay = (cv: Canvas | null) => (form === 'outline' ? outline(cv, root) : tree(cv, root, form))
  const w = lay(null)
  if (w > columns) {
    return fail('too-wide')
  }

  const all: Pill[] = []
  const gather = (p: Pill): void => {
    all.push(p)
    p.kids.forEach(gather)
  }
  gather(root)
  // Each child's link, an edge from its parent with no end mark; siblings' links, and only theirs, may share a line
  // cell.
  const kids = all.filter((p) => p.parent)
  const from = new Map(kids.map((p) => [link(p), `m${p.parent!.node.k}`]))
  const shares = (a: string, b: string) => from.has(a) && from.get(a) === from.get(b)
  const cv = createCanvas(
    form === 'outline' ? all.reduce((s, p) => s + p.rows.length, 0) : root.sub,
    w,
    columns,
    shares,
  )
  lay(cv)
  const edges = kids.map((p) => ({
    id: link(p),
    from: from.get(link(p))!,
    to: `m${p.node.k}`,
    ends: [],
    style: 'solid' as const,
  })) // links draw light
  const body = cv.toDrawing({
    labels: all.map((p) => ({ owner: `m${p.node.k}`, text: p.node.lines.join('\n') })),
    edges,
    edgeLabels: [],
    frames: [],
  })
  if (m.title === null) {
    return body
  }

  const head = heading(m.title, 'title', 'title', columns)
  return isFail(head) ? head : stack([head, body], columns)
}

// The first of draw's forms at each width in maxes that validates, or the last one's drawing or Fail.
function first(m: Mindmap, form: 'compact' | 'outline', maxes: readonly number[], columns: number): Drawing | Fail {
  let last: Drawing | Fail = fail('too-wide')
  for (const max of maxes) {
    last = draw(m, form, max, columns)
    if (!isFail(last) && !validate(last)) {
      return last
    }
  }

  return last
}

const WRAPS = [24, 20, 16, 12, 8]

function layout(m: Mindmap, step: Step, columns: number): Drawing | Fail {
  if (step === 'natural' || step === 'compact') {
    return draw(m, step, Infinity, columns)
  }

  if (step === 'wrap') {
    return first(m, 'compact', WRAPS, columns)
  }

  if (step === 'outline') {
    return first(m, 'outline', [Infinity, ...WRAPS], columns)
  }

  return fail('step')
}

export const mindmap: DiagramModule<Mindmap> = {
  type: 'mindmap',
  parse: parseMindmap,
  steps: () => ['natural', 'compact', 'wrap', 'outline'],
  layout,
}

register(mindmap as DiagramModule)
