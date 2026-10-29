// B5, every PR: scripts/test-local-install.sh, run for real by bash, with a scratch bin first on PATH that holds a strict fake
// claude and, in one case, a fake cygpath. The caller's CLAUDE_CONFIG_DIR is a sentinel dir with one marker file. Each test
// checks the script's output; the calls the fake claude logged, all in one throwaway config dir that is neither the sentinel nor
// inside it; that the script's trap left nothing behind; and that the sentinel still holds exactly its marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const version: string = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version;
const NO_BASH = spawnSync('bash', ['-c', 'exit 0']).status !== 0 && 'needs bash on PATH (Git Bash on Windows)';
const OURS = 'mermaid-tty@mermaid-tty', OK = `local install: ok (mermaid-tty ${version})\n`;
// The fakes' realpath: node realpath.cjs DIR prints fs.realpathSync(DIR), as the test computes the sentinel's. For a dir that
// does not exist, the realpath of its deepest existing ancestor, joined to the rest. On Windows a /c/... path is C:/... first.
const REALPATH = ['const fs = require("fs"), path = require("path");', 'let p = process.argv[2] || "";', 'if (!p) process.exit(0);',
  'if (process.platform === "win32") p = p.replace(/^\\/([a-zA-Z])(?=\\/|$)/, "$1:");', 'let dir = path.resolve(p), rest = "";',
  'for (;;) {', '  try { process.stdout.write(path.join(fs.realpathSync(dir), rest)); break; } catch {}', '  const up = path.dirname(dir);',
  '  if (up === dir) { process.stdout.write(path.join(dir, rest)); break; }', '  rest = path.join(path.basename(dir), rest); dir = up;', '}', ''].join('\n');
// The fake claude logs each call's CLAUDE_CONFIG_DIR, that dir's realpath then, and argv, tab-separated, to claude.log beside it.
// It fails an add of any dir but the repo root (MTTY_REPO), and an install before that add or of any plugin but ours; plugin
// list prints MTTY_PLUGIN_LIST only after that install, and an empty list before. Any other call fails.
const CLAUDE = ['#!/bin/sh', 'here="$(dirname "$0")"', 'real="$(node "$here/realpath.cjs" "$CLAUDE_CONFIG_DIR")"',
  `{ printf '%s\\t%s' "$CLAUDE_CONFIG_DIR" "$real"; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\n'; } >> "$here/claude.log"`,
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
// Git Bash's cygpath -w prints a Windows form of the mktemp path; this one logs that path's realpath and prints a Windows path
// that is not it at all.
const CYGPATH = ['#!/bin/sh', `{ node "$(dirname "$0")/realpath.cjs" "$2"; echo; } >> "$(dirname "$0")/cygpath.log"`,
  `printf '%s\\n' 'C:\\mtty\\elsewhere'`, ''].join('\n');
// claude plugin list's format: a header and a blank line, then per plugin an id line, its fields indented, and a blank line.
const entry = (id: string, v: string) => [`  ❯ ${id}`, `    Version: ${v}`, `    Read from: /plugins/${id}`, '    Scope: user', '    Status: ✔ enabled', ''];
const list = (...entries: string[][]) => ['Installed plugins:', '', ...entries.flat()].join('\n') + '\n';
// Every run's calls, in order: the add, the install and the list, each with CLAUDE_CONFIG_DIR FRESH: set, the first call's, and
// a dir whose realpath is neither the sentinel's nor inside it.
const CALLS = [['FRESH', 'plugin', 'marketplace', 'add', './'], ['FRESH', 'plugin', 'install', OURS], ['FRESH', 'plugin', 'list']];
// The sentinel, the caller's own config: one marker file, which no run may change.
const SENTINEL: [string, string][] = [['marker', "the caller's own config\n"]];
const lines = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
// What dir holds: each entry's name and, for a file, its text; null once dir is gone.
const holds = (dir: string) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).map((e) => [e.name, e.isFile() ? readFileSync(join(dir, e.name), 'utf8') : '(not a file)']) : null);

