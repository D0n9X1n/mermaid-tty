import type { Register, RenderElement, StateDollar } from 'claude-code'
import type { Rows } from '../core/render.ts'
import { modeReply, parseModeArgs, type Mode } from './mode.ts'
import { safePlan } from './plan.ts'

// Draws a terminal reply's closed mermaid fences as colored rows. Prose, and a fence that fails to draw (joined to the
// prose around it), goes through next() unchanged, as does a reply with nothing drawn. A reply that opens on a diagram
// first sends next() an empty block, which draws the reply's bullet. /mermaid-tty source|diagram|text sets the mode,
// kept in $.state; in source mode every reply goes through next() untouched. Where the terminal shows pixels, diagram
// mode draws a fence as an Image of mermaid-cli's PNG once it is rendered (hooks/image.ts); text mode never does.
const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const
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

export const register: Register = (on, options) => {
  const theme = String(options.theme ?? 'default')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mermaid-tty',
      description: 'Show Mermaid diagrams as source or diagram: /mermaid-tty [source|diagram]',
    })
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

    await $.state.set(SOURCE, STORED[a.set])
    $.ui.invalidate('ui.render')
    return { text: modeReply(a.set, a.set !== cur) }
  })

  // Fail closed: any error in the plugin's own work (mode, splitting, rendering, the debug log, resolving the UI) sends
  // the reply through next(e) unchanged, so Claude Code draws it as it would without the plugin.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const plan = await safePlan($, e, theme, () => mode($))
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
      } // D5: keep the bullet

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
