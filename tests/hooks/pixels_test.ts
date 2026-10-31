import test from 'node:test'
import assert from 'node:assert/strict'

import { showsPixels, sonicTermOwnsConsole, sonicTermOwnsTty } from '../../hooks/pixels.ts'

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
    [{ ...PAIR, OS: 'Windows_NT' }, SONICTERM_MAC, false], // Windows reads its own listing, not ps's
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

// Windows process tables as the PowerShell listing prints them: its own pid first, then `pid ppid ticks name` rows.
// SonicTerm (200) created the pseudoconsole, so its OpenConsole (210) is its child; pwsh (300) runs Claude Code (400),
// whose PowerShell (500) lists. Ticks rise with start time, as on the windows-latest run that drew a picture.
const windows = (...extra: string[]) =>
  [
    '500',
    '4 0 100 System',
    '150 4 1000 explorer.exe',
    '200 150 2000 sonicterm-windows.exe',
    '210 200 2100 OpenConsole.exe',
    '300 200 3000 pwsh.exe',
    '400 300 4000 claude.exe',
    '500 400 5000 powershell.exe',
    ...extra,
  ].join('\r\n')
const SONICTERM_WINDOWS = windows()
const WINDOWS_PAIR = { TERM: 'xterm-256color', TERM_PROGRAM: 'SonicTerm', OS: 'Windows_NT' }

test("A6.hook-tests: on Windows, pixels only when SonicTerm hosts the session's console", async () => {
  // The Windows listing comes from PowerShell, never ps.
  const windowsEnv = (vars: Record<string, string>, listing: string) => ({
    env: { get: async (n: string) => vars[n] },
    process: {
      run: async (argv: string[]) => ({ exitCode: 0, stdout: argv[0] === 'powershell.exe' ? listing : '', stderr: '' }),
    },
  })
  for (const [vars, listing, want] of [
    [WINDOWS_PAIR, SONICTERM_WINDOWS, true],
    [{ ...WINDOWS_PAIR, TERM: '' }, SONICTERM_WINDOWS, true], // ConPTY needs no TERM; SonicTerm's console decides
    [{ OS: 'Windows_NT', TERM: 'xterm-kitty' }, SONICTERM_WINDOWS, false], // only SonicTerm on Windows
    [{ ...WINDOWS_PAIR, TERM_PROGRAM: 'vscode' }, SONICTERM_WINDOWS, false],
    [{ ...WINDOWS_PAIR, TMUX: '/tmp/tmux,1,0' }, SONICTERM_WINDOWS, false],
    [WINDOWS_PAIR, '', false], // a failed listing
  ] as [Record<string, string>, string, boolean][]) {
    assert.equal(await showsPixels(windowsEnv(vars, listing)), want, JSON.stringify(vars))
  }
})

test('A6.hook-tests: the console owner is the nearest ancestor hosting a console, and anything unclear is a no', () => {
  // The bundled OpenConsole or the system conhost both mark the owner.
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('OpenConsole.exe', 'conhost.exe')), true)
  // A terminal started inside SonicTerm hosts its own console: Alacritty under SonicTerm's pwsh, Windows Terminal
  // launched apart from it, and a classic console window whose host is the shell's.
  const nested = [
    '500',
    '200 150 2000 sonicterm-windows.exe',
    '210 200 2100 OpenConsole.exe',
    '300 200 3000 pwsh.exe',
    '320 300 3200 alacritty.exe',
    '330 320 3300 conhost.exe',
    '340 320 3400 pwsh.exe',
    '400 340 4000 claude.exe',
    '500 400 5000 powershell.exe',
  ].join('\r\n')
  assert.equal(sonicTermOwnsConsole(nested), false)
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('sonicterm-windows.exe', 'WindowsTerminal.exe')), false)
  const classic = SONICTERM_WINDOWS.replace('210 200 2100 OpenConsole.exe', '310 300 3100 conhost.exe')
  assert.equal(sonicTermOwnsConsole(classic), false)
  // No console host anywhere above, a parent that started after its child (a reused pid), a gap and a missing lister.
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('210 200 2100 OpenConsole.exe', '')), false)
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('200 150 2000', '200 150 3500')), false)
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('300 200 3000', '300 999 3000')), false)
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace(/^500/, '777')), false)
  // A name that only contains SonicTerm's is not its executable.
  assert.equal(
    sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('sonicterm-windows.exe', 'sonicterm-windows.exe.bak')),
    false,
  )
  // Claude Code started in a classic console window of its own (`start "" claude.exe` from a SonicTerm pane) owns that
  // console, so the walk stops at it even though SonicTerm is further up.
  assert.equal(sonicTermOwnsConsole(windows('450 400 4500 conhost.exe')), false)
  // A console host that started before its owner is a reused pid, and a start time Windows withholds is unknown.
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('210 200 2100', '210 200 1000')), false)
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('200 150 2000', '200 150 0')), false)
  assert.equal(sonicTermOwnsConsole(SONICTERM_WINDOWS.replace('400 300 4000', '400 300 0')), false)
  // The walk checks at most 64 processes from Claude Code up: above 62 shells SonicTerm is the 64th, above 63 the 65th.
  assert.equal(sonicTermOwnsConsole(shells(62)), true)
  assert.equal(sonicTermOwnsConsole(shells(63)), false)
})

// A Windows listing with `count` nested cmd.exe shells between SonicTerm and Claude Code.
function shells(count: number): string {
  const nested = Array.from(
    { length: count },
    (_, index) => `${1000 + index} ${index ? 999 + index : 200} ${3000 + index} cmd.exe`,
  )
  return [
    '500',
    '200 150 2000 sonicterm-windows.exe',
    '210 200 2100 OpenConsole.exe',
    ...nested,
    `400 ${999 + count} 5000 claude.exe`,
    '500 400 6000 powershell.exe',
  ].join('\r\n')
}

test('A5.errors: on Windows, a PowerShell listing that fails or throws means no pixels', async () => {
  const run = (result: () => Promise<unknown>) => ({ env: env(WINDOWS_PAIR).env, process: { run: result } })
  assert.equal(await showsPixels(run(async () => ({ exitCode: 1, stdout: SONICTERM_WINDOWS, stderr: '' }))), false)
  assert.equal(await showsPixels(run(async () => Promise.reject(new Error('denied')))), false)
  assert.equal(
    await showsPixels(
      run(() => {
        throw new Error('no powershell')
      }),
    ),
    false,
  )
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
