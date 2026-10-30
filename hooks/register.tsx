import type { Register, RenderElement, StateDollar } from 'claude-code'
import type { Rows } from '../core/render.ts'
import { modeReply, parseModeArgs, type Mode } from './mode.ts'
import { safePlan } from './plan.ts'

// Draws a terminal reply's closed mermaid fences as colored rows. Prose, and a fence that
// fails to draw (joined to the prose around it), goes through next() unchanged, as does a
// reply with nothing drawn. A reply that opens on a diagram first sends next() an empty
// block, which draws the reply's bullet (D5). /mermaid-tty source|diagram sets the mode,
// kept in $.state; in source mode every reply goes through next() untouched.
const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const

// The loader follows $ only into top-level functions, so mode lives here. A read while a
// ui.render hook draws subscribes that drawing, so a later set draws it again.
async function mode($: StateDollar): Promise<Mode> { return (await $.state.get(SOURCE)).value === true ? 'source' : 'diagram' }

export const register: Register = (on, options) => {
  const theme = String(options.theme ?? 'default')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mermaid-tty', description: 'Show Mermaid diagrams as source or diagram: /mermaid-tty [source|diagram]' })
    return next(e)
  })

  // CommandRunInput types args as a string, yet $.command.run passes any value as given
  // (undefined when left out); parseModeArgs coerces none of them.
  on('command.run', { command: 'mermaid-tty' }, async ($, e) => {
    const a = parseModeArgs(e.args), cur = await mode($)
    if ('error' in a) return { text: a.error }
    if ('report' in a) return { text: modeReply(cur, false) }
    await $.state.set(SOURCE, a.set === 'source'); $.ui.invalidate('ui.render')
    return { text: modeReply(a.set, a.set !== cur) }
  })

  // Fail closed: any error in the plugin's own work (mode, splitting, rendering, the debug log, resolving the UI)
  // sends the reply through next(e) unchanged, so Claude Code draws it as it would without the plugin.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const plan = await safePlan($, e, theme, () => mode($))
    if (!plan) return next(e)
    const { parts, Box, Text } = plan, kids: RenderElement[] = []
    let first = e.props.isFirstOfReply, n = 0
    for (const p of parts) {
      if ('rows' in p && first) kids.push(await next({ ...e, props: { ...e.props, text: '', isFirstOfReply: true } }))  // D5: keep the bullet
      if ('rows' in p) kids.push(<Box key={`mermaid-${n++}`} flexDirection="column">{p.rows.map(row =>
        <Text wrap="truncate-end">{row.map(({ text, role: _r, ...style }) => <Text {...style}>{text}</Text>)}</Text>)}</Box>)
      else kids.push(await next({ ...e, props: { ...e.props, text: p.prose, isFirstOfReply: first } }))
      first = false
    }
    return <Box flexDirection="column">{kids}</Box>
  })
}
