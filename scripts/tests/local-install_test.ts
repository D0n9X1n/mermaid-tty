// B5, every PR: scripts/test-local-install.sh, run for real by bash, with a scratch bin first on PATH that holds a strict fake
// claude and, in one case, a fake cygpath. Each test checks the script's output, the calls the fake claude logged, and that the
// script's trap left nothing behind: not in TMPDIR, a scratch dir, and not at any path the fakes were handed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const version: string = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version;
const NO_BASH = spawnSync('bash', ['-c', 'exit 0']).status !== 0 && 'needs bash on PATH (Git Bash on Windows)';
const OURS = 'mermaid-tty@mermaid-tty', OK = `local install: ok (mermaid-tty ${version})\n`;
// The fake claude logs each call's CLAUDE_CONFIG_DIR and argv, tab-separated, to claude.log beside it. It fails an add of
// any dir but the repo root (MTTY_REPO), and an install before that add or of any plugin but ours; plugin list prints
// MTTY_PLUGIN_LIST only after that install, and an empty list before. Any other call fails.
const CLAUDE = ['#!/bin/sh', 'here="$(dirname "$0")"',
  `{ printf '%s' "$CLAUDE_CONFIG_DIR"; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\n'; } >> "$here/claude.log"`,
  'case "$*" in',
  '  "plugin marketplace add "*)',
  '    [ "$(cd "$4" && pwd -P)" = "$(cd "$MTTY_REPO" && pwd -P)" ] || { echo "fake claude: $4 is not the repo root" >&2; exit 1; }',
  '    : > "$here/added" ;;',
  '  "plugin install "*)',
  '    [ -e "$here/added" ] || { echo "fake claude: no marketplace added" >&2; exit 1; }',
  `    [ "$3" = "${OURS}" ] || { echo "fake claude: no plugin $3 in the added marketplace" >&2; exit 1; }`,
  '    : > "$here/installed" ;;',
  `  "plugin list") if [ -e "$here/installed" ]; then printf '%s' "$MTTY_PLUGIN_LIST"; else echo 'No plugins installed.'; fi ;;`,
  '  *) echo "fake claude: unexpected call: $*" >&2; exit 2 ;;', 'esac', ''].join('\n');
// Git Bash's cygpath -w prints a Windows form of the mktemp path; this one logs the path and prints a Windows path that is not it at all.
const CYGPATH = ['#!/bin/sh', `printf '%s\\n' "$2" >> "$(dirname "$0")/cygpath.log"`, `printf '%s\\n' 'C:\\mtty\\elsewhere'`, ''].join('\n');
// claude plugin list's format: a header and a blank line, then per plugin an id line, its fields indented, and a blank line.
const entry = (id: string, v: string) => [`  ❯ ${id}`, `    Version: ${v}`, `    Read from: /plugins/${id}`, '    Scope: user', '    Status: ✔ enabled', ''];
const list = (...entries: string[][]) => ['Installed plugins:', '', ...entries.flat()].join('\n') + '\n';
// Every run's calls, in order: the add, the install and the list, each with CLAUDE_CONFIG_DIR FRESH: set, not the user's
// config, and the same dir in all three.
const CALLS = [['FRESH', 'plugin', 'marketplace', 'add', './'], ['FRESH', 'plugin', 'install', OURS], ['FRESH', 'plugin', 'list']];
const lines = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);

// Runs the script with bash from the repo root, as CI does, with CLAUDE_CONFIG_DIR set to a stand-in for the user's config.
// Returns its exit status and output, the fake claude's calls, and what the script left behind.
function localInstall(pluginList: string, { cygpath = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-')), bin = join(dir, 'bin'), tmp = join(dir, 'tmp'), own = join(dir, 'own-config');
  try {
    mkdirSync(bin); mkdirSync(tmp);
    writeFileSync(join(bin, 'claude'), CLAUDE, { mode: 0o755 });
    if (cygpath) writeFileSync(join(bin, 'cygpath'), CYGPATH, { mode: 0o755 });
    // Windows names it Path: drop every spelling, so the child gets one PATH, with the scratch bin first. MTTY_REPO has /
    // separators, a form Git Bash's cd takes too.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    const r = spawnSync('bash', ['scripts/test-local-install.sh'], { cwd: root, encoding: 'utf8', env: { ...env,
      PATH: [bin, process.env.PATH].join(delimiter), TMPDIR: tmp, CLAUDE_CONFIG_DIR: own, MTTY_REPO: root.replaceAll(sep, '/'), MTTY_PLUGIN_LIST: pluginList } });
    // Each call as its argv after its CLAUDE_CONFIG_DIR, which is FRESH if set, not the user's config (the stand-in, or
    // ~/.claude) and the first call's.
    const log = lines(join(bin, 'claude.log')).map((l) => l.split('\t')), first = log[0]?.[0];
    const fresh = (d = '') => d !== '' && d !== own && d !== join(homedir(), '.claude') && d === first;
    const calls = log.map(([d, ...argv]) => [fresh(d) ? 'FRESH' : d, ...argv]);
    // Left behind: TMPDIR's entries, and each handed path that still exists. macOS's mktemp -d ignores TMPDIR for its per-user
    // temp dir, so there only a handed path shows a dir the trap missed.
    const handed = new Set([...log.map(([d]) => d), ...lines(join(bin, 'cygpath.log'))]);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls, left: [...readdirSync(tmp), ...[...handed].filter((p) => p && existsSync(p))] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("local install: ok, with plugin.json's version, when the list has mermaid-tty@mermaid-tty at that version", { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
test('local install: fails as not installed when the list has no mermaid-tty@mermaid-tty', { skip: NO_BASH }, () => {
  const r = localInstall('No plugins installed. Use `claude plugin install` to install a plugin.\n');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes('local install: mermaid-tty is not installed'), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
test('local install: fails when mermaid-tty@mermaid-tty has another version', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`local install: installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
test('local install: fails on a prerelease of the expected version, such as 1.0.0-rc', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, `${version}-rc`)));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is ${version}-rc, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
test("local install: reads its own entry's Version, not that of a plugin listed before it", { skip: NO_BASH }, () => {
  const r = localInstall(list(entry('other@market', version), entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
test('local install: CRLF list output passes, since the CRs drop before parsing', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)).replaceAll('\n', '\r\n'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
test('local install: the trap removes the mktemp dir, not the Windows path cygpath gave claude', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)), { cygpath: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
});
