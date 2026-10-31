// The workflow rules run on the parsed YAML tree (docs/workflow-tree.ts): real keys and values, never substrings; what they cannot read fails.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { need, publishWikiErrors, readWorkflow } from '../docs/workflow-tree.ts'
const SHA = 'a'.repeat(40)
const PINNED = `actions/checkout@${SHA} # v7.0.1`
// A workflow whose one job, x, has these steps; they start on line 6.
const wf = (steps: string) => `on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`
const errors = (yml: string) => readWorkflow('w.yml', yml).errors
test('a pinned uses, a bash .sh step with an id and a plain run step pass', () => {
  assert.deepEqual(
    errors(
      wf(
        `      - uses: ${PINNED}\n      - id: check\n        shell: bash\n        run: bash scripts/x.sh\n      - run: echo "this step uses actions/checkout@v7"\n`,
      ),
    ),
    [],
  )
})
test('bypass 1: a multi-line flow sequence cannot hide a quoted uses key', () => {
  assert.deepEqual(
    errors(
      'on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: [\n      "uses":"actions/checkout@v7"\n    ]\n',
    ),
    [
      'w.yml:5: unreadable: jobs.x.steps must be a block sequence',
      'w.yml:6: action not pinned by full SHA with a # version comment: "uses":"actions/checkout@v7"',
    ],
  )
})
test('bypass 2: an id in a comment or shell: bash in a script is not a key', () => {
  assert.deepEqual(
    errors(
      wf(
        '      - run: node scripts/x.ts # id: check\n      - id: y\n        run: |\n          echo "shell: bash"\n          bash scripts/x.sh\n',
      ),
    ),
    ['w.yml:6: check step has no stable id', 'w.yml:7: step runs a .sh script without shell: bash'],
  )
})
test('every earlier spelling of a uses key is read as uses: quoted, spaced, capital, escaped, explicit or in a flow mapping', () => {
  for (const s of [
    '- "uses": actions/checkout@v7',
    "- 'uses': actions/checkout@v7",
    '- uses : actions/checkout@v7',
    '- Uses: actions/checkout@v7',
    '- "us\\u0065s": actions/checkout@v7',
    '- ? uses\n        : actions/checkout@v7',
    '- { uses: actions/checkout@v7 }',
    `- { uses: actions/checkout@${SHA} } # v7.0.1`,
  ]) {
    assert.ok(
      errors(wf(`      ${s}\n`)).some((e) => e.includes(': action not pinned by full SHA with a # version comment: ')),
      s,
    )
  }
  for (const s of [`- "uses": ${PINNED}`, `- 'uses' : ${PINNED}`, `- uses: "actions/checkout@${SHA}" # v7.0.1`]) {
    assert.deepEqual(errors(wf(`      ${s}\n`)), [], s)
  }
})
test('a quoted or spaced run, id or shell key is that key, held to its rule', () => {
  for (const k of ['"run"', "'run'", 'run ']) {
    assert.deepEqual(
      errors(wf(`      - id: x\n        ${k}: bash scripts/x.sh\n`)),
      ['w.yml:6: step runs a .sh script without shell: bash'],
      k,
    )
    assert.deepEqual(
      errors(wf(`      - shell: bash\n        ${k}: node scripts/x.ts\n`)),
      ['w.yml:6: check step has no stable id'],
      k,
    )
  }
  for (const k of ['"id"', "'id'", 'id ']) {
    assert.deepEqual(errors(wf(`      - ${k}: x\n        run: node scripts/x.ts\n`)), [], k)
  }
  for (const k of ['"shell"', "'shell'", 'shell ']) {
    assert.deepEqual(errors(wf(`      - id: x\n        ${k}: bash\n        run: bash scripts/x.sh\n`)), [], k)
  }
})
test('an anchor/alias fixture fails: a step reused by alias, or a uses key spelled by an alias, is reported, never passed', () => {
  const reused = errors(
    'on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - &step\n        id: x\n        shell: bash\n        run: bash scripts/x.sh\n' +
      '  y:\n    runs-on: ubuntu-latest\n    steps:\n      - *step\n',
  )
  for (const want of [
    'unreadable: anchor &step',
    'w.yml:13: unreadable: alias *step',
    'w.yml:13: unreadable: jobs.y.steps[0] must be a block mapping',
  ]) {
    assert.ok(
      reused.some((e) => e.includes(want)),
      want,
    )
  }
  assert.ok(
    errors(`x: &k uses\n${wf('      - *k : actions/checkout@v7\n')}`).some((e) => e.includes('unreadable: alias *k')),
  )
})
test('a merge key, a tag, a non-string key, a duplicate key, YAML 1.1, a second document or flow-style jobs is unreadable, never a pass', () => {
  const cases: [string, string][] = [
    [wf(`      - <<: {}\n        uses: ${PINNED}\n`), 'unreadable: merge key <<'],
    [wf(`      - uses: !!str ${PINNED}\n`), 'unreadable: tag tag:yaml.org,2002:str'],
    [wf('      - 1: x\n'), 'unreadable: non-string key 1'],
    [wf('      - run: echo a\n        run: echo b\n'), 'unreadable: DUPLICATE_KEY'],
    [`%YAML 1.1\n---\n${wf('      - run: echo a\n')}`, 'unreadable: non-string key true'],
    [`${wf('      - run: echo a\n')}---\non: push\n`, 'unreadable: MULTIPLE_DOCS'],
    ['on: push\njobs: { x: { runs-on: ubuntu-latest } }\n', 'unreadable: jobs must be a block mapping'],
    ['on: push\njobs:\n  x: { runs-on: ubuntu-latest }\n', 'unreadable: jobs.x must be a block mapping'],
  ]
  for (const [yml, want] of cases) {
    assert.ok(
      errors(yml).some((e) => e.includes(want)),
      want,
    )
  }
})
test('the real workflows are readable and pin every action, and publish-wiki.yml passes its rules', () => {
  const dir = new URL('../../.github/workflows/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'))
  assert.ok(files.includes('ci.yml') && files.includes('publish-wiki.yml'), files.join())
  for (const f of files) {
    const { unreadable, errors: e } = readWorkflow(f, readFileSync(new URL(f, dir), 'utf8'))
    assert.deepEqual([unreadable, e.filter((x) => x.includes('not pinned'))], [[], []], f)
  }
  assert.deepEqual(publishWikiErrors(readFileSync(new URL('publish-wiki.yml', dir), 'utf8')), [])
})
test('the # vN comment must follow the uses value on its own line', () => {
  for (const s of [
    `      # v7.0.1\n      - uses: actions/checkout@${SHA}\n`,
    `      - uses: actions/checkout@${SHA}\n        # v7.0.1\n`,
    `      - uses: actions/checkout@${SHA} #v7\n`,
  ]) {
    assert.ok(
      errors(wf(s)).some((e) => e.includes('not pinned')),
      s,
    )
  }
})
test('need() reads object keys and values, never text in a comment or a script', () => {
  const { value } = readWorkflow(
    'w.yml',
    'on: push # workflow_dispatch:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: \'echo "workflow_dispatch: on"\'\n',
  )
  assert.deepEqual(need('w.yml', value, [['workflow_dispatch', (w) => Object.hasOwn(w.on, 'workflow_dispatch')]]), [
    'w.yml: missing workflow_dispatch',
  ])
})
