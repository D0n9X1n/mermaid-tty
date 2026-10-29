// The graph model from plan A §6: shared by flowchart now; by state, class, ER, requirement, C4 and architecture in C. Types only.
import type { Shape } from '../caps.ts'
import type { Role } from '../themes.ts'

export type Dir = 'TB' | 'BT' | 'LR' | 'RL'
// rows[0] is the header; C's member rows carry their own id (default: the node's).
export type NodeRow = { text: string; role: Role; align: 'center' | 'left'; id?: string }
export type GNode = { id: string; shape: Shape; role: Role; rows: NodeRow[]; order: number }
export type End = 'arrow' | 'circle' | 'cross' | 'none'
export type GEdge = { id: string; from: string; to: string; style: 'solid' | 'dotted' | 'thick' | 'invisible'
  tail: End; head: End; label: string | null; minlen: number; order: number }
export type GCluster = { id: string; title: string | null; dir: Dir | null; nodes: string[]; clusters: string[] }
export type Graph = { dir: Dir; title: string | null; nodes: GNode[]; edges: GEdge[]; clusters: GCluster[] }
