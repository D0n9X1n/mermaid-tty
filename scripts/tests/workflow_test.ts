// The SHA-pin rule of lib/workflow.ts's common(): a line whose YAML key is uses, in any spelling, must be the strict pinned form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { common } from '../lib/workflow.ts';
const SHA = 'a'.repeat(40);
// What common() reports for line l of x.yml when l's action is not pinned.
const unpinned = (l: string) => [`x.yml: action not pinned by full SHA with a # version comment: ${l.trim()}`];
test('SHA pin: a quoted uses key, single or double, is held to the strict form', () => {
  for (const l of ['- "uses": actions/checkout@v7', `- "uses": actions/checkout@${SHA} # v7.0.1`, "- 'uses': actions/checkout@v7", `      - 'uses': actions/checkout@${SHA} # v7.0.1`])
    assert.deepEqual(common('x.yml', `${l}\n`), unpinned(l), l);
});
test('SHA pin: a uses key in a flow mapping is held to the strict form, even with a pinned value', () => {
  for (const l of ['- { uses: actions/checkout@v7 }', `- { uses: actions/checkout@${SHA} } # v7.0.1`, '- { "uses": actions/checkout@v7 }', '- {name: x, uses: actions/checkout@v7}', '- {"uses":"actions/checkout@v7"}'])
    assert.deepEqual(common('x.yml', `${l}\n`), unpinned(l), l);
});
test('SHA pin: the strict form passes: an unquoted uses key, owner/repo@<40 hex>, a # vN comment', () => {
  assert.deepEqual(common('x.yml', `      - name: Checkout\n        uses: actions/checkout@${SHA} # v7.0.1\n      - uses: actions/setup-node@${SHA} # v7.1.0\n        with:\n          node-version: 24\n`), []);
});
test('SHA pin: the word uses inside a run string is not a uses key; a uses key beside run: still is', () => {
  assert.deepEqual(common('x.yml', '      - run: echo "this step uses actions/checkout@v7"\n'), []);
  const l = '- { run: echo hi, uses: actions/checkout@v7 }';
  assert.deepEqual(common('x.yml', `${l}\n`), unpinned(l));
});
test('SHA pin: other spellings of the uses key are held to the strict form: a space before the colon, an anchor, a tag, a capital', () => {
  for (const l of ['- uses : actions/checkout@v7', `- uses : actions/checkout@${SHA} # v7.0.1`, '- &a uses: actions/checkout@v7', '- !!str uses: actions/checkout@v7', '- Uses: actions/checkout@v7'])
    assert.deepEqual(common('x.yml', `${l}\n`), unpinned(l), l);
});
