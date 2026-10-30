import test from 'node:test'; import assert from 'node:assert/strict'; import { readSource, type Source } from '../../core/source.ts'
// #25. A config setting draws only if a renderer here honours it, or if it was seen under Mermaid 12.2.0 (JSDOM) to change
// only pixels, with a value of a type Mermaid takes. Each case is written as frontmatter config and as an init directive.
type Obj = { [k: string]: string | number | boolean | Obj }
const yaml = (o: Obj, pad = '  '): string => Object.entries(o).map(([k, v]) =>
  typeof v === 'object' ? `${pad}${k}:\n${yaml(v, `${pad}  `)}` : `${pad}${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`).join('\n')
const forms = (o: Obj) => [`---\nconfig:\n${yaml(o)}\n---\nflowchart TD\nA`, `%%{init: ${JSON.stringify(o)}}%%\nflowchart TD\nA`]
const flat = (o: Obj, p = ''): Record<string, unknown> =>
  Object.assign({}, ...Object.entries(o).map(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : { [p + k]: v })))

test('#25: a setting that changes what Mermaid shows, or one of a type Mermaid rejects, falls back with config:<key>', () => {
  const bad: [Obj, string][] = [
    // The cross-family review's cases.
    [{ gitGraph: { showBranches: false } }, 'gitGraph.showBranches'], [{ gitGraph: { showCommitLabel: false } }, 'gitGraph.showCommitLabel'],
    [{ sequence: { showSequenceNumbers: true } }, 'sequence.showSequenceNumbers'], [{ xyChart: { xAxis: { showLabel: false } } }, 'xyChart.xAxis.showLabel'],
    [{ xyChart: { yAxis: { showLabel: false } } }, 'xyChart.yAxis.showLabel'], [{ xyChart: { chartOrientation: 'horizontal' } }, 'xyChart.chartOrientation'],
    [{ quadrantChart: { showTitle: false } }, 'quadrantChart.showTitle'], [{ sequence: { wrap: true } }, 'sequence.wrap'], [{ wrap: true }, 'wrap'],
    [{ fontFamily: 1 }, 'fontFamily'],
    // Font metrics move wrapLabel's hyphens; other values Mermaid throws on or reads otherwise; settings not verified.
    [{ fontFamily: 'monospace' }, 'fontFamily'], [{ fontSize: 30 }, 'fontSize'], [{ theme: 1 }, 'theme'], [{ theme: 'nope' }, 'theme'],
    [{ themeVariables: { primaryColor: 'notacolor' } }, 'themeVariables.primaryColor'], [{ themeVariables: { primaryColor: 1 } }, 'themeVariables.primaryColor'],
    // The second review's cases: a 0px text size, malformed or transparent colours, a text colour on its own background,
    // a tiny quadrant chart, pie labels pushed off the chart. Any colour can match another and hide text, so none draws.
    [{ themeVariables: { pieTitleTextSize: '0px' } }, 'themeVariables.pieTitleTextSize'], [{ themeVariables: { pieSectionTextSize: '17px' } }, 'themeVariables.pieSectionTextSize'],
    [{ themeVariables: { primaryColor: 'rgb(1)' } }, 'themeVariables.primaryColor'], [{ themeVariables: { primaryColor: '#0000' } }, 'themeVariables.primaryColor'],
    [{ themeVariables: { primaryColor: 'transparent' } }, 'themeVariables.primaryColor'], [{ themeVariables: { primaryColor: 'rgba(0, 0, 0, 0)' } }, 'themeVariables.primaryColor'],
    [{ theme: 'base', themeVariables: { primaryColor: '#123456', primaryTextColor: '#123456' } }, 'themeVariables.primaryColor'],
    [{ themeVariables: { mainBkg: '#333333' } }, 'themeVariables.mainBkg'], [{ themeVariables: { primaryColor: '#ff0000' } }, 'themeVariables.primaryColor'],
    [{ themeVariables: { xyChart: { plotColorPalette: '#000000, #0000FF' } } }, 'themeVariables.xyChart.plotColorPalette'],
    [{ themeVariables: { pieOuterStrokeWidth: '0px' } }, 'themeVariables.pieOuterStrokeWidth'], [{ themeVariables: { pieOuterStrokeWidth: '21px' } }, 'themeVariables.pieOuterStrokeWidth'],
    // Third review: wider than Mermaid's 2px default, the strokes cover more of a thin slice's label (52% at 5px, 21% at 2px).
    [{ themeVariables: { pieOuterStrokeWidth: '20px' } }, 'themeVariables.pieOuterStrokeWidth'], [{ themeVariables: { pieOuterStrokeWidth: '5px' } }, 'themeVariables.pieOuterStrokeWidth'],
    [{ themeVariables: { pieStrokeWidth: '5px' } }, 'themeVariables.pieStrokeWidth'], [{ themeVariables: { pieStrokeWidth: '2.5px' } }, 'themeVariables.pieStrokeWidth'],
    [{ themeVariables: { strokeWidth: '2px' } }, 'themeVariables.strokeWidth'],
    [{ quadrantChart: { chartWidth: 50 } }, 'quadrantChart.chartWidth'], [{ quadrantChart: { chartHeight: 499 } }, 'quadrantChart.chartHeight'],
    [{ quadrantChart: { chartWidth: 2001 } }, 'quadrantChart.chartWidth'], [{ pie: { textPosition: 0 } }, 'pie.textPosition'],
    [{ pie: { textPosition: 0.49 } }, 'pie.textPosition'], [{ pie: { textPosition: 1.5 } }, 'pie.textPosition'], [{ pie: { textPosition: -1 } }, 'pie.textPosition'],
    [{ flowchart: { wrappingWidth: 120 } }, 'flowchart.wrappingWidth'], [{ mindmap: { maxNodeWidth: 150 } }, 'mindmap.maxNodeWidth'],
    [{ themeVariables: { quadrant1TextFill: 'ff0000' } }, 'themeVariables.quadrant1TextFill'], [{ themeVariables: { pieOpacity: '0' } }, 'themeVariables.pieOpacity'],
    [{ themeVariables: { useGradient: true } }, 'themeVariables.useGradient'], [{ themeVariables: { fontSize: '30px' } }, 'themeVariables.fontSize'],
    [{ themeVariables: { THEME_COLOR_LIMIT: 3 } }, 'themeVariables.THEME_COLOR_LIMIT'], [{ themeVariables: { pieOuterStrokeWidth: '5' } }, 'themeVariables.pieOuterStrokeWidth'],
    [{ flowchart: { wrappingWidth: '200' } }, 'flowchart.wrappingWidth'], [{ flowchart: { wrappingWidth: 0 } }, 'flowchart.wrappingWidth'],
    [{ markdownAutoWrap: 'false' }, 'markdownAutoWrap'], [{ gantt: { displayMode: 'compact' } }, 'gantt.displayMode'], [{ flowchart: { curve: 'basis' } }, 'flowchart.curve'],
    [{ securityLevel: 'loose' }, 'securityLevel'], [{ look: 'handDrawn' }, 'look'], [{ title: 'x' }, 'title'], [{ gitGraph: { rotateCommitLabel: false } }, 'gitGraph.rotateCommitLabel'],
    [{ logLevel: 'loud' }, 'logLevel'], [{ pie: { textPosition: 'x' } }, 'pie.textPosition'], [{ quadrantChart: { chartWidth: -1 } }, 'quadrantChart.chartWidth'],
    [{ htmlLabels: false }, 'htmlLabels'], [{ class: { htmlLabels: true } }, 'htmlLabels'],
    [{ xyChart: { showDataLabel: 'true' } }, 'xyChart.showDataLabel']]
  const got = bad.flatMap(([o]) => forms(o).map(t => readSource(t)))
  assert.deepEqual(got, bad.flatMap(([, k]) => [{ reason: `config:${k}` }, { reason: `config:${k}` }]))
  assert.deepEqual(readSource('%%{wrap}%%\nsequenceDiagram\nA->>B: hi'), { reason: 'config:wrap' })
  // processFrontmatter moves a top-level displayMode to gantt.displayMode.
  assert.deepEqual(readSource('---\ndisplayMode: compact\n---\ngantt\ntask : 2024-01-01, 1d'), { reason: 'config:gantt.displayMode' })
})

