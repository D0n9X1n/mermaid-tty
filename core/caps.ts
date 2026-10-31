// End caps: the glyphs drawn left and right of a pill's label. They show the shape when there is no color.
export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'hcyl'
  | 'circle'
  | 'dcircle'
  | 'diamond'
  | 'hexagon'
  | 'leanR'
  | 'leanL'
  | 'trap'
  | 'trapInv'
  | 'asym'
  | 'bang'
  | 'cloud'
  | 'arrowR'
  | 'arrowL'
  | 'arrowU'
  | 'arrowD'
  | 'plain'

export const CAPS: Readonly<Record<Shape, readonly [string, string]>> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  subroutine: ['[[', ']]'],
  cylinder: ['[(', ')]'],
  hcyl: ['(|', '|)'],
  circle: ['((', '))'],
  dcircle: ['(((', ')))'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  leanR: ['/', '/'],
  leanL: ['\\', '\\'],
  trap: ['/', '\\'],
  trapInv: ['\\', '/'],
  asym: ['>', ']'],
  bang: ['))', '(('],
  cloud: [')', '('],
  arrowR: ['', '►'],
  arrowL: ['◄', ''],
  arrowU: ['▲', ''],
  arrowD: ['', '▼'],
  plain: ['', ''],
}

// flowchart.md's `@{ shape: name }` names for the shapes above, from its table "Complete List of New Shapes"
// (mermaid-js/mermaid 1fb78698). Any other name draws rectangle caps: a miss changes the caps, never the correctness.
const NAMES: readonly (readonly [Shape, readonly string[]])[] = [
  ['rect', ['rect', 'rectangle', 'proc', 'process']],
  ['round', ['rounded', 'event']],
  ['stadium', ['stadium', 'pill', 'terminal']],
  ['subroutine', ['fr-rect', 'framed-rectangle', 'subproc', 'subprocess', 'subroutine']],
  ['cylinder', ['cyl', 'cylinder', 'database', 'db']],
  ['hcyl', ['h-cyl', 'das', 'horizontal-cylinder']],
  ['circle', ['circle', 'circ']],
  ['dcircle', ['dbl-circ', 'double-circle']],
  ['diamond', ['diam', 'diamond', 'decision', 'question']],
  ['hexagon', ['hex', 'hexagon', 'prepare']],
  ['leanR', ['lean-r', 'lean-right', 'in-out']],
  ['leanL', ['lean-l', 'lean-left', 'out-in']],
  ['trap', ['trap-b', 'trapezoid', 'trapezoid-bottom', 'priority']],
  ['trapInv', ['trap-t', 'inv-trapezoid', 'trapezoid-top', 'manual']],
  ['asym', ['odd']],
  ['bang', ['bang']],
  ['cloud', ['cloud']],
]

// A Map, not an object: an object lookup returns inherited members for names like `constructor`, and those must fall
// back to rect like any unknown name.
export const ALIASES: ReadonlyMap<string, Shape> = new Map(
  NAMES.flatMap(([shape, names]) => names.map((n) => [n, shape] as const)),
)

export const shapeFromName = (n: string): Shape => ALIASES.get(n.trim()) ?? 'rect'
