import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL } from '../lib/workflow.ts';
const script = fileURLToPath(new URL('../check-release.ts', import.meta.url));
const version = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const run = (args: string[], input?: string) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', input });
test('B5: release CLI accepts only the tag matching plugin.json', () => {
  const ok = run(['tag', `v${version}`]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, `check-release: tag ok (${version})\n`);
  for (const tag of ['v99.99.99', version, '']) {
    const bad = run(['tag', tag]);
    assert.equal(bad.status, 1);
    assert.equal(bad.stderr, `check-release: tag ${tag} does not match plugin.json version ${version}\n`);
  }
});
test('B5: release CLI checks notes from a file or stdin for both install commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-release-'))
const  file = join(dir, 'notes with spaces.txt');
  try {
    writeFileSync(file, INSTALL.join('\n'));
    for (const result of [run(['notes', file]), run(['notes', '-'], INSTALL.join('\n'))]) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `check-release: notes ok (${version})\n`);
    }
    for (const present of INSTALL) {
      const bad = run(['notes', '-'], present)
const  absent = INSTALL.find(line => line !== present);
      assert.equal(bad.status, 1);
      assert.equal(bad.stderr, `check-release: release notes lack: ${absent}\n`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('B5: release CLI rejects unknown modes and unreadable notes', () => {
  const usage = run(['unknown']);
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /usage: node scripts\/check-release.ts tag vX.Y.Z \| notes FILE\|-/);
  const dir = mkdtempSync(join(tmpdir(), 'mtty-release-'));
  try {
    const missing = run(['notes', join(dir, 'missing')]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /ENOENT/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
