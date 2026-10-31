import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readWorkflow } from '../docs/workflow-tree.ts'
import { versionsErrors } from '../docs/ci-rules.ts'
const SHA = 'a'.repeat(40)
const NODE = `      - uses: actions/setup-node@${SHA} # v7.1.0\n        with:\n          node-version: 24\n`
const VERS =
  "on:\n  schedule:\n    - cron: '41 */4 * * *'\n  workflow_dispatch:\n    inputs:\n      version:\n        required: false\n\npermissions:\n  contents: read\n\njobs:\n" +
  '  list:\n    outputs:\n      versions: ${{ steps.untested.outputs.versions }}\n    steps:\n      - id: untested\n        run: versions="$(node scripts/cc-versions.ts list a b)"\n' +
  '  a9:\n    needs: list\n    strategy:\n      fail-fast: false\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n' +
  '        version: ${{ fromJSON(needs.list.outputs.versions) }}\n    runs-on: ${{ matrix.os }}\n    steps:\n' +
  NODE +
  '      - run: npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"\n      - id: a9-version\n        run: node scripts/e2e/run.ts --claude-version "${{ matrix.version }}"\n' +
  `      - if: always()\n        uses: actions/upload-artifact@${SHA} # v7.0.2\n        with:\n          name: leg-\${{ matrix.version }}-\${{ matrix.os }}\n` +
  "  record:\n    needs: [list, a9]\n    if: ${{ !cancelled() && needs.list.outputs.versions != '[]' }}\n    permissions:\n      contents: write\n    steps:\n" +
  '      - id: record\n        run: |\n          node scripts/cc-versions.ts record legs t v\n          git push origin HEAD:claude-code-tested\n'
test('the version workflow passes, and each clause is required', () => {
  assert.deepEqual(versionsErrors(VERS), [])
  for (const [from, to, want] of [
    ["'41 */4 * * *'", "'41 4 * * 1'", 'schedule'],
    ['    inputs:\n      version:\n        required: false\n', '', 'version input'],
    ['fail-fast: false', 'fail-fast: true', 'fail-fast'],
    ['!cancelled() && ', '', 'record even when'],
    [' --claude-version "${{ matrix.version }}"', '', 'A9 per version'],
    ['contents: read', 'contents: write', 'outside the record job'],
    ['node scripts/cc-versions.ts record', 'node scripts/cc-versions.ts list', 'every result recorded'],
    ['      - if: always()\n        uses: actions/upload', '      - uses: actions/upload', 'a result per leg'],
    ['HEAD:claude-code-tested', 'HEAD:main', 'tested-version record'],
    ['${{ fromJSON(needs.list.outputs.versions) }}', '[2.1.308]', 'a version per leg'],
    ['"@anthropic-ai/claude-code@${{ matrix.version }}"', '@anthropic-ai/claude-code@latest', 'that version from npm'],
    [
      '  a9:\n    needs: list\n',
      '  a9:\n    needs: list\n    permissions:\n      contents: write\n',
      'outside the record job',
    ],
    ['scripts/cc-versions.ts list a b', 'scripts/other.ts list a b', 'untested-version list'],
  ]) {
    assert.ok(
      versionsErrors(VERS.replace(from, () => to)).some((e) => e.includes(want)),
      want,
    )
  }
})
const real = () => readFileSync(new URL('../../.github/workflows/claude-code-versions.yml', import.meta.url), 'utf8')
test('the real version workflow passes, keeps the runner context out of job env, and check-docs runs its rule', () => {
  assert.deepEqual(versionsErrors(real()), [])
  for (const [id, j] of Object.entries<any>((readWorkflow('claude-code-versions.yml', real()).value as any).jobs)) {
    assert.ok(!JSON.stringify(j.env ?? {}).includes('runner.'), `${id}: runner context in job env`)
  }
  assert.match(
    readFileSync(new URL('../check-docs.ts', import.meta.url), 'utf8'),
    /versionsErrors\(read\('\.github\/workflows\/claude-code-versions\.yml'\)\)/,
  )
})
