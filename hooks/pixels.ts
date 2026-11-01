// Whether this terminal shows an Image's pixels (kitty graphics protocol), told conservatively: a wrong yes would leave
// only the Image's alt text, so anything unsure is a no. TERM must name kitty or Ghostty (TERM travels over ssh, so a
// remote session counts), or SonicTerm must own this session's terminal. SonicTerm sets TERM_PROGRAM SonicTerm and TERM
// xterm-256color, since it ships no terminfo of its own, but a terminal started inside it can keep both (VTE and
// QTermWidget do), so that pair only asks the process table who holds this session's terminal: on macOS and Linux the
// nearest ancestor on another tty, on Windows the nearest ancestor hosting a console. A TERM_PROGRAM naming another
// terminal means one started inside them, which inherited TERM. screen and Zellij pass no pixels through, and on
// Windows only SonicTerm shows them. Inside tmux or RMUX, Claude Code's kitty commands reach the terminal only through
// bin/claude-tmux.py, which wraps them for passthrough after checking the pane can show them, and says so with
// MERMAID_TTY_TMUX_IMAGES=1. A failing env read or process listing is a no.
export async function showsPixels($: any): Promise<boolean> {
  try {
    if ((await $.env.get('STY')) || (await $.env.get('ZELLIJ'))) {
      return false
    }

    if (await $.env.get('TMUX')) {
      return (await $.env.get('MERMAID_TTY_TMUX_IMAGES')) === '1'
    }

    const program = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase()
    if ((await $.env.get('OS')) === 'Windows_NT') {
      return program === 'sonicterm' && sonicTermOwnsConsole(await listWindowsProcesses($))
    }

    const term = (await $.env.get('TERM')) ?? ''
    if (term === 'xterm-kitty') {
      return program === '' || program === 'kitty'
    }

    if (term === 'xterm-ghostty') {
      return program === '' || program === 'ghostty'
    }

    if (program === 'sonicterm') {
      return term === 'xterm-256color' && sonicTermOwnsTty(await listProcesses($))
    }

    return false
  } catch {
    return false
  }
}

// How long the process listing may take, in milliseconds.
const LIST_MS = 5000

// The process table as `ps` prints it, after a first line holding the pid of `ps` itself: it runs as `sh`'s own pid,
// which `exec` keeps, so the listing starts from a child of this session. Empty when the listing fails.
async function listProcesses($: any): Promise<string> {
  const listed = await $.process.run(['sh', '-c', 'echo $$; exec ps -A -o pid=,ppid=,tty=,comm='], {
    timeoutMs: LIST_MS,
  })
  return listed.exitCode === 0 ? listed.stdout : ''
}

// Whether SonicTerm holds the pty of the process the listing starts from: walking up from it, the first ancestor on
// another tty is the terminal emulator, and its executable must be SonicTerm's own, `sonicterm-mac` in the macOS app or
// `sonicterm` on Linux. A start with no tty, a gap in the chain or a chain longer than any real one is a no, as is a
// tmux server or sshd at the top, which pass the pty on rather than draw it.
export function sonicTermOwnsTty(listing: string): boolean {
  const [first = '', ...rows] = listing.split('\n')
  const byPid = new Map<string, { ppid: string; tty: string; command: string }>()
  for (const row of rows) {
    const fields = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(row)
    if (fields) {
      byPid.set(fields[1], { ppid: fields[2], tty: fields[3], command: fields[4] })
    }
  }

  const start = byPid.get(first.trim())
  if (!start || /^\?+$/.test(start.tty)) {
    return false
  }

  let current = start
  for (let depth = 0; depth < 64; depth++) {
    const parent = byPid.get(current.ppid)
    if (!parent) {
      return false
    }

    if (parent.tty !== start.tty) {
      const executable = parent.command.slice(parent.command.lastIndexOf('/') + 1)
      return executable === 'sonicterm' || executable === 'sonicterm-mac'
    }

    current = parent
  }

  return false
}

// The Windows process table, after a first line holding the pid of the PowerShell that lists it, a child of this
// session: one `pid ppid ticks name` row per process, ticks being its start time (0 when Windows withholds it). Empty
// when the listing fails.
async function listWindowsProcesses($: any): Promise<string> {
  const script =
    '$PID; Get-CimInstance Win32_Process | ForEach-Object { ' +
    "'{0} {1} {2} {3}' -f $_.ProcessId, $_.ParentProcessId, " +
    '$(if ($_.CreationDate) { $_.CreationDate.Ticks } else { 0 }), $_.Name }'
  const listed = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], {
    timeoutMs: WINDOWS_LIST_MS,
  })
  return listed.exitCode === 0 ? listed.stdout : ''
}

// How long the Windows listing may take, in milliseconds: PowerShell and CIM start slower than ps.
const WINDOWS_LIST_MS = 15000

// Whether SonicTerm hosts the console of the session the Windows listing starts from. The terminal emulator is the
// process that created the pseudoconsole, which makes it the parent of the console host (conhost.exe, or the
// OpenConsole.exe SonicTerm ships); a shell or Claude Code under it hosts none. Walking up from the session (the
// lister's parent, Claude Code itself, which owns a console when it was started in a window of its own), the first
// process with a console host child owns the console and must be SonicTerm's own `sonicterm-windows.exe`. A host counts
// only if it started after its owner, and a parent only if it started before its child: either way round is a reused
// pid. A start time Windows withholds (0), a gap or a chain longer than any real one is a no.
export function sonicTermOwnsConsole(listing: string): boolean {
  const [first = '', ...rows] = listing.split(/\r?\n/)
  const byPid = new Map<string, { ppid: string; started: bigint; name: string }>()
  for (const row of rows) {
    const fields = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(row)
    if (fields) {
      byPid.set(fields[1], { ppid: fields[2], started: BigInt(fields[3]), name: fields[4].toLowerCase() })
    }
  }

  // The start of each console host, by the pid of the process it hosts a console for.
  const hostStarts = new Map<string, bigint[]>()
  for (const [, entry] of byPid) {
    if (entry.name === 'conhost.exe' || entry.name === 'openconsole.exe') {
      hostStarts.set(entry.ppid, [...(hostStarts.get(entry.ppid) ?? []), entry.started])
    }
  }

  const lister = byPid.get(first.trim())
  let current = lister && byPid.get(lister.ppid)
  if (!lister || !current || current.started === 0n || current.started > lister.started) {
    return false
  }

  let currentPid = lister.ppid
  for (let depth = 0; depth < 64; depth++) {
    const hosts = hostStarts.get(currentPid) ?? []
    if (hosts.includes(0n)) {
      return false
    }

    if (hosts.some((started) => started >= current!.started)) {
      return current.name === 'sonicterm-windows.exe'
    }

    const parent = byPid.get(current.ppid)
    if (!parent || parent.started === 0n || parent.started > current.started) {
      return false
    }

    currentPid = current.ppid
    current = parent
  }

  return false
}
