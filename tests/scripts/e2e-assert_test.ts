// The e2e scenarios' screen check: each drawn diagram's rows on screen, in order, each label in its role's color, and the
// prose intact. Node built-ins and the repo's own modules only, so the main suite runs this with nothing installed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDiagramScreen, drawnDiagrams, drawnRows, sourceShown } from '../../scripts/e2e/assert.ts'
import { REPLY } from '../../scripts/e2e/reply.ts'
const D = { mode: 'default', value: 0 }
const rgb = (v: number) => ({ mode: 'rgb', value: v })
const p256 = (v: number) => ({ mode: 'p256', value: v })
const row = (s: string, fg: object = D, bg: object = D) => [...s].map((ch) => ({ ch, width: 1, fg, bg }))
const screen = (pill: object, msg: object) => [
  row('Here is the config flow:'),
  row(' 读取配置文件 ', D, pill),
  row(' ping ', msg),
]
const E = {
  labels: { 读取配置文件: 'node', ping: 'label' },
  prose: ['Here is the config flow:'],
  diagrams: [],
} as const
const HEX = { node: 0x88c0d0, label: 0xa3be8c }
test('A9.harness: labels are checked by role: node background on node labels, role foreground elsewhere, no color under mono', () => {
  assert.deepEqual(
    checkDiagramScreen(screen(rgb(0x88c0d0), rgb(0xa3be8c)) as never, { ...E, color: 'truecolor', hex: HEX }),
    [],
  )
  assert.match(
    checkDiagramScreen(screen(rgb(0x88c0d0), D) as never, { ...E, color: 'truecolor', hex: HEX })[0]!,
    /ping: expected label foreground/,
  )
  assert.deepEqual(checkDiagramScreen(screen(p256(110), p256(150)) as never, { ...E, color: '256' }), [])
  assert.deepEqual(checkDiagramScreen(screen(D, D) as never, { ...E, color: 'none' }), [])
  assert.match(
    checkDiagramScreen(screen(rgb(0x88c0d0), D) as never, { ...E, color: 'none' })[0]!,
    /读取配置文件: expected no color/,
  )
})

test('A9.harness: a drawn row holds a label outside its source line; source rows are not drawn ones', () => {
  const src = ['A[读取配置文件] -->|成功| B{完成?}', 'U->>S: ping']
  const text = [
    '⏺ Here is the config flow:',
    '  A[读取配置文件] -->|成功| B{完成?}',
    '  U->>S: ping',
    '[ 读取配置文件 ]──成功──►{ 完成? }',
    '   │ ping  │',
  ].join('\n')
  assert.deepEqual(drawnRows(text, ['读取配置文件', 'ping'], src), [
    '[ 读取配置文件 ]──成功──►{ 完成? }',
    '   │ ping  │',
  ])
  assert.deepEqual(drawnRows(text.split('\n').slice(0, 3).join('\n'), ['读取配置文件', 'ping'], src), [])
})

// A screen row as the terminal holds it: a wide character's second cell is ''.
const cellsOf = (s: string) =>
  [...s].flatMap((ch) =>
    /[\u2e80-\uffef]/.test(ch)
      ? [
          { ch, width: 2, fg: D, bg: D },
          { ch: '', width: 0, fg: D, bg: D },
        ]
      : [{ ch, width: 1, fg: D, bg: D }],
  )
const FLOW = drawnDiagrams(REPLY, 100, 'mono')
const MONO = {
  labels: { 读取配置文件: 'node', ping: 'label' },
  prose: ['Here is the config flow:', 'And the handshake:'],
  color: 'none',
  diagrams: FLOW,
} as const
// REPLY's prose and diagrams as Claude Code lays them out: a two-column margin, the reply bullet in the first.
const lay = (flow: readonly string[], seq: readonly string[]) =>
  [
    '⏺ Here is the config flow:',
    '',
    ...flow.map((r) => `  ${r}`),
    '',
    '  And the handshake:',
    '',
    ...seq.map((r) => `  ${r}`),
  ].map(cellsOf)
test("A9.harness: the screen must hold each drawn diagram's rows, as the renderer draws them, in order", () => {
  assert.equal(FLOW.length, 2)
  assert.ok(
    FLOW.every((d) => d.some((r) => /[─│►◄▲▼]/.test(r))),
    'the rows hold edge and arrow glyphs',
  )
  assert.deepEqual(checkDiagramScreen(lay(FLOW[0]!, FLOW[1]!) as never, MONO), [])
  const labelsOnly = (d: readonly string[]) => d.map((r) => r.replace(/[^\p{L}\p{N}?\s]/gu, ' '))
  assert.match(
    checkDiagramScreen(lay(labelsOnly(FLOW[0]!), labelsOnly(FLOW[1]!)) as never, MONO).join('\n'),
    /diagram 1: not drawn[\s\S]*diagram 2: not drawn/,
  )
  const source = splitSource(REPLY)
  assert.match(
    checkDiagramScreen(lay(source[0]!, source[1]!) as never, MONO).join('\n'),
    /diagram 1: not drawn[\s\S]*diagram 2: not drawn/,
  )
  assert.match(checkDiagramScreen(lay(FLOW[1]!, FLOW[0]!) as never, MONO).join('\n'), /diagram 2: not drawn/)
})
// The reply's first two mermaid fences, each as its lines, fence lines included.
const splitSource = (t: string) =>
  t
    .split('\n\n')
    .filter((b) => b.startsWith('```mermaid'))
    .map((b) => b.split('\n'))

