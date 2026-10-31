// The journey module (plan C T65; matrix, journey): under the title, each section's header row in its series ink, then its
// tasks, indented 2: the name, a 10-cell bar of the score out of 5, the score as written, and the actors. A task's bar and
// score sit on its first row; its wrapped name and its actor rows run down from there.
// It registers itself on import, as flowchart's does.
import { createCanvas, type Drawing } from '../../canvas.ts'
import { hbar } from '../../charts/bars.ts'
import { dec } from '../../charts/decimal.ts'
import { eighths } from '../../charts/scale.ts'
import { heading, placed, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap, type Piece } from '../../text.ts'
import type { SeriesKey } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { width } from '../../width.ts'
import { parseJourney, type Journey, type Task } from './parse.ts'

const STEPS: readonly Step[] = ['natural', 'wrap', 'oneActor']
const FIVE = dec(5)
const widest = (xs: readonly string[]): number => Math.max(0, ...xs.map(width))

// A row of a task's actors, actors[from] up to actors[to]: joined by ', ', with a ',' after its last unless that ends the
// list. Its span is the cells it draws.
type Range = readonly [from: number, to: number]
const span = (actors: readonly string[], [from, to]: Range): number =>
  width(actors.slice(from, to).join(', ')) + (to < actors.length ? 1 : 0)

// actors filled greedily into rows at most max cells wide, each broken after a comma; null if one actor alone is wider.
function fill(actors: readonly string[], max: number): Range[] | null {
  const rows: Range[] = []
  for (let k = 0; k < actors.length; k++) {
    const last = rows.at(-1)
    if (last && span(actors, [last[0], k + 1]) <= max) {
      rows[rows.length - 1] = [last[0], k + 1]
    } else if (span(actors, [k, k + 1]) <= max) {
      rows.push([k, k + 1])
    } else {
      return null
    }
  }
  return rows
}

// A task as a step draws it: its name's pieces and its actor rows.
type Block = { pieces: Piece[]; rows: Range[] }
// The rows a block takes: its bar's, the first, and as many more as its name pieces or its actor rows need.
const tall = (b: Block): number => Math.max(b.pieces.length, b.rows.length)

// The blocks of tasks at step, with the widest name piece N and score S; 'too-wide' if a piece or a row overflows its field.
// A task row is N + S + 16 cells, then its actors. natural: names and actor lists whole. wrap: actor lists fill
// columns − N − S − 16 cells. oneActor: one actor a row, and names wrap to columns − S − a − 16 cells, a the widest
// actor, its comma included.
function plan(tasks: readonly Task[], step: Step, columns: number): { blocks: Block[]; N: number; S: number } | Fail {
  const S = widest(tasks.map((t) => t.raw))
  const solo = (t: Task) => t.actors.map((_, k): Range => [k, k + 1])
  const a = Math.max(...tasks.flatMap((t) => solo(t).map((x) => span(t.actors, x))))
  const names = tasks.map((t) => wrap(t.name, step === 'oneActor' ? columns - S - a - 16 : Infinity))
  if (names.some((p) => !p)) {
    return fail('too-wide')
  }
  const N = widest(names.flatMap((p) => p!.map((x) => x.text)))
  const F = columns - N - S - 16
  const blocks: Block[] = []
  for (const [i, t] of tasks.entries()) {
    const rows = step === 'oneActor' ? solo(t) : fill(t.actors, step === 'wrap' ? F : Infinity)
    if (!rows || rows.some((x) => span(t.actors, x) > F)) {
      return fail('too-wide')
    }
    blocks.push({ pieces: names[i]!, rows })
  }
  return { blocks, N, S }
}

// A named group's header rows are its name wrapped at columns (common rule 6), in its series ink, owned by sec<k>. Tasks
// before the first section form a group with no name and no header, which takes s1, so the sections take s2, s3, …
// (shared rule 3). A task row, indented 2: its name pieces padded to N, its bar as caps in its group's ink padded to 10
// cells, its score right-aligned to S, two spaces, then its actor rows, each ', ' and a row's last ',' drawn as caps.
// Any step off the ladder fails 'step'.
function layout(journey: Journey, step: Step, columns: number): Drawing | Fail {
  if (!STEPS.includes(step)) {
    return fail('step')
  }
  const tasks = journey.groups.flatMap((g) => g.tasks)
  const p = plan(tasks, step, columns)
  if (isFail(p)) {
    return p
  }
  const heads = journey.groups.map((g) => (g.name === null ? [] : wrap(g.name, columns)))
  if (heads.some((h) => !h)) {
    return fail('too-wide')
  }
  const { blocks, N, S } = p
  const height = heads.reduce((n, h) => n + h!.length, 0) + blocks.reduce((n, b) => n + tall(b), 0)
  const cv = createCanvas(height, columns, columns)
  const labels: Expect['labels'][number][] = []
  const bars: NonNullable<Expect['bars']>[number][] = []
  // Draws task i, t, in ink from row r, and returns its row count. The separator after actor k is ', ' within a row, ','
  // ending a row that does not end the list, and none after the last actor.
  const task = (t: Task, i: number, r: number, ink: SeriesKey): number => {
    const id = `t${i}`
    const b = blocks[i]!
    const e = eighths(t.score, FIVE, 10)
    b.pieces.forEach((x, j) => cv.text(r + j, 2, x.text, 'label', id, j > 0 ? x.join : undefined))
    cv.cap(r, N + 3, hbar(e).padEnd(10), ink, id)
    cv.text(r, N + S + 14 - width(t.raw), t.raw, 'value', `${id}.v`)
    labels.push(placed(id, t.name, b.pieces, r, 2), {
      owner: `${id}.v`,
      text: t.raw,
      at: { r, c: N + S + 14 - width(t.raw) },
    })
    bars.push({ owner: id, eighths: e, axis: 'h', at: { r, c: N + 3 } })
    b.rows.forEach(([from, to], j) => {
      let c = N + S + 16
      for (let k = from; k < to; k++) {
        const owner = `${id}.a${k}`
        const sep = k === t.actors.length - 1 ? '' : k < to - 1 ? ', ' : ','
        labels.push({ owner, text: t.actors[k]!, at: { r: r + j, c } })
        c += cv.text(r + j, c, t.actors[k]!, 'label', owner)
        cv.cap(r + j, c, sep, 'label', owner)
        c += sep.length
      }
    })
    return tall(b)
  }
  let r = 0
  let i = 0
  let sec = 0
  journey.groups.forEach((g, gi) => {
    const ink = `s${(gi % 8) + 1}` as SeriesKey
    if (g.name !== null) {
      const id = `sec${sec++}`
      heads[gi]!.forEach((x, j) => cv.text(r + j, 0, x.text, ink, id, j > 0 ? x.join : undefined))
      labels.push(placed(id, g.name, heads[gi]!, r, 0))
      r += heads[gi]!.length
    }
    for (const t of g.tasks) {
      r += task(t, i, r, ink)
      i++
    }
  })
  const body = cv.toDrawing({ labels, edges: [], edgeLabels: [], frames: [], bars })
  if (journey.title === null) {
    return body
  }
  const head = heading(journey.title, 'title', 'title', columns)
  return isFail(head) ? head : stack([head, body], columns)
}

export const journey: DiagramModule<Journey> = { type: 'journey', parse: parseJourney, steps: () => STEPS, layout }

register(journey as DiagramModule)
