// The engine beneath the plugin for the /btw kit tests: a fork that answers scripted replies, a completion that answers
// when there was nothing to fork, the session's conversation, a pane that is placed, and Claude Code's own /btw, each
// recorded. Shared by btw.test.tsx and btw-status.test.tsx.
export const FC = '```mermaid\nflowchart LR\nA[读取] --> B[完成]\n```\n'
export const ANSWER = `Here is the flow:\n\n${FC}\nThat is all.`
export const BTW = ($: any, args: string) => $.command.run({ command: 'btw', args })
export const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
export const answered = (text: string) => ({ isAnswered: true, text, usage })
export const NOTHING_TO_FORK = { isAnswered: false, reason: 'nothing-to-fork' }
// A conversation with something to answer from, as $.session.messages() gives it.
export const CONVERSATION = [
  { role: 'user', text: 'lead', toolUses: [] },
  { role: 'assistant', text: 'After the diagram.', toolUses: [] },
]

// The kit answers neither the fork nor the pane's open, so hooks beneath the plugin stand for them: each fork answers
// the next reply in turn, and each prompt and open is recorded. A reply may be a promise, held to order the forks.
// Called as each fork starts, before its reply: a test's look at the cue then.
export const forks: { onFork: () => void } = { onFork: () => {} }
export const engine = (on: any, ...replies: unknown[]) => {
  forks.onFork = () => {}
  const prompts: string[] = []
  const opens: any[] = []
  const closes: string[] = []
  const builtin: string[] = []
  // What each completion was asked, the replies they answer in turn, and the conversation the session holds: none by
  // default, as in a session that has sent nothing. A reply or the conversation may be a promise, held to order it.
  const completions: any[] = []
  const completed: unknown[] = []
  const conversation = { value: [] as unknown }
  // The session's model, a promise held to order it.
  const model = { value: 'claude-opus-5-5' as unknown }
  const placed = { value: { isPlaced: true } as object }
  // Each open answers the next of these in turn, a promise held to order it, then placed; one that rejects throws.
  const openings: unknown[] = []
  on('model.fork', async (_$: any, e: any) => {
    prompts.push(e.prompt)
    forks.onFork()
    return { value: await replies.shift() }
  })
  on('model.complete', async (_$: any, e: any) => {
    completions.push(e)
    return { value: await completed.shift() }
  })
  on('session.messages', async () => ({ value: await conversation.value }))
  on('session.model', async () => ({ value: await model.value }))
  on('ui.open', async (_$: any, e: any) => {
    opens.push(e)
    return openings.length ? { value: await openings.shift() } : placed
  })
  on('ui.close', async (_$: any, e: any) => {
    closes.push(e.id)
    return { value: undefined }
  })
  on('command.run', { command: 'btw' }, async (_$: any, e: any) => {
    builtin.push(e.args)
    return { text: 'the built-in /btw' }
  })
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  return { prompts, opens, closes, builtin, placed, openings, completions, completed, conversation, model }
}
export const pane = ($: any, surface = 'terminal') =>
  $.ui.mount({
    plugin: 'mermaid-tty',
    surface,
    component: 'Pane',
    requestId: 'btw',
    props: { title: 'btw', isFocused: true, bodyColumns: 80, placement: 'inline' },
    viewport: { columns: 82, rows: 40 },
  })
// A promise and the function that settles it, to hold a fork or an open until a test lets it go.
export const held = () => {
  let settle: (v: unknown) => void = () => {}
  let fail: (e: unknown) => void = () => {}
  const promise = new Promise((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}
export const tick = () => new Promise((resolve) => setTimeout(resolve, 20))
export const start = ($: any, surface: string | null = 'terminal') =>
  $.session.start({ cwd: '/', surface, isInteractive: surface === 'terminal' })
