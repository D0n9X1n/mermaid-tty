// Whether a reply's render goes straight to next(): on any surface but the
// terminal, in source mode, or when the message is expanded.
export type Mode = 'diagram' | 'source'

export const passThrough = (s: string, p: unknown, m: Mode) =>
  s !== 'terminal' || m === 'source' || (p as { isExpanded?: unknown }).isExpanded === true

// The /mermaid-tty argument: one word, trimmed and matched in any case. Left out or blank, it
// reports the mode. Another word, a second one, or anything but a string is a usage error:
// never ignored, never coerced (String(['source']) would be 'source').
export type ModeArgs = { set: Mode } | { report: true } | { error: string }
const USAGE = 'usage: /mermaid-tty [source|diagram]'

export const parseModeArgs = (a: unknown): ModeArgs => {
  if (a === undefined) return { report: true }
  if (typeof a !== 'string') return { error: USAGE }
  const w = a.trim().toLowerCase()
  if (w === '') return { report: true }
  return w === 'source' || w === 'diagram' ? { set: w } : { error: USAGE }
}

// The command's reply: what changed, or the mode in force when nothing did.
export const modeReply = (m: Mode, changed: boolean) =>
  !changed ? `mermaid-tty mode: ${m}` : m === 'source' ? 'mermaid-tty: showing diagrams as source' : 'mermaid-tty: drawing diagrams'
