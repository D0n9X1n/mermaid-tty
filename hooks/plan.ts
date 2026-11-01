// The plugin's own work for one reply: its mode, its fences split out and drawn, and the UI to draw them with. No JSX,
// so node --test can import it.
import { isFail } from '../core/fail.ts'
import { createRenderer, type Rows } from '../core/render.ts'
import { splitFences } from './fences.ts'
import { createPictures, pictureFor, pictureLook, sweepTemp, type Picture, type Pictures } from './image.ts'
import { passThrough, type Images, type Mode } from './mode.ts'

const renderer = createRenderer(64)
const pictures = createPictures()

// Removes the picture temp dirs this session's renders still hold, and any stale ones; within timeoutMs, quietly. A
// function declaration: the engine's loader follows $ only into one.
export async function sweepPictures($: any, timeoutMs?: number): Promise<void> {
  await sweepTemp($, pictures, timeoutMs)
}

// The picture setting images() answers, auto when it throws, before or after it returns a promise.
async function readImages(images: () => Promise<Images>): Promise<Images> {
  try {
    return await images()
  } catch {
    return 'auto'
  }
}

// planReply, or null when it throws: the hook then sends the reply through next(e) unchanged. images reads the picture
// setting; left out, or failing, it is auto.
export async function safePlan(
  $: any,
  e: any,
  theme: string,
  mode: () => Promise<Mode>,
  store: Pictures = pictures,
  images: () => Promise<Images> = async () => 'auto',
) {
  try {
    return await planReply($, e, theme, mode, store, images)
  } catch {
    return null
  }
}

// The reply's parts, prose, drawn rows and pictures, and the UI to draw them with; null when the reply goes through
// untouched. A fallback's debug log is best-effort: a failing log never stops a drawing. In diagram mode, where the
// terminal shows pixels, a fence's cached picture stands in for its rows (or for its source, when text cannot draw it);
// a miss queues its render and draws as before. A failing picture lookup is no picture. The images setting decides
// whether the terminal must be detected first (auto), is taken as able (on), or gets no picture (off).
async function planReply(
  $: any,
  e: any,
  theme: string,
  mode: () => Promise<Mode>,
  store: Pictures,
  images: () => Promise<Images>,
) {
  const columns = e.viewport?.columns
  const m = await mode()
  if (columns === undefined || passThrough(e.surface, e.props, m)) {
    return null
  }

  const log = (reason: string) => {
    try {
      void Promise.resolve($.ui.log(`mermaid-tty fallback: ${reason}`, { to: 'debug' })).catch(() => {})
    } catch {}
  }
  const segments = splitFences(e.props.text)
  const look =
    m === 'diagram' && segments.some((s) => s.kind === 'mermaid')
      ? await pictureLook($, store, theme, await readImages(images)).catch(() => null)
      : null
  const parts: ({ prose: string } | { rows: Rows } | { picture: Picture })[] = []
  for (const s of segments) {
    let picture: Picture | undefined
    if (s.kind === 'mermaid' && look) {
      try {
        picture = pictureFor($, store, s.body, look, columns, log)
      } catch {}
    }

    const r =
      s.kind === 'mermaid' && !picture ? renderer.render(s.body, { columns, theme }, (f) => log(f.reason)) : null
    if (picture) {
      parts.push({ picture })
    } else if (r && !isFail(r)) {
      parts.push({ rows: r })
    } else {
      const last = parts[parts.length - 1]
      if (last && 'prose' in last) {
        last.prose += s.text
      } else {
        parts.push({ prose: s.text })
      }
    }
  }

  if (!parts.some((p) => !('prose' in p))) {
    return null
  }

  const { Box, Text, Image } = $.ui.resolve(e)
  return { parts, Box, Text, Image }
}
