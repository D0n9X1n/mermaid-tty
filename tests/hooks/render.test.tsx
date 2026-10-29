import { test, expect } from 'claude-code/testing'; import { THEMES } from '../../core/themes.ts'
const FC = '```mermaid\nflowchart TD\nA[读取] --> B[完成]\n```\n', BAD = '```mermaid\nflowchart TD\nA[👨‍👩]\n```\n'
const mount = ($: any, text: string, surface = 'terminal', extra: object = {}) => $.ui.mount({ plugin: 'mermaid-tty', surface, component: 'AssistantMessage',
  props: { text, isFirstOfReply: true, ...extra }, viewport: { columns: 80, rows: 40 } })
const capture = (on: any) => { const seen: string[] = [], logs: string[] = [], props: any[] = []
  on('ui.log', async (_$: any, e: any) => { logs.push(`${e.to}:${e.text}`); return { value: undefined } })
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => { seen.push(e.props.text); props.push(e.props); const { Text } = $.ui.resolve(e); return <Text>{e.props.text}</Text> })
  return { seen, logs, props } }
test('A6.hook-tests: prose reaches next() unchanged; diagrams render in order', async ($, on) => {
  const c = capture(on), ui = await mount($, `Intro\n${FC}Outro`)
  expect(c.seen).toEqual(['Intro\n', 'Outro']); expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
  c.seen.length = 0; const two = await mount($, FC + FC); expect(c.seen).toEqual(['']); expect(await two.find({ key: 'mermaid-1' })).toBeDefined()  // D5: empty prose
  c.seen.length = 0; await mount($, `P1\r\n\r\n${FC.replace(/\n/g, '\r\n')}\r\nP2`); expect(c.seen).toEqual(['P1\r\n\r\n', '\r\nP2'])
  c.seen.length = 0; await mount($, `${FC}\r\n\r\n${FC}`); expect(c.seen).toEqual(['', '\r\n\r\n'])  // whitespace-only prose between fences reaches next() unchanged
})
test('A6.hook-tests: read-only props pass through; a leading diagram keeps its bullet (D5)', async ($, on) => {
  const c = capture(on); await mount($, `Intro\n${FC}Outro`, 'terminal', { isSummary: true }); expect(c.props.map(p => p.isSummary)).toEqual([true, true])
  c.props.length = 0; await mount($, `${FC}Outro`); expect(c.props.map(p => [p.text, p.isFirstOfReply])).toEqual([['', true], ['Outro', false]])
})
test('A6.hook-tests: an unclosed fence and a non-terminal surface reach next(e) untouched', async ($, on) => {
  const c = capture(on), open = 'x\n```mermaid\nflowchart TD\nA'; await mount($, open); await mount($, `Intro\n${FC}`, 'desktop')
  expect(c.seen).toEqual([open, `Intro\n${FC}`])
})
test('A5.errors: a failed diagram draws the original fence; the reason goes only to the debug log', async ($, on) => {
  const c = capture(on), reply = `Intro\n${BAD}Outro`, ui = await mount($, reply)
  expect(c.seen).toEqual([reply]); expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(JSON.stringify(await ui.drawn()).includes('unsupported')).toBe(false); expect(c.logs).toEqual(['debug:mermaid-tty fallback: unsupported-char U+200D'])
})
// After A5, whose log assertion needs BAD's first (uncached) render.
test('A5.errors: a failed fence beside a drawn one joins the prose around it', async ($, on) => {
  const c = capture(on), ui = await mount($, `Intro\n${BAD}Mid\n${FC}Outro`)
  expect(c.seen).toEqual([`Intro\n${BAD}Mid\n`, 'Outro']); expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
})
// The 7th role, note, is a sequence role: its test lands with sequence registration (T24), as this runner has no todo.
const ROLES ='flowchart TD\nA[读取] -->|yes| B{ok?}\nsubgraph F [Frame]\nC[x]\nend\n'
// has(re, k, v): some colored Text whose text matches re carries props[k] === v.
const inks = async (ui: any) => { const s = (await ui.findAll({ type: 'Text' })).filter((x: any) => x.props.color || x.props.backgroundColor)
  return (re: RegExp, k: string, v: unknown) => s.some((x: any) => re.test(x.text) && x.props[k] === v) }
for (const theme of ['default', 'nord', 'dracula', 'gruvbox', 'solarized'] as const) {
  test(`A7: the 6 flowchart roles draw in their ${theme} colors`, { options: { theme } }, async ($, on) => {
    capture(on); const ui = await mount($, '```mermaid\n' + ROLES + '```\n'), r = THEMES[theme].roles, has = await inks(ui)
    expect([has(/读取/, 'backgroundColor', r.node), has(/ok\?/, 'backgroundColor', r.decision), has(/[│─┌┐└┘┼]/, 'color', r.edge),
      has(/[►◄▲▼]/, 'color', r.arrow), has(/yes/, 'color', r.label), has(/Frame/, 'color', r.frame)]).toEqual([true, true, true, true, true, true])
  })
}