// Runs the script with bash from the repo root, as CI does. The caller's CLAUDE_CONFIG_DIR is the sentinel, and HOME its parent,
// so ~/.claude is the sentinel too. Returns the script's exit status and output, the fake claude's calls, what the script left
// behind, and what the sentinel holds.
function localInstall(pluginList: string, { cygpath = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-')), bin = join(dir, 'bin'), tmp = join(dir, 'tmp'), home = join(dir, 'home'), sentinel = join(home, '.claude');
  try {
    mkdirSync(bin); mkdirSync(tmp); mkdirSync(sentinel, { recursive: true });
    for (const [name, text] of SENTINEL) writeFileSync(join(sentinel, name), text);
    writeFileSync(join(bin, 'realpath.cjs'), REALPATH);
    writeFileSync(join(bin, 'claude'), CLAUDE, { mode: 0o755 });
    if (cygpath) writeFileSync(join(bin, 'cygpath'), CYGPATH, { mode: 0o755 });
    const own = realpathSync(sentinel);
    // Windows names it Path: drop every spelling, so the child gets one PATH, with the scratch bin first. MTTY_REPO has /
    // separators, a form Git Bash's cd takes too.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    const r = spawnSync('bash', ['scripts/test-local-install.sh'], { cwd: root, encoding: 'utf8', env: { ...env, PATH: [bin, process.env.PATH].join(delimiter),
      TMPDIR: tmp, HOME: home, CLAUDE_CONFIG_DIR: sentinel, MTTY_REPO: root.replaceAll(sep, '/'), MTTY_PLUGIN_LIST: pluginList } });
    // Each call as its argv after a label for its CLAUDE_CONFIG_DIR: FRESH if set, the first call's, and its realpath at the call
    // is neither the sentinel's nor inside it. Both are fs.realpathSync, so a trailing / or /., a .. or a symlink cannot alias it.
    const log = lines(join(bin, 'claude.log')).map((l) => l.split('\t')), first = log[0]?.[0];
    const label = (d = '', real = '') => {
      if (!d) return 'unset';
      if (d !== first) return `${d}: not the first call's dir`;
      if (!real) return `${d}: no realpath`;
      const rel = relative(own, real);
      if (rel === '') return `${d}: the sentinel`;
      return isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) ? 'FRESH' : `${d}: inside the sentinel`;
    };
    const calls = log.map(([d, real, ...argv]) => [label(d, real), ...argv]);
    // Left behind: TMPDIR's entries, and each handed dir, by its realpath, that still exists. macOS's mktemp -d ignores TMPDIR for
    // its per-user temp dir, so there only a handed dir shows one the trap missed.
    const handed = new Set([...log.map(([, real]) => real), ...lines(join(bin, 'cygpath.log'))]);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls, left: [...readdirSync(tmp), ...[...handed].filter((p) => p && existsSync(p))], sentinel: holds(sentinel) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("local install: ok, with plugin.json's version, when the list has mermaid-tty@mermaid-tty at that version", { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
test('local install: fails as not installed when the list has no mermaid-tty@mermaid-tty', { skip: NO_BASH }, () => {
  const r = localInstall('No plugins installed. Use `claude plugin install` to install a plugin.\n');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes('local install: mermaid-tty is not installed'), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
test('local install: fails when mermaid-tty@mermaid-tty has another version', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`local install: installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
test('local install: fails on a prerelease of the expected version, such as 1.0.0-rc', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, `${version}-rc`)));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is ${version}-rc, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
test("local install: reads its own entry's Version, not that of a plugin listed before it", { skip: NO_BASH }, () => {
  const r = localInstall(list(entry('other@market', version), entry(OURS, '0.9.0')));
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`installed version is 0.9.0, not ${version}`), r.stderr);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
test('local install: CRLF list output passes, since the CRs drop before parsing', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)).replaceAll('\n', '\r\n'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
test('local install: the trap removes the mktemp dir, not the Windows path cygpath gave claude', { skip: NO_BASH }, () => {
  const r = localInstall(list(entry(OURS, version)), { cygpath: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, OK);
  assert.deepEqual(r.calls, CALLS);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.sentinel, SENTINEL);
});
