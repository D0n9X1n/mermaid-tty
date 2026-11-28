// The plugin's own work for one reply: its mode, its fences split out and drawn, and the UI to draw them with. No JSX,
// so node --test can import it.
import { isFail } from '../core/fail.ts'
import { createRenderer, type Rows } from '../core/render.ts'
import { splitFences } from './fences.ts'
import {
  COMPACT,
  createPictures,
  fit,
  FULL_SIZE,
  pictureFor,
  pictureLook,
  pngSize,
  sweepTemp,
  type Picture,
  type Pictures,
} from './image.ts'
import { passThrough, type Crossings, type Images, type Mode, type Size } from './mode.ts'

const renderer = createRenderer(64)

// The most a reply's drawing holds: characters of drawn rows and prose, and elements. Claude Code draws at most 100,000
// characters of a drawing and drops the rest, and draws none of one past 20,000 elements, so a reply past either would
// show in part or not at all; it goes through as its source instead, whole. Each margin leaves room for what is drawn
// around the reply's own parts, as a /btw row's frame and question line, which the caller counts in as around.
export const DRAWN_CHARS = 90_000
export const DRAWN_NODES = 15_000

// Whether parts, with around characters drawn beside them, fit what Claude Code draws. A drawn row is a Text of one
// Text per run of a color, each holding its string; a picture is an image, not text, and one element.
export function fitsDrawing(parts: readonly ({ prose: string } | { rows: Rows } | { picture: Picture })[], around = 0) {
  let chars = around
  let nodes = 1
  for (const p of parts) {
    if ('prose' in p) {
      chars += p.prose.length
      nodes += 2
    } else if ('rows' in p) {
      nodes += 1
      for (const row of p.rows) {
        nodes += 2 + 2 * row.length
        chars += row.reduce((n, c) => n + c.text.length, 0)
      }
    } else {
      nodes += 1
    }
  }

  return chars <= DRAWN_CHARS && nodes <= DRAWN_NODES
}
const pictures = createPictures()

// Removes the picture temp dirs this session's renders still hold, and any stale ones; within timeoutMs, quietly. At
// the session's end (ending) it also stops new renders and takes the dirs still being made. A function declaration:
// the engine's loader follows $ only into one.
export async function sweepPictures($: any, timeoutMs?: number, ending = false): Promise<void> {
  await sweepTemp($, pictures, timeoutMs, ending)
}

// The picture setting images() answers, auto when it throws, before or after it returns a promise.
async function readImages(images: () => Promise<Images>): Promise<Images> {
  try {
    return await images()
  } catch {
    return 'auto'
  }
}

// The crossings setting crossings() answers, on when it throws, before or after it returns a promise.
async function readCrossings(crossings: () => Promise<Crossings>): Promise<Crossings> {
  try {
    return await crossings()
  } catch {
    return 'on'
  }
}

// The size size() answers, compact when it throws, before or after it returns a promise.
async function readSize(size: () => Promise<Size>): Promise<Size> {
  try {
    return await size()
  } catch {
    return 'compact'
  }
}

// A picture shown at size: the same PNG, its box worked out again from its own width and height at that size's density.
// The PNG is rendered once at its natural size and the terminal scales it into the box, so a size never renders again.
function sized(p: Picture, size: Size, columns: number): Picture {
  const px = pngSize(p.png)
  const box = px ? fit(px.width, px.height, columns, size === 'full' ? FULL_SIZE : COMPACT) : null
  return box ? { ...p, ...box } : p
}

// planReply, or null when it throws: the hook then sends the reply through next(e) unchanged. images reads the picture
// setting; left out, or failing, it is auto. crossings reads whether crossing lines are colored apart; left out, on.
// size reads how large a picture is shown; left out, full, the size a picture was always shown at. around is how many
// characters the caller draws beside the reply, counted against what Claude Code draws (fitsDrawing).
export async function safePlan(
  $: any,
  e: any,
  theme: string,
  mode: () => Promise<Mode>,
  store: Pictures = pictures,
  images: () => Promise<Images> = async () => 'auto',
  crossings: () => Promise<Crossings> = async () => 'on',
  size: () => Promise<Size> = async () => 'full',
  around = 0,
) {
  try {
    return await planReply($, e, theme, mode, store, images, crossings, size, around)
  } catch {
    return null
  }
}

// The reply's parts, prose, drawn rows and pictures, and the UI to draw them with; null when the reply goes through
// untouched. A fallback's debug log is best-effort: a failing log never stops a drawing. In diagram mode, where the
// terminal shows pixels, a fence's cached picture stands in for its rows (or for its source, when text cannot draw it);
// a miss queues its render and draws as before. A failing picture lookup is no picture. The images setting decides
// whether the terminal must be detected first (auto), is taken as able (on), or gets no picture (off). The crossings
// setting decides whether crossing lines are colored apart, and the size how large a picture is shown.
async function planReply(
  $: any,
  e: any,
  theme: string,
  mode: () => Promise<Mode>,
  store: Pictures,
  images: () => Promise<Images>,
  crossings: () => Promise<Crossings>,
  size: () => Promise<Size>,
  around: number,
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
  const colored = segments.some((s) => s.kind === 'mermaid') ? (await readCrossings(crossings)) !== 'off' : true
  const look =
    m === 'diagram' && segments.some((s) => s.kind === 'mermaid')
      ? await pictureLook($, store, theme, await readImages(images)).catch(() => null)
      : null
  const shown = look ? await readSize(size) : 'full'
  const parts: ({ prose: string } | { rows: Rows } | { picture: Picture })[] = []
  for (const s of segments) {
    let picture: Picture | undefined
    if (s.kind === 'mermaid' && look) {
      try {
        picture = pictureFor($, store, s.body, look, columns, log)
      } catch {}
    }

    const r =
      s.kind === 'mermaid' && !picture
        ? renderer.render(s.body, { columns, theme, crossings: colored }, (f) => log(f.reason))
        : null
    if (picture) {
      parts.push({ picture: sized(picture, shown, columns) })
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

  if (!fitsDrawing(parts, around)) {
    log(`drawing passes the ${DRAWN_CHARS} characters or ${DRAWN_NODES} elements Claude Code draws`)
    return null
  }

  const { Box, Text, Image } = $.ui.resolve(e)
  return { parts, Box, Text, Image }
}
