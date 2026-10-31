// The screen reader the e2e harness reads a session through. It needs @xterm/headless, so only the e2e job, which
// installs scripts/e2e's packages, runs this.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createScreen } from './screen.ts'

test('A9.harness: the screen reader keeps truecolor, 256 colors, widths and OSC 52', async () => {
  const s = createScreen(20, 3)
  await s.write('\x1b[38;2;236;239;244m\x1b[48;2;94;129;172m读a\x1b[0m \x1b[38;5;110mb\x1b[0m\x1b]52;c;aGk=\x07')
  const r = s.cells()[0]!
  assert.deepEqual(
    [r[0]!.ch, r[0]!.width, r[0]!.fg, r[0]!.bg],
    ['读', 2, { mode: 'rgb', value: 0xeceff4 }, { mode: 'rgb', value: 0x5e81ac }],
  )
  assert.deepEqual([r[2]!.ch, r[4]!.fg], ['a', { mode: 'p256', value: 110 }])
  assert.equal(s.clipboard(), 'hi')
})

test('A9.harness: the screen reader tells the 16-color palette from the 256-color one and from the default, foreground and background', async () => {
  const s = createScreen(20, 3)
  await s.write('\x1b[31mp\x1b[38;5;1mq\x1b[39mr\x1b[44;91ms\x1b[48;5;4mt\x1b[0mu')
  const D = { mode: 'default', value: 0 }
  assert.deepEqual(
    s
      .cells()[0]!
      .slice(0, 6)
      .map((c) => [c.ch, c.fg, c.bg]),
    [
      ['p', { mode: 'p16', value: 1 }, D],
      ['q', { mode: 'p256', value: 1 }, D],
      ['r', D, D],
      ['s', { mode: 'p16', value: 9 }, { mode: 'p16', value: 4 }],
      ['t', { mode: 'p16', value: 9 }, { mode: 'p256', value: 4 }],
      ['u', D, D],
    ],
  )
})

test('A9.harness: each row has cols cells, a wide character a width-0 cell after it, and text() is the rows trimmed on the right', async () => {
  const s = createScreen(6, 3)
  await s.write('读a\r\n  b')
  const cells = s.cells()
  assert.deepEqual(
    cells.map((r) => r.length),
    [6, 6, 6],
  )
  // The width-0 cell after 读 is not the blank, width-1 cell of a column nothing was drawn in.
  assert.deepEqual(
    cells[0]!.slice(0, 4).map((c) => [c.ch, c.width]),
    [
      ['读', 2],
      ['', 0],
      ['a', 1],
      [' ', 1],
    ],
  )
  assert.equal(s.text(), '读a\n  b\n')
})

test('A9.harness: a blank cell reads as a space, whether a space was written to it, the cursor moved over it or nothing was drawn there', async () => {
  const s = createScreen(6, 2)
  // Row 2 as a renderer that moves over unchanged cells draws it; tmux's capture-pane writes the same blank as a space.
  await s.write('a b\r\nc\x1b[1Cd')
  assert.deepEqual(
    s.cells().map((r) => r.map((c) => c.ch).join('')),
    ['a b   ', 'c d   '],
  )
})

test('A9.harness: cells() and text() read the screen, not the lines scrolled off it', async () => {
  const s = createScreen(4, 2)
  await s.write('1\r\n2\r\n3')
  assert.equal(s.text(), '2\n3')
  assert.deepEqual(
    s.cells().map((r) => r[0]!.ch),
    ['2', '3'],
  )
})

test('A9.harness: clipboard() is undefined before any OSC 52, then the last payload set, decoded as UTF-8; a query sets nothing', async () => {
  const s = createScreen(20, 3)
  assert.equal(s.clipboard(), undefined)
  // ESC \ ends this one, BEL the others.
  await s.write('\x1b]52;c;6K+7IGhp\x1b\\')
  assert.equal(s.clipboard(), '读 hi')
  await s.write('\x1b]52;c;?\x07')
  assert.equal(s.clipboard(), '读 hi')
  await s.write('\x1b]52;;Ynll\x07')
  assert.equal(s.clipboard(), 'bye')
})

test('A9.harness: each color is read from its cell as last drawn, not from the bytes that drew it', async () => {
  const s = createScreen(10, 2)
  // A redraw as ConPTY makes one: a cell drawn, then drawn over in another color after a cursor move.
  await s.write('\x1b[38;5;110mxy\x1b[1;1H\x1b[38;2;1;2;3mz\x1b[0m')
  assert.deepEqual(
    s
      .cells()[0]!
      .slice(0, 2)
      .map((c) => [c.ch, c.fg]),
    [
      ['z', { mode: 'rgb', value: 0x010203 }],
      ['y', { mode: 'p256', value: 110 }],
    ],
  )
})
