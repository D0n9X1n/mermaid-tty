import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkShErrors, coverageErrors, notesErrors, tagErrors } from '../lib/ci-rules.ts';
import { INSTALL } from '../lib/workflow.ts';
import { parseIds } from '../lib/check-ids.ts';
const SH = '#!/usr/bin/env bash\nset -euo pipefail\nclaude plugin validate .\n';
test('check.sh accepts fail-fast bash, including the real header comments', () => {
  assert.deepEqual(checkShErrors(SH), []);
  assert.deepEqual(checkShErrors(readFileSync(new URL('../check.sh', import.meta.url), 'utf8')), []);
});
test('check.sh rejects missing fail-fast settings and commands that mask failure', () => {
  for (const [from, to, want] of [['set -euo pipefail\n', '', 'set -euo pipefail'],
    ['validate .', 'validate . || true', 'masks'], ['validate .', 'set +e\nvalidate .', 'masks']])
    assert.ok(checkShErrors(SH.replace(from!, to!)).some(e => e.includes(want!)));
});
test('release: tag equals v + plugin.json version; notes carry both install commands', () => {
  assert.deepEqual([tagErrors('v1.0.0', '1.0.0'), notesErrors(INSTALL.join('\n'))], [[], []]);
  assert.equal(tagErrors('v1.0.1', '1.0.0').length + notesErrors(INSTALL[0]!).length, 2);
});
const IDS48 = ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 A6.hook-tests A6.command A6.in-claude-code ' +
  'A7 A8 A8.portability A8.benchmark A8.cache A8.no-build A8.validation A8.platforms A9 A9.harness A9.stored A9.release ' +
  'A10 VR.gallery VR.in-ci VR.reviewers VR.tangled VR.passes B1 B1.docs-check B1.beauty-review B2 B2.per-paragraph ' +
  'B2.translation-review B3 B3.publish-test B3.workflow-check B3.release B4 B5 B5.every-pr B5.release B6 B7 B7.check-ids').split(' ');
test('check IDs: plan A\'s one parser yields the 48 acceptance IDs', () => {
  assert.deepEqual(parseIds(readFileSync(new URL('../../docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md', import.meta.url), 'utf8')).sort(), [...IDS48].sort());
});
test('coverage map: every check ID maps to an existing step id, and no unknown ID', () => {
  const ids = ['A8', 'A8.portability', 'A8.no-build', 'VR.in-ci', 'B1', 'B1.beauty-review'];
  const coverage = Object.fromEntries(ids.map(id => [id, 'check']));
  assert.deepEqual(coverageErrors(ids, coverage, new Set(['check'])), []);
  const { 'A8.no-build': _, ...missing } = coverage;
  for (const [c, want] of [[missing, 'A8.no-build: no CI step'], [{ ...coverage, B9: 'check' }, 'B9: unknown check ID'],
    [{ ...coverage, A8: ['check', 'gone'] }, 'step id gone is missing']] as const)
    assert.ok(coverageErrors(ids, c, new Set(['check'])).some(e => e.includes(want)), want);
});
test('the check job runs the wiki check and the CI coverage check on every OS (B7); check.sh stays plan A\'s', () => {
  const yml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(yml, /- id: wiki\n\s+run: node scripts\/check-wiki\.ts\n/);
  assert.match(yml, /- id: ci-coverage\n[^\n]*\n\s+run: node scripts\/check-ci-coverage\.ts\n/);
  assert.ok(!readFileSync(new URL('../check.sh', import.meta.url), 'utf8').includes('check-ci-coverage'));
});
