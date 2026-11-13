import type { Register, RenderElement, StateDollar } from 'claude-code'
import type { Rows } from '../core/render.ts'
import type { ThemeName } from '../core/themes.ts'
import { forkPrompt, isBtw, takesBtw } from './btw.ts'
import type { Picture } from './image.ts'
import {
  directionNote,
  directionReply,
  directionSection,
  imagesReply,
  isDirection,
  isImages,
  isTheme,
  modeReply,
  parseModeArgs,
  themeReply,
  type Direction,
  type Images,
  type Mode,
} from './mode.ts'
import { safePlan, sweepPictures } from './plan.ts'

// Draws a terminal reply's closed mermaid fences as colored rows. Prose, and a fence that fails to draw (joined to the
// prose around it), goes through next() unchanged, as does a reply with nothing drawn. A reply that opens on a diagram
// first sends next() an empty block, which draws the reply's bullet. /mermaid-tty source|diagram|text sets the mode,
// kept in $.state; in source mode every reply goes through next() untouched. Where the terminal shows pixels, diagram
// mode draws a fence as an Image of mermaid-cli's PNG once it is rendered (hooks/image.ts); text mode never does.
// /mermaid-tty images auto|on|off sets whether it tries: kept in $.store across sessions and mirrored into $.state,
// which a drawing reads, so a change redraws at once with no restart. /mermaid-tty theme sets the theme the same way:
// in $.state for this session, and saved as the plugin's theme setting through $.config.set for later ones.
// /mermaid-tty direction LR|TB|off sets, the same way, the flowchart direction a system-prompt section asks Claude to
// write; it never changes how a diagram is drawn. In a terminal session /btw, the side question, is answered here
// (hooks/btw.ts) and shown in a pane that draws its fences as a reply does.
const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const
const IMAGES = { plugin: 'mermaid-tty', key: 'images' } as const
const THEME = { plugin: 'mermaid-tty', key: 'theme' } as const
const DIRECTION = { plugin: 'mermaid-tty', key: 'direction' } as const
// Whether this conversation has not been told the direction in force, its note refused. Kept in $.state, not in the
// module, since a reload (a /config change) starts the module over within the same conversation.
const UNTOLD = { plugin: 'mermaid-tty', key: 'untold' } as const
// The latest /btw answered, which the btw pane shows.
const BTW = { plugin: 'mermaid-tty', key: 'btw' } as const
const BTW_PANE = 'btw'
const SECTION_ID = 'mermaid-tty:flowchart-direction'
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

// The theme a drawing is in: this session's, set by /mermaid-tty theme, else the configured one. A read while drawing
// subscribes the drawing; a failing read is the configured theme.
async function theme($: StateDollar, configured: ThemeName): Promise<ThemeName> {
  try {
    const v = (await $.state.get(THEME)).value
    return isTheme(v) ? v : configured
  } catch {
    return configured
  }
}

// The direction the prompt asks for: this session's, set by /mermaid-tty direction, else the configured one; a failing
// read is the configured one.
async function direction($: StateDollar, configured: Direction): Promise<Direction> {
  try {
    const v = (await $.state.get(DIRECTION)).value
    return isDirection(v) ? v : configured
  } catch {
    return configured
  }
}

// Whether a /config row's owner is this plugin: mermaid-tty, or mermaid-tty@<marketplace> as installed. A plugin whose
// name only starts the same, such as mermaid-tty-extra, is another plugin.
const isOurs = (name: unknown) => name === 'mermaid-tty' || String(name).startsWith('mermaid-tty@')

// Saves one of the plugin's own /config rows, as if the person picked the value there: true once written, false when no
// row is found, a hook or a trusted source refuses it, or the call fails. The row is <plugin>.<field>; the plugin's
// name may carry a marketplace suffix, so the row is found by owner and field, not by a fixed key.
async function saveOption($: any, field: 'theme' | 'direction', value: string): Promise<boolean> {
  try {
    const rows = await $.config.list()
    const suffix = `.${field}`
    const row = rows.find(
      (r: any) =>
        isOurs(r.provider?.plugin) &&
        typeof r.key === 'string' &&
        r.key.endsWith(suffix) &&
        isOurs(r.key.slice(0, -suffix.length)),
    )
    if (!row) {
      return false
    }

    const done = await $.config.set({ key: row.key, value })
    return done.deny === undefined
  } catch {
    return false
  }
}

// Whether the conversation is still owed a direction note; a failing read is not owed, as nothing was refused.
async function isUntold($: StateDollar): Promise<boolean> {
  try {
    return (await $.state.get(UNTOLD)).value === true
  } catch {
    return false
  }
}

// Tells the running thread the direction changed: its system prompt stays as sent, so the change goes in a user row the
// model reads. True once the row is stored; false when a hook refuses it or the call fails, which leaves the setting
// changed but this thread untold.
async function noteDirection($: any, d: Direction): Promise<boolean> {
  try {
    const r = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: directionNote(d) }] } })
    return r?.deny === undefined
  } catch {
    return false
  }
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

