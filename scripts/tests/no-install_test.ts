// A8 no-install: bare `node --test` in a fresh clone, with nothing installed, must discover no test that needs the docs parser.
// Those tests are named *.docs-spec.ts, outside Node's default patterns; check.sh runs them after `npm ci --prefix scripts/docs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url)), docs = resolve(here, '../docs') + sep;
const reaches = (f: string, seen = new Set<string>()): boolean => !seen.has(f) && !!seen.add(f) &&
  [...readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => resolve(dirname(f), m[1]!)).some((p) => p.startsWith(docs) || reaches(p, seen));
const files = readdirSync(here), specs = files.filter((f) => f.endsWith('.docs-spec.ts'));
test('no-install: every test that reaches scripts/docs is a .docs-spec.ts, and no *_test.ts does', () => {
  assert.deepEqual(files.filter((f) => f.endsWith('_test.ts') && reaches(join(here, f))), []);
  assert.ok(specs.length > 0 && specs.every((f) => reaches(join(here, f))), specs.join());
});
// A child of a test run inherits NODE_TEST_CONTEXT and reports to its parent instead of running; drop it, as in a fresh shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));
test('no-install: bare node --test in a fresh copy with nothing installed discovers no .docs-spec.ts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-fresh-')), run = () => spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', env });
  try {
    writeFileSync(join(dir, 'probe_test.ts'), "import test from 'node:test';\ntest('probe', () => {});\n");
    for (const f of specs) copyFileSync(join(here, f), join(dir, f));
    const clean = run();
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /probe/);
    renameSync(join(dir, specs[0]!), join(dir, 'renamed_test.ts')); // the mutation: a default name is discovered, and it fails
    assert.notEqual(run().status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
