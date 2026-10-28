# mermaid-tty v1 B2: CI and release (T8–T10, T15–T17)

Part of [plan B](2026-10-28-mermaid-tty-v1-B-docs-release.md), which holds the design check, component map, traceability, runbook and reconciliation. Each task adds its failing check, then the code under it, then runs its done-when command. The code ran on 2026-10-28 in a scratch tree against stub `core/` modules. A **Waits on A** interface is an assumption (D3): confirm it against plan A. Commits: one per task on `feat/v1`, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Needs:** B1's T3 (`doc-rules.ts`) and T6 (`check-docs.ts`); T15 also needs B3, because `check.sh` runs every check. **Unblocks:** B3's T12 (T8, T17). Tasks are in run order.

### T8 — CI and release workflows
- **Files:** create `scripts/lib/ci-rules.ts` (C11), `scripts/tests/ci-rules_test.ts` (C12), `.github/workflows/ci.yml` (P3) and `.github/workflows/release.yml` (P4); add C10's two `// T8` lines to `scripts/check-docs.ts`. **Acceptance:** B4, B5, B7, A8 platforms, A9 and VR wiring. **Depends on:** T3, T6. **Group:** G4. **Waits on A** for green runs: `check.sh`, `scripts/e2e/` (`run.ts`, `package-lock.json`), `render-gallery.ts`, `check-review-hashes.ts`.
- **Failing check:** add C12; `node --test scripts/tests/ci-rules_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/ci-rules.ts`. After C11 and the `// T8` lines, `node scripts/check-docs.ts 2>&1 | grep -E 'ci\.yml|release\.yml'` → `missing …` lines.
- **Implement:** C11; the `// T8` lines (the import before the `doc-rules.ts` import, the `errors.push` right after the `const md` statement); P3 and P4. The pins are checkout `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1), setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0) and upload-artifact `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7.0.2), from `gh api repos/actions/<name>/commits/<tag> -q .sha` on 2026-10-28.
- **Done when:** the test → `ℹ pass 19`; the grep prints nothing; `ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f) }' .github/workflows/*.yml` exits 0; green on three OSes at R2. The 48-ID test reads the real acceptance file: when its labels change, update `IDS48` and `ci/coverage.json` in the same commit. **Commit:** `B: CI and release rules; CI on three OSes with e2e and gallery; release on v*`
````ts C11 — scripts/lib/ci-rules.ts
// CI and release rules: B4 ci.yml, release.yml and check.sh; B5 tag and notes; B7 check IDs and the coverage map. Text in, errors out.
import { INSTALL, common, need } from './doc-rules.ts';
const job = (yml: string, name: string) => new RegExp(`^  ${name}:\\n((?:(?: {4}.*)?\\n)*)`, 'm').exec(yml)?.[1] ?? '';
const MATRIX: [string, string | RegExp][] = [['fail-fast: false', 'fail-fast: false'], ['3-OS matrix', 'os: [ubuntu-latest, macos-latest, windows-latest]'],
  ['runs-on matrix.os', 'runs-on: ${{ matrix.os }}'], ['Node 24 via pinned actions/setup-node', /uses: actions\/setup-node@[0-9a-f]{40} # v\S+\n\s+with:\n\s+node-version: '?24'?\n/],
  ['pinned Claude Code from npm', /npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+\n/]];
export const ciErrors = (yml: string) => [...common('ci.yml', yml), ...need('ci.yml', yml, [
  ['pull_request trigger', /^  pull_request:/m], ['push trigger', /^  push:/m]]),
  ...need('ci.yml check job', job(yml, 'check'), [...MATRIX, ['check.sh under bash', 'shell: bash\n        run: bash scripts/check.sh']]),
  ...need('ci.yml e2e job', job(yml, 'e2e'), [...MATRIX, ['tmux on Linux', 'sudo apt-get install -y tmux'], ['tmux on macOS', 'brew install tmux'],
    ['Windows-only e2e tooling', "if: runner.os == 'Windows'\n        run: npm ci --prefix scripts/e2e"],
    ['C.UTF-8 on Linux', /LC_ALL: \$\{\{ runner\.os == 'Linux' && 'C\.UTF-8' \|\| '' \}\}/], ['A9 run', 'node scripts/e2e/run.ts']]),
  ...need('ci.yml gallery job', job(yml, 'gallery'), [['gallery render', 'node scripts/render-gallery.ts'], ['artifact upload', /uses: actions\/upload-artifact@[0-9a-f]{40}/]]),
  ...(yml.split('npm ci').length > 2 ? ['ci.yml: npm ci outside the e2e job'] : [])];
export const releaseErrors = (yml: string) => [...common('release.yml', yml), ...need('release.yml', yml, [
  ['v* tag trigger', "on:\n  push:\n    tags: ['v*']\n"], ['job-scoped contents: write', '\n    permissions:\n      contents: write\n'],
  ['tag check', 'node scripts/check-release.ts tag "$GITHUB_REF_NAME"'], ['notes check on the published release', '| node scripts/check-release.ts notes -'],
  ['GitHub marketplace install', 'claude plugin marketplace add D0n9X1n/mermaid-tty'], ['A9 against the installed copy', 'node scripts/e2e/run.ts --installed']])];
export const checkShErrors = (sh: string) => [...(sh.startsWith('#!/usr/bin/env bash\nset -euo pipefail\n') ? [] : ['check.sh: must start with #!/usr/bin/env bash and set -euo pipefail']),
  ...(/\|\|\s*true\b|\bset \+e\b/.test(sh) ? ['check.sh: masks a failing command (|| true or set +e)'] : [])];
export const tagErrors = (tag: string, version: string) => (tag === `v${version}` ? [] : [`tag ${tag} does not match plugin.json version ${version}`]);
export const notesErrors = (notes: string) => INSTALL.filter((l) => !notes.includes(l)).map((l) => `release notes lack: ${l}`);
// B7 (70a26e2): each row ID; row.slug(label) per bold "Label:" in the row; VR.slug(label) per label in the visual-review section.
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function checkIds(acceptance: string): string[] {
  const ids: string[] = [];
  let vr = false;
  for (const line of acceptance.split(/\r?\n/)) {
    if (line.startsWith('## ')) vr = line.startsWith('## Visual review');
    const row = /^\| ([AB]\d+) \|/.exec(line), labels = [...line.matchAll(/\*\*([^*]+?):\*\*/g)].map((m) => slug(m[1]!));
    if (row) ids.push(row[1]!, ...labels.map((s) => row[1] + '.' + s));
    else if (vr) ids.push(...labels.map((s) => 'VR.' + s));
  }
  return [...new Set(ids)];
}
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
import { checkIds, checkShErrors, ciErrors, coverageErrors, notesErrors, releaseErrors, stepIds, tagErrors } from '../lib/ci-rules.ts';
import { INSTALL } from '../lib/doc-rules.ts';
const SHA = 'a'.repeat(40);
const PIN = (a: string, v: string) => `      - uses: actions/${a}@${SHA} # ${v}\n`;
const NODE = PIN('setup-node', 'v7.1.0') + '        with:\n          node-version: 24\n';
const CLAUDE = '      - run: npm install -g @anthropic-ai/claude-code@2.1.308\n';
const OS3 = '    strategy:\n      fail-fast: false\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n    runs-on: ${{ matrix.os }}\n    steps:\n';
const CI = "on:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n" +
  `  check:\n${OS3}${PIN('checkout', 'v7.0.1')}${NODE}${CLAUDE}      - id: check\n        shell: bash\n        run: bash scripts/check.sh\n` +
  `  e2e:\n${OS3}${PIN('checkout', 'v7.0.1')}${NODE}${CLAUDE}      - if: runner.os == 'Linux'\n        run: sudo apt-get update && sudo apt-get install -y tmux\n      - if: runner.os == 'macOS'\n        run: brew install tmux\n      - id: e2e-tooling\n        if: runner.os == 'Windows'\n        run: npm ci --prefix scripts/e2e\n      - id: e2e\n        env:\n          LC_ALL: \${{ runner.os == 'Linux' && 'C.UTF-8' || '' }}\n        run: node scripts/e2e/run.ts\n` +
  `  gallery:\n    runs-on: ubuntu-latest\n    steps:\n      - id: gallery\n        run: node scripts/render-gallery.ts\n${PIN('upload-artifact', 'v7.0.2')}`;
const REL = "on:\n  push:\n    tags: ['v*']\n\njobs:\n  release:\n    permissions:\n      contents: write\n    steps:\n" + PIN('checkout', 'v7.0.1') +
  '      - id: release-tag\n        run: node scripts/check-release.ts tag "$GITHUB_REF_NAME"\n      - id: release-notes-published\n        run: gh release view "$GITHUB_REF_NAME" --json body -q .body | node scripts/check-release.ts notes -\n' +
  '      - id: release-install\n        run: claude plugin marketplace add D0n9X1n/mermaid-tty\n      - id: release-e2e\n        run: node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR"\n';
const SH = '#!/usr/bin/env bash\nset -euo pipefail\nclaude plugin validate .\n';
test('complete fixtures pass', () => assert.deepEqual([ciErrors(CI), releaseErrors(REL), checkShErrors(SH)], [[], [], []]));
const cases: [(s: string) => string[], string, string, string, string][] = [
  [ciErrors, CI, '  pull_request:\n', '', 'pull_request'],
  [ciErrors, CI, 'claude-code@2.1.308', 'claude-code@latest', 'pinned Claude Code'], [ciErrors, CI, ', windows-latest]', ']', '3-OS matrix'],
  [ciErrors, CI, 'fail-fast: false', 'fail-fast: true', 'fail-fast'], [ciErrors, CI, 'node-version: 24', 'node-version: 22', 'Node 24'],
  [ciErrors, CI, 'shell: bash\n        run: bash scripts/check.sh', 'run: bash scripts/check.sh', 'without shell: bash'],
  [ciErrors, CI, '- id: e2e\n        env:', '- env:', 'no stable id'], [ciErrors, CI, 'brew install tmux', 'brew install screen', 'tmux on macOS'],
  [ciErrors, CI, "if: runner.os == 'Windows'\n        run: npm ci", 'run: npm ci', 'Windows-only'],
  [ciErrors, CI, 'run: node scripts/e2e/run.ts', 'run: node scripts/e2e/other.ts', 'A9 run'], [ciErrors, CI, 'actions/upload-artifact@', 'actions/upload-artifact@v7 #', 'artifact'],
  [releaseErrors, REL, "tags: ['v*']", 'branches: [main]', 'v* tag'], [releaseErrors, REL, ' --installed', '', 'installed copy'],
  [checkShErrors, SH, 'set -euo pipefail\n', '', 'set -euo pipefail'], [checkShErrors, SH, 'validate .', 'validate . || true', 'masks'],
];
for (const [rule, base, from, to, want] of cases)
  test(`rejects: ${want}`, () => assert.ok(rule(base.replace(from, to)).some((e) => e.includes(want)), `${from} -> ${to}`));
test('release: tag equals v + plugin.json version; notes carry both install commands', () => {
  assert.deepEqual([tagErrors('v1.0.0', '1.0.0'), notesErrors(INSTALL.join('\n'))], [[], []]);
  assert.equal(tagErrors('v1.0.1', '1.0.0').length + notesErrors(INSTALL[0]!).length, 2);
});
const ACC = '| A8 | Zero | **Portability:** a **No build:** b |\n## Visual review\n\n**In CI:** x\n\n## Spec B\n\n| B1 | R | **Beauty review:** c |\n';
const IDS = ['A8', 'A8.portability', 'A8.no-build', 'VR.in-ci', 'B1', 'B1.beauty-review'], COV = Object.fromEntries(IDS.map((id) => [id, 'check']));
const IDS48 = ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 A6.hook-tests A6.command A6.in-claude-code ' +
  'A7 A8 A8.portability A8.benchmark A8.cache A8.no-build A8.validation A8.platforms A9 A9.harness A9.stored A9.release ' +
  'A10 VR.gallery VR.in-ci VR.reviewers VR.tangled VR.passes B1 B1.docs-check B1.beauty-review B2 B2.per-paragraph ' +
  'B2.translation-review B3 B3.publish-test B3.workflow-check B3.release B4 B5 B5.every-pr B5.release B6 B7 B7.check-ids').split(' ');
