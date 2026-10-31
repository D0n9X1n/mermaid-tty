import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readWorkflow } from '../docs/workflow-tree.ts';
import { ciErrors, releaseErrors, stepIds } from '../docs/ci-rules.ts';
const SHA = 'a'.repeat(40);
const PIN = (a: string, v: string) => `      - uses: actions/${a}@${SHA} # ${v}\n`;
const NODE = PIN('setup-node', 'v7.1.0') + '        with:\n          node-version: 24\n';
const CLAUDE = '      - run: npm install -g @anthropic-ai/claude-code@2.1.308\n';
const OS3 = '    strategy:\n      fail-fast: false\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n    runs-on: ${{ matrix.os }}\n    steps:\n';
const CI = 'on:\n  pull_request:\n  push:\npermissions:\n  contents: read\nconcurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\njobs:\n' +
  `  check:\n${OS3}${PIN('checkout', 'v7.0.1')}${NODE}${CLAUDE}      - id: check\n        shell: bash\n        run: bash scripts/check.sh\n        env:\n          GH_TOKEN: \${{ github.token }}\n` +
  `  e2e:\n${OS3}${PIN('checkout', 'v7.0.1')}${NODE}${CLAUDE}      - if: runner.os == 'Linux'\n        run: sudo apt-get update && sudo apt-get install -y tmux\n      - if: runner.os == 'macOS'\n        run: brew install tmux\n      - id: e2e-tooling\n        run: npm ci --prefix scripts/e2e\n      - id: e2e\n        env:\n          LC_ALL: \${{ runner.os == 'Linux' && 'C.UTF-8' || '' }}\n        run: node scripts/e2e/run.ts --claude-version 2.1.308 --scenario all\n` +
  `  gallery:\n    runs-on: ubuntu-latest\n    steps:\n      - id: gallery\n        run: node scripts/render-gallery.ts gallery\n${PIN('upload-artifact', 'v7.0.2')}`;
const REL = "on:\n  push:\n    tags: ['v*']\npermissions:\n  contents: read\njobs:\n  release:\n    permissions:\n      contents: write\n      actions: read\n    steps:\n" + PIN('checkout', 'v7.0.1') +
  '        with:\n          fetch-depth: 0\n          fetch-tags: true\n' +
  '      - id: release-tag\n        run: node scripts/check-release.ts tag "$GITHUB_REF_NAME"\n' +
  '      - id: release-notes\n        run: python3 scripts/release-notes.py "$GITHUB_REF_NAME" > "$RUNNER_TEMP/release-notes.md"\n      - id: release-notes-published\n        run: gh release view "$GITHUB_REF_NAME" --json body -q .body | node scripts/check-release.ts notes -\n' +
  '      - id: release-wiki-run\n        run: |\n          conclusion="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/publish-wiki.yml/runs?branch=main&head_sha=${GITHUB_SHA}&per_page=1" -q \'.workflow_runs[0].conclusion\')"\n          test "$conclusion" = success\n' +
  '      - id: release-install\n        run: claude plugin marketplace add D0n9X1n/mermaid-tty\n      - id: release-e2e\n        run: node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR" --claude-version 2.1.308 --scenario all\n';
