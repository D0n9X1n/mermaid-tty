import test from 'node:test'
import assert from 'node:assert/strict'

import { showsPixels, sonicTermOwnsTty } from '../../hooks/pixels.ts'

// A fake $ whose env.get answers from vars, a name not listed being unset, and whose process listing prints `listing`.
const env = (vars: Record<string, string>, listing = '') => ({
  env: { get: async (n: string) => vars[n] },
  process: { run: async () => ({ exitCode: 0, stdout: listing, stderr: '' }) },
})

// Process tables as `sh -c 'echo $$; exec ps ...'` prints them: the first line is the listing's own pid, 500, a child
// of Claude Code (400) under a shell (300) on ttys008, whose parent at 200 holds the pty from no tty of its own.
const table = (terminal: string, terminalTty = '??') =>
  [
    '500',
    `  1     0 ??       /sbin/launchd`,
    `200     1 ${terminalTty} ${terminal}`,
    `300   200 ttys008  -zsh`,
    `400   300 ttys008  claude`,
    `500   400 ttys008  ps`,
  ].join('\n')
const SONICTERM_MAC = table('/Applications/SonicTerm.app/Contents/MacOS/sonicterm-mac')
const SONICTERM_LINUX = table('sonicterm', '?').replaceAll('ttys008', 'pts/3')
const PAIR = { TERM: 'xterm-256color', TERM_PROGRAM: 'SonicTerm' }

test("A6.hook-tests: pixels in SonicTerm only when SonicTerm holds this session's pty", async () => {
  for (const [vars, listing, want] of [
    [PAIR, SONICTERM_MAC, true],
    [PAIR, SONICTERM_LINUX, true],
    [{ ...PAIR, TERM_PROGRAM_VERSION: '1.4.0' }, SONICTERM_MAC, true],
    [{ ...PAIR, TERM: 'tmux-256color' }, SONICTERM_MAC, false], // tmux started in SonicTerm passes no pixels
    [{ ...PAIR, TMUX: '/tmp/tmux-501/default,1,0' }, SONICTERM_MAC, false],
    [{ ...PAIR, TERM: 'screen-256color', STY: '1.pts-0.host' }, SONICTERM_MAC, false],
    [{ ...PAIR, ZELLIJ: '0' }, SONICTERM_MAC, false],
    [{ ...PAIR, OS: 'Windows_NT' }, SONICTERM_MAC, false], // Windows panes take another path
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'vscode' }, SONICTERM_MAC, false], // a terminal inside sets its own
    [{ ...PAIR, TERM: 'vt100' }, SONICTERM_MAC, false], // only the TERM SonicTerm sets
    // A terminal started inside SonicTerm that keeps both variables owns its own pty: QTerminal sets only WINDOWID,
    // xfce4-terminal sets VTE_VERSION, and neither marker is needed to tell.
    [{ ...PAIR, WINDOWID: '12345', COLORTERM: 'truecolor' }, table('/usr/bin/qterminal', '?'), false],
    [{ ...PAIR, VTE_VERSION: '7800' }, table('/usr/bin/xfce4-terminal', '?'), false],
    [PAIR, table('/usr/bin/tmux: server', '?'), false], // a tmux server forwards the pty
    [PAIR, table('sshd: user@pts/3', '?'), false], // a remote shell that kept the pair
    [PAIR, '', false], // a failed listing
  ] as [Record<string, string>, string, boolean][]) {
    assert.equal(await showsPixels(env(vars, listing)), want, `${JSON.stringify(vars)} ${listing.split('\n')[2]}`)
  }
})

test('A6.hook-tests: the pty owner is the nearest ancestor on another tty, and anything unclear is a no', () => {
  // A shell inside a terminal inside SonicTerm: the nearest owner is the inner terminal, not SonicTerm further up.
  const nested = [
    '600',
    '100     1 ??       /Applications/SonicTerm.app/Contents/MacOS/sonicterm-mac',
    '150   100 ttys002  -zsh',
    '200   150 ttys002  /usr/bin/qterminal',
    '300   200 pts/9    bash',
    '600   300 pts/9    ps',
  ].join('\n')
  assert.equal(sonicTermOwnsTty(nested), false)
  // sudo and su keep the tty, so the walk passes through them to the terminal.
  const elevated = SONICTERM_MAC.replace('500   400 ttys008  ps', '450   400 ttys008  sudo\n500   450 ttys008  ps')
  assert.equal(sonicTermOwnsTty(elevated), true)
  // A start with no tty (a daemon, a headless run), a broken chain or an unknown start pid is a no.
  assert.equal(sonicTermOwnsTty(SONICTERM_MAC.replaceAll('ttys008', '??')), false)
  assert.equal(sonicTermOwnsTty(SONICTERM_MAC.replace('300   200', '300   999')), false)
  assert.equal(sonicTermOwnsTty(SONICTERM_MAC.replace(/^500/, '777')), false)
  // A program merely named like SonicTerm inside its path, or a longer name, is not its executable.
  assert.equal(sonicTermOwnsTty(table('/opt/sonicterm/bin/sonicterm-helper')), false)
  // A cycle in a corrupt listing ends at the depth cap instead of looping.
  assert.equal(sonicTermOwnsTty(['500', '500   500 ttys008  ps'].join('\n')), false)
})

test('A5.errors: a listing that fails or throws means no pixels', async () => {
  const run = (result: () => Promise<unknown>) => ({ env: env(PAIR).env, process: { run: result } })
  assert.equal(await showsPixels(run(async () => ({ exitCode: 1, stdout: SONICTERM_MAC, stderr: '' }))), false)
  assert.equal(await showsPixels(run(async () => Promise.reject(new Error('denied')))), false)
})

test('A6.hook-tests: pixels only where TERM names kitty or Ghostty, outside tmux, screen and Zellij', async () => {
  for (const [vars, want] of [
    [{ TERM: 'xterm-kitty' }, true],
    [{ TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', TERM_PROGRAM: 'kitty' }, true],
    [{ TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' }, true],
    [{ TERM: 'xterm-ghostty' }, true], // over ssh: TERM travels, TERM_PROGRAM does not
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'ghostty' }, false], // another terminal may have inherited TERM_PROGRAM
    [{ TERM: 'xterm-256color', KITTY_WINDOW_ID: '1' }, false], // ...or KITTY_WINDOW_ID
    [{ TERM: 'xterm-kitty', TERM_PROGRAM: 'vscode' }, false], // a terminal started inside kitty inherits TERM
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
  ] as [Record<string, string>, boolean][]) {
    assert.equal(await showsPixels(env(vars)), want, JSON.stringify(vars))
  }
})

test('A5.errors: an env read that throws or rejects means no pixels', async () => {
  assert.equal(
    await showsPixels({
      env: {
        get: () => {
          throw new Error('denied')
        },
      },
    }),
    false,
  )
  assert.equal(
    await showsPixels({
      env: {
        get: async () => {
          throw new Error('denied')
        },
      },
    }),
    false,
  )
})
