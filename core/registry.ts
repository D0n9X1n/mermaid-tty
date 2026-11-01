// The diagram registry: each header keyword's diagram type, the Tier 1 and Tier 2 types, the types drawn, and their
// modules.
import type { Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import type { Step } from './fit.ts'
import type { Source } from './source.ts'

export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'state'
  | 'class'
  | 'er'
  | 'requirement'
  | 'c4'
  | 'architecture'
  | 'gantt'
  | 'pie'
  | 'xychart'
  | 'quadrant'
  | 'journey'
  | 'sankey'
  | 'radar'
  | 'treemap'
  | 'mindmap'
  | 'gitGraph'
  | 'timeline'
  | 'kanban'
  | 'block'
  | 'packet'
  | 'zenuml'

// Every header keyword and alias, and its type. Headers are case-sensitive. null marks an explicit fallback: a keyword
// that is never drawn, though Mermaid reads it.
export const KEYWORDS: Readonly<Record<string, DiagramType | null>> = {
  flowchart: 'flowchart',
  graph: 'flowchart',
  'flowchart-elk': null,
  sequenceDiagram: 'sequence',
  stateDiagram: 'state',
  'stateDiagram-v2': 'state',
  classDiagram: 'class',
  'classDiagram-v2': 'class',
  erDiagram: 'er',
  requirementDiagram: 'requirement',
  requirement: null,
  C4Context: 'c4',
  C4Container: 'c4',
  C4Component: 'c4',
  C4Dynamic: 'c4',
  C4Deployment: 'c4',
  'architecture-beta': 'architecture',
  gantt: 'gantt',
  pie: 'pie',
  journey: 'journey',
  mindmap: 'mindmap',
  gitGraph: 'gitGraph',
  timeline: 'timeline',
  kanban: 'kanban',
  zenuml: 'zenuml',
  'xychart-beta': 'xychart',
  xychart: 'xychart',
  quadrantChart: 'quadrant',
  'sankey-beta': 'sankey',
  sankey: 'sankey',
  'radar-beta': 'radar',
  'treemap-beta': 'treemap',
  treemap: 'treemap',
  'block-beta': 'block',
  block: 'block',
  'packet-beta': 'packet',
  packet: 'packet',
}

// The types C draws. Each has its own core/diagrams/<type>/{parse,layout}.ts, loaded by diagrams/all.ts.
export const TIER1: readonly DiagramType[] = [
  'state',
  'class',
  'er',
  'mindmap',
  'gantt',
  'pie',
  'gitGraph',
  'timeline',
  'journey',
  'xychart',
  'quadrant',
]
// The types not yet drawn: each stays disabled until its fixtures and goldens pass review in the PR that adds it to
// TIER2_PASSED. None has passed in v1.
export const TIER2: readonly DiagramType[] = [
  'requirement',
  'c4',
  'block',
  'architecture',
  'kanban',
  'packet',
  'sankey',
  'treemap',
  'radar',
  'zenuml',
]
export const TIER2_PASSED: readonly DiagramType[] = []

// The types drawn: A's two, Tier 1 and the passed Tier 2 types. Every other type falls back as disabled.
export const ENABLED: ReadonlySet<DiagramType> = new Set<DiagramType>([
  'flowchart',
  'sequence',
  ...TIER1,
  ...TIER2_PASSED,
])

export type DiagramModule<M = unknown> = {
  type: DiagramType
  parse(src: Source): M | Fail
  steps(model: M): readonly Step[] // the type's ladder
  layout(model: M, step: Step, columns: number): Drawing | Fail
}

// Each type's module, filed by register under the module's own type. It starts empty: each type's layout module
// registers itself here on import, and diagrams/all.ts loads each Tier 1 type's.
const MODULES: Partial<Record<DiagramType, DiagramModule>> = {}

// Files mod under mod.type, replacing any module filed there before.
export function register(mod: DiagramModule): void {
  MODULES[mod.type] = mod
}

// The module for a header line, named by its first whitespace-separated token less one trailing ':'. Fails with
// 'unknown-type' (no such keyword), 'fallback:<keyword>' (null in KEYWORDS), 'disabled:<type>' (not in ENABLED) or
// 'unregistered:<type>' (no module).
export function lookup(header: string): DiagramModule | Fail {
  const kw = (/\S+/.exec(header)?.[0] ?? '').replace(/:$/, '')
  const type = Object.hasOwn(KEYWORDS, kw) ? KEYWORDS[kw] : undefined
  if (type === undefined) {
    return fail('unknown-type')
  }

  if (type === null) {
    return fail(`fallback:${kw}`)
  }

  if (!ENABLED.has(type)) {
    return fail(`disabled:${type}`)
  }

  return MODULES[type] ?? fail(`unregistered:${type}`)
}

// The support table: two header rows, then one row per ENABLED type, in ENABLED's order, listing its header keywords in
// KEYWORDS order.
export function supportTable(): string {
  const keywords = (t: DiagramType) =>
    Object.keys(KEYWORDS)
      .filter((k) => KEYWORDS[k] === t)
      .map((k) => `\`${k}\``)
      .join(', ')
  return ['| Type | Header keywords |', '|---|---|', ...[...ENABLED].map((t) => `| \`${t}\` | ${keywords(t)} |`)].join(
    '\n',
  )
}
