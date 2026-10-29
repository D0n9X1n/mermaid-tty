// The diagram registry (plan A §6, A1): each header keyword's diagram type, the types A draws, and their modules.
import type { Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import type { Step } from './fit.ts'
import type { Source } from './source.ts'

export type DiagramType = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'requirement' | 'c4' | 'architecture' | 'gantt'
  | 'pie' | 'xychart' | 'quadrant' | 'journey' | 'sankey' | 'radar' | 'treemap' | 'mindmap' | 'gitGraph' | 'timeline'
  | 'kanban' | 'block' | 'packet' | 'zenuml'

// Every header keyword and alias, and its type. Headers are case-sensitive. null marks an explicit fallback: a keyword
// that is never drawn, though Mermaid reads it.
export const KEYWORDS: Readonly<Record<string, DiagramType | null>> = {
  flowchart: 'flowchart', graph: 'flowchart', 'flowchart-elk': null,
  sequenceDiagram: 'sequence',
  stateDiagram: 'state', 'stateDiagram-v2': 'state',
  classDiagram: 'class', 'classDiagram-v2': 'class',
  erDiagram: 'er',
  requirementDiagram: 'requirement', requirement: null,
  C4Context: 'c4', C4Container: 'c4', C4Component: 'c4', C4Dynamic: 'c4', C4Deployment: 'c4',
  'architecture-beta': 'architecture',
  gantt: 'gantt', pie: 'pie', journey: 'journey', mindmap: 'mindmap', gitGraph: 'gitGraph', timeline: 'timeline', kanban: 'kanban', zenuml: 'zenuml',
  'xychart-beta': 'xychart', xychart: 'xychart',
  quadrantChart: 'quadrant',
  'sankey-beta': 'sankey', sankey: 'sankey',
  'radar-beta': 'radar',
  'treemap-beta': 'treemap', treemap: 'treemap',
  'block-beta': 'block', block: 'block',
  'packet-beta': 'packet', packet: 'packet',
}

// The types A draws; every other type falls back as disabled.
export const ENABLED: ReadonlySet<DiagramType> = new Set<DiagramType>(['flowchart', 'sequence'])

export type DiagramModule<M = unknown> = {
  type: DiagramType
  parse(src: Source): M | Fail
  steps(model: M): readonly Step[]                                  // the type's ladder
  layout(model: M, step: Step, columns: number): Drawing | Fail
}

// Each type's module, filed by register under the module's own type. It starts empty: T19 and T24 register flowchart's
// and sequence's here.
const MODULES: Partial<Record<DiagramType, DiagramModule>> = {}

// Files mod under mod.type, replacing any module filed there before.
export function register(mod: DiagramModule): void { MODULES[mod.type] = mod }

// The module for a header line, named by its first whitespace-separated token less one trailing ':'. Fails with
// 'unknown-type' (no such keyword), 'fallback:<keyword>' (null in KEYWORDS), 'disabled:<type>' (not in ENABLED) or
// 'unregistered:<type>' (no module).
export function lookup(header: string): DiagramModule | Fail {
  const kw = (/\S+/.exec(header)?.[0] ?? '').replace(/:$/, '')
  const type = Object.hasOwn(KEYWORDS, kw) ? KEYWORDS[kw] : undefined
  if (type === undefined) return fail('unknown-type')
  if (type === null) return fail(`fallback:${kw}`)
  if (!ENABLED.has(type)) return fail(`disabled:${type}`)
  return MODULES[type] ?? fail(`unregistered:${type}`)
}
