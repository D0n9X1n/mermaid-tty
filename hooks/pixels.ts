// Whether this terminal shows an Image's pixels (kitty graphics protocol), told conservatively: a wrong yes would leave
// only the Image's alt text, so anything unsure is a no. TERM must name kitty or Ghostty (TERM travels over ssh, so a
// remote session counts), or SonicTerm must own this session's terminal. SonicTerm sets TERM_PROGRAM SonicTerm and
// TERM xterm-256color, since it ships no terminfo of its own, but a terminal started inside it can keep both (VTE and
// QTermWidget do), so that pair only asks the process table, where the terminal holding this session's pty is the
// nearest ancestor on another tty. A TERM_PROGRAM naming another terminal means one started inside them, which
// inherited TERM. tmux, screen and Zellij pass no pixels through, and Windows has no terminal that shows them. A failing
// env read or process listing is a no.
export async function showsPixels($: any): Promise<boolean> {
  try {
    if (
      (await $.env.get('TMUX')) ||
      (await $.env.get('STY')) ||
      (await $.env.get('ZELLIJ')) ||
      (await $.env.get('OS')) === 'Windows_NT'
    ) {
      return false
    }

    const term = (await $.env.get('TERM')) ?? ''
    const program = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase()
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
  const listed = await $.process.run(['sh', '-c', 'echo $$; exec ps -A -o pid=,ppid=,tty=,comm='], { timeoutMs: LIST_MS })
  return listed.exitCode === 0 ? listed.stdout : ''
}

// Whether SonicTerm holds the pty of the process the listing starts from: walking up from it, the first ancestor on
// another tty is the terminal emulator, and its executable must be SonicTerm's own, `sonicterm-mac` in the macOS app
// or `sonicterm` on Linux. A start with no tty, a gap in the chain or a chain longer than any real one is a no, as is a
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
