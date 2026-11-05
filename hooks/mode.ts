import { THEMES, type ThemeName } from '../core/themes.ts'

// Whether a reply's render goes straight to next(): on any surface but the terminal, in source mode, or when the
// message is expanded. text mode draws as diagram mode does, but never as a picture.
export type Mode = 'diagram' | 'source' | 'text'

export const passThrough = (s: string, p: unknown, m: Mode) =>
  s !== 'terminal' || m === 'source' || (p as { isExpanded?: unknown }).isExpanded === true

// Whether diagram mode draws pictures: auto where the terminal is detected to show them, on without that detection, off
// never.
export type Images = 'auto' | 'on' | 'off'

export const isImages = (v: unknown): v is Images => v === 'auto' || v === 'on' || v === 'off'

// A theme name core draws, matched exactly: Object.hasOwn keeps out inherited names such as toString.
export const isTheme = (v: unknown): v is ThemeName => typeof v === 'string' && Object.hasOwn(THEMES, v)

// The flowchart direction mermaid-tty asks Claude to write: LR, as a terminal is wider than it is tall; TB; or off,
// which asks for nothing. It shapes only what Claude writes, never how a diagram is drawn.
export type Direction = 'LR' | 'TB' | 'off'

export const isDirection = (v: unknown): v is Direction => v === 'LR' || v === 'TB' || v === 'off'

// The command's words for each direction, lower-cased as the argument is.
const DIRECTION_WORDS: Readonly<Record<string, Direction>> = { lr: 'LR', tb: 'TB', off: 'off' }

// The /mermaid-tty argument, trimmed and matched in any case. Left out or blank, it reports the mode. One mode word
// sets the mode; images reports the picture setting, and images followed by one setting word sets it; theme reports the
// theme, and theme followed by a theme name sets it; direction likewise, with LR, TB or off. Another word, an extra
// one, or anything but a string is a usage error: never ignored, never coerced (String(['source']) would be 'source').
export type ModeArgs =
  | { set: Mode }
  | { report: true }
  | { images: Images | 'report' }
  | { theme: ThemeName | 'report' }
  | { direction: Direction | 'report' }
  | { error: string }
const USAGE =
  `usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [${Object.keys(THEMES).join('|')}]` +
  '|direction [LR|TB|off]]'

export const parseModeArgs = (a: unknown): ModeArgs => {
  if (a === undefined) {
    return { report: true }
  }

  if (typeof a !== 'string') {
    return { error: USAGE }
  }

  const [w = '', setting, ...rest] = a.trim().toLowerCase().split(/\s+/)
  if (w === '') {
    return { report: true }
  }

  if (w === 'images' && rest.length === 0) {
    if (setting === undefined) {
      return { images: 'report' }
    }

    return isImages(setting) ? { images: setting } : { error: USAGE }
  }

  if (w === 'theme' && rest.length === 0) {
    if (setting === undefined) {
      return { theme: 'report' }
    }

    return isTheme(setting) ? { theme: setting } : { error: USAGE }
  }

  if (w === 'direction' && rest.length === 0) {
    if (setting === undefined) {
      return { direction: 'report' }
    }

    const d = Object.hasOwn(DIRECTION_WORDS, setting) ? DIRECTION_WORDS[setting] : undefined
    return d === undefined ? { error: USAGE } : { direction: d }
  }

  return setting === undefined && (w === 'source' || w === 'diagram' || w === 'text') ? { set: w } : { error: USAGE }
}

// The command's reply: what changed, or the mode in force when nothing did.
const CHANGED: Record<Mode, string> = {
  source: 'mermaid-tty: showing diagrams as source',
  diagram: 'mermaid-tty: drawing diagrams',
  text: 'mermaid-tty: drawing diagrams as text',
}
export const modeReply = (m: Mode, changed: boolean) => (!changed ? `mermaid-tty mode: ${m}` : CHANGED[m])

// The images command's reply: what changed, or the setting in force when nothing did.
const IMAGES_CHANGED: Record<Images, string> = {
  auto: 'mermaid-tty: pictures where the terminal is detected to show them',
  on: 'mermaid-tty: pictures on, without terminal detection',
  off: 'mermaid-tty: pictures off',
}
export const imagesReply = (i: Images, changed: boolean) => (!changed ? `mermaid-tty images: ${i}` : IMAGES_CHANGED[i])

// The theme command's reply: the theme now drawn in, or the one in force when nothing changed; a theme that could not
// be saved says it lasts only this session.
export const themeReply = (t: ThemeName, changed: boolean, saved: boolean) => {
  const said = changed ? `mermaid-tty: drawing in ${t}` : `mermaid-tty theme: ${t}`
  return saved ? said : `${said} (this session only: the setting was not saved)`
}

// The direction command's reply: what Claude is now asked for, or the setting in force when nothing changed; a
// direction that could not be saved says it lasts only this session, and one this conversation was not told of says so.
const DIRECTION_CHANGED: Record<Direction, string> = {
  LR: 'mermaid-tty: asking Claude for left-to-right flowcharts',
  TB: 'mermaid-tty: asking Claude for top-to-bottom flowcharts',
  off: 'mermaid-tty: leaving flowchart direction to Claude',
}
export const directionReply = (d: Direction, changed: boolean, saved: boolean, told = true) => {
  const notes = [
    ...(saved ? [] : ['this session only: the setting was not saved']),
    ...(told ? [] : ['Claude was not told in this conversation; new conversations get it']),
  ]
  const said = changed ? DIRECTION_CHANGED[d] : `mermaid-tty direction: ${d}`
  return notes.length === 0 ? said : `${said} (${notes.join('; ')})`
}

const DIRECTION_NAMES: Record<'LR' | 'TB', string> = { LR: 'left to right', TB: 'top to bottom' }

// The system-prompt section for a direction, or null for off. A diagram the person wrote, or a direction they ask for,
// is theirs: the section only sets what Claude picks when nobody said.
export const directionSection = (d: Direction): string | null => {
  if (d === 'off') {
    return null
  }

  return (
    `Mermaid flowcharts are drawn in a terminal here. Open each flowchart you write with \`flowchart ${d}\`, so it ` +
    `runs ${DIRECTION_NAMES[d]}, unless the person asks for another direction or the diagram is one they wrote.`
  )
}

// The note a running thread gets when the direction changes: its system prompt was sent with the old section and stays
// as sent, so the change reaches the model as a row of its own.
export const directionNote = (d: Direction): string =>
  d === 'off'
    ? 'mermaid-tty: the flowchart direction setting is now off. You are no longer asked to use a set flowchart direction.'
    : `mermaid-tty: the flowchart direction setting changed. From now on, open each Mermaid flowchart you write with ` +
      `\`flowchart ${d}\`, unless the person asks for another direction or the diagram is one they wrote.`
