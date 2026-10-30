// B7: every check ID, from plan A's one parser (scripts/lib/check-ids.ts), maps, in ci/coverage.json, to the id: of a step in ci.yml or release.yml.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIds } from './lib/check-ids.ts';
import { coverageErrors } from './lib/ci-rules.ts';
import { stepIds } from './docs/ci-rules.ts';
const root = fileURLToPath(new URL('..', import.meta.url)), at = (p: string) => join(root, p);
const read = (p: string) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n') : '');
const ids = parseIds(read('docs/specs/2026-10-27-mermaid-tty-v1-acceptance.md')), coverage = JSON.parse(read('ci/coverage.json') || '{}');
const errors = coverageErrors(ids, coverage, stepIds(read('.github/workflows/ci.yml'), read('.github/workflows/release.yml')));
for (const e of errors) console.error(`check-ci-coverage: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-ci-coverage: ok (${ids.length} check IDs mapped)`);
