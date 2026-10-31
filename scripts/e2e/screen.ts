// The screen the e2e harness reads a session through: a headless xterm that parses what the session draws. Each cell's
// character, width and colors come from the parsed screen, never from the byte stream: ConPTY redraws and re-encodes
// what a program writes, so only the cells say what is shown.
import xterm from '@xterm/headless'

// A cell's color: the terminal's default, whose value is 0; an index into the 16-color or the 256-color palette; or 0xRRGGBB.
export type Color = { mode: 'default' | 'p16' | 'p256' | 'rgb'; value: number }
// A cell. ch is ' ' in a blank cell, whether a space was written to it or not, so that the pty driver, whose program may
// move the cursor over blanks, reads what the tmux driver, whose capture-pane writes them, does. It is '' only in the cell
// after a wide character, whose width is 0.
export type Cell = { ch: string; width: number; fg: Color; bg: Color }
export type Screen = {
  // Resolves once the terminal has parsed data.
  write(data: string): Promise<void>
  // The screen's rows of cells, top to bottom; not the lines scrolled off it.
  cells(): Cell[][]
  // The screen's rows, each trimmed on the right, joined by \n.
  text(): string
  // The last text a program copied with OSC 52, or undefined before any.
  clipboard(): string | undefined
}

// xterm's color modes, as getFgColorMode and getBgColorMode return them (its Attributes.CM_DEFAULT, CM_P16, CM_P256, CM_RGB).
const MODES = new Map<number, Color['mode']>([[0, 'default'], [0x1000000, 'p16'], [0x2000000, 'p256'], [0x3000000, 'rgb']])
const color = (mode: number, value: number): Color => {
  const m = MODES.get(mode)!
  return { mode: m, value: m === 'default' ? 0 : value }
}

export function createScreen(cols: number, rows: number): Screen {
  const term = new xterm.Terminal({ cols, rows, allowProposedApi: true })
  let copied: string | undefined
  // OSC 52 ; Pc ; Pd. Pd is the base64 of the copied text, or ? for a query of the clipboard, which copies nothing.
  term.parser.registerOscHandler(52, data => {
    const pd = data.slice(data.indexOf(';') + 1)
    if (pd !== '?') { copied = Buffer.from(pd, 'base64').toString('utf8') }
    return true
  })
  // The active buffer's lines on the screen: those after the baseY lines scrolled off it.
  const lines = () => {
    const b = term.buffer.active
    return Array.from({ length: rows }, (_, y) => b.getLine(b.baseY + y)!)
  }
  return {
    write: data => new Promise(resolve => term.write(data, resolve)),
    cells: () => lines().map(line => Array.from({ length: cols }, (_, x) => {
      const c = line.getCell(x)!
const  width = c.getWidth()
      return { ch: c.getChars() || (width ? ' ' : ''), width, fg: color(c.getFgColorMode(), c.getFgColor()), bg: color(c.getBgColorMode(), c.getBgColor()) }
    })),
    text: () => lines().map(line => line.translateToString(true)).join('\n'),
    clipboard: () => copied,
  }
}
