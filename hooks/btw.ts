// /btw, the side question, answered where mermaid-tty can draw its fences. Claude Code's own /btw draws its answer in
// a panel of its own, through a markdown component no plugin hooks, so a fence there shows as source. mermaid-tty
// answers it instead in a terminal session: a fork of the session's own transcript, tools denied, as the built-in
// asks, shown in a pane. No JSX, so node --test can import it.
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
// a question that is not blank. Anything else is the built-in's, which says how to use it, draws in its own surface,
// or shows the source as source mode asks.
export const takesBtw = (args: unknown, inTerminal: boolean, mode: Mode) =>
  inTerminal && mode !== 'source' && typeof args === 'string' && args.trim() !== ''

// The question and the answer the pane shows: the latest /btw that was answered.
export type Btw = { question: string; text: string }

export const isBtw = (v: unknown): v is Btw =>
  typeof v === 'object' && v !== null && typeof (v as Btw).question === 'string' && typeof (v as Btw).text === 'string'
