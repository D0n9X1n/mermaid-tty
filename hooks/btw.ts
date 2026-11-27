// /btw, the side question, answered where mermaid-tty can draw its fences. Claude Code's own /btw draws its answer in a
// panel of its own, through a markdown component no plugin hooks, so a fence there shows as source. mermaid-tty answers
// it instead in a terminal session: a fork of the session's own transcript, tools denied, as the built-in asks, shown
// in a pane. No JSX, so node --test can import it.
import type { Mode } from './mode.ts'

// What the fork is told before the question: Claude Code's own side-question framing, shortened. The fork shares the
// main thread's context but is a separate one-off answer with no tools, so it must answer from what it knows.
export const SIDE_QUESTION =
  '<system-reminder>This is a side question from the user. Answer it directly, in a single response. You are a ' +
  'separate, one-off answer that shares the conversation context; the main agent is not interrupted and goes on ' +
  'working. You have no tools: do not write tool calls, do not promise to look anything up, and if answering ' +
  'would need reading files, running commands or searching, say it cannot be checked from a side question. If you ' +
  'do not know, say so.</system-reminder>\n\n'

// The fork's one user message for question.
export const forkPrompt = (question: string) => SIDE_QUESTION + question

// Whether mermaid-tty answers this /btw, rather than Claude Code: only in a terminal session, outside source mode, for
// a question that is not blank. Anything else is the built-in's, which says how to use it, draws in its own surface, or
// shows the source as source mode asks.
export const takesBtw = (args: unknown, inTerminal: boolean, mode: Mode) =>
  inTerminal && mode !== 'source' && typeof args === 'string' && args.trim() !== ''

// The question and the answer the pane shows: the latest /btw that was answered.
export type Btw = { question: string; text: string }

export const isBtw = (v: unknown): v is Btw =>
  typeof v === 'object' && v !== null && typeof (v as Btw).question === 'string' && typeof (v as Btw).text === 'string'

// A /btw answered in a transcript row of its own: the row's id, and the question and answer it draws. A row is drawn at
// the transcript's full width, where a pane docked beside a fullscreen transcript gets at most 45% of the terminal, too
// narrow for many diagrams. Claude Code 2.1.314 and later place rows; an earlier one has no $.ui.place, and the answer
// goes to the btw pane instead.
export type BtwRow = Btw & { id: string }

// What the rows keep in $.state: the newest answers, oldest first, and how many rows this session has placed, which
// numbers the next one. The count lives in $.state, not the module, since a reload starts the module over while the
// rows it placed stand, and placing an id that stands redraws that row instead of placing one.
export type BtwRows = { seq: number; rows: BtwRow[] }

// How many answers the rows keep at most, the newest, and how much of their JSON: a session's state stays bounded
// however many /btw it asks, well under the 4 MiB a $.state value may hold even when every character takes three bytes.
// A row whose answer is gone draws nothing of mermaid-tty's.
export const KEPT_ROWS = 50
export const KEPT_CHARS = 1_000_000

const isBtwRow = (v: unknown): v is BtwRow => isBtw(v) && typeof (v as BtwRow).id === 'string'

// The kept rows, read whole: a value that is not the store, or an entry that is not a whole row, is left out, so one
// written by an earlier version never breaks a /btw.
function readRows(stored: unknown): BtwRows {
  const v = typeof stored === 'object' && stored !== null ? (stored as Partial<BtwRows>) : {}
  const seq = typeof v.seq === 'number' && Number.isSafeInteger(v.seq) && v.seq >= 0 ? v.seq : 0
  return { seq, rows: Array.isArray(v.rows) ? v.rows.filter(isBtwRow) : [] }
}

// A row's id: 1 to 64 letters, digits, _ and -, as the engine takes it. The count keeps it apart from every row this
// session placed before, across reloads; the time, from a row of a conversation whose state was started over.
export const rowId = (seq: number, now: number) => `btw-${seq}-${now}`

// The store with btw kept last under a new row's id, and that id. The oldest rows go past KEPT_ROWS, or while their
// JSON passes KEPT_CHARS; the newest always stays, so an answer is never cut to fit.
export function keepRow(stored: unknown, btw: Btw, now: number): { id: string; store: BtwRows } {
  const { seq, rows } = readRows(stored)
  const id = rowId(seq + 1, now)
  const kept = [...rows, { id, question: btw.question, text: btw.text }].slice(-KEPT_ROWS)
  let size = kept.reduce((n, r) => n + JSON.stringify(r).length, 0)
  while (kept.length > 1 && size > KEPT_CHARS) {
    size -= JSON.stringify(kept.shift()).length
  }

  return { id, store: { seq: seq + 1, rows: kept } }
}

// The question and answer the row id draws, or undefined when none is kept under it.
export function rowFor(stored: unknown, id: string): Btw | undefined {
  const found = readRows(stored).rows.find((r) => r.id === id)
  return found ? { question: found.question, text: found.text } : undefined
}

// The row mermaid-tty pins under the prompt while it answers a /btw, which Claude Code shows after the plugin's name
// (mermaid-tty: answering /btw…), so the person sees the side question is being worked on: the fork can take a minute,
// and the pane only opens once it is done.
export const BTW_STATUS = 'answering /btw…'

// Where a status line finds the cue instead, when the switch asks for it: a file named by the session in
// ~/.cache/mermaid-tty, under the person's own home, so no other user can put a link where mermaid-tty writes, as one
// could in a shared /tmp. The status line's input carries the same session_id and its shell the same HOME, so both
// sides spell the same path. No POSIX home, or an id that is not a plain lowercase name, means no marker: neither is
// put into a path it was not meant for, and a disk that ignores case, as macOS's does, never gives two ids one file.
// Session ids are lowercase UUIDs.
export function markerPath(home: string | undefined, sessionId: string): string | null {
  if (!home?.startsWith('/') || !/^[a-z0-9_-]+$/.test(sessionId)) {
    return null
  }

  return `${home.replace(/\/$/, '')}/.cache/mermaid-tty/btw-${sessionId}`
}

// The variables that show Windows. OS alone is not enough: a session started with a bare environment can lack it while
// SystemRoot or windir, which every Windows program needs, are still set. Set at all counts, even empty: no macOS or
// Linux sets either.
export type WindowsVars = { os: string | undefined; systemRoot: string | undefined; windir: string | undefined }

export const isWindows = (v: WindowsVars) =>
  v.os === 'Windows_NT' || v.systemRoot !== undefined || v.windir !== undefined

// Whether the cue goes to the marker rather than the row: only when MERMAID_TTY_BTW_STATUS is file, and never on
// Windows, where a status line's Git Bash home is not spelled as mermaid-tty's, so the marker would be written where no
// status line looks and the person would see no cue at all.
export const usesMarker = (setting: string | undefined, vars: WindowsVars) => setting === 'file' && !isWindows(vars)
