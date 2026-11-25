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
