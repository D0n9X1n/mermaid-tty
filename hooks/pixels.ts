// Whether this terminal shows an Image's pixels (kitty graphics protocol), told conservatively from the environment: a
// wrong yes would leave only the Image's alt text, so anything unsure is a no. TERM must name kitty or Ghostty (TERM
// travels over ssh, so a remote session counts), or the shell must be SonicTerm's own: TERM_PROGRAM SonicTerm with the
// TERM it sets, xterm-256color, since SonicTerm ships no terminfo of its own. A TERM_PROGRAM naming another terminal
// means one started inside them, which inherited TERM. SonicTerm's pair is common enough that a terminal started in it
// can keep both (xfce4-terminal copies TERM_PROGRAM, and VTE sets xterm-256color), so a marker such a terminal sets of
// its own is a no too. tmux, screen and Zellij pass no pixels through, and Windows has no terminal that shows them. A
// failing env read is a no.
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
      return term === 'xterm-256color' && !(await nestedTerminal($))
    }

    return false
  } catch {
    return false
  }
}

// Whether a terminal started inside SonicTerm runs this session: each variable is one a terminal sets for its own
// sessions, so one present under SonicTerm's TERM_PROGRAM means a terminal that kept it but draws on its own. Each name
// is spelled out because the engine lists the variables a module reads.
async function nestedTerminal($: any): Promise<boolean> {
  const markers = [
    await $.env.get('VTE_VERSION'),
    await $.env.get('KONSOLE_VERSION'),
    await $.env.get('ALACRITTY_WINDOW_ID'),
    await $.env.get('KITTY_WINDOW_ID'),
    await $.env.get('WEZTERM_PANE'),
    await $.env.get('WT_SESSION'),
    await $.env.get('TERMINATOR_UUID'),
    await $.env.get('TILIX_ID'),
    await $.env.get('GNOME_TERMINAL_SCREEN'),
    await $.env.get('ITERM_SESSION_ID'),
    await $.env.get('GHOSTTY_RESOURCES_DIR'),
  ]
  return markers.some(Boolean)
}
