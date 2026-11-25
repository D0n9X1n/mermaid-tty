import type { Register, RenderElement, StateDollar } from 'claude-code'
import type { Rows } from '../core/render.ts'
import type { ThemeName } from '../core/themes.ts'
import { BTW_STATUS, forkPrompt, isBtw, isWindows, markerPath, takesBtw, usesMarker } from './btw.ts'
import type { Picture } from './image.ts'
import {
  directionNote,
  directionReply,
  directionSection,
  imagesReply,
  crossingsReply,
  isCrossings,
  isSize,
  sizeReply,
  isDirection,
  isImages,
  isTheme,
  modeReply,
  parseModeArgs,
  themeReply,
  type Crossings,
  type Direction,
  type Size,
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
// write; it never changes how a diagram is drawn. /mermaid-tty crossings on|off sets, the same way as the theme,
// whether each edge that crosses another is drawn in a color of its own, and /mermaid-tty size full|compact how large a
// diagram's picture is shown. In a terminal session /btw, the side question, is answered here (hooks/btw.ts) and shown
// in a pane that draws its fences as a reply does.
const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const
const IMAGES = { plugin: 'mermaid-tty', key: 'images' } as const
const THEME = { plugin: 'mermaid-tty', key: 'theme' } as const
const DIRECTION = { plugin: 'mermaid-tty', key: 'direction' } as const
const CROSSINGS = { plugin: 'mermaid-tty', key: 'crossings' } as const
const SIZE = { plugin: 'mermaid-tty', key: 'size' } as const
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

// Whether crossing lines are colored apart: this session's, set by /mermaid-tty crossings, else the configured one. A
// read while drawing subscribes the drawing; a failing read is the configured one.
async function crossings($: StateDollar, configured: Crossings): Promise<Crossings> {
  try {
    const v = (await $.state.get(CROSSINGS)).value
    return isCrossings(v) ? v : configured
  } catch {
    return configured
  }
}

// How large a picture is shown: this session's, set by /mermaid-tty size, else the configured one. A read while drawing
// subscribes the drawing; a failing read is the configured one.
async function size($: StateDollar, configured: Size): Promise<Size> {
  try {
    const v = (await $.state.get(SIZE)).value
    return isSize(v) ? v : configured
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
async function saveOption(
  $: any,
  field: 'theme' | 'direction' | 'crossings' | 'size',
  value: string,
): Promise<boolean> {
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

// Shows a /btw answer in the btw pane; true once the pane is placed. With no answer, a refused store, an open that
// fails or a pane the surface does not place, the pane closes and the answer before it is put back, so the person sees
// the newest answer that showed, or none. Once isStale says a newer /btw arrived, each step left is skipped. A function
// declaration: the engine's loader follows $ only into one.
async function showBtw($: any, isStale: () => boolean, question: string, answer: string | undefined) {
  if (isStale() || answer === undefined) {
    return false
  }

  let before: unknown
  try {
    before = (await $.state.get(BTW)).value
    await $.state.set(BTW, { question, text: answer })
    if (!isStale()) {
      const opened = await $.ui.open({ id: BTW_PANE, title: 'btw', focus: true, closeOnEscape: true })
      if (opened.isPlaced) {
        return true
      }
    }
  } catch {}

  if (!isStale()) {
    await $.ui.close({ id: BTW_PANE }).catch(() => {})
  }

  if (isBtw(before)) {
    await $.state.set(BTW, before).catch(() => {})
  }

  return false
}

// Where the /btw cue is shown: the status row or a marker file at its path, for the /btw it stands for, by number.
type Shown = ({ at: 'row' } | { at: 'marker'; path: string }) & { owner: number }

// This session's marker path, or null where none can be: Windows, no POSIX home, or a session id that names no file.
// With switchedOn, also null unless MERMAID_TTY_BTW_STATUS asks for the marker. Any read that fails means null: the row
// needs nothing but the engine.
async function cueMarker($: any, switchedOn: boolean): Promise<string | null> {
  try {
    const vars = {
      os: await $.env.get('OS'),
      systemRoot: await $.env.get('SystemRoot'),
      windir: await $.env.get('windir'),
    }
    const wanted = switchedOn ? usesMarker(await $.env.get('MERMAID_TTY_BTW_STATUS'), vars) : !isWindows(vars)
    if (!wanted) {
      return null
    }

    return markerPath(await $.env.get('HOME'), await $.session.id())
  } catch {
    return null
  }
}

// Sets the status row, or clears it with undefined; false when the call fails. mermaid-tty sends its row calls in the
// order the cue needs. $.ui.status returns before the hooks beneath it run and says nothing of when they apply a call,
// so a hook of another plugin's that holds one may apply it after a later one: the row is best effort. The sweep in
// syncCue sends another clear as each /btw ends and as a session ends while none is answered, which a show held longer
// can still land after. The marker, a status line's cue, has no such limit: each write is awaited before the next.
function setRow($: any, text: string | undefined): boolean {
  try {
    $.ui.status(text)
    return true
  } catch {
    return false
  }
}

// Shows the cue for owner where this session asks for it, and returns where it went, or null where it could go nowhere.
// A marker that cannot be written leaves the row as the cue, so the person still sees one. A status line reads the
// marker's text, 1 while a /btw is answered, and its age, which each /btw's own write starts again.
async function showCue($: any, owner: number): Promise<Shown | null> {
  const path = await cueMarker($, true)
  if (path !== null) {
    try {
      await $.fs.write(path, '1')
      return { at: 'marker', path, owner }
    } catch {}
  }

  return setRow($, BTW_STATUS) ? { at: 'row', owner } : null
}

// Takes the cue down where showCue put it. There is no file removal, so a marker is emptied, which a status line reads
// as no cue; one that cannot be emptied ages out of the status line. The engine drops a refused status row without a
// word to the plugin, so a row is cleared again whenever no /btw may leave one up: see syncCue's sweep.
async function hideCue($: any, shown: Shown) {
  if (shown.at === 'marker') {
    await Promise.resolve($.fs.write(shown.path, '')).catch(() => {})
    return
  }

  setRow($, undefined)
}

// Takes down whatever a run before this module may have left, as a session starts: the row, and this session's marker
// if one is on disk, the switch on or off, so turning the switch off never strands a marker. No marker is written where
// none was.
async function resetCue($: any) {
  const left = await cueMarker($, false)
  if (left !== null && (await Promise.resolve($.fs.exists(left)).catch(() => false))) {
    await Promise.resolve($.fs.write(left, '')).catch(() => {})
  }

  setRow($, undefined)
}

// The /btw cue's state, one per load of the module. answering is the /btw whose fork the cue stands for, by its number,
// or 0 when none is being answered: only the /btw that set it takes it down, so an older one settling late never hides
// a newer one's cue. shown is where the cue is now and for which /btw; tried, the /btw a show was last tried for;
// turns, the cue's writes, one after another.
type Cues = { answering: number; shown: Shown | null; tried: number; turns: Promise<unknown> }

// Queues one write of the cue, after those before it. The step brings the cue to what answering says when the step
// ends, so a /btw that arrived while a write was under way is caught up at once, and the last step always leaves the
// cue as the newest /btw needs it. A cue shown for an older /btw is taken down and shown again for the newer, so the
// newer one tries its own marker and starts its own age. A show is tried once per /btw, so a session that can show
// nothing never spins. With reset, as a session starts, it first takes down whatever a run before this module may have
// left. With sweep, before Claude Code runs a /btw and as a session ends, a step that finds no /btw answered clears the
// row once more, so one whose clear the engine dropped does not stay up.
async function syncCue($: any, cues: Cues, how?: 'reset' | 'sweep') {
  const step = async () => {
    if (how === 'reset') {
      await resetCue($)
      cues.shown = null
    }

    while (true) {
      const wanted = cues.answering
      if (cues.shown !== null && cues.shown.owner !== wanted) {
        await hideCue($, cues.shown)
        cues.shown = null
      } else if (wanted !== 0 && cues.shown === null && cues.tried !== wanted) {
        cues.tried = wanted
        cues.shown = await showCue($, wanted)
      } else {
        break
      }
    }

    if (how === 'sweep' && cues.answering === 0 && cues.shown === null) {
      setRow($, undefined)
    }
  }
  cues.turns = cues.turns.then(step, step)
  await cues.turns
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
  // On unless the setting says off: crossing lines are colored apart by default.
  const configuredCrossings: Crossings = isCrossings(options.crossings) ? options.crossings : 'on'
  // Compact unless the setting says full: a picture at its natural size takes much of the screen.
  const configuredSize: Size = isSize(options.size) ? options.size : 'compact'
  // Whether the theme, or the direction, in force was set by the command but not saved, so asking for it again retries
  // the save. A load starts from the saved options, so it starts saved.
  let isThemeUnsaved = false
  let isDirectionUnsaved = false
  let isCrossingsUnsaved = false
  let isSizeUnsaved = false
  // Whether this session started in the CLI's terminal, where mermaid-tty draws.
  let inTerminal = false
  // How many /btw questions have arrived: a /btw overtaken by a newer one is dropped.
  let asked = 0
  // The /btw answers shown so far, one after another: each step waits for the one before it to settle.
  let turns: Promise<unknown> = Promise.resolve()
  const inTurn = <T,>(step: () => Promise<T>): Promise<T> => {
    const run = turns.then(step, step)
    turns = run.catch(() => {})
    return run
  }
  // The /btw cue: which /btw it stands for, where it is shown, and its writes (Cues).
  const cues: Cues = { answering: 0, shown: null, tried: 0, turns: Promise.resolve() }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mermaid-tty',
      description:
        'Show Mermaid diagrams as source, diagram or text, in a theme, with crossing lines colored apart, ' +
        'pictures full or compact, ' +
        'and set the flowchart direction Claude writes: ' +
        '/mermaid-tty [source|diagram|text|images [auto|on|off]|theme <name>|direction [LR|TB|off]|' +
        'crossings [on|off]|size [full|compact]]',
    })
    await loadImages($)
    // Each load starts from the configured theme, so a change in /config, which reloads the module, is never hidden by
    // a theme the command set earlier.
    await $.state.set(THEME, configured)
    isThemeUnsaved = false
    // The same for crossings.
    await $.state.set(CROSSINGS, configuredCrossings)
    isCrossingsUnsaved = false
    await $.state.set(SIZE, configuredSize)
    isSizeUnsaved = false
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

    // A session starts with no /btw cue: a reload while one was answered forgets it, so the row and this session's
    // marker are taken down whatever was shown.
    cues.answering = 0
    await syncCue($, cues, 'reset')
    return next(e)
  })

  // Nothing of a picture stays on disk once a terminal session closes: its renders' temp dirs go, in flight or left
  // behind, within the end's short bound.
  on('session.end', async ($, e, next) => {
    // An ending session's /btw is over, /clear's included, which goes on under a new session id with no session.start:
    // each one under way is overtaken, so it neither marks, forks nor shows a pane in the next conversation, and its
    // cue comes down where it was shown, the old session's marker. The cue and the pictures are taken down side by
    // side, so a marker write that is slow to finish never eats into the short time an ending session gives the
    // pictures.
    asked++
    cues.answering = 0
    const pictures = inTerminal
      ? sweepPictures($, Math.max(100, Math.min(1000, next.budget?.remainingMs ?? 1000)), true)
      : Promise.resolve()
    await Promise.all([syncCue($, cues, 'sweep'), pictures])
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

    if ('crossings' in a) {
      const was = await crossings($, configuredCrossings)
      if (a.crossings === 'report' || (a.crossings === was && !isCrossingsUnsaved)) {
        return { text: crossingsReply(was, false, !isCrossingsUnsaved) }
      }

      // As for the theme: the setting in force, asked for again after its save was refused, tries the save again.
      const changed = a.crossings !== was
      if (changed) {
        await $.state.set(CROSSINGS, a.crossings)
        $.ui.invalidate('ui.render')
      }

      isCrossingsUnsaved = !(await saveOption($, 'crossings', a.crossings))
      return { text: crossingsReply(a.crossings, changed, !isCrossingsUnsaved) }
    }

    if ('size' in a) {
      const was = await size($, configuredSize)
      if (a.size === 'report' || (a.size === was && !isSizeUnsaved)) {
        return { text: sizeReply(was, false, !isSizeUnsaved) }
      }

      // As for the theme: the setting in force, asked for again after its save was refused, tries the save again.
      const changed = a.size !== was
      if (changed) {
        await $.state.set(SIZE, a.size)
        $.ui.invalidate('ui.render')
      }

      isSizeUnsaved = !(await saveOption($, 'size', a.size))
      return { text: sizeReply(a.size, changed, !isSizeUnsaved) }
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
      () => crossings($, configuredCrossings),
      () => size($, configuredSize),
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
    // Every /btw is numbered as it arrives, before anything is awaited, the ones Claude Code answers too. Only the
    // newest may still act once it has waited: an older one ends with nothing, so it neither hands an obsolete question
    // to Claude Code nor shows, or takes away, the newer one's answer.
    const mine = ++asked
    const isStale = () => mine !== asked
    let takes: boolean
    try {
      takes = takesBtw(e.args, inTerminal, await mode($))
    } catch {
      takes = false
    }

    if (isStale()) {
      return {}
    }

    // The newest /btw decides the cue: one Claude Code answers takes down any an older fork left before it runs, and
    // one answered here shows it before its fork starts.
    cues.answering = takes ? mine : 0
    await syncCue($, cues, takes ? undefined : 'sweep')
    // Writing the cue waits, so a newer /btw may have arrived meanwhile: this one then ends with nothing, neither
    // forking nor handing on an obsolete question.
    if (isStale()) {
      return {}
    }

    if (!takes) {
      return next(e)
    }

    // While it is the one the cue stands for, every way out takes the cue down, before Claude Code runs it if handed
    // on.
    const done = async () => {
      if (cues.answering === mine) {
        cues.answering = 0
        await syncCue($, cues, 'sweep')
      }
    }
    let answer: string | undefined
    try {
      const r = await $.model.fork({ prompt: forkPrompt(e.args) })
      if (!r.isAnswered && r.reason === 'aborted') {
        await done()
        return {}
      }

      answer = r.isAnswered ? r.text : undefined
    } catch {
      answer = undefined
    }

    // The answer is shown, or the pane closed, one /btw at a time, each step taken only while this one is the newest:
    // an older one still storing, opening or closing finishes before a newer one starts, and then does nothing more.
    const shown = await inTurn(() => showBtw($, isStale, e.args.trim(), answer))
    await done()
    if (isStale()) {
      return {}
    }

    return shown ? {} : next(e)
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
      () => crossings($, configuredCrossings),
      () => size($, configuredSize),
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
