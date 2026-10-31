// B4/B5/B7 workflow rules: inspect the YAML tree, sharing its fail-closed parser and SHA-pin checks.
import { need, readWorkflow } from './workflow-tree.ts';
type Step = { id?: string; run?: string; uses?: string; shell?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = { steps?: Step[]; strategy?: { 'fail-fast'?: boolean; matrix?: { os?: string[] } }; 'runs-on'?: string; permissions?: Record<string, string> };
const steps = (job?: Job): Step[] => Array.isArray(job?.steps) ? job.steps.filter(s => s && typeof s === 'object') : [];
const jobs = (value: any): Job[] => Object.values(value?.jobs ?? {});
const hasRun = (job: Job, command: string | RegExp) => steps(job).some(s => typeof s?.run === 'string' &&
  (typeof command === 'string' ? s.run.split('\n').some(line => line.trim() === command) : command.test(s.run)));
const action = (s: Step, name: string) => new RegExp(`^actions/${name}@[0-9a-f]{40}$`).test(s?.uses ?? '');
const MATRIX: [string, (j: Job) => unknown][] = [
  ['fail-fast: false', j => j.strategy?.['fail-fast'] === false],
  ['3-OS matrix', j => JSON.stringify(j.strategy?.matrix?.os) === '["ubuntu-latest","macos-latest","windows-latest"]'],
  ['runs-on matrix.os', j => j['runs-on'] === '${{ matrix.os }}'],
  ['Node 24 via pinned actions/setup-node', j => steps(j).some(s => action(s, 'setup-node') && String(s.with?.['node-version']) === '24')],
  ['pinned Claude Code from npm', j => hasRun(j, /^npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+\s*$/m)]];
export function ciErrors(yml: string): string[] {
  const { errors, value } = readWorkflow('ci.yml', yml)
const  w = value as any;
  const check: Job = w?.jobs?.check ?? {}
const  e2e: Job = w?.jobs?.e2e ?? {}
const  gallery: Job = w?.jobs?.gallery ?? {};
  return [...errors, ...need('ci.yml', w, [
    ['pull_request trigger on every PR', w => Object.hasOwn(w.on, 'pull_request') && (w.on.pull_request === null || Object.keys(w.on.pull_request).length === 0)],
    ['push trigger on every branch', w => Object.hasOwn(w.on, 'push') && (w.on.push === null || Object.keys(w.on.push).length === 0)],
    ['read-only workflow token', w => w.permissions.contents === 'read' && Object.values(w.permissions).every(v => v === 'read' || v === 'none')],
    ['concurrency that cancels superseded runs', w => w.concurrency.group === 'ci-${{ github.ref }}' && w.concurrency['cancel-in-progress'] === true]]),
    ...need('ci.yml check job', check, [...MATRIX,
      ['check.sh under bash', j => steps(j).some(s => s.run === 'bash scripts/check.sh' && s.shell === 'bash')],
      ['GH_TOKEN for the GitHub render cross-check (D15d)', j => steps(j).some(s => s.run === 'bash scripts/check.sh' && s.env?.GH_TOKEN === '${{ github.token }}')],
      ['GH_TOKEN on every check-docs step (D15d)', j => steps(j).filter(s => s.run === 'node scripts/check-docs.ts').every(s => s.env?.GH_TOKEN === '${{ github.token }}')]]),
    ...need('ci.yml e2e job', e2e, [...MATRIX,
      ['tmux on Linux', j => steps(j).some(s => s.if === "runner.os == 'Linux'" && s.run === 'sudo apt-get update && sudo apt-get install -y tmux')],
      ['tmux on macOS', j => steps(j).some(s => s.if === "runner.os == 'macOS'" && s.run === 'brew install tmux')],
      ['e2e tooling on every OS', j => steps(j).some(s => !s.if && s.run === 'npm ci --prefix scripts/e2e')],
      ['C.UTF-8 on Linux', j => steps(j).some(s => s.run?.startsWith('node scripts/e2e/run.ts') && s.env?.LC_ALL === "${{ runner.os == 'Linux' && 'C.UTF-8' || '' }}")],
      ['A9 run', j => hasRun(j, /^node scripts\/e2e\/run\.ts(?:\s|$)/)]]),
    ...need('ci.yml gallery job', gallery, [
      ['gallery render', j => hasRun(j, /^node scripts\/render-gallery\.ts(?:\s|$)/)],
      ['artifact upload', j => steps(j).some(s => action(s, 'upload-artifact'))]]),
    ...Object.entries(w?.jobs ?? {}).flatMap(([name, job]) => steps(job as Job).filter(s => /\bnpm ci\b/.test(s.run ?? '') &&
      !((name === 'e2e' && s.run === 'npm ci --prefix scripts/e2e') || (name === 'check' && s.run === 'npm ci --prefix scripts/docs')))
      .map(() => 'ci.yml: npm ci outside its tooling job'))];
}
export function releaseErrors(yml: string): string[] {
  const { errors, value } = readWorkflow('release.yml', yml)
const  w = value as any
const  release: Job = w?.jobs?.release ?? {};
  return [...errors, ...need('release.yml', w, [
    ['v* tag trigger', w => JSON.stringify(w.on.push.tags) === '["v*"]' && Object.keys(w.on.push).length === 1],
    ['read-only workflow token', w => w.permissions.contents === 'read' && Object.values(w.permissions).every(v => v === 'read' || v === 'none')]]), ...need('release.yml release job', release, [
    ['job-scoped contents: write and actions: read', j => j.permissions?.contents === 'write' && j.permissions?.actions === 'read'],
    ['publish-wiki run for the tagged commit', j => hasRun(j, /^conclusion="\$\(gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/workflows\/publish-wiki\.yml\/runs\?branch=main&head_sha=\$\{GITHUB_SHA\}&per_page=1" -q '\.workflow_runs\[0\]\.conclusion'\)"$/m)],
    ['publish-wiki concluded success', j => hasRun(j, 'test "$conclusion" = success')],
    ['tag check', j => hasRun(j, 'node scripts/check-release.ts tag "$GITHUB_REF_NAME"')],
    ['notes generated from the tag\'s issues and PRs', j => hasRun(j, 'python3 scripts/release-notes.py "$GITHUB_REF_NAME" > "$RUNNER_TEMP/release-notes.md"')],
    ['full history for the notes', j => steps(j).some(s => action(s, 'checkout') && s.with?.['fetch-depth'] === 0 && s.with?.['fetch-tags'] === true)],
    ['notes check on the published release', j => hasRun(j, 'gh release view "$GITHUB_REF_NAME" --json body -q .body | node scripts/check-release.ts notes -')],
    ['GitHub marketplace install', j => hasRun(j, 'claude plugin marketplace add D0n9X1n/mermaid-tty')],
    ['A9 against the installed copy', j => hasRun(j, /^node scripts\/e2e\/run\.ts --installed "\$CLAUDE_CONFIG_DIR"(?:\s|$)/)]])];
}
// B4: the scheduled job runs A9 on every newly published Claude Code version, one leg per OS and version, and records every result.
export function versionsErrors(yml: string): string[] {
  const { errors, value } = readWorkflow('claude-code-versions.yml', yml)
const  w = value as any;
  const list: Job = w?.jobs?.list ?? {}
const  a9: Job & { strategy?: { matrix?: { version?: unknown } } } = w?.jobs?.a9 ?? {}
const  rec: Job & { if?: string } = w?.jobs?.record ?? {};
  const writers = Object.entries<any>(w?.jobs ?? {}).filter(([name, j]) => name !== 'record' && j?.permissions?.contents === 'write');
  return [...errors, ...need('claude-code-versions.yml', w, [
    ['a schedule of a few hours', w => w.on.schedule.length === 1 && /^\d+ \*\/\d+ \* \* \*$/.test(w.on.schedule[0].cron)],
    ['workflow_dispatch with a version input', w => Object.hasOwn(w.on.workflow_dispatch.inputs, 'version')],
    ['read-only workflow token', w => w.permissions.contents === 'read' && Object.values(w.permissions).every(v => v === 'read' || v === 'none')]]),
    ...need('claude-code-versions.yml list job', list, [['untested-version list', j => hasRun(j, /^versions="\$\(node scripts\/cc-versions\.ts list /m)]]),
    ...need('claude-code-versions.yml a9 job', a9, [...MATRIX.slice(0, 4),
      ['a version per leg', j => j.strategy.matrix.version === '${{ fromJSON(needs.list.outputs.versions) }}'],
      ['that version from npm', j => hasRun(j, 'npm install -g "@anthropic-ai/claude-code@${{ matrix.version }}"')],
      ['A9 per version', j => hasRun(j, /^node scripts\/e2e\/run\.ts --claude-version "\$\{\{ matrix\.version \}\}"(?:\s|$)/)],
      ['a result per leg', j => steps(j).some(s => s.if === 'always()' && action(s, 'upload-artifact') && s.with?.name === 'leg-${{ matrix.version }}-${{ matrix.os }}')]]),
    ...need('claude-code-versions.yml record job', rec, [
      ['record even when a version failed', j => j.if === "${{ !cancelled() && needs.list.outputs.versions != '[]' }}"],
      ['record job with contents: write', j => j.permissions.contents === 'write'],
      ['every result recorded', j => hasRun(j, /^node scripts\/cc-versions\.ts record /m)],
      ['tested-version record', j => hasRun(j, 'git push origin HEAD:claude-code-tested')]]),
    ...(w?.permissions?.contents === 'write' || writers.length ? ['claude-code-versions.yml: contents: write outside the record job'] : [])];
}
// Coverage must never silently accept IDs extracted from unreadable YAML or a shell script.
export function stepIds(...ymls: string[]): Set<string> {
  return new Set(ymls.flatMap(yml => {
    const { unreadable, value } = readWorkflow('workflow', yml);
    if (unreadable.length) { throw new Error(unreadable.join('\n')); }
    return jobs(value).flatMap(j => steps(j).flatMap(s => typeof s.id === 'string' ? [s.id] : []));
  }));
}
