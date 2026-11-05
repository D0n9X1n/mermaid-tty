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

// The /mermaid-tty argument, trimmed and matched in any case. Left out or blank, it reports the mode. One mode word
// sets the mode; images reports the picture setting, and images followed by one setting word sets it; theme reports the
// theme, and theme followed by a theme name sets it. Another word, an extra one, or anything but a string is a usage
// error: never ignored, never coerced (String(['source']) would be 'source').
export type ModeArgs =
  | { set: Mode }
  | { report: true }
  | { images: Images | 'report' }
  | { theme: ThemeName | 'report' }
  | { error: string }
const USAGE = `usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [${Object.keys(THEMES).join('|')}]]`

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
