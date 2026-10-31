// Every Tier 1 type's module (plan C §4, T40). Importing this file runs each type's layout.ts, which files its module
// with register; render.ts imports it after flowchart's and sequence's modules.
import type { DiagramModule } from '../registry.ts'
import { classDiagram } from './class/layout.ts'
import { er } from './er/layout.ts'
import { gantt } from './gantt/layout.ts'
import { gitGraph } from './gitGraph/layout.ts'
import { journey } from './journey/layout.ts'
import { mindmap } from './mindmap/layout.ts'
import { pie } from './pie/layout.ts'
import { quadrant } from './quadrant/layout.ts'
import { state } from './state/layout.ts'
import { timeline } from './timeline/layout.ts'
import { xychart } from './xychart/layout.ts'

export const TIER1_MODULES: readonly DiagramModule<any>[] = [
  state,
  classDiagram,
  er,
  mindmap,
  gantt,
  pie,
  gitGraph,
  timeline,
  journey,
  xychart,
  quadrant,
]
