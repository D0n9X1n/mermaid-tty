import test from 'node:test'
import assert from 'node:assert/strict'
import { showsPixels } from '../../hooks/pixels.ts'

// A fake $ whose env.get answers from vars; a name not listed is unset.
const env = (vars: Record<string, string>) => ({ env: { get: async (n: string) => vars[n] } })

test('A6.hook-tests: pixels only where TERM names kitty or Ghostty, outside tmux, screen and Zellij', async () => {
  for (const [vars, want] of [
    [{ TERM: 'xterm-kitty' }, true],
    [{ TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', TERM_PROGRAM: 'kitty' }, true],
    [{ TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' }, true],
    [{ TERM: 'xterm-ghostty' }, true],                                   // over ssh: TERM travels, TERM_PROGRAM does not
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'ghostty' }, false],          // another terminal may have inherited TERM_PROGRAM
    [{ TERM: 'xterm-256color', KITTY_WINDOW_ID: '1' }, false],             // ...or KITTY_WINDOW_ID
    [{ TERM: 'xterm-kitty', TERM_PROGRAM: 'vscode' }, false],              // a terminal started inside kitty inherits TERM
    [{ TERM: 'xterm-ghostty', TERM_PROGRAM: 'iTerm.app' }, false],
    [{ TERM: 'xterm-kitty', TMUX: '/tmp/tmux-501/default,1,0' }, false],
    [{ TERM: 'screen-256color' }, false],
    [{ TERM: 'tmux-256color' }, false],
    [{ TERM: 'xterm-kitty', STY: '1.pts-0.host' }, false],
    [{ TERM: 'xterm-ghostty', ZELLIJ: '0' }, false],
    [{ TERM: 'xterm-kitty', OS: 'Windows_NT' }, false],
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' }, false],
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'Apple_Terminal' }, false],
    [{}, false],
  ] as [Record<string, string>, boolean][]) assert.equal(await showsPixels(env(vars)), want, JSON.stringify(vars))
})

test('A5.errors: an env read that throws or rejects means no pixels', async () => {
  assert.equal(await showsPixels({ env: { get: () => { throw new Error('denied') } } }), false)
  assert.equal(await showsPixels({ env: { get: async () => { throw new Error('denied') } } }), false)
})
