// Workflow YAML helpers shared by doc-rules.ts, ci-rules.ts and cc-versions.ts; no Markdown, so the release and version jobs need no docs tooling (D15c).
export const INSTALL = ['claude plugin marketplace add D0n9X1n/mermaid-tty', 'claude plugin install mermaid-tty@mermaid-tty'];
// Every key rule reads canonical(yml).text, where each key has one spelling: one pair of matching quotes stripped, the space before its colon
// trimmed. Values, comments and block scalars stay as written. A key it cannot read (an explicit ? key, an escape, a flow mapping, an anchor,
// a tag, a merge key) stays as written and is listed in unreadable, which common() reports: an unreadable key is never a pass.
const NAME = /^[\w.-]+$/, PROPS = /^(?:[&!]\S*\s+)*/, BLOCK = /^[|>][-+0-9]*\s*(#.*)?$/;
const KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"][^#]*?)\s*:(?=\s|$)/;
export function canonical(yml: string): { text: string; unreadable: string[] } {
  const unreadable: string[] = [];
  let block = -1; // inside a block scalar: the column its lines indent past
  const text = yml.split('\n').map((l) => {
    if (block >= 0 && (!l.trim() || /^[ \t]*/.exec(l)![0].length > block)) return l;
    const lead = /^[ \t]*(?:-[ \t]+)*/.exec(l)![0], body = l.slice(lead.length), key = KEY.exec(body);
    const node = (key ? body.slice(key[0].length) : body).trim().replace(PROPS, ''), name = key?.[1]!.replace(/^(["'])(.*)\1$/s, '$2');
    block = BLOCK.test(node) ? (key ? lead.length : lead.lastIndexOf('-')) : -1;
    if (/^[?:](\s|$)/.test(body) || (key && !NAME.test(name!)) || /^\{(?!\s*\})|^\[[^\]]*:/.test(node)) { unreadable.push(l); return l; }
    return key ? `${lead}${name}:${body.slice(key[0].length)}` : l;
  }).join('\n');
  return { text, unreadable };
}
const PIN = /^\s*(-\s+)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d/;
// A uses key, read in canonical form, in any case: an error unless it is PIN's strict form.
const USES = /^[ \t]*(?:-[ \t]+)*uses:/i;
const steps = (yml: string) => yml.split(/\n(?=\s+- )/);
const first = (s: string) => s.trim().split('\n')[0];
export const common = (name: string, yml: string) => {
  const { text, unreadable } = canonical(yml);
  return [...unreadable.map((l) => `${name}: unreadable key: ${l.trim()}`),
    ...text.split('\n').filter((l) => USES.test(l) && !PIN.test(l)).map((l) => `${name}: action not pinned by full SHA with a # version comment: ${l.trim()}`),
    ...steps(text).filter((s) => /\brun:[\s\S]*\.sh\b/.test(s) && !/\bshell: bash\b/.test(s)).map((s) => `${name}: step runs a .sh script without shell: bash: ${first(s)}`),
    ...steps(text).filter((s) => /\brun:[\s\S]*(scripts\/|gh release|claude plugin)/.test(s) && !/\bid: [\w-]+/.test(s)).map((s) => `${name}: check step has no stable id: ${first(s)}`)];
};
// need() reads the canonical text too; common(), which every workflow rule runs on the whole file, reports the keys it could not read.
export const need = (name: string, yml: string, rules: [string, string | RegExp][]) => {
  const text = canonical(yml).text;
  return rules.filter(([, r]) => (typeof r === 'string' ? !text.includes(r) : !r.test(text))).map(([what]) => `${name}: missing ${what}`);
};
