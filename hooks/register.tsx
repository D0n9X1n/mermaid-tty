import type { Register } from 'claude-code'
import { isFail } from '../core/fail.ts'

// Task 0's probe: proves the loader resolves a `.ts` import from this module
// and that the hyphenated `$.state` key round-trips. T21 and T22 replace it.
const SOURCE = { plugin: 'mermaid-tty', key: 'source' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mermaid-tty', description: 'Show mermaid diagrams as drawings or as their source' })
    return next(e)
  })

  on('command.run', { command: 'mermaid-tty' }, async $ => {
    await $.state.set(SOURCE, true)
    return { text: 'mermaid-tty: source (probe)' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.props.text.includes('```mermaid')) return next(e)
    const src = (await $.state.get(SOURCE)).value === true
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="mermaid-0">
        <Text>{'probe:' + String(isFail(null)) + ':' + String(src)}</Text>
      </Box>
    )
  })
}