test('check IDs: row IDs, row.slug(label) and VR.slug(label), derived from the real acceptance file', () => {
  assert.deepEqual(checkIds(ACC), IDS);
  assert.deepEqual(checkIds(readFileSync(new URL('../../docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', import.meta.url), 'utf8')), IDS48);
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
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

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
    # Publishing the GitHub Release is the only write; the grant stays on this job.
    permissions:
      contents: write
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
      - id: release-publish
        run: gh release create "$GITHUB_REF_NAME" --verify-tag --title "mermaid-tty $GITHUB_REF_NAME" --notes-file "docs/release-notes/$GITHUB_REF_NAME.md"
      - id: release-notes-published
        run: gh release view "$GITHUB_REF_NAME" --json body -q .body | node scripts/check-release.ts notes -
      - id: release-wiki
        name: The published wiki matches wiki/ (B3)
        run: |
          git clone --depth 1 "https://github.com/${GITHUB_REPOSITORY}.wiki.git" "$RUNNER_TEMP/wiki"
          diff -r --exclude=.git wiki "$RUNNER_TEMP/wiki"
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

### T9 — Release checks and notes
- **Files:** create `scripts/check-release.ts` (P5) and `docs/release-notes/v1.0.0.md` (P6). **Acceptance:** B5. **Depends on:** T8. **Group:** G5. **Waits on A:** `plugin.json` version `1.0.0`.
- **Failing check:** `node scripts/check-release.ts tag v1.0.0` → FAIL `Cannot find module …/scripts/check-release.ts`.
- **Implement:** P5, P6 (hand-written; they name `/mermaid-tty source`, `/mermaid-tty diagram` and `/copy`, and make no ctrl+o claim, per D12).
- **Done when:** `node scripts/check-release.ts tag v1.0.0 && node scripts/check-release.ts notes docs/release-notes/v1.0.0.md` → `check-release: tag ok (1.0.0)` and `check-release: notes ok (1.0.0)`; `node scripts/check-release.ts tag v1.0.1` exits 1 with `tag v1.0.1 does not match plugin.json version 1.0.0`. **Commit:** `B: release tag and notes checks; v1.0.0 notes`
````ts P5 — scripts/check-release.ts
// B5 release checks: `tag vX.Y.Z` must equal plugin.json's version; `notes FILE|-` must hold both install commands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notesErrors, tagErrors } from './lib/ci-rules.ts';
const root = fileURLToPath(new URL('..', import.meta.url)), [mode, arg = ''] = process.argv.slice(2);
const version = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version as string;
const errors = mode === 'tag' ? tagErrors(arg, version) : mode === 'notes' ? notesErrors(readFileSync(arg === '-' ? 0 : arg, 'utf8'))
  : ['usage: node scripts/check-release.ts tag vX.Y.Z | notes FILE|-'];
for (const e of errors) console.error(`check-release: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-release: ${mode} ok (${version})`);
````
````markdown P6 — docs/release-notes/v1.0.0.md
# mermaid-tty v1.0.0

The first release. In Claude Code, each closed mermaid code fence in a reply is drawn as a colored, flat, box-drawing diagram sized to your terminal, on macOS, Linux and Windows. The transcript keeps the source.

## Install

```sh
claude plugin marketplace add D0n9X1n/mermaid-tty
claude plugin install mermaid-tty@mermaid-tty
```

Needs Claude Code 2.1.287 or later.

## What's in it

- Flowcharts with subgraphs, sequence diagrams, and every type in the README's support table.
- Exact widths for CJK labels. A diagram that can't be drawn falls back to its source.
- Colors follow your Claude Code theme, or pick nord, dracula, gruvbox, solarized or mono.
- `/mermaid-tty source` shows every diagram as its Mermaid source, and `/mermaid-tty diagram` draws them again; `/copy` copies the exact source.
````

### T10 — Local-marketplace install on every PR
- **Files:** create `scripts/test-local-install.sh` (P7). **Acceptance:** B5 (every PR). **Depends on:** none. **Group:** G1. **Waits on A:** `.claude-plugin/plugin.json` and `marketplace.json` (`source: "./"`).
- **Failing check:** `bash scripts/test-local-install.sh` → FAIL `No such file or directory`.
- **Implement:** P7. **Done when:** → `local install: ok (mermaid-tty 1.0.0)`; it writes only to a throwaway `CLAUDE_CONFIG_DIR` (probed offline). **Commit:** `B: install from the local marketplace on every PR`
````bash P7 — scripts/test-local-install.sh
#!/usr/bin/env bash
# B5, every PR: install the plugin from this checkout's marketplace into a throwaway config. Offline; no account.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
config="$(mktemp -d)"
trap 'rm -rf "$config"' EXIT
if command -v cygpath >/dev/null 2>&1; then config="$(cygpath -w "$config")"; fi # Git Bash: give claude.exe a Windows path
export CLAUDE_CONFIG_DIR="$config"
version="$(node -p 'require("./.claude-plugin/plugin.json").version')"
claude plugin marketplace add ./
claude plugin install mermaid-tty@mermaid-tty
list="$(claude plugin list)"
grep -Fq 'mermaid-tty@mermaid-tty' <<<"$list" || { printf '%s\n' "$list" >&2; printf 'local install: mermaid-tty is not installed\n' >&2; exit 1; }
grep -Fq "Version: $version" <<<"$list" || { printf 'local install: installed version is not %s\n' "$version" >&2; exit 1; }
printf 'local install: ok (mermaid-tty %s)\n' "$version"
````

### T17 — Claude Code version job
- **Files:** create `scripts/lib/cc-versions.ts` (V2), `scripts/cc-versions.ts` (V3), `scripts/tests/cc-versions_test.ts` (V4) and `.github/workflows/claude-code-versions.yml` (V1); add C10's `// T17` lines to `scripts/check-docs.ts`. **Acceptance:** spec B 4 and B4 (the scheduled job). **Depends on:** T3, T6. **Group:** G5. **Waits on A:** `run.ts --claude-version`.
- **Failing check:** add V4; `node --test scripts/tests/cc-versions_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/cc-versions.ts`.
- **Implement:** V2, V3, V1 and C10's `// T17` lines (the import after the `doc-rules.ts` import, the `errors.push` after the `// T8` one).
- **Done when:** the test → `ℹ pass 3`; `node scripts/check-docs.ts 2>&1 | grep -F claude-code-versions.yml` prints nothing; after merge, the first dispatched run tests the latest version and creates the `claude-code-tested` branch (R5). **Commit:** `B: run A9 on every new Claude Code version`
````ts V2 — scripts/lib/cc-versions.ts
// The scheduled Claude Code version job (spec B 4, B4): which versions to test next, and the rule check-docs applies to its workflow.
import { common, need } from './doc-rules.ts';
// Stable versions published after the newest tested one, oldest first, at most `limit` (the rest wait for the next run).
// With no record yet, only the latest.
export function untested(published: string[], tested: string[], limit = 20): string[] {
  const stable = published.filter((v) => /^\d+\.\d+\.\d+$/.test(v)), last = Math.max(-1, ...tested.map((v) => stable.indexOf(v)));
  return last < 0 ? stable.slice(-1) : stable.slice(last + 1, last + 1 + limit);
}
export const versionsErrors = (yml: string) => [...common('claude-code-versions.yml', yml), ...need('claude-code-versions.yml', yml, [
  ['a schedule of a few hours', /^  schedule:\n    - cron: '\d+ \*\/\d+ \* \* \*'$/m], ['workflow_dispatch', '\n  workflow_dispatch:\n'],
  ['untested-version list', 'node scripts/cc-versions.ts'], ['3-OS matrix per version', 'os: [ubuntu-latest, macos-latest, windows-latest]\n        version: ${{ fromJSON(needs.list.outputs.versions) }}'],
  ['that version from npm', 'npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"'], ['A9 per version', 'node scripts/e2e/run.ts --claude-version "${{ matrix.version }}"'],
  ['read-only workflow token', '\npermissions:\n  contents: read\n'], ['record job with contents: write', '\n    permissions:\n      contents: write\n'], ['tested-version record', 'git push origin HEAD:claude-code-tested']]),
  ...(yml.split('contents: write').length > 2 ? ['claude-code-versions.yml: contents: write outside the record job'] : [])];
````
````ts V3 — scripts/cc-versions.ts
// Prints the Claude Code versions to test as a JSON array: `node scripts/cc-versions.ts PUBLISHED_JSON TESTED_TXT`.
import { existsSync, readFileSync } from 'node:fs';
import { untested } from './lib/cc-versions.ts';
const [published = '', tested = ''] = process.argv.slice(2);
const done = existsSync(tested) ? readFileSync(tested, 'utf8').split(/\s+/).filter(Boolean) : [];
console.log(JSON.stringify(untested(JSON.parse(readFileSync(published, 'utf8')), done)));
````
````ts V4 — scripts/tests/cc-versions_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { untested, versionsErrors } from '../lib/cc-versions.ts';
const P = ['2.1.306', '2.1.307', '2.2.0-beta.1', '2.1.308', '2.1.309', '2.1.310'];
test('versions after the newest tested one, oldest first; prereleases skipped', () => {
  assert.deepEqual(untested(P, ['2.1.306', '2.1.308']), ['2.1.309', '2.1.310']);
  assert.deepEqual(untested(P, ['2.1.310']), []);
});
test('no record yet: only the latest; a backlog is capped and resumes on the next run', () => {
  assert.deepEqual(untested(P, []), ['2.1.310']);
  assert.deepEqual(untested(P, ['2.1.306'], 2), ['2.1.307', '2.1.308']);
});
const VERS = "on:\n  schedule:\n    - cron: '41 */4 * * *'\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  list:\n    steps:\n      - id: untested\n        run: node scripts/cc-versions.ts a b\n" +
  '  a9:\n    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n        version: ${{ fromJSON(needs.list.outputs.versions) }}\n    steps:\n' +
  '      - run: npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"\n      - id: a9-version\n        run: node scripts/e2e/run.ts --claude-version "${{ matrix.version }}"\n' +
  '  record:\n    permissions:\n      contents: write\n    steps:\n      - id: record\n        run: git push origin HEAD:claude-code-tested\n';
test('the version workflow passes, and each clause is required', () => {
  assert.deepEqual(versionsErrors(VERS), []);
  for (const [from, to, want] of [["'41 */4 * * *'", "'41 4 * * 1'", 'schedule'], [' --claude-version "${{ matrix.version }}"', '', 'A9 per version'],
    ['contents: write', 'contents: read', 'record job'], ['contents: read', 'contents: write', 'outside the record job']]) assert.ok(versionsErrors(VERS.replace(from, to)).some((e) => e.includes(want)), want);
});
````
````yaml V1 — .github/workflows/claude-code-versions.yml
name: Claude Code versions

# Runs A9 against every Claude Code version published to npm since the last tested one, on three OSes.
# A failed run is GitHub's own notification; a version is recorded only when every job passed, so failures are retried.
on:
  schedule:
    - cron: '41 */4 * * *'
  workflow_dispatch:

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
        run: |
          git fetch --depth 1 origin claude-code-tested && git show FETCH_HEAD:tested.txt > "$RUNNER_TEMP/tested.txt" || : > "$RUNNER_TEMP/tested.txt"
          npm view @anthropic-ai/claude-code versions --json > "$RUNNER_TEMP/published.json"
          echo "versions=$(node scripts/cc-versions.ts "$RUNNER_TEMP/published.json" "$RUNNER_TEMP/tested.txt")" >> "$GITHUB_OUTPUT"

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

  record:
    needs: [list, a9]
    runs-on: ubuntu-latest
    # The only write: append the tested versions to the claude-code-tested branch.
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - id: record
        env:
          VERSIONS: ${{ needs.list.outputs.versions }}
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git fetch --depth 1 origin claude-code-tested && git switch -c record FETCH_HEAD || git switch --orphan record
          node -e 'for (const v of JSON.parse(process.env.VERSIONS)) console.log(v)' >> tested.txt
          git add tested.txt && git commit -m "Tested Claude Code $VERSIONS"
          git push origin HEAD:claude-code-tested
````
````ts C10 — scripts/check-docs.ts, the // T17 lines
import { versionsErrors } from './lib/cc-versions.ts'; // T17
errors.push(...versionsErrors(read('.github/workflows/claude-code-versions.yml'))); // T17
````

### T15 — check.sh wiring and CI coverage
- **Files:** create `scripts/check-ci-coverage.ts` (P13) and `ci/coverage.json`; append to `scripts/check.sh`. **Acceptance:** B7, B4, B5. **Depends on:** T3–T14, T17. **Group:** G8. **Waits on A:** `check.sh` with its header, and the scripts it runs.
- **Failing check:** add P13; `node scripts/check-ci-coverage.ts` → 48 lines ending `: no CI step`.
- **Implement:** generate the manifest, then review it; most IDs run inside `check.sh`, under the `check` step:
  ```bash
  node --input-type=module -e "
  import { checkIds } from '$PWD/scripts/lib/ci-rules.ts'; import { readFileSync, writeFileSync } from 'node:fs';
  const ids = checkIds(readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', 'utf8')), R = 'review-hashes';
  const special = { A9: 'e2e', 'A9.harness': 'e2e', 'A9.release': 'release-e2e', 'A6.in-claude-code': 'e2e', 'A9.stored': 'e2e', 'B3.release': 'release-wiki',
    'B5.release': ['release-tag', 'release-notes', 'release-notes-published', 'release-install', 'release-e2e'], 'VR.gallery': ['gallery', 'gallery-upload'],
    'VR.in-ci': ['gallery', 'gallery-upload', 'check'], 'VR.reviewers': R, 'VR.passes': R, 'B1.beauty-review': R, 'B2.translation-review': R };
  writeFileSync('ci/coverage.json', JSON.stringify(Object.fromEntries(ids.map((id) => [id, special[id] ?? 'check'])), null, 2) + '\n');"
  ```
  Append to `scripts/check.sh`, leaving A's lines above it unchanged:
  ```bash
  # Sub-project B: docs, wiki, install and CI coverage
  node --test 'scripts/tests/*_test.ts'
  node scripts/check-docs.ts
  node scripts/check-wiki.ts
  bash scripts/test-wiki-publish.sh
  bash scripts/test-local-install.sh
  node scripts/check-ci-coverage.ts
  ```
- **Done when:** → `check-ci-coverage: ok (48 check IDs mapped)`, and `bash scripts/check.sh` exits 0 on the Mac. **Commit:** `B: wire B checks into check.sh; CI coverage map`
````ts P13 — scripts/check-ci-coverage.ts
// B7: every check ID parsed from the acceptance file maps, in ci/coverage.json, to the id: of a step in ci.yml or release.yml.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIds, coverageErrors, stepIds } from './lib/ci-rules.ts';
const root = fileURLToPath(new URL('..', import.meta.url)), at = (p: string) => join(root, p);
const read = (p: string) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n') : '');
const ids = checkIds(read('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md')), coverage = JSON.parse(read('ci/coverage.json') || '{}');
const errors = coverageErrors(ids, coverage, stepIds(read('.github/workflows/ci.yml'), read('.github/workflows/release.yml')));
for (const e of errors) console.error(`check-ci-coverage: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-ci-coverage: ok (${ids.length} check IDs mapped)`);
````

### T16 — LF on every OS
- **Files:** modify `.gitattributes`, only if a check prints anything. **Acceptance:** A8 platforms (B's files), B4. **Depends on:** T15. **Group:** G9.
- **Failing check** (prints nothing when everything is right):
  ```bash
  git ls-files --eol -- '*.ts' '*.sh' '*.md' '*.yml' '*.svg' '*.mmd' '*.json' | grep -v 'eol=lf'
  git ls-files --eol -- '*.png' | grep -v -e '-text'
  ```
- **Implement**, only if either prints: append `*.<ext> text eol=lf` for each listed extension, and `*.png binary`, below A's lines; then `git add --renormalize .`.
- **Done when:** both print nothing; the Windows `check` job proves it at R2. **Commit:** `B: keep text LF on every OS`
