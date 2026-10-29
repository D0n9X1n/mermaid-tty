// Whether a reply's render goes straight to next(): on any surface but the
// terminal, in source mode, or when the message is expanded.
export type Mode = 'diagram' | 'source'

export const passThrough = (s: string, p: unknown, m: Mode) =>
  s !== 'terminal' || m === 'source' || (p as { isExpanded?: unknown }).isExpanded === true

// The /mermaid-tty argument: one word, trimmed and matched in any case. Bare reports the
// mode; any other word, or a second one, is a usage error rather than being ignored.
export type ModeArgs = { set: Mode } | { report: true } | { error: string }

export const parseModeArgs = (a: string): ModeArgs => {
  const w = a.trim().toLowerCase()
  if (w === '') return { report: true }
  return w === 'source' || w === 'diagram' ? { set: w } : { error: 'usage: /mermaid-tty [source|diagram]' }
}

// The command's reply: what changed, or the mode in force when nothing did.
export const modeReply = (m: Mode, changed: boolean) =>
  !changed ? `mermaid-tty mode: ${m}` : m === 'source' ? 'mermaid-tty: showing diagrams as source' : 'mermaid-tty: drawing diagrams'
