// The graph model from plan A §6: shared by flowchart now; by state, class, ER, requirement, C4 and architecture in C.
// Types only.
import type { Shape } from '../caps.ts'
import type { Piece } from '../text.ts'
import type { Role } from '../themes.ts'

export type Dir = 'TB' | 'BT' | 'LR' | 'RL'
// One aligned member column (members.ts): width cells, its text padded to them; join attaches it to the column before.
// key:
// drawn in its place.
export type Col = { text: string; role: Role; id: string; width: number; join?: Piece['join']; key?: string }
// rows[0] is the header; C's member rows carry their own id (default: the node's). A fixed row, built by members.ts, is
// never re-wrapped: indent cells, then its text, or its cols a gap cell apart; join attaches it to the row before. key:
// a key row.
export type NodeRow = {
  text: string
  role: Role
  align: 'center' | 'left'
  id?: string
  key?: true
  fixed?: boolean
  indent?: number
  join?: Piece['join']
  cols?: readonly Col[]
}
// A mark is a glyph node with no label: start ●, end ◉, choice ◇, and a bar ━ (┃ across) that spans `span` cells across
// the flow.
export type Mark = 'start' | 'end' | 'choice' | 'bar'
// A state note beside its node: its text keeps its <br> breaks. key: drawn in its place.
export type Note = { id: string; text: string; side: 'left' | 'right'; key?: string }
export type GNode = {
  id: string
  shape: Shape
  role: Role
  rows: NodeRow[]
  order: number
  mark?: Mark
  span?: number
  note?: Note
}
// triangle △▽◁▷ by side, diamond ◆, odiamond ◇.
export type End = 'arrow' | 'circle' | 'cross' | 'none' | 'triangle' | 'diamond' | 'odiamond'
// reversed: set only by the layout, on a back edge it drew from `to` to `from` with its ends swapped. tailLabel and
// headLabel label the ends (a cardinality), in endRole, else 'label'; labelKey: the label's key, drawn in its place.
export type GEdge = {
  id: string
  from: string
  to: string
  style: 'solid' | 'dotted' | 'thick' | 'invisible'
  tail: End
  head: End
  label: string | null
  minlen: number
  order: number
  reversed?: true
  tailLabel?: string
  headLabel?: string
  endRole?: Role
  labelKey?: string
}
// frameless: a region that draws no frame of its own, as a state's concurrent regions.
export type GCluster = {
  id: string
  title: string | null
  dir: Dir | null
  nodes: string[]
  clusters: string[]
  frameless?: boolean
}
export type Graph = { dir: Dir; title: string | null; nodes: GNode[]; edges: GEdge[]; clusters: GCluster[] }
