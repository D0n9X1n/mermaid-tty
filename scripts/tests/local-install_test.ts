// B5, every PR: scripts/test-local-install.sh, run for real by bash, with a scratch bin first on PATH that holds a strict fake
// claude and, in one case, a fake cygpath. The caller's CLAUDE_CONFIG_DIR is a sentinel dir with one marker file. Each run
// checks the script's output and what it did, never how a path is spelled: the add → install → list calls the fake claude
// logged, each finding in the dir it was handed the markers of the calls before it, and no others; that the sentinel still
// holds exactly its marker, which a call handed any alias of the sentinel breaks; that a watch on the sentinel saw no change
// during the run, not even one undone before the run ended; and that TMPDIR, a fresh empty dir for each run, is empty after it.
// Runs miss a dir left outside TMPDIR, where macOS's bare mktemp -d puts it, so the last test reads the script's own text: its
// one temp allocation, explicitly under TMPDIR, and its one trap, which removes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const version: string = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version;
const NO_BASH = spawnSync('bash', ['-c', 'exit 0']).status !== 0 && 'needs bash on PATH (Git Bash on Windows)';
const OURS = 'mermaid-tty@mermaid-tty', OK = `local install: ok (mermaid-tty ${version})\n`;
// The fake claude writes a marker, fake-claude-<pid>-<n> for its nth call, into the config dir it is handed, CLAUDE_CONFIG_DIR or,
// unset or empty, claude's default ~/.claude, by that path as the shell resolves it. It logs to claude.log beside it, tab-separated:
// the marker's name, the markers the dir held before, and argv. A dir it cannot enter or write in fails the call. It fails an add
// of any dir but the repo root (MTTY_REPO), and an install before that add or of any plugin but ours; plugin list prints
// MTTY_PLUGIN_LIST only after that install, and an empty list before. Any other call fails.
const CLAUDE = ['#!/bin/sh', 'unset CDPATH', 'here="$(dirname "$0")"', 'dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"',
  'n=$(( $(cat "$here/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$here/count"; name="fake-claude-$$-$n"',
  'found="$(cd -P "$dir" && for f in fake-claude-*; do if [ -e "$f" ]; then printf "%s " "$f"; fi; done)" || { echo "fake claude: cannot enter $dir" >&2; exit 3; }',
  `printf '' > "$dir/$name" || { echo "fake claude: cannot write in $dir" >&2; exit 3; }`,
  `{ printf '%s\\t%s' "$name" "$found"; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\n'; } >> "$here/claude.log"`,
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
// Git Bash's cygpath -w prints another form of the mktemp path. This one prints it with /. appended: the same dir, in a form
// rm -rf refuses, so a trap that removed the form handed to claude would leave the dir behind.
const CYGPATH = ['#!/bin/sh', `printf '%s/.\\n' "$2"`, ''].join('\n');
// claude plugin list's format: a header and a blank line, then per plugin an id line, its fields indented, and a blank line.
const entry = (id: string, v: string) => [`  ❯ ${id}`, `    Version: ${v}`, `    Read from: /plugins/${id}`, '    Scope: user', '    Status: ✔ enabled', ''];
const list = (...entries: string[][]) => ['Installed plugins:', '', ...entries.flat()].join('\n') + '\n';
// Every run's calls, in order: the add, the install and the list, each labelled one dir: the dir it was handed held the markers
// of the calls before it, and no others, so all three wrote to one dir.
const CALLS = [['one dir', 'plugin', 'marketplace', 'add', './'], ['one dir', 'plugin', 'install', OURS], ['one dir', 'plugin', 'list']];
// The sentinel, the caller's own config: one marker file, which no run may change.
const SENTINEL: [string, string][] = [['marker', "the caller's own config\n"]];
const lines = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
// What dir holds: each entry's name and, for a file, its text; null once dir is gone.
const holds = (dir: string) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).map((e) => [e.name, e.isFile() ? readFileSync(join(dir, e.name), 'utf8') : '(not a file)']) : null);
// macOS and Windows watch a whole tree natively. Elsewhere (Linux) Node emulates that, checking what exists as it handles each
// event, so it misses an entry made and removed while spawnSync blocks the event loop. There the watch covers dir's own entries
// only, which, with the sentinel's listing after the run checked against SENTINEL, its listing before, covers a dir with no subdirs.
const RECURSIVE = process.platform === 'darwin' || process.platform === 'win32';
// How long a watch may take to report a change. macOS can also report writes made just before the watch began.
const LAG = 200;
// Calls run while watching dir. Returns run's result and the changes the watch reported up to LAG ms after run returned, but
// none from its first LAG ms, before run.
async function watching<T>(dir: string, run: () => T): Promise<[T, string[]]> {
  const changes: string[] = [], watcher = watch(dir, { recursive: RECURSIVE }, (event, name) => changes.push(`${event} ${name}`));
  watcher.on('error', (e) => changes.push(`error ${e.message}`));
  try {
    await sleep(LAG);
    changes.length = 0;
    const result = run();
    await sleep(LAG);
    return [result, changes];
  } finally { watcher.close(); }
}

