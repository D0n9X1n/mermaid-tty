// B5 release checks: `tag vX.Y.Z` must equal plugin.json's version; `notes FILE|-` must hold both install commands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notesErrors, tagErrors } from './lib/ci-rules.ts';
const root = fileURLToPath(new URL('..', import.meta.url))
const  [mode, arg = ''] = process.argv.slice(2);
const version = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version as string;
const errors = mode === 'tag' ? tagErrors(arg, version) : mode === 'notes' ? notesErrors(readFileSync(arg === '-' ? 0 : arg, 'utf8'))
  : ['usage: node scripts/check-release.ts tag vX.Y.Z | notes FILE|-'];
for (const e of errors) { console.error(`check-release: ${e}`); }
if (errors.length) { process.exit(1); }
console.log(`check-release: ${mode} ok (${version})`);
