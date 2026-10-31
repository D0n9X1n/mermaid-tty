import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { tier2Problems, tier2Files, repoRecords } from '../../scripts/check-tier2.ts'
import { TIER2, TIER2_PASSED } from '../../core/registry.ts'
import type { ReviewRecord } from '../../scripts/check-review-hashes.ts'
const FILES: Record<string, string> = {
  'fixtures/radar/radar-ok-01.mmd': 'radar-beta\naxis A\n',
  'goldens/radar/radar-ok-01.golden': '@80\nA\n',
}
const ALL = Object.keys(FILES)
const read = (p: string) => FILES[p] ?? null
const sha = (p: string) => createHash('sha256').update(FILES[p]!).digest('hex')
const rec = (paths: string[], verdict: 'pass' | 'fail' = 'pass', scope = 'vr-C-radar'): ReviewRecord => ({
  path: 'ci/reviews/x.md',
  scope,
  verdict,
  date: '2026-11-01',
  reviewers: ['a', 'b'],
  files: paths.map((p) => ({ path: p, sha256: sha(p) })),
})
test('A5.errors: a Tier 2 type passes the gate only with a vr-C-<type> pass record that hashes every ok fixture and golden', () => {
  assert.deepEqual(tier2Problems('radar', ALL, [rec(ALL)], read), [])
  assert.deepEqual(tier2Problems('radar', ALL, [rec(ALL.slice(1))], read), [
    'vr-C-radar: fixtures/radar/radar-ok-01.mmd',
  ]) // a fixture not listed
  assert.equal(tier2Problems('radar', ALL, [rec(ALL.slice(0, 1)), rec(ALL.slice(1))], read).length, 1) // a fixture-only and a golden-only record do not add up
  for (const records of [[rec([])], [], [rec(ALL, 'fail')], [rec(ALL, 'pass', 'vr-C-sankey')]]) { // empty table, no record, fail, other scope
    assert.equal(tier2Problems('radar', ALL, records, read).length, 2)
  }
  assert.equal(
    tier2Problems('radar', ALL, [rec(ALL)], (p) => (p.endsWith('.mmd') ? 'radar-beta\n' : read(p))).length,
    1,
  ) // a stale hash
  assert.deepEqual(tier2Problems('radar', [], [rec([])], read), ['vr-C-radar: no ok fixtures'])
})
test('A5.errors: TIER2_PASSED lists exactly the Tier 2 types that pass the gate in this repo', () => {
  const records = repoRecords()
  for (const t of TIER2) {
    assert.equal(tier2Problems(t, tier2Files(t), records).length === 0, TIER2_PASSED.includes(t), t)
  }
})
