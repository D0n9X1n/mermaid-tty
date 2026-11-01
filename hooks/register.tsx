import type { Register, RenderElement, StateDollar } from 'claude-code'
import type { Rows } from '../core/render.ts'
import { imagesReply, isImages, modeReply, parseModeArgs, type Images, type Mode } from './mode.ts'
import { safePlan } from './plan.ts'

// Draws a terminal reply's closed mermaid fences as colored rows. Prose, and a fence that fails to draw (joined to the
// prose around it), goes through next() unchanged, as does a reply with nothing drawn. A reply that opens on a diagram
// first sends next() an empty block, which draws the reply's bullet. /mermaid-tty source|diagram|text sets the mode,
// kept in $.state; in source mode every reply goes through next() untouched. Where the terminal shows pixels, diagram
// mode draws a fence as an Image of mermaid-cli's PNG once it is rendered (hooks/image.ts); text mode never does.
// /mermaid-tty images auto|on|off sets whether it tries: kept in $.store across sessions and mirrored into $.state,
// which a drawing reads, so a change redraws at once with no restart.
const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const
const IMAGES = { plugin: 'mermaid-tty', key: 'images' } as const
// The value each mode keeps in $.state, as mode() reads it back.
const STORED: Readonly<Record<Mode, true | 'text' | false>> = { source: true, text: 'text', diagram: false }

// The loader follows $ only into top-level functions, so mode lives here. A read while a ui.render hook draws
// subscribes that drawing, so a later set draws it again. The value is true for source, 'text' for text, and anything
// else for diagram.
async function mode($: StateDollar): Promise<Mode> {
  const v = (await $.state.get(SOURCE)).value
  if (v === true) {
    return 'source'
  }

  return v === 'text' ? 'text' : 'diagram'
}

// The picture setting this session holds, auto when unset. A read while drawing subscribes the drawing.
async function images($: StateDollar): Promise<Images> {
  const v = (await $.state.get(IMAGES)).value
  return isImages(v) ? v : 'auto'
}

// The picture setting kept between sessions, auto when unset, unknown or unreadable.
async function storedImages($: any): Promise<Images> {
  try {
    const v = await $.store.get('images')
    return isImages(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

// The picture setting in force: this session's, else the stored one, which is then mirrored into this session.
async function loadImages($: any): Promise<Images> {
  const v = (await $.state.get(IMAGES)).value
  if (isImages(v)) {
    return v
  }

  const kept = await storedImages($)
  await $.state.set(IMAGES, kept)
  return kept
}

export const register: Register = (on, options) => {
  const theme = String(options.theme ?? 'default')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mermaid-tty',
      description:
        'Show Mermaid diagrams as source, diagram or text, with or without pictures: /mermaid-tty [source|diagram|text|images [auto|on|off]]',
    })
    await loadImages($)
    return next(e)
  })

  // CommandRunInput types args as a string, yet $.command.run passes any value as given (undefined when left out);
  // parseModeArgs coerces none of them.
  on('command.run', { command: 'mermaid-tty' }, async ($, e) => {
    const a = parseModeArgs(e.args)
    const cur = await mode($)
    if ('error' in a) {
      return { text: a.error }
    }

    if ('report' in a) {
      return { text: modeReply(cur, false) }
    }

    if ('images' in a) {
      const was = await loadImages($)
      if (a.images === 'report') {
        return { text: imagesReply(was, false) }
      }

      await $.state.set(IMAGES, a.images)
      const kept = await $.store.set('images', a.images).then(
        () => true,
        () => false,
      )
      $.ui.invalidate('ui.render')
      const said = imagesReply(a.images, a.images !== was)
      return { text: kept ? said : `${said} (this session only: the setting was not saved)` }
    }

    await $.state.set(SOURCE, STORED[a.set])
    $.ui.invalidate('ui.render')
    return { text: modeReply(a.set, a.set !== cur) }
  })

  // Fail closed: any error in the plugin's own work (mode, splitting, rendering, the debug log, resolving the UI) sends
  // the reply through next(e) unchanged, so Claude Code draws it as it would without the plugin.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const plan = await safePlan(
      $,
      e,
      theme,
      () => mode($),
      undefined,
      () => images($),
    )
    if (!plan) {
      return next(e)
    }

    const { parts, Box, Text, Image } = plan
    const kids: RenderElement[] = []
    let first = e.props.isFirstOfReply
    let n = 0
    for (const p of parts) {
      if (!('prose' in p) && first) {
        kids.push(await next({ ...e, props: { ...e.props, text: '', isFirstOfReply: true } }))
      } // an empty prose part first keeps the reply's bullet, which Claude Code draws before its first part

      if ('picture' in p) {
        kids.push(
          <Image
            key={`mermaid-${n++}`}
            source={{ png: p.picture.png }}
            columns={p.picture.columns}
            rows={p.picture.rows}
            alt="mermaid diagram"
          />,
        )
      } else if ('rows' in p) {
        kids.push(
          <Box key={`mermaid-${n++}`} flexDirection="column">
            {p.rows.map((row) => (
              <Text wrap="truncate-end">
                {row.map(({ text, role: _r, ...style }) => (
                  <Text {...style}>{text}</Text>
                ))}
              </Text>
            ))}
          </Box>,
        )
      } else {
        kids.push(await next({ ...e, props: { ...e.props, text: p.prose, isFirstOfReply: first } }))
      }

      first = false
    }

    return <Box flexDirection="column">{kids}</Box>
  })
}