test("A9.lead: a drawn diagram's node or edge source lines on screen are problems", () => {
  const src = ['flowchart TD', 'S[开始] --> E[结束]']
  assert.deepEqual(sourceShown('⏺ flowchart TD\n  S[开始] --> E[结束]\n  After the diagram.', src), [
    'S[开始] --> E[结束]: drawn diagram shown as source',
  ])
  assert.deepEqual(sourceShown('⏺ [ 开始 ]\n     │\n     ▼\n  [ 结束 ]\n  After the diagram.', src), [])
})

test('A9.harness: a label is checked where its diagram is drawn, not in other text that holds it, like a Windows cwd', () => {
  const cells = [
    row('  C:\\Users\\runneradmin\\AppData\\Local\\Temp\\mtty-x\\cwd'),
    row(''),
    row('  [ User ]', D, rgb(0x88c0d0)),
  ]
  const spec = {
    labels: { User: 'node' },
    prose: [],
    diagrams: [['[ User ]']],
    color: 'truecolor',
    hex: { node: 0x88c0d0 },
  } as const
  assert.deepEqual(checkDiagramScreen(cells as never, spec), [])
})

// Claude Code's own UI colour (its spinner), which mono never draws.
const CLAUDE = rgb(0xd77757)
const tint = (c: object, fg: object) => ({ ...c, fg })
test("A9.harness: under mono, only the cells the diagram draws must carry no color; Claude Code's own UI may color the rest", () => {
  const cells = lay(FLOW[0]!, FLOW[1]!) as any[][]
  const y = cells.findIndex((r) =>
    r
      .map((c: any) => c.ch)
      .join('')
      .includes('读取配置文件'),
  )
  // A blank margin cell and a blank cell past the drawing's end on the label's row, and a spinner row below it all.
  cells[y]![0] = tint(cells[y]![0], CLAUDE)
  cells[y]!.push({ ch: ' ', width: 1, fg: CLAUDE, bg: D })
  cells.push([{ ch: '✻', width: 1, fg: CLAUDE, bg: D }, ...cellsOf(' Thinking…').map((c) => tint(c, CLAUDE))])
  assert.deepEqual(checkDiagramScreen(cells as never, MONO), [])
})

test('A9.harness: under mono, a blank cell the diagram covers may carry a foreground color: it shows none, as the Claude Code spinner leaves on Windows', () => {
  const cells = lay(FLOW[0]!, FLOW[1]!) as any[][]
  const y = cells.findIndex((r) =>
    r
      .map((c: any) => c.ch)
      .join('')
      .includes('读取配置文件'),
  )
  const x = cells[y]!.findIndex((c: any, i: number) => i >= 4 && c.ch === ' ')
  cells[y]![x] = tint(cells[y]![x], CLAUDE)
  assert.deepEqual(checkDiagramScreen(cells as never, MONO), [])
  // A background shows on a blank cell, so it is still a problem.
  cells[y]![x] = { ...cells[y]![x], bg: CLAUDE }
  assert.match(checkDiagramScreen(cells as never, MONO).join('\n'), /diagram 1: expected no color, got ' '/)
})

test("A9.harness: under mono, a colored cell the diagram draws is a problem, on a label's row or not", () => {
  const tinted = (pick: (rows: string[]) => number, n: number) => {
    const cells = lay(FLOW[0]!, FLOW[1]!) as any[][]
    const text = cells.map((r) => r.map((c: any) => c.ch).join(''))
    const y = pick(text)
    const x = cells[y]!.findIndex((c: any, i: number) => i >= 2 && /[─│►▼]/.test(c.ch))
    cells[y]![x] = tint(cells[y]![x], CLAUDE)
    return checkDiagramScreen(cells as never, MONO)
      .join('\n')
      .match(new RegExp(`diagram ${n}: expected no color, got '.' fg rgb #d77757`))
  }
  // A ► on the label's row, outside the label; a glyph of diagram 2 on a row that holds no label.
  assert.ok(tinted((t) => t.findIndex((r) => r.includes('读取配置文件')), 1))
  assert.ok(tinted((t) => t.findIndex((r, y) => y > 5 && /[─│►▼]/.test(r) && !r.includes('ping')), 2))
})
