// The rules of lib/workflow.ts read every YAML key in one canonical form (canonical()); a key it cannot read is an error, never a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { canonical, common, need } from '../lib/workflow.ts';
const SHA = 'a'.repeat(40);
// What common() reports for canonical line l of x.yml when l's action is not pinned.
const unpinned = (l: string) => [`x.yml: action not pinned by full SHA with a # version comment: ${l.trim()}`];
test('SHA pin: a quoted or spaced uses key is read as uses: unpinned fails, pinned passes', () => {
  for (const k of ['"uses"', "'uses'", 'uses ', "'uses' "]) {
    assert.deepEqual(common('x.yml', `- ${k}: actions/checkout@v7\n`), unpinned('- uses: actions/checkout@v7'), k);
    assert.deepEqual(common('x.yml', `      - ${k}: actions/checkout@${SHA} # v7.0.1\n`), [], k);
  }
  assert.deepEqual(common('x.yml', '- Uses: actions/checkout@v7\n'), unpinned('- Uses: actions/checkout@v7'));
});
test('SHA pin: the strict form passes: an unquoted uses key, owner/repo@<40 hex>, a # vN comment', () => {
  assert.deepEqual(common('x.yml', `      - name: Checkout\n        uses: actions/checkout@${SHA} # v7.0.1\n      - uses: actions/setup-node@${SHA} # v7.1.0\n        with:\n          node-version: 24\n`), []);
});
test('SHA pin: uses inside a run string is not a uses key; a uses key in the same step still is', () => {
  assert.deepEqual(common('x.yml', '      - run: echo "this step uses actions/checkout@v7"\n'), []);
  assert.deepEqual(common('x.yml', '      - run: echo "uses: actions/checkout@v7"\n'), []);
  assert.deepEqual(common('x.yml', '      - run: echo hi\n        uses: actions/checkout@v7\n'), unpinned('uses: actions/checkout@v7'));
});
test('unreadable key: an explicit ? key, an escape, a flow mapping, an anchor, a tag or a merge key is reported, never passed', () => {
  for (const yml of ['- ? uses\n  : actions/checkout@v7\n', '- "us\\u0065s": actions/checkout@v7\n', "- 'it''s': x\n", '- { uses: actions/checkout@v7 }\n',
    `- { uses: actions/checkout@${SHA} } # v7.0.1\n`, '- {\n    run: bash x.sh }\n', '- &a uses: actions/checkout@v7\n', '- !!str uses: actions/checkout@v7\n',
    '      with: { node-version: 24 }\n', 'steps: &s [{ uses: actions/checkout@v7 }]\n', '<<: *defaults\n'])
    assert.ok(common('x.yml', yml).some((e) => e.startsWith('x.yml: unreadable key: ')), yml);
});
test('key rules read run in canonical form: a quoted or spaced run key is held to the .sh and id rules', () => {
  for (const k of ['"run"', "'run'", 'run ', '"run" ']) {
    assert.deepEqual(common('x.yml', `      - id: x\n        ${k}: bash scripts/x.sh\n`), ['x.yml: step runs a .sh script without shell: bash: - id: x'], k);
    assert.deepEqual(common('x.yml', `      - shell: bash\n        ${k}: node scripts/x.ts\n`), ['x.yml: check step has no stable id: - shell: bash'], k);
  }
});
test('key rules read id in canonical form: a quoted or spaced id key gives a check step its stable id', () => {
  for (const k of ['"id"', "'id'", 'id '])
    assert.deepEqual(common('x.yml', `      - ${k}: check\n        shell: bash\n        run: bash scripts/x.sh\n`), [], k);
});
test('key rules read shell in canonical form: a quoted or spaced shell key satisfies the .sh rule', () => {
  for (const k of ['"shell"', "'shell'", 'shell '])
    assert.deepEqual(common('x.yml', `      - id: x\n        ${k}: bash\n        run: bash scripts/x.sh\n`), [], k);
});
test('need reads keys in canonical form: quoted or spaced on and permissions keys are found', () => {
  assert.deepEqual(need('x.yml', '"on":\n  push:\npermissions :\n  contents: read\n', [['push', 'on:\n  push:\n'], ['read token', '\npermissions:\n  contents: read\n']]), []);
});
test('the current workflows are already canonical: normalizing changes no line and finds no unreadable key', () => {
  const dir = new URL('../../.github/workflows/', import.meta.url), files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  assert.ok(files.includes('publish-wiki.yml'), files.join());
  for (const f of files) { const yml = readFileSync(new URL(f, dir), 'utf8'); assert.deepEqual(canonical(yml), { text: yml, unreadable: [] }, f); }
  assert.deepEqual(common('publish-wiki.yml', readFileSync(new URL('publish-wiki.yml', dir), 'utf8')), []);
});
