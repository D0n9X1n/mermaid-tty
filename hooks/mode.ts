// Whether a reply's render goes straight to next(): on any surface but the
// terminal, in source mode, or when the message is expanded.
export type Mode = 'diagram' | 'source'

export const passThrough = (s: string, p: unknown, m: Mode) =>
  s !== 'terminal' || m === 'source' || (p as { isExpanded?: unknown }).isExpanded === true