test('#25: settings honoured here, or seen to change only pixels with a value Mermaid takes, draw', () => {
  const good: Obj[] = [{ theme: 'dark' }, { theme: 'base' }, { theme: 'default' }, { theme: 'forest' }, { logLevel: 'debug' }, { logLevel: 5 },
    { theme: 'neutral', themeVariables: { pieOuterStrokeWidth: '1px', pieStrokeWidth: '0.5px' } }, { themeVariables: { pieOuterStrokeWidth: '2px', pieStrokeWidth: '2px' } },
    { htmlLabels: true, flowchart: { htmlLabels: true }, markdownAutoWrap: false },
    { pie: { textPosition: 0.5 } }, { pie: { textPosition: 1 } }, { quadrantChart: { chartWidth: 500, chartHeight: 2000 } }, { xyChart: { showDataLabel: true } }, { xyChart: { showDataLabel: false } },
    { gitGraph: { showBranches: true, showCommitLabel: true, mainBranchName: 'trunk', mainBranchOrder: 2 } }, { mindmap: { colorBy: 'depth' } },
    { timeline: { disableMulticolor: true } }]
  const got = good.flatMap(o => forms(o).map(t => { const s = readSource(t); return 'reason' in s ? s : s.config }))
  assert.deepEqual(got, good.flatMap(o => [flat(o), flat(o)]))
  // cleanAndMerge lays the directive over the frontmatter, so its htmlLabels: true wins, as later inits win over earlier ones.
  assert.deepEqual((readSource('---\nconfig:\n  htmlLabels: false\n---\n%%{init: {"htmlLabels": true}}%%\nflowchart TD\nA') as Source).config, { htmlLabels: true })
  assert.deepEqual((readSource('%%{init: {"htmlLabels": false}}%%\n%%{init: {"htmlLabels": true}}%%\nflowchart TD\nA') as Source).config, { htmlLabels: true })
})

// PM, #25: a sequence frame's lifelines follow Mermaid's default geometry, which a sequence.* margin or width can move, so
// none of them is allowed, default value or not.
test('#25: a sequence geometry setting around a framed diagram falls back', () => {
  const framed = 'sequenceDiagram\nbox Team\nparticipant A\nparticipant B\nend\nrect rgb(1, 2, 3)\nA->>B: hi\nend\nloop again\nB->>A: ok\nend'
  assert.ok(!('reason' in readSource(framed)))
  const keys: [string, string | number | boolean][] = [['boxMargin', 40], ['actorMargin', 50], ['width', 150], ['boxTextMargin', 5],
    ['noteMargin', 10], ['messageMargin', 35], ['mirrorActors', true], ['diagramMarginX', 50]]
  for (const [k, v] of keys) {
    const o = { sequence: { [k]: v } }
    assert.deepEqual([`---\nconfig:\n  sequence:\n    ${k}: ${v}\n---\n${framed}`, `%%{init: ${JSON.stringify(o)}}%%\n${framed}`].map(t => readSource(t)),
      [{ reason: `config:sequence.${k}` }, { reason: `config:sequence.${k}` }], k)
  }
})