// One drawn fence as an element: a picture where one is rendered, else its rows, each row one truncated line.
function fenceElement(p: { rows: Rows } | { picture: Picture }, key: string, ui: any): RenderElement {
  const { Box, Text, Image } = ui
  if ('picture' in p) {
    return (
      <Image
        key={key}
        source={{ png: p.picture.png }}
        columns={p.picture.columns}
        rows={p.picture.rows}
        alt="mermaid diagram"
      />
    )
  }

  return (
    <Box key={key} flexDirection="column">
      {p.rows.map((row) => (
        <Text wrap="truncate-end">
          {row.map(({ text, role: _r, ...style }) => (
            <Text {...style}>{text}</Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export const register: Register = (on, options) => {
  // nord unless the setting names another theme: an unset or unknown value draws in nord, the manifest's default.
  const configured: ThemeName = isTheme(options.theme) ? options.theme : 'nord'
  // LR unless the setting says TB or off: a terminal is wider than it is tall.
  const configuredDirection: Direction = isDirection(options.direction) ? options.direction : 'LR'
  // Whether the theme, or the direction, in force was set by the command but not saved, so asking for it again retries
  // the save. A load starts from the saved options, so it starts saved.
  let isThemeUnsaved = false
  let isDirectionUnsaved = false
  // Whether this session started in the CLI's terminal, where mermaid-tty draws.
  let inTerminal = false
  // How many /btw questions mermaid-tty has taken: a /btw overtaken by a newer one is dropped.
  let asked = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mermaid-tty',
      description:
        'Show Mermaid diagrams as source, diagram or text, in a theme, ' +
        'and set the flowchart direction Claude writes: ' +
        '/mermaid-tty [source|diagram|text|images [auto|on|off]|theme <name>|direction [LR|TB|off]]',
    })
    await loadImages($)
    // Each load starts from the configured theme, so a change in /config, which reloads the module, is never hidden by
    // a theme the command set earlier.
    await $.state.set(THEME, configured)
    isThemeUnsaved = false
    // The same for the direction. A load within a session that already held another one is a /config change, or a
    // command whose save the reload now undoes: the thread's system prompt still has the old section, so the model is
    // told in a row of its own.
    const was = (await $.state.get(DIRECTION)).value
    await $.state.set(DIRECTION, configuredDirection)
    isDirectionUnsaved = false
    // A changed direction is told now; an unchanged one keeps whatever note the conversation is still owed.
    const owed = await isUntold($)
    const untold =
      isDirection(was) && was !== configuredDirection ? !(await noteDirection($, configuredDirection)) : owed
    if (untold !== owed) {
      await $.state.set(UNTOLD, untold)
    }
    // mermaid-tty draws only in the CLI's terminal, so only a terminal session renders pictures or sweeps for them: a
    // desktop or SDK session leaves the temp dir alone. A past session cut short may have left picture temp dirs; sweep
    // them without holding the start up.
    inTerminal = e.surface === 'terminal'
    if (inTerminal) {
      void sweepPictures($)
    }

    return next(e)
  })

  // Nothing of a picture stays on disk once a terminal session closes: its renders' temp dirs go, in flight or left
  // behind, within the end's short bound.
  on('session.end', async ($, e, next) => {
    if (inTerminal) {
      await sweepPictures($, Math.max(100, Math.min(1000, next.budget?.remainingMs ?? 1000)), true)
    }

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

    if ('theme' in a) {
      const was = await theme($, configured)
      if (a.theme === 'report' || (a.theme === was && !isThemeUnsaved)) {
        return { text: themeReply(was, false, !isThemeUnsaved) }
      }

      // The theme in force, asked for again after its save was refused, tries the save again; it is already drawn.
      const changed = a.theme !== was
      if (changed) {
        await $.state.set(THEME, a.theme)
        $.ui.invalidate('ui.render')
      }

      isThemeUnsaved = !(await saveOption($, 'theme', a.theme))
      return { text: themeReply(a.theme, changed, !isThemeUnsaved) }
    }

    if ('direction' in a) {
      const was = await direction($, configuredDirection)
      let untold = await isUntold($)
      if (a.direction === 'report' || (a.direction === was && !isDirectionUnsaved && !untold)) {
        return { text: directionReply(was, false, !isDirectionUnsaved, !untold) }
      }

      // As for the theme: the direction in force, asked for again after its save or its note was refused, tries what
      // failed again.
      const changed = a.direction !== was
      if (changed) {
        await $.state.set(DIRECTION, a.direction)
      }

      if (changed || untold) {
        untold = !(await noteDirection($, a.direction))
        await $.state.set(UNTOLD, untold)
      }

      if (changed || isDirectionUnsaved) {
        isDirectionUnsaved = !(await saveOption($, 'direction', a.direction))
      }

      return { text: directionReply(a.direction, changed, !isDirectionUnsaved, !untold) }
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

  // A section after the engine's own, on the session side of the cache boundary, asks Claude for the configured
  // flowchart direction; off, or a session that draws in no terminal, adds nothing. A failure sends the engine's
  // sections unchanged.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    try {
      const text = e.surfaces.includes('terminal') ? directionSection(await direction($, configuredDirection)) : null
      return text === null ? r : { sections: [...r.sections, { id: SECTION_ID, text, scope: 'session' as const }] }
    } catch {
      return r
    }
  })

  // Fail closed: any error in the plugin's own work (mode, splitting, rendering, the debug log, resolving the UI) sends
  // the reply through next(e) unchanged, so Claude Code draws it as it would without the plugin.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const plan = await safePlan(
      $,
      e,
      await theme($, configured),
      () => mode($),
      undefined,
      () => images($),
    )
    if (!plan) {
      return next(e)
    }

    const { parts, Box } = plan
    const kids: RenderElement[] = []
    let first = e.props.isFirstOfReply
    let n = 0
    for (const p of parts) {
      if (!('prose' in p) && first) {
        kids.push(await next({ ...e, props: { ...e.props, text: '', isFirstOfReply: true } }))
      } // an empty prose part first keeps the reply's bullet, which Claude Code draws before its first part

      if ('prose' in p) {
        kids.push(await next({ ...e, props: { ...e.props, text: p.prose, isFirstOfReply: first } }))
      } else {
        kids.push(fenceElement(p, `mermaid-${n++}`, plan))
      }

      first = false
    }

    return <Box flexDirection="column">{kids}</Box>
  })

  // /btw in a terminal session, outside source mode: the question goes to a fork of this session's transcript, as
  // Claude Code's own /btw sends it, and the answer to the btw pane. The answer adds nothing to the conversation: no
  // output row, no context. The fork is awaited here, so whatever comes back but an answer hands /btw to Claude Code,
  // which runs it as if mermaid-tty were not installed; a cancelled one shows nothing. Claude Code shows the command as
  // running meanwhile, and the prompt stays free. The pane opens from this hook, which answers the person's command, so
  // it is placed at any width wherever the surface places panes.
  on('command.run', { command: 'btw' }, async ($, e, next) => {
    let takes: boolean
    try {
      takes = takesBtw(e.args, inTerminal, await mode($))
    } catch {
      takes = false
    }

    if (!takes) {
      return next(e)
    }

    // Only the newest /btw may still act once it has waited: an older one, overtaken while its fork or its open ran,
    // ends with nothing, so it neither hands an obsolete question to Claude Code nor closes the newer answer's pane.
    const mine = ++asked
    const isStale = () => mine !== asked
    const giveUp = async (closePane: boolean) => {
      if (isStale()) {
        return {}
      }

      if (closePane) {
        await $.ui.close({ id: BTW_PANE }).catch(() => {})
      }

      return isStale() ? {} : next(e)
    }
    let answer: string
    try {
      const r = await $.model.fork({ prompt: forkPrompt(e.args) })
      if (!r.isAnswered) {
        return r.reason === 'aborted' ? {} : giveUp(false)
      }

      answer = r.text
    } catch {
      return giveUp(false)
    }

    if (isStale()) {
      return {}
    }

    // An answer nobody would see is no answer: a pane the surface does not place, or an open that fails, closes the
    // pane again and hands /btw to Claude Code.
    try {
      await $.state.set(BTW, { question: e.args.trim(), text: answer })
      const opened = await $.ui.open({ id: BTW_PANE, title: 'btw', focus: true, closeOnEscape: true })
      if (opened.isPlaced) {
        return {}
      }
    } catch {}

    return giveUp(true)
  })

  // The btw pane: the question, dim, and under it the answer, drawn as a reply is: each fence that draws as a diagram
  // or a picture, the prose between as markdown. In source mode, or when nothing draws or the drawing fails, the whole
  // answer is one markdown block. The answer is read while drawing, so a newer one redraws the pane.
  on('ui.render', { component: 'Pane', requestId: BTW_PANE }, async ($, e, next) => {
    const v = e.surface === 'terminal' ? (await $.state.get(BTW)).value : undefined
    if (!isBtw(v)) {
      return next(e)
    }

    // The answer is drawn as a reply at the pane's body width: the plan reads the reply's surface, text and columns.
    const reply = {
      ...e,
      viewport: { ...e.viewport, columns: e.props.bodyColumns },
      props: { ...e.props, text: v.text },
    }
    const plan = await safePlan(
      $,
      reply,
      await theme($, configured),
      () => mode($),
      undefined,
      () => images($),
    )
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const parts = plan ? plan.parts : [{ prose: v.text }]
    let n = 0
    return (
      <Box flexDirection="column">
        <Box key="btw-question">
          <Text dimColor>{`/btw ${v.question}`}</Text>
        </Box>
        {parts.map((p, i) =>
          'prose' in p ? <Markdown key={`prose-${i}`} text={p.prose} /> : fenceElement(p, `mermaid-${n++}`, plan!),
        )}
      </Box>
    )
  })
}
