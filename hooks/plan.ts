// The plugin's own work for one reply: its mode, its fences split out and drawn, and the UI to draw them with.
// No JSX, so node --test can import it.
import { isFail } from '../core/fail.ts'
import { createRenderer, type Rows } from '../core/render.ts'
import { splitFences } from './fences.ts'
import { passThrough, type Mode } from './mode.ts'

const renderer = createRenderer(64)

// planReply, or null when it throws: the hook then sends the reply through next(e) unchanged.
export async function safePlan($: any, e: any, theme: string, mode: () => Promise<Mode>) { try { return await planReply($, e, theme, mode) } catch { return null } }

// The reply's parts, prose and drawn rows, and the UI to draw them with; null when the reply goes through untouched.
// A fallback's debug log is best-effort: a failing log never stops a drawing.
async function planReply($: any, e: any, theme: string, mode: () => Promise<Mode>) {
  const columns = e.viewport?.columns
  if (columns === undefined || passThrough(e.surface, e.props, await mode())) return null
  const log = (reason: string) => { try { void Promise.resolve($.ui.log(`mermaid-tty fallback: ${reason}`, { to: 'debug' })).catch(() => {}) } catch {} }
  const parts: ({ prose: string } | { rows: Rows })[] = []
  for (const s of splitFences(e.props.text)) {
    const r = s.kind === 'mermaid' ? renderer.render(s.body, { columns, theme }, f => log(f.reason)) : null
    if (r && !isFail(r)) parts.push({ rows: r })
    else { const last = parts[parts.length - 1]; if (last && 'prose' in last) last.prose += s.text; else parts.push({ prose: s.text }) }
  }
  if (!parts.some(p => 'rows' in p)) return null
  const { Box, Text } = $.ui.resolve(e)
  return { parts, Box, Text }
}
