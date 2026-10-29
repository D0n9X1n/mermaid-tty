// Workflow YAML helpers shared by doc-rules.ts, ci-rules.ts and cc-versions.ts; no Markdown, so the release and version jobs need no docs tooling (D15c).
export const INSTALL = ['claude plugin marketplace add D0n9X1n/mermaid-tty', 'claude plugin install mermaid-tty@mermaid-tty'];
const PIN = /^\s*(-\s+)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d/;
// A uses key in any spelling: quoted, in a flow mapping, after an anchor or tag, a space before the colon, any case. Fails closed: a line holding one is an error unless it is PIN's strict form.
const USES = /\buses["']?\s*:/i;
const steps = (yml: string) => yml.split(/\n(?=\s+- )/);
const first = (s: string) => s.trim().split('\n')[0];
export const common = (name: string, yml: string) => [
  ...yml.split('\n').filter((l) => USES.test(l) && !PIN.test(l)).map((l) => `${name}: action not pinned by full SHA with a # version comment: ${l.trim()}`),
  ...steps(yml).filter((s) => /\brun:[\s\S]*\.sh\b/.test(s) && !/\bshell: bash\b/.test(s)).map((s) => `${name}: step runs a .sh script without shell: bash: ${first(s)}`),
  ...steps(yml).filter((s) => /\brun:[\s\S]*(scripts\/|gh release|claude plugin)/.test(s) && !/\bid: [\w-]+/.test(s)).map((s) => `${name}: check step has no stable id: ${first(s)}`)];
export const need = (name: string, yml: string, rules: [string, string | RegExp][]) => rules
  .filter(([, r]) => (typeof r === 'string' ? !yml.includes(r) : !r.test(yml))).map(([what]) => `${name}: missing ${what}`);
