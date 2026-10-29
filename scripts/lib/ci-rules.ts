// Dependency-free CI/release rules; YAML rules live in scripts/docs/ci-rules.ts.
import { INSTALL } from './workflow.ts';
export const checkShErrors = (sh: string) => [
  ...(/^#!\/usr\/bin\/env bash\n(?:#[^\n]*\n|\n)*set -euo pipefail\n/.test(sh) ? [] : ['check.sh: must start with #!/usr/bin/env bash and set -euo pipefail']),
  ...(/\|\|\s*true\b|\bset \+e\b/.test(sh) ? ['check.sh: masks a failing command (|| true or set +e)'] : [])];
export const tagErrors = (tag: string, version: string) => tag === `v${version}` ? [] : [`tag ${tag} does not match plugin.json version ${version}`];
export const notesErrors = (notes: string) => INSTALL.filter(line => !notes.includes(line)).map(line => `release notes lack: ${line}`);
export function coverageErrors(ids: string[], coverage: Record<string, string | string[]>, steps: Set<string>): string[] {
  const errors: string[] = [];
  for (const id of ids) if (![coverage[id] ?? []].flat().length) errors.push(`${id}: no CI step`);
  for (const [id, value] of Object.entries(coverage)) {
    if (!ids.includes(id)) errors.push(`${id}: unknown check ID`);
    for (const step of [value].flat()) if (!steps.has(step)) errors.push(`${id}: step id ${step} is missing from ci.yml and release.yml`);
  }
  return errors;
}
