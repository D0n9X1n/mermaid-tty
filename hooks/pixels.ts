// Whether this terminal shows an Image's pixels (kitty graphics protocol), told conservatively from the
// environment: a wrong yes would leave only the Image's alt text, so anything unsure is a no.
// TERM must name kitty or Ghostty (TERM travels over ssh, so a remote session counts). A TERM_PROGRAM
// naming another terminal means one started inside them, which inherited TERM. tmux, screen and Zellij
// pass no pixels through, and Windows has no terminal that shows them. A failing env read is a no.
export async function showsPixels($: any): Promise<boolean> {
  try {
    if (await $.env.get('TMUX') || await $.env.get('STY') || await $.env.get('ZELLIJ') || await $.env.get('OS') === 'Windows_NT') return false
    const term = await $.env.get('TERM') ?? '', program = (await $.env.get('TERM_PROGRAM') ?? '').toLowerCase()
    if (term === 'xterm-kitty') return program === '' || program === 'kitty'
    if (term === 'xterm-ghostty') return program === '' || program === 'ghostty'
    return false
  } catch { return false }
}
