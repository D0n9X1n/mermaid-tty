// B5, every PR: scripts/test-local-install.sh, run for real by bash, with a scratch bin first on PATH. Its fake claude ignores
// marketplace add and install, and prints MTTY_PLUGIN_LIST for plugin list; one case adds a fake cygpath. Each test checks
// that the script's trap left nothing behind: not in TMPDIR, a scratch dir, and not at any path the fakes were handed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const version: string = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version;
const NO_BASH = spawnSync('bash', ['-c', 'exit 0']).status !== 0 && 'needs bash on PATH (Git Bash on Windows)';
// Each fake appends the path it is handed to handed, beside it. Any other claude call fails, so a call the script adds cannot pass unseen.
const CLAUDE = ['#!/bin/sh', `printf '%s\\n' "$CLAUDE_CONFIG_DIR" >> "$(dirname "$0")/handed"`, 'case "$*" in',
  '  "plugin marketplace add "*|"plugin install "*) exit 0 ;;', `  "plugin list") printf '%s' "$MTTY_PLUGIN_LIST" ;;`,
  '  *) echo "fake claude: unexpected call: $*" >&2; exit 2 ;;', 'esac', ''].join('\n');
// Git Bash's cygpath -w prints a Windows form of the mktemp path; this one prints a Windows path that is not it at all.
const CYGPATH = ['#!/bin/sh', `printf '%s\\n' "$2" >> "$(dirname "$0")/handed"`, `printf '%s\\n' 'C:\\mtty\\elsewhere'`, ''].join('\n');
// claude plugin list's format: a header and a blank line, then per plugin an id line, its fields indented, and a blank line.
const entry = (id: string, v: string) => [`  ❯ ${id}`, `    Version: ${v}`, `    Read from: /plugins/${id}`, '    Scope: user', '    Status: ✔ enabled', ''];
const list = (...entries: string[][]) => ['Installed plugins:', '', ...entries.flat()].join('\n') + '\n';
const OURS = 'mermaid-tty@mermaid-tty', OK = `local install: ok (mermaid-tty ${version})\n`;

// Runs the script with bash from the repo root, as CI does. Returns its exit status and output, and what it left behind.
function localInstall(pluginList: string, { cygpath = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-')), bin = join(dir, 'bin'), tmp = join(dir, 'tmp');
  try {
    mkdirSync(bin); mkdirSync(tmp);
    writeFileSync(join(bin, 'claude'), CLAUDE, { mode: 0o755 });
    if (cygpath) writeFileSync(join(bin, 'cygpath'), CYGPATH, { mode: 0o755 });
    // Windows names it Path: drop every spelling, so the child gets one PATH, with the scratch bin first.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    const r = spawnSync('bash', ['scripts/test-local-install.sh'], { cwd: root, encoding: 'utf8',
      env: { ...env, PATH: [bin, process.env.PATH].join(delimiter), TMPDIR: tmp, MTTY_PLUGIN_LIST: pluginList } });
    // Left behind: TMPDIR's entries, and each handed path that still exists. macOS's mktemp -d ignores TMPDIR for its per-user
    // temp dir, so there only a handed path shows a dir the trap missed. The fake claude runs in every case, so handed exists.
    const handed = readFileSync(join(bin, 'handed'), 'utf8').split('\n').filter(Boolean);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, left: [...readdirSync(tmp), ...handed.filter((p) => existsSync(p))] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("local install: ok, with plugin.json's version, when the list has mermaid-tty@mermaid-tty at that version", { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.left, []);
});
test('local install: fails as not installed when the list has no mermaid-tty@mermaid-tty', { skip: NO_BASH }, () => {
  const r = localInstall('No plugins installed. Use `claude plugin install` to install a plugin.\n');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes('local install: mermaid-tty is not installed'), r.stderr);
  assert.deepEqual(r.left, []);
});
test('local install: fails when mermaid-tty@mermaid-tty has another version', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`local install: installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.left, []);
});
test('local install: fails on a prerelease of the expected version, such as 1.0.0-rc', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, `${version}-rc`)));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is ${version}-rc, not ${version}`), r.stderr);
  assert.deepEqual(r.left, []);
});
test("local install: reads its own entry's Version, not that of a plugin listed before it", { skip: NO_BASH }, () => {
  const r = localInstall(list(entry('other@market', version), entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.left, []);
});
test('local install: CRLF list output passes, since the CRs drop before parsing', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)).replaceAll('\n', '\r\n'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.left, []);
});
test('local install: the trap removes the mktemp dir, not the Windows path cygpath gave claude', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)), { cygpath: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.left, []);
});
