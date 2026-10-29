# mermaid-tty v1 B2: CI and release (T8, T15, T17)

Part of [plan B](2026-10-28-mermaid-tty-v1-B-docs-release.md), which holds the design check, component map, traceability, runbook and reconciliation. Each task adds its failing check, then the code under it, then runs its done-when command. The code ran on 2026-10-28 in a scratch tree against stub `core/` modules and a stub of plan A's `scripts/lib/check-ids.ts` (`parseIds`, D16). A **Waits on A** interface is an assumption (D3): confirm it against plan A. Commits: one per task on `feat/v1`, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Needs:** B1's T3 (`workflow.ts`, `doc-rules.ts`) and T6 (`check-docs.ts`); plan A's T1 (`scripts/lib/check-ids.ts`, the one check-ID parser, D16); T15 also needs B3's T9–T14 and T18, because `check.sh` runs every check. **Unblocks:** B3's T9 (T8), T12 (T8, T17), T18 (T8) and T16 (T15). Tasks are in run order; T9, T10 and T16 are in B3 to keep this file under 500 lines.

### T8 — CI and release workflows
- **Files:** create `scripts/lib/ci-rules.ts` (C11), `scripts/tests/ci-rules_test.ts` (C12), `.github/workflows/ci.yml` (P3) and `.github/workflows/release.yml` (P4); add C10's two `// T8` lines to `scripts/check-docs.ts`. **Acceptance:** B4, B5, B7, A8 platforms, A9 and VR wiring. **Depends on:** T3, T6, and A's T1 (`parseIds`, D16). **Group:** G4. **Waits on A** for green runs: `check.sh`, `scripts/e2e/` (`run.ts`, `package-lock.json`), `render-gallery.ts`, `check-review-hashes.ts`.
- **Failing check:** add C12; `node --test scripts/tests/ci-rules_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/ci-rules.ts`. After C11 and the `// T8` lines, `node scripts/check-docs.ts 2>&1 | grep -E 'ci\.yml|release\.yml'` → `missing …` lines.
- **Implement:** C11; the `// T8` lines (the import before the `doc-rules.ts` import, the `errors.push` right after the `const errors` statement); P3 and P4. The pins are checkout `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1), setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0) and upload-artifact `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7.0.2), from `gh api repos/actions/<name>/commits/<tag> -q .sha` on 2026-10-28.
- **Done when:** the test → `ℹ pass 24` (the check step passes `GH_TOKEN` for D15d's render cross-check); the grep prints nothing; `ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f) }' .github/workflows/*.yml` exits 0; green on three OSes at R2. The 48-ID test runs plan A's `parseIds` on the real acceptance file (D16; B keeps no parser of its own): when its labels change, update `IDS48` and `ci/coverage.json` in the same commit. **Commit:** `B: CI and release rules; CI on three OSes with e2e and gallery; release on v*`
````ts C11 — scripts/lib/ci-rules.ts
// CI and release rules: B4 ci.yml, release.yml and check.sh; B5 tag and notes; B7 check IDs and the coverage map. Text in, errors out.
import { INSTALL, common, need } from './workflow.ts';
const job = (yml: string, name: string) => new RegExp(`^  ${name}:\\n((?:(?: {4}.*)?\\n)*)`, 'm').exec(yml)?.[1] ?? '';
const MATRIX: [string, string | RegExp][] = [['fail-fast: false', 'fail-fast: false'], ['3-OS matrix', 'os: [ubuntu-latest, macos-latest, windows-latest]'],
  ['runs-on matrix.os', 'runs-on: ${{ matrix.os }}'], ['Node 24 via pinned actions/setup-node', /uses: actions\/setup-node@[0-9a-f]{40} # v\S+\n\s+with:\n\s+node-version: '?24'?\n/],
  ['pinned Claude Code from npm', /npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+\n/]];
export const ciErrors = (yml: string) => [...common('ci.yml', yml), ...need('ci.yml', yml, [
  ['pull_request trigger', /^  pull_request:/m], ['push trigger on every branch', /^  push:\n(?! {4}branches)/m], ['concurrency that cancels superseded runs', 'group: ci-${{ github.ref }}\n  cancel-in-progress: true']]),
  ...need('ci.yml check job', job(yml, 'check'), [...MATRIX, ['check.sh under bash', 'shell: bash\n        run: bash scripts/check.sh'],
    ['GH_TOKEN for the GitHub render cross-check (D15d)', 'run: bash scripts/check.sh\n        env:\n          GH_TOKEN: ${{ github.token }}\n']]),
  ...need('ci.yml e2e job', job(yml, 'e2e'), [...MATRIX, ['tmux on Linux', 'sudo apt-get install -y tmux'], ['tmux on macOS', 'brew install tmux'],
    ['Windows-only e2e tooling', "if: runner.os == 'Windows'\n        run: npm ci --prefix scripts/e2e"],
    ['C.UTF-8 on Linux', /LC_ALL: \$\{\{ runner\.os == 'Linux' && 'C\.UTF-8' \|\| '' \}\}/], ['A9 run', 'node scripts/e2e/run.ts']]),
  ...need('ci.yml gallery job', job(yml, 'gallery'), [['gallery render', 'node scripts/render-gallery.ts'], ['artifact upload', /uses: actions\/upload-artifact@[0-9a-f]{40}/]]),
  ...(yml.split('npm ci').length > 2 ? ['ci.yml: npm ci outside the e2e job'] : [])];
export const releaseErrors = (yml: string) => [...common('release.yml', yml), ...need('release.yml', yml, [
  ['v* tag trigger', "on:\n  push:\n    tags: ['v*']\n"], ['job-scoped contents: write and actions: read', '\n    permissions:\n      contents: write\n      actions: read\n'], ['publish-wiki run for the tagged commit', 'actions/workflows/publish-wiki.yml/runs?branch=main&head_sha=${GITHUB_SHA}'], ['publish-wiki concluded success', 'test "$conclusion" = success'],
  ['tag check', 'node scripts/check-release.ts tag "$GITHUB_REF_NAME"'], ['notes check on the published release', '| node scripts/check-release.ts notes -'],
  ['GitHub marketplace install', 'claude plugin marketplace add D0n9X1n/mermaid-tty'], ['A9 against the installed copy', 'node scripts/e2e/run.ts --installed']])];
export const checkShErrors = (sh: string) => [...(sh.startsWith('#!/usr/bin/env bash\nset -euo pipefail\n') ? [] : ['check.sh: must start with #!/usr/bin/env bash and set -euo pipefail']),
  ...(/\|\|\s*true\b|\bset \+e\b/.test(sh) ? ['check.sh: masks a failing command (|| true or set +e)'] : [])];
export const tagErrors = (tag: string, version: string) => (tag === `v${version}` ? [] : [`tag ${tag} does not match plugin.json version ${version}`]);
export const notesErrors = (notes: string) => INSTALL.filter((l) => !notes.includes(l)).map((l) => `release notes lack: ${l}`);
export const stepIds = (...ymls: string[]) => new Set(ymls.flatMap((y) => [...y.matchAll(/^\s+(?:- )?id: ([\w-]+)\s*$/gm)].map((m) => m[1]!)));
export function coverageErrors(ids: string[], coverage: Record<string, string | string[]>, steps: Set<string>): string[] {
  const e: string[] = [];
  for (const id of ids) if (![coverage[id] ?? []].flat().length) e.push(`${id}: no CI step`);
  for (const [id, v] of Object.entries(coverage)) {
    if (!ids.includes(id)) e.push(`${id}: unknown check ID`);
    for (const s of [v].flat()) if (!steps.has(s)) e.push(`${id}: step id ${s} is missing from ci.yml and release.yml`);
  }
  return e;
}
````
````ts C12 — scripts/tests/ci-rules_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkShErrors, ciErrors, coverageErrors, notesErrors, releaseErrors, stepIds, tagErrors } from '../lib/ci-rules.ts';
import { INSTALL } from '../lib/workflow.ts';
import { parseIds } from '../lib/check-ids.ts';
const SHA = 'a'.repeat(40);
const PIN = (a: string, v: string) => `      - uses: actions/${a}@${SHA} # ${v}\n`;
const NODE = PIN('setup-node', 'v7.1.0') + '        with:\n          node-version: 24\n';
const CLAUDE = '      - run: npm install -g @anthropic-ai/claude-code@2.1.308\n';
const OS3 = '    strategy:\n      fail-fast: false\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n    runs-on: ${{ matrix.os }}\n    steps:\n';
const CI = "on:\n  pull_request:\n  push:\nconcurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\njobs:\n" +
  `  check:\n${OS3}${PIN('checkout', 'v7.0.1')}${NODE}${CLAUDE}      - id: check\n        shell: bash\n        run: bash scripts/check.sh\n        env:\n          GH_TOKEN: \${{ github.token }}\n` +
  `  e2e:\n${OS3}${PIN('checkout', 'v7.0.1')}${NODE}${CLAUDE}      - if: runner.os == 'Linux'\n        run: sudo apt-get update && sudo apt-get install -y tmux\n      - if: runner.os == 'macOS'\n        run: brew install tmux\n      - id: e2e-tooling\n        if: runner.os == 'Windows'\n        run: npm ci --prefix scripts/e2e\n      - id: e2e\n        env:\n          LC_ALL: \${{ runner.os == 'Linux' && 'C.UTF-8' || '' }}\n        run: node scripts/e2e/run.ts\n` +
  `  gallery:\n    runs-on: ubuntu-latest\n    steps:\n      - id: gallery\n        run: node scripts/render-gallery.ts\n${PIN('upload-artifact', 'v7.0.2')}`;
const REL = "on:\n  push:\n    tags: ['v*']\n\njobs:\n  release:\n    permissions:\n      contents: write\n      actions: read\n    steps:\n" + PIN('checkout', 'v7.0.1') +
  '      - id: release-tag\n        run: node scripts/check-release.ts tag "$GITHUB_REF_NAME"\n      - id: release-notes-published\n        run: gh release view "$GITHUB_REF_NAME" --json body -q .body | node scripts/check-release.ts notes -\n' +
  '      - id: release-wiki-run\n        run: gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/publish-wiki.yml/runs?branch=main&head_sha=${GITHUB_SHA}&per_page=1"; test "$conclusion" = success\n      - id: release-install\n        run: claude plugin marketplace add D0n9X1n/mermaid-tty\n      - id: release-e2e\n        run: node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR"\n';
const SH = '#!/usr/bin/env bash\nset -euo pipefail\nclaude plugin validate .\n';
test('complete fixtures pass', () => assert.deepEqual([ciErrors(CI), releaseErrors(REL), checkShErrors(SH)], [[], [], []]));
const cases: [(s: string) => string[], string, string, string, string][] = [
  [ciErrors, CI, '  pull_request:\n', '', 'pull_request'], [ciErrors, CI, '  push:\n', '  push:\n    branches: [main]\n', 'push trigger on every branch'],
  [ciErrors, CI, 'cancel-in-progress: true', 'cancel-in-progress: false', 'concurrency'],
  [ciErrors, CI, 'claude-code@2.1.308', 'claude-code@latest', 'pinned Claude Code'], [ciErrors, CI, ', windows-latest]', ']', '3-OS matrix'],
  [ciErrors, CI, 'fail-fast: false', 'fail-fast: true', 'fail-fast'], [ciErrors, CI, 'node-version: 24', 'node-version: 22', 'Node 24'],
  [ciErrors, CI, 'shell: bash\n        run: bash scripts/check.sh', 'run: bash scripts/check.sh', 'without shell: bash'],
  [ciErrors, CI, '- id: e2e\n        env:', '- env:', 'no stable id'], [ciErrors, CI, 'brew install tmux', 'brew install screen', 'tmux on macOS'],
  [ciErrors, CI, "if: runner.os == 'Windows'\n        run: npm ci", 'run: npm ci', 'Windows-only'],
  [ciErrors, CI, 'run: node scripts/e2e/run.ts', 'run: node scripts/e2e/other.ts', 'A9 run'], [ciErrors, CI, 'actions/upload-artifact@', 'actions/upload-artifact@v7 #', 'artifact'],
  [releaseErrors, REL, "tags: ['v*']", 'branches: [main]', 'v* tag'], [releaseErrors, REL, ' --installed', '', 'installed copy'], [releaseErrors, REL, '      actions: read\n', '', 'actions: read'],
  [releaseErrors, REL, 'test "$conclusion" = success', 'true', 'publish-wiki concluded success'],
  [ciErrors, CI, '          GH_TOKEN: ${{ github.token }}\n', '', 'GH_TOKEN for the GitHub render cross-check'],
  [checkShErrors, SH, 'set -euo pipefail\n', '', 'set -euo pipefail'], [checkShErrors, SH, 'validate .', 'validate . || true', 'masks'],
];
for (const [rule, base, from, to, want] of cases)
  test(`rejects: ${want}`, () => assert.ok(rule(base.replace(from, to)).some((e) => e.includes(want)), `${from} -> ${to}`));
test('release: tag equals v + plugin.json version; notes carry both install commands', () => {
  assert.deepEqual([tagErrors('v1.0.0', '1.0.0'), notesErrors(INSTALL.join('\n'))], [[], []]);
  assert.equal(tagErrors('v1.0.1', '1.0.0').length + notesErrors(INSTALL[0]!).length, 2);
});
const IDS = ['A8', 'A8.portability', 'A8.no-build', 'VR.in-ci', 'B1', 'B1.beauty-review'], COV = Object.fromEntries(IDS.map((id) => [id, 'check']));
const IDS48 = ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 A6.hook-tests A6.command A6.in-claude-code ' +
  'A7 A8 A8.portability A8.benchmark A8.cache A8.no-build A8.validation A8.platforms A9 A9.harness A9.stored A9.release ' +
  'A10 VR.gallery VR.in-ci VR.reviewers VR.tangled VR.passes B1 B1.docs-check B1.beauty-review B2 B2.per-paragraph ' +
  'B2.translation-review B3 B3.publish-test B3.workflow-check B3.release B4 B5 B5.every-pr B5.release B6 B7 B7.check-ids').split(' ');
test('check IDs: plan A\'s one parser yields the 48 IDs that coverage.json maps; step ids', () => {
  assert.deepEqual(parseIds(readFileSync(new URL('../../docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', import.meta.url), 'utf8')).sort(), [...IDS48].sort());
  assert.deepEqual([...stepIds(CI)], ['check', 'e2e-tooling', 'e2e', 'gallery']);
});
test('coverage map: every check ID maps to an existing step id, and no unknown ID', () => {
  assert.deepEqual(coverageErrors(IDS, COV, new Set(['check'])), []);
  const { 'A8.no-build': _, ...missing } = COV;
  for (const [c, want] of [[missing, 'A8.no-build: no CI step'], [{ ...COV, B9: 'check' }, 'B9: unknown check ID'], [{ ...COV, A8: ['check', 'gone'] }, 'step id gone is missing']] as const)
    assert.ok(coverageErrors(IDS, c as Record<string, string | string[]>, new Set(['check'])).some((e) => e.includes(want)), want);
});
````
````ts C10 — scripts/check-docs.ts, the // T8 lines
import { checkShErrors, ciErrors, releaseErrors } from './lib/ci-rules.ts'; // T8
errors.push(...ciErrors(read('.github/workflows/ci.yml')), ...releaseErrors(read('.github/workflows/release.yml')), ...checkShErrors(read('scripts/check.sh'))); // T8
````
````yaml P3 — .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

# Claude Code is pinned here; claude-code-versions.yml runs A9 on each newly published version.

jobs:
  check:
    name: check (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - run: npm install -g @anthropic-ai/claude-code@2.1.308
      - id: check
        name: Must-pass suite (Git Bash on Windows; set -euo pipefail fails on any command)
        shell: bash
        run: bash scripts/check.sh
        env:
          GH_TOKEN: ${{ github.token }}
      - id: review-hashes
        name: Review verdicts still match the reviewed files (SHA-256)
        run: node scripts/check-review-hashes.ts

  e2e:
    name: e2e (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - run: npm install -g @anthropic-ai/claude-code@2.1.308
      - if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y tmux
      - if: runner.os == 'macOS'
        run: brew install tmux
      - id: e2e-tooling
        name: node-pty and @xterm/headless from the pinned lockfile (Windows has no tmux)
        if: runner.os == 'Windows'
        run: npm ci --prefix scripts/e2e
      - id: e2e
        name: A9, default mapping and every curated theme (mono expects no color)
        env:
          LC_ALL: ${{ runner.os == 'Linux' && 'C.UTF-8' || '' }}
        run: node scripts/e2e/run.ts

  gallery:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - id: gallery
        run: node scripts/render-gallery.ts gallery
      - id: gallery-upload
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: gallery
          path: gallery/
````
````yaml P4 — .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    # Publishing the GitHub Release is the only write, and actions: read checks the publish-wiki run; both grants stay on this job.
    permissions:
      contents: write
      actions: read
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      CLAUDE_CONFIG_DIR: ${{ runner.temp }}/claude-config
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - run: npm install -g @anthropic-ai/claude-code@2.1.308
      - id: release-tag
        run: node scripts/check-release.ts tag "$GITHUB_REF_NAME"
      - id: release-notes
        run: node scripts/check-release.ts notes "docs/release-notes/$GITHUB_REF_NAME.md"
      - id: release-wiki-run
        name: publish-wiki concluded success for the tagged commit on main (B3)
        run: |
          conclusion="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/publish-wiki.yml/runs?branch=main&head_sha=${GITHUB_SHA}&per_page=1" -q '.workflow_runs[0].conclusion')"
          echo "publish-wiki on ${GITHUB_SHA}: ${conclusion}"
          test "$conclusion" = success
      - id: release-wiki
        name: The published wiki matches wiki/ (B3)
        run: |
          git clone --depth 1 "https://github.com/${GITHUB_REPOSITORY}.wiki.git" "$RUNNER_TEMP/wiki"
          diff -r --exclude=.git wiki "$RUNNER_TEMP/wiki"
      - id: release-publish
        run: gh release create "$GITHUB_REF_NAME" --verify-tag --title "mermaid-tty $GITHUB_REF_NAME" --notes-file "docs/release-notes/$GITHUB_REF_NAME.md"
      - id: release-notes-published
        run: gh release view "$GITHUB_REF_NAME" --json body -q .body | node scripts/check-release.ts notes -
      - id: release-install
        name: Install from the GitHub marketplace into a fresh config
        run: |
          mkdir -p "$CLAUDE_CONFIG_DIR"
          claude plugin marketplace add D0n9X1n/mermaid-tty
          claude plugin install mermaid-tty@mermaid-tty
          claude plugin list | tee /dev/stderr | grep -F "Version: ${GITHUB_REF_NAME#v}"
      - run: sudo apt-get update && sudo apt-get install -y tmux
      - id: release-e2e
        name: A9 against the installed copy
        env:
          LC_ALL: C.UTF-8
        run: node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR"
````

### T17 — Claude Code version job
- **Files:** create `scripts/lib/cc-versions.ts` (V2), `scripts/cc-versions.ts` (V3), `scripts/tests/cc-versions_test.ts` (V4) and `.github/workflows/claude-code-versions.yml` (V1); add C10's `// T17` lines to `scripts/check-docs.ts`. **Acceptance:** spec B 4 and B4 (the scheduled job). **Depends on:** T3, T6. **Group:** G5. **Waits on A:** `run.ts --claude-version`.
- **Failing check:** add V4; `node --test scripts/tests/cc-versions_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/cc-versions.ts`.
- **Implement:** V2, V3, V1 and C10's `// T17` lines (the import after the `doc-rules.ts` import, the `errors.push` after the `// T8` one).
- **Done when:** the test → `ℹ pass 4`, the stall scenario included; `node scripts/check-docs.ts 2>&1 | grep -F claude-code-versions.yml` prints nothing; after merge, the first dispatched run tests the latest version and creates the `claude-code-tested` branch (R5). Every selected version is recorded, pass or fail; retry one with `gh workflow run claude-code-versions.yml -f version=X.Y.Z`. **Commit:** `B: run A9 on every new Claude Code version`
````ts V2 — scripts/lib/cc-versions.ts
// The scheduled Claude Code version job (spec B 4, B4): which versions to test, how a run's legs become results, and its workflow rule.
import { common, need } from './workflow.ts';
const STABLE = /^\d+\.\d+\.\d+$/, OSES = ['ubuntu-latest', 'macos-latest', 'windows-latest'];
// tested.txt holds `VERSION pass|fail` lines; a recorded version is never selected again (retry it with workflow_dispatch).
export const recorded = (text: string) => [...text.matchAll(/^(\d+\.\d+\.\d+) (?:pass|fail)$/gm)].map((m) => m[1]!);
// Unrecorded stable versions after the first recorded one, oldest first, at most `limit`; with no record, only the latest.
export function untested(published: string[], tested: string[], limit = 20): string[] {
  const stable = published.filter((v) => STABLE.test(v)), seen = new Set(tested);
  const first = Math.min(...tested.map((v) => stable.indexOf(v)).filter((i) => i >= 0));
  return first === Infinity ? stable.slice(-1) : stable.slice(first + 1).filter((v) => !seen.has(v)).slice(0, limit);
}
// A version passes only when its leg succeeded on every OS; a missing leg is a failure.
export const verdict = (legs: Record<string, string>) => (OSES.every((os) => legs[os] === 'success') ? 'pass' : 'fail');
// tested.txt with one line per result; a retried version's old line is replaced.
export const record = (text: string, results: Record<string, string>) =>
  [...text.split('\n').filter((l) => l && !(l.split(' ')[0]! in results)), ...Object.entries(results).map(([v, r]) => `${v} ${r}`)].join('\n') + '\n';
export const versionsErrors = (yml: string) => [...common('claude-code-versions.yml', yml), ...need('claude-code-versions.yml', yml, [
  ['a schedule of a few hours', /^  schedule:\n    - cron: '\d+ \*\/\d+ \* \* \*'$/m], ['workflow_dispatch with a version input', '\n  workflow_dispatch:\n    inputs:\n      version:\n'],
  ['read-only workflow token', '\npermissions:\n  contents: read\n'], ['untested-version list', 'node scripts/cc-versions.ts list'],
  ['independent legs', 'fail-fast: false\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n        version: ${{ fromJSON(needs.list.outputs.versions) }}'],
  ['that version from npm', 'npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"'], ['A9 per version', 'node scripts/e2e/run.ts --claude-version "${{ matrix.version }}"'],
  ['a result per leg', 'name: leg-${{ matrix.version }}-${{ matrix.os }}'], ['record even when a version failed', "if: ${{ !cancelled() && needs.list.outputs.versions != '[]' }}"],
  ['record job with contents: write', '\n    permissions:\n      contents: write\n'], ['every result recorded', 'node scripts/cc-versions.ts record'],
  ['tested-version record', 'git push origin HEAD:claude-code-tested']]),
  ...(yml.split('contents: write').length > 2 ? ['claude-code-versions.yml: contents: write outside the record job'] : [])];
````
````ts V3 — scripts/cc-versions.ts
// The version job's CLI. `list PUBLISHED_JSON TESTED_TXT [VERSION]` prints the versions to test as a JSON array; VERSION, from
// workflow_dispatch, retries just that one. `record LEGS_DIR TESTED_TXT VERSIONS_JSON` writes a result for every selected version:
// LEGS_DIR/<artifact>/leg.txt holds `VERSION OS STATUS`, and a version with a missing leg is recorded as fail.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { record, recorded, untested, verdict } from './lib/cc-versions.ts';
const [mode, a = '', b = '', extra = ''] = process.argv.slice(2), read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
if (mode === 'list') console.log(JSON.stringify(/^\d+\.\d+\.\d+$/.test(extra) ? [extra] : untested(JSON.parse(read(a) || '[]'), recorded(read(b)))));
else if (mode === 'record') {
  const legs: Record<string, Record<string, string>> = Object.fromEntries((JSON.parse(extra || '[]') as string[]).map((v) => [v, {}]));
  for (const d of existsSync(a) ? readdirSync(a) : []) {
    const [v = '', os = '', status = ''] = read(join(a, d, 'leg.txt')).trim().split(/\s+/);
    if (legs[v]) legs[v]![os] = status;
  }
  writeFileSync(b, record(read(b), Object.fromEntries(Object.entries(legs).map(([v, l]) => [v, verdict(l)]))));
  console.log(`cc-versions: recorded ${Object.keys(legs).join(', ') || 'nothing'}`);
} else { console.error('usage: node scripts/cc-versions.ts list PUBLISHED_JSON TESTED_TXT [VERSION] | record LEGS_DIR TESTED_TXT VERSIONS_JSON'); process.exit(2); }
````
````ts V4 — scripts/tests/cc-versions_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { record, recorded, untested, verdict, versionsErrors } from '../lib/cc-versions.ts';
const P = ['2.1.306', '2.1.307', '2.2.0-beta.1', '2.1.308', '2.1.309', '2.1.310'];
test('unrecorded stable versions after the first recorded one, oldest first; prereleases skipped; capped', () => {
  assert.deepEqual(untested(P, ['2.1.306', '2.1.308']), ['2.1.307', '2.1.309', '2.1.310']);
  assert.deepEqual(untested(P, []), ['2.1.310']);
  assert.deepEqual(untested(P, ['2.1.306'], 2), ['2.1.307', '2.1.308']);
});
test('a failing version is recorded and never stalls later ones (tested 2.1.0; 2.1.0–2.1.21 published; 2.1.1 fails)', () => {
  const pub = Array.from({ length: 22 }, (_, i) => `2.1.${i}`), ok = { 'ubuntu-latest': 'success', 'macos-latest': 'success', 'windows-latest': 'success' };
  let tested = '2.1.0 pass\n';
  const run1 = untested(pub, recorded(tested));
  assert.deepEqual([run1.length, run1[0], run1.at(-1)], [20, '2.1.1', '2.1.20']);
  tested = record(tested, Object.fromEntries(run1.map((v) => [v, verdict(v === '2.1.1' ? { ...ok, 'macos-latest': 'failure' } : ok)])));
  assert.match(tested, /^2\.1\.1 fail$/m);
  assert.deepEqual(untested(pub, recorded(tested)), ['2.1.21']);
});
test('a missing leg fails the version; a retried result replaces its line', () => {
  assert.equal(verdict({ 'ubuntu-latest': 'success', 'macos-latest': 'success' }), 'fail');
  assert.equal(record('2.1.1 fail\n2.1.2 pass\n', { '2.1.1': 'pass' }), '2.1.2 pass\n2.1.1 pass\n');
});
const VERS = "on:\n  schedule:\n    - cron: '41 */4 * * *'\n  workflow_dispatch:\n    inputs:\n      version:\n        required: false\n\npermissions:\n  contents: read\n\njobs:\n" +
  "  list:\n    steps:\n      - id: untested\n        run: node scripts/cc-versions.ts list a b\n  a9:\n    strategy:\n      fail-fast: false\n      matrix:\n" +
  '        os: [ubuntu-latest, macos-latest, windows-latest]\n        version: ${{ fromJSON(needs.list.outputs.versions) }}\n    steps:\n' +
  '      - run: npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"\n      - id: a9-version\n        run: node scripts/e2e/run.ts --claude-version "${{ matrix.version }}"\n' +
  "      - with:\n          name: leg-${{ matrix.version }}-${{ matrix.os }}\n  record:\n    if: ${{ !cancelled() && needs.list.outputs.versions != '[]' }}\n" +
  '    permissions:\n      contents: write\n    steps:\n      - id: record\n        run: node scripts/cc-versions.ts record legs t v && git push origin HEAD:claude-code-tested\n';
test('the version workflow passes, and each clause is required', () => {
  assert.deepEqual(versionsErrors(VERS), []);
  for (const [from, to, want] of [["'41 */4 * * *'", "'41 4 * * 1'", 'schedule'], ['    inputs:\n      version:\n        required: false\n', '', 'version input'],
    ['fail-fast: false', 'fail-fast: true', 'independent legs'], ['!cancelled() && ', '', 'record even when'],
    [' --claude-version "${{ matrix.version }}"', '', 'A9 per version'], ['contents: read', 'contents: write', 'outside the record job'],
    ['node scripts/cc-versions.ts record', 'node scripts/cc-versions.ts list', 'every result recorded']])
    assert.ok(versionsErrors(VERS.replace(from, () => to)).some((e) => e.includes(want)), want);
});
````
````yaml V1 — .github/workflows/claude-code-versions.yml
name: Claude Code versions

# Runs A9 against every Claude Code version published to npm, on three OSes, each OS and version as its own leg.
# Every selected version is recorded with its result, pass or fail, so a failing release never blocks later ones; a failed
# leg still turns the run red, which is GitHub's notification. Retry one: gh workflow run claude-code-versions.yml -f version=X.Y.Z
on:
  schedule:
    - cron: '41 */4 * * *'
  workflow_dispatch:
    inputs:
      version:
        description: Retry one version (X.Y.Z)
        required: false

permissions:
  contents: read

concurrency:
  group: claude-code-versions
  cancel-in-progress: false

jobs:
  list:
    runs-on: ubuntu-latest
    outputs:
      versions: ${{ steps.untested.outputs.versions }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - id: untested
        env:
          VERSION: ${{ inputs.version }}
        run: |
          git fetch --depth 1 origin claude-code-tested && git show FETCH_HEAD:tested.txt > "$RUNNER_TEMP/tested.txt" || : > "$RUNNER_TEMP/tested.txt"
          npm view @anthropic-ai/claude-code versions --json > "$RUNNER_TEMP/published.json"
          versions="$(node scripts/cc-versions.ts list "$RUNNER_TEMP/published.json" "$RUNNER_TEMP/tested.txt" $VERSION)"
          echo "versions=$versions" >> "$GITHUB_OUTPUT"

  a9:
    needs: list
    if: needs.list.outputs.versions != '[]'
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        version: ${{ fromJSON(needs.list.outputs.versions) }}
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - run: npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"
      - if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y tmux
      - if: runner.os == 'macOS'
        run: brew install tmux
      - id: e2e-tooling
        if: runner.os == 'Windows'
        run: npm ci --prefix scripts/e2e
      - id: a9-version
        env:
          LC_ALL: ${{ runner.os == 'Linux' && 'C.UTF-8' || '' }}
        run: node scripts/e2e/run.ts --claude-version "${{ matrix.version }}"
      - name: Leg result
        if: always()
        shell: bash
        run: echo "${{ matrix.version }} ${{ matrix.os }} ${{ job.status }}" > leg.txt
      - if: always()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: leg-${{ matrix.version }}-${{ matrix.os }}
          path: leg.txt

  record:
    needs: [list, a9]
    if: ${{ !cancelled() && needs.list.outputs.versions != '[]' }}
    runs-on: ubuntu-latest
    # The only write: append every tested version's result, pass or fail, to the claude-code-tested branch.
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          pattern: leg-*
          path: ${{ runner.temp }}/legs
      - id: record
        env:
          VERSIONS: ${{ needs.list.outputs.versions }}
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          if git fetch --depth 1 origin claude-code-tested; then git show FETCH_HEAD:tested.txt > "$RUNNER_TEMP/tested.txt"; base=FETCH_HEAD; else : > "$RUNNER_TEMP/tested.txt"; base=; fi
          node scripts/cc-versions.ts record "$RUNNER_TEMP/legs" "$RUNNER_TEMP/tested.txt" "$VERSIONS"
          if [ -n "$base" ]; then git switch -c record "$base"; else git switch --orphan record; fi
          cp "$RUNNER_TEMP/tested.txt" tested.txt
          git add tested.txt && git commit -m "Tested Claude Code $VERSIONS"
          git push origin HEAD:claude-code-tested
````
````ts C10 — scripts/check-docs.ts, the // T17 lines
import { versionsErrors } from './lib/cc-versions.ts'; // T17
errors.push(...versionsErrors(read('.github/workflows/claude-code-versions.yml'))); // T17
````

### T15 — check.sh wiring and CI coverage
- **Files:** create `scripts/check-ci-coverage.ts` (P13) and `ci/coverage.json`; append to `scripts/check.sh`. **Acceptance:** B7, B4, B5. **Depends on:** T3–T14, T17, T18. **Group:** G8. **Waits on A:** T1's `check.sh` with its header and `scripts/lib/check-ids.ts` (`parseIds`, D16), and the scripts it runs.
- **Failing check:** add P13; `node scripts/check-ci-coverage.ts` → 48 lines ending `: no CI step`.
- **Implement:** generate the manifest, then review it; most IDs run inside `check.sh`, under the `check` step:
  ```bash
  node --input-type=module -e "
  import { parseIds } from '$PWD/scripts/lib/check-ids.ts'; import { readFileSync, writeFileSync } from 'node:fs';
  const ids = parseIds(readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', 'utf8')), R = 'review-hashes';
  const special = { A9: 'e2e', 'A9.harness': 'e2e', 'A9.release': 'release-e2e', 'A6.in-claude-code': 'e2e', 'A9.stored': 'e2e', 'B3.release': ['release-wiki-run', 'release-wiki'],
    'B5.release': ['release-tag', 'release-notes', 'release-notes-published', 'release-install', 'release-e2e'], 'VR.gallery': ['gallery', 'gallery-upload'],
    'VR.in-ci': ['gallery', 'gallery-upload', 'check'], 'VR.reviewers': R, 'VR.passes': R, 'B1.beauty-review': R, 'B2.translation-review': R };
  writeFileSync('ci/coverage.json', JSON.stringify(Object.fromEntries(ids.map((id) => [id, special[id] ?? 'check'])), null, 2) + '\n');"
  ```
  Append to `scripts/check.sh`, leaving A's lines above it unchanged:
  ```bash
  # Sub-project B: docs, wiki, install and CI coverage
  [[ -d scripts/docs/node_modules ]] || npm ci --prefix scripts/docs  # D15c: install the pinned parser once
  node --test 'scripts/tests/*_test.ts' 'scripts/tests/*.docs-spec.ts'
  node scripts/check-docs.ts
  node scripts/check-wiki.ts
  bash scripts/test-wiki-publish.sh
  bash scripts/test-local-install.sh
  node scripts/check-ci-coverage.ts
  ```
- **Done when:** → `check-ci-coverage: ok (48 check IDs mapped)`, and `bash scripts/check.sh` exits 0 on the Mac, also after `rm -rf scripts/docs/node_modules` (its guard runs `npm ci --prefix scripts/docs`). **Commit:** `B: wire B checks into check.sh; CI coverage map`
````ts P13 — scripts/check-ci-coverage.ts
// B7: every check ID, from plan A's one parser (scripts/lib/check-ids.ts), maps, in ci/coverage.json, to the id: of a step in ci.yml or release.yml.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIds } from './lib/check-ids.ts';
import { coverageErrors, stepIds } from './lib/ci-rules.ts';
const root = fileURLToPath(new URL('..', import.meta.url)), at = (p: string) => join(root, p);
const read = (p: string) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n') : '');
const ids = parseIds(read('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md')), coverage = JSON.parse(read('ci/coverage.json') || '{}');
const errors = coverageErrors(ids, coverage, stepIds(read('.github/workflows/ci.yml'), read('.github/workflows/release.yml')));
for (const e of errors) console.error(`check-ci-coverage: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-ci-coverage: ok (${ids.length} check IDs mapped)`);
````