// Runs the script with bash from the repo root, as CI does, with TMPDIR a fresh empty dir, while watching the sentinel, the
// caller's CLAUDE_CONFIG_DIR; HOME is its parent, so ~/.claude is the sentinel too. Returns the script's exit status and output,
// the fake claude's calls, what the sentinel holds after the run and the changes watched in it during the run, and what is left
// in TMPDIR.
async function localInstall(pluginList: string, { cygpath = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-')), bin = join(dir, 'bin'), tmp = join(dir, 'tmp'), home = join(dir, 'home'), sentinel = join(home, '.claude');
  try {
    mkdirSync(bin); mkdirSync(tmp); mkdirSync(sentinel, { recursive: true });
    for (const [name, text] of SENTINEL) writeFileSync(join(sentinel, name), text);
    writeFileSync(join(bin, 'claude'), CLAUDE, { mode: 0o755 });
    if (cygpath) writeFileSync(join(bin, 'cygpath'), CYGPATH, { mode: 0o755 });
    // Windows names it Path: drop every spelling, so the child gets one PATH, with the scratch bin first. MTTY_REPO has /
    // separators, a form Git Bash's cd takes too.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    const [r, changes] = await watching(sentinel, () => spawnSync('bash', ['scripts/test-local-install.sh'], { cwd: root, encoding: 'utf8',
      env: { ...env, PATH: [bin, process.env.PATH].join(delimiter), TMPDIR: tmp, HOME: home, CLAUDE_CONFIG_DIR: sentinel,
        MTTY_REPO: root.replaceAll(sep, '/'), MTTY_PLUGIN_LIST: pluginList } }));
    // Each call as its argv after a label: one dir if the dir it was handed held exactly the markers of the calls before it.
    const log = lines(join(bin, 'claude.log')).map((l) => l.split('\t')), names = log.map(([name = '']) => name);
    const calls = log.map(([, found = '', ...argv], i) => {
      const got = found.split(' ').filter(Boolean).sort().join(' '), want = names.slice(0, i).sort().join(' ');
      return [got === want ? 'one dir' : `found ${got || 'no marker'}, not ${want || 'none'}`, ...argv];
    });
    // Left behind: TMPDIR's entries. TMPDIR starts empty, so anything the script left under it, at any depth, shows here.
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls, sentinel: holds(sentinel), changes, left: readdirSync(tmp) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("local install: ok, with plugin.json's version, when the list has mermaid-tty@mermaid-tty at that version", { skip: NO_BASH }, async () => {
  const r = await localInstall(list(entry(OURS, version)));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
test('local install: fails as not installed when the list has no mermaid-tty@mermaid-tty', { skip: NO_BASH }, async () => {
  const r = await localInstall('No plugins installed. Use `claude plugin install` to install a plugin.\n');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes('local install: mermaid-tty is not installed'), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
test('local install: fails when mermaid-tty@mermaid-tty has another version', { skip: NO_BASH }, async () => {
  const r = await localInstall(list(entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`local install: installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
test('local install: fails on a prerelease of the expected version, such as 1.0.0-rc', { skip: NO_BASH }, async () => {
  const r = await localInstall(list(entry(OURS, `${version}-rc`)));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is ${version}-rc, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
test("local install: reads its own entry's Version, not that of a plugin listed before it", { skip: NO_BASH }, async () => {
  const r = await localInstall(list(entry('other@market', version), entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
test('local install: CRLF list output passes, since the CRs drop before parsing', { skip: NO_BASH }, async () => {
  const r = await localInstall(list(entry(OURS, version)).replaceAll('\n', '\r\n'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
test('local install: the trap removes the mktemp dir, not the form of it cygpath gave claude', { skip: NO_BASH }, async () => {
  const r = await localInstall(list(entry(OURS, version)), { cygpath: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.sentinel, SENTINEL);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.left, []);
});
// The script's own text, outside comments (each from a # at a line's start or after a space; the script has no # in quotes):
// the lines naming mktemp, mkdir, tempfile or trap are exactly its one temp allocation, explicitly under TMPDIR, and its trap.
test("local install: the script's one temp allocation is under TMPDIR, and its one trap removes it", () => {
  const code = readFileSync(join(root, 'scripts/test-local-install.sh'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)#.*/, '').trim());
  assert.deepEqual(code.filter((l) => /\b(mktemp|mkdir|tempfile|trap)\b/.test(l)),
    ['tmp="$(mktemp -d "${TMPDIR:-/tmp}/mtty-install.XXXXXX")"', `trap 'rm -rf "$tmp"' EXIT`]);
});
