// The plugin's own work for one reply: its mode, its fences split out and drawn, and the UI to draw them with.
// No JSX, so node --test can import it.
import { isFail } from '../core/fail.ts'
import { createRenderer, type Rows } from '../core/render.ts'
import { splitFences } from './fences.ts'
import { createPictures, pictureFor, pictureLook, type Picture, type Pictures } from './image.ts'
import { passThrough, type Mode } from './mode.ts'

const renderer = createRenderer(64), pictures = createPictures()

// planReply, or null when it throws: the hook then sends the reply through next(e) unchanged.
export async function safePlan($: any, e: any, theme: string, mode: () => Promise<Mode>, store: Pictures = pictures) { try { return await planReply($, e, theme, mode, store) } catch { return null } }

// The reply's parts, prose, drawn rows and pictures, and the UI to draw them with; null when the reply goes through
// untouched. A fallback's debug log is best-effort: a failing log never stops a drawing. In diagram mode, where the
// terminal shows pixels, a fence's cached picture stands in for its rows (or for its source, when text cannot draw
// it); a miss queues its render and draws as before. A failing picture lookup is no picture.
async function planReply($: any, e: any, theme: string, mode: () => Promise<Mode>, store: Pictures) {
  const columns = e.viewport?.columns, m = await mode()
  if (columns === undefined || passThrough(e.surface, e.props, m)) return null
  const log = (reason: string) => { try { void Promise.resolve($.ui.log(`mermaid-tty fallback: ${reason}`, { to: 'debug' })).catch(() => {}) } catch {} }
  const segments = splitFences(e.props.text)
  const look = m === 'diagram' && segments.some(s => s.kind === 'mermaid') ? await pictureLook($, store, theme).catch(() => null) : null
  const parts: ({ prose: string } | { rows: Rows } | { picture: Picture })[] = []
  for (const s of segments) {
    let picture: Picture | undefined
    if (s.kind === 'mermaid' && look) try { picture = pictureFor($, store, s.body, look, columns, log) } catch {}
    const r = s.kind === 'mermaid' && !picture ? renderer.render(s.body, { columns, theme }, f => log(f.reason)) : null
    if (picture) parts.push({ picture })
    else if (r && !isFail(r)) parts.push({ rows: r })
    else { const last = parts[parts.length - 1]; if (last && 'prose' in last) last.prose += s.text; else parts.push({ prose: s.text }) }
  }
  if (!parts.some(p => !('prose' in p))) return null
  const { Box, Text, Image } = $.ui.resolve(e)
  return { parts, Box, Text, Image }
}
