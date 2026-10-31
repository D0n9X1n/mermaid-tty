// A8 no-build: in a fresh clone, with nothing installed, bare `node --test` must pass; no default-discovered test may need the docs parser.
// Those tests are named *.docs-spec.ts, outside Node's default patterns; check.sh runs them after `npm ci --prefix scripts/docs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url))
const  docs = resolve(here, '../docs') + sep;
const reaches = (f: string, seen = new Set<string>()): boolean => !seen.has(f) && !!seen.add(f) &&
  [...readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => resolve(dirname(f), m[1]!)).some((p) => p.startsWith(docs) || reaches(p, seen));
const files = readdirSync(here)
const  specs = files.filter((f) => f.endsWith('.docs-spec.ts'));
test('A8.no-build: every test that reaches scripts/docs is a .docs-spec.ts, and no *_test.ts does', () => {
  assert.deepEqual(files.filter((f) => f.endsWith('_test.ts') && reaches(join(here, f))), []);
  assert.ok(specs.length > 0 && specs.every((f) => reaches(join(here, f))), specs.join());
});
// The fresh copy's own run reaches this file too; MTTY_NO_INSTALL_CHILD skips the nested copy there, so it does not recurse.
// A child of a test run inherits NODE_TEST_CONTEXT and reports to its parent instead of running; drop it, as in a fresh shell.
const child = process.env.MTTY_NO_INSTALL_CHILD === '1';
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')), MTTY_NO_INSTALL_CHILD: '1' };
// The mutation's import specifier is a const, so the reaches() scan of this file's text does not take it for this file's own import.
const parser = '../scripts/docs/markdown.ts';
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
test('A8.no-build: bare node --test passes in a fresh copy of the tracked files, and fails once a default test imports the docs parser', { skip: child }, () => {
  const root = git(here, 'rev-parse', '--show-toplevel').trim()
const  dir = mkdtempSync(join(tmpdir(), 'mtty-'));
  const run = () => { const r = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', env }); return { status: r.status, out: r.stdout + r.stderr }; };
  try {
    // The repository's layout, as a clone has it: every tracked file at its own path, and no node_modules, so nothing is installed.
    for (const f of git(root, 'ls-files', '-z').split('\0').filter((p) => p && !p.split('/').includes('node_modules'))) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      copyFileSync(join(root, f), join(dir, f));
    }
    const clean = run();
    assert.equal(clean.status, 0, clean.out);
    assert.doesNotMatch(clean.out, /ERR_MODULE_NOT_FOUND/);
    // The mutation: a default-discovered test that imports the parser fails for the missing package, not a missing file.
    writeFileSync(join(dir, 'tests/leak_test.ts'), `import test from 'node:test';\nimport { parse } from '${parser}';\ntest('leak', () => { parse('# x'); });\n`);
    const leak = run();
    assert.notEqual(leak.status, 0, leak.out);
    assert.match(leak.out, /Cannot find package 'mdast-util-from-markdown'/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