test('complete CI and release fixtures pass', () => assert.deepEqual([ciErrors(CI), releaseErrors(REL)], [[], []]));
test('unreadable null steps report parser errors rather than throwing', () => {
  assert.ok(ciErrors(CI.replace('      - id: check\n', '      -\n      - id: check\n')).some(e => e.includes('unreadable')));
});
const cases: [(s: string) => string[], string, string, string, string][] = [
  [ciErrors, CI, '  pull_request:\n', '', 'pull_request'], [ciErrors, CI, '  push:\n', '  push:\n    branches: [main]\n', 'push trigger on every branch'],
  [ciErrors, CI, 'cancel-in-progress: true', 'cancel-in-progress: false', 'concurrency'],
  [ciErrors, CI, 'claude-code@2.1.308', 'claude-code@latest', 'pinned Claude Code'], [ciErrors, CI, ', windows-latest]', ']', '3-OS matrix'],
  [ciErrors, CI, 'fail-fast: false', 'fail-fast: true', 'fail-fast'], [ciErrors, CI, 'node-version: 24', 'node-version: 22', 'Node 24'],
  [ciErrors, CI, 'shell: bash\n        run: bash scripts/check.sh', 'run: bash scripts/check.sh', 'without shell: bash'],
  [ciErrors, CI, '- id: e2e\n        env:', '- env:', 'no stable id'], [ciErrors, CI, 'brew install tmux', 'brew install screen', 'tmux on macOS'],
  [ciErrors, CI, 'run: npm ci --prefix scripts/e2e', "if: runner.os == 'Windows'\n        run: npm ci --prefix scripts/e2e", 'e2e tooling on every OS'],
  [ciErrors, CI, 'run: node scripts/e2e/run.ts', 'run: node scripts/e2e/other.ts', 'A9 run'], [ciErrors, CI, 'actions/upload-artifact@', 'actions/upload-artifact@v7 #', 'artifact'],
  [releaseErrors, REL, "tags: ['v*']", 'branches: [main]', 'v* tag'],
  [releaseErrors, REL, "tags: ['v*']", "tags: ['v*']\n    branches: [main]", 'v* tag'], [releaseErrors, REL, ' --installed', '', 'installed copy'], [releaseErrors, REL, '      actions: read\n', '', 'actions: read'],
  [releaseErrors, REL, 'test "$conclusion" = success', 'true', 'publish-wiki concluded success'],
  [ciErrors, CI, '          GH_TOKEN: ${{ github.token }}\n', '', 'GH_TOKEN for the GitHub render cross-check'],
  [ciErrors, CI, 'runs-on: ${{ matrix.os }}', 'runs-on: ubuntu-latest', 'runs-on matrix.os'],
  [ciErrors, CI, 'sudo apt-get install -y tmux', 'sudo apt-get install -y screen', 'tmux on Linux'],
  [ciErrors, CI, "'C.UTF-8'", "'en_US.UTF-8'", 'C.UTF-8 on Linux'],
  [ciErrors, CI, 'node scripts/render-gallery.ts gallery', 'node other.ts', 'gallery render'],
  [ciErrors, CI, 'contents: read', 'contents: write', 'read-only workflow token'],
  [ciErrors, CI, '  pull_request:\n', '  pull_request:\n    paths: [core/**]\n', 'pull_request'],
  [ciErrors, CI, 'contents: read', 'contents: read\n  actions: write', 'read-only workflow token'],
  [releaseErrors, REL, 'contents: read', 'contents: write', 'read-only workflow token'],
  [releaseErrors, REL, 'scripts/check-release.ts tag', 'scripts/other.ts tag', 'tag check'],
  [releaseErrors, REL, 'python3 scripts/release-notes.py', 'cat docs/release-notes/v1.md #', 'notes generated'],
  [releaseErrors, REL, '          fetch-depth: 0\n', '', 'full history'],
  [releaseErrors, REL, '| node scripts/check-release.ts notes -', '', 'notes check on the published release'],
  [releaseErrors, REL, 'marketplace add D0n9X1n/mermaid-tty', 'marketplace add ./', 'GitHub marketplace install'],
  [releaseErrors, REL, 'head_sha=${GITHUB_SHA}', 'head_sha=other', 'publish-wiki run for the tagged commit'],
  [ciErrors, CI, 'run: node scripts/render-gallery.ts gallery', 'run: npm ci --prefix scripts/e2e', 'npm ci outside its tooling job'],
  [ciErrors, CI, '  e2e:\n', '      - id: docs\n        run: node scripts/check-docs.ts\n  e2e:\n', 'GH_TOKEN on every check-docs step'],
];
for (const [rule, base, from, to, want] of cases)
  { test(`rejects: ${want}`, () => assert.ok(rule(base.replace(from, to)).some(e => e.includes(want)), `${from} -> ${to}`)); }
test('step ids come from real step keys, not comments, job ids or shell content', () => {
  assert.deepEqual([...stepIds(CI)], ['check', 'e2e-tooling', 'e2e', 'gallery']);
  assert.deepEqual([...stepIds('jobs:\n  id:\n    uses: org/repo/.github/workflows/job.yml@' + SHA + ' # v1\n  x:\n    steps:\n      - "id": real\n        run: |\n          id: fake\n      # id: comment\n')], ['real']);
  assert.throws(() => stepIds('jobs: [broken'), /unreadable/);
});
const root = new URL('../../', import.meta.url)
const  read = (path: string) => readFileSync(new URL(path, root), 'utf8');
test('real workflows pass CI and release rules', () => {
  assert.deepEqual(ciErrors(read('.github/workflows/ci.yml')), []);
  assert.deepEqual(releaseErrors(read('.github/workflows/release.yml')), []);
});
test('check-docs wires CI, release and check.sh validation', () => {
  const checker = read('scripts/check-docs.ts');
  assert.match(checker, /ciErrors\(read\('\.github\/workflows\/ci\.yml'\)\)/);
  assert.match(checker, /releaseErrors\(read\('\.github\/workflows\/release\.yml'\)\)/);
  assert.match(checker, /checkShErrors\(read\('scripts\/check\.sh'\)\)/);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/check-docs.ts', root))], { encoding: 'utf8' });
  assert.ifError(result.error);
  // README work is independent of T8; this integration assertion covers only T8 diagnostics.
  assert.ok(result.status === 0 || result.status === 1, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /check-docs: (ci\.yml|release\.yml|check\.sh):|ERR_MODULE_NOT_FOUND/);
});
test('CI preserves every interim check and runs all A9 scenarios on each OS', () => {
  const w = readWorkflow('ci.yml', read('.github/workflows/ci.yml')).value as any;
  assert.deepEqual(Object.keys(w.jobs), ['check', 'e2e', 'gallery']);
  const runs = (job: string): string[] => w.jobs[job].steps.map((s: any) => s.run).filter(Boolean);
  for (const command of ['node --test', 'node scripts/typecheck.ts', 'npm ci --prefix scripts/docs',
    "node --test 'scripts/tests/*.docs-spec.ts'", 'node scripts/check-docs.ts', 'bash scripts/test-wiki-publish.sh',
    'bash scripts/test-local-install.sh', 'bash scripts/check.sh', 'node scripts/check-review-hashes.ts'])
    { assert.ok(runs('check').includes(command), command); }
  for (const command of ['claude plugin validate .', 'claude plugin test .']) { assert.ok(read('scripts/check.sh').includes(command)); }
  assert.ok(runs('e2e').includes('npm ci --prefix scripts/e2e'));
  assert.ok(runs('e2e').includes('node --test scripts/e2e/screen.e2etest.ts scripts/e2e/driver.e2etest.ts'));
  assert.ok(runs('e2e').includes('node scripts/e2e/run.ts --claude-version 2.1.308 --scenario all'));
});
test('release checks tag, notes and wiki before publication; tests the fresh installed copy afterwards', () => {
  const w = readWorkflow('release.yml', read('.github/workflows/release.yml')).value as any
const  job = w.jobs.release;
  assert.equal(job['runs-on'], 'ubuntu-latest');
  // The runner context is not allowed in job-level env (GitHub rejects the file), so the first step sets it.
  assert.equal(job.env.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(job.steps[0].run, 'echo "CLAUDE_CONFIG_DIR=$RUNNER_TEMP/claude-config" >> "$GITHUB_ENV"');
  for (const [name, wf] of [['ci.yml', 'ci.yml'], ['release.yml', 'release.yml'], ['publish-wiki.yml', 'publish-wiki.yml']] as const) {
    const y = readWorkflow(name, read(`.github/workflows/${wf}`)).value as any
    for (const [id, j] of Object.entries<any>(y.jobs)) { assert.ok(!JSON.stringify(j.env ?? {}).includes('runner.'), `${name} ${id}: runner context in job env`) }
  }
  const ids = job.steps.map((s: any) => s.id).filter(Boolean);
  const order = ['release-tag', 'release-notes', 'release-wiki-run', 'release-wiki', 'release-publish', 'release-notes-published', 'release-install', 'release-e2e'];
  assert.deepEqual(ids.filter((id: string) => order.includes(id)), order);
  assert.ok(job.steps.some((s: any) => s.run === 'npm ci --prefix scripts/e2e'));
  const install = job.steps.find((s: any) => s.id === 'release-install').run;
  assert.match(install, /claude plugin install mermaid-tty@mermaid-tty/);
  assert.match(install, /Version: \$\{GITHUB_REF_NAME#v\}/);
  assert.equal(job.steps.find((s: any) => s.id === 'release-e2e').run,
    'node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR" --claude-version 2.1.308 --scenario all');
});
