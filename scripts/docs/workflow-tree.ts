// Workflow YAML as GitHub reads it (D15c, as markdown.ts is for Markdown): every workflow rule runs on the parsed tree, on real keys and values,
// never on substrings. What the rules cannot interpret is an error, never a pass: a parse error or warning, an anchor, an alias, a merge key, a
// tag, a non-string key, or a flow collection where they need block style (jobs, each job, its steps, each step).
import { LineCounter, isAlias, isMap, isNode, isPair, isScalar, isSeq, parseDocument, visit, type YAMLMap } from 'yaml';
// A uses value is owner/repo[/path]@<40 hex>. Its # vN comment is read from the source: the rest of the value's own line, right after the value.
const PIN = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, VERSION = /^ # v\d/;
export type Workflow = { unreadable: string[]; errors: string[]; value: unknown };
export function readWorkflow(name: string, yml: string): Workflow {
  const lc = new LineCounter(), doc = parseDocument(yml, { lineCounter: lc, prettyErrors: false }), unreadable: string[] = [], rules: string[] = [];
  const start = (n: any): number => n?.range?.[0] ?? n?.key?.range?.[0] ?? n?.value?.range?.[0] ?? 0, at = (n: unknown) => lc.linePos(start(n)).line;
  const eol = (i: number) => { const j = yml.indexOf('\n', i); return j < 0 ? yml.length : j; };
  const source = (i: number) => yml.slice(yml.lastIndexOf('\n', i - 1) + 1, eol(i)).trim();
  const bad = (n: unknown, what: string) => { unreadable.push(`${name}:${at(n)}: unreadable: ${what}`); };
  const pinned = (v: unknown) => isScalar(v) && typeof v.value === 'string' && PIN.test(v.value) && !!v.range && VERSION.test(yml.slice(v.range[1], eol(v.range[1])));
  for (const e of [...doc.errors, ...doc.warnings]) unreadable.push(`${name}:${lc.linePos(e.pos[0]).line}: unreadable: ${e.code}: ${e.message.split('\n')[0]}`);
  visit(doc, (_, n) => {
    if (isAlias(n)) bad(n, `alias *${n.source}`);
    else if (isNode(n)) { if (n.anchor) bad(n, `anchor &${n.anchor}`); if (n.tag) bad(n, `tag ${n.tag}`); }
    else if (isPair(n)) {
      const key = isScalar(n.key) ? n.key.value : undefined;
      if (typeof key !== 'string') bad(n, `non-string key ${String(n.key)}`);
      else if (key === '<<') bad(n, 'merge key <<');
      else if (key.toLowerCase() === 'uses' && !pinned(n.value)) rules.push(`${name}:${at(n)}: action not pinned by full SHA with a # version comment: ${source(start(n))}`);
    }
  });
  const block = (n: unknown): n is YAMLMap => isMap(n) && !n.flow;
  const text = (m: YAMLMap, k: string) => { const v = m.get(k, true); return isScalar(v) && typeof v.value === 'string' ? v.value : undefined; };
  const step = (s: YAMLMap) => {
    if (!s.has('run')) return;
    const run = text(s, 'run');
    if (run === undefined) { bad(s.get('run', true) ?? s, 'run must be a string'); return; }
    if (/\.sh\b/.test(run) && text(s, 'shell') !== 'bash') rules.push(`${name}:${at(s)}: step runs a .sh script without shell: bash`);
    if (/scripts\/|gh release|claude plugin/.test(run) && !/^[\w-]+$/.test(text(s, 'id') ?? '')) rules.push(`${name}:${at(s)}: check step has no stable id`);
  };
  const jobs = isMap(doc.contents) ? doc.contents.get('jobs', true) : undefined;
  if (!block(jobs)) bad(jobs ?? doc.contents, 'jobs must be a block mapping');
  else for (const p of jobs.items) {
    const job = p.value, where = `jobs.${String(p.key)}`;
    if (!block(job)) { bad(job ?? p, `${where} must be a block mapping`); continue; }
    if (!job.has('steps')) continue; // a job that calls a reusable workflow has no steps
    const steps = job.get('steps', true);
    if (!isSeq(steps) || steps.flow) { bad(steps ?? p, `${where}.steps must be a block sequence`); continue; }
    steps.items.forEach((s, i) => { if (block(s)) step(s); else bad(s ?? steps, `${where}.steps[${i}] must be a block mapping`); });
  }
  let value: unknown;
  try { value = doc.toJS(); } catch (e) { bad(doc.contents, `cannot resolve: ${(e as Error).message}`); }
  return { unreadable, errors: [...unreadable, ...rules], value };
}
// Required keys and values, read from the plain object; a rule that throws (a missing parent) is missing too.
export const need = (name: string, value: unknown, rules: [string, (w: any) => unknown][]) => rules
  .filter(([, ok]) => { try { return !ok(value); } catch { return true; } }).map(([what]) => `${name}: missing ${what}`);
// B3: publish-wiki.yml publishes on every push to main with a read-only token, one job-scoped write and the push-if-changed publisher.
export function publishWikiErrors(yml: string): string[] {
  const { errors, value } = readWorkflow('publish-wiki.yml', yml);
  const jobs = (w: any): any[] => Object.values(w.jobs ?? {}), steps = (w: any): any[] => jobs(w).flatMap((j) => (Array.isArray(j?.steps) ? j.steps : []));
  const filtered = Object.values((value as any)?.on ?? {}).some((e: any) => e !== null && typeof e === 'object' && (Object.hasOwn(e, 'paths') || Object.hasOwn(e, 'paths-ignore')));
  return [...errors, ...need('publish-wiki.yml', value, [
    ['push to main', (w) => JSON.stringify(w.on.push.branches) === '["main"]'], ['workflow_dispatch', (w) => Object.hasOwn(w.on, 'workflow_dispatch')],
    ['read-only workflow token', (w) => w.permissions.contents === 'read'], ['job-scoped contents: write', (w) => jobs(w).some((j) => j?.permissions?.contents === 'write')],
    ['ubuntu runner', (w) => jobs(w).some((j) => j?.['runs-on'] === 'ubuntu-latest')],
    ['publisher call', (w) => steps(w).some((s) => typeof s?.run === 'string' && s.run.trim() === 'scripts/publish-wiki.sh wiki wiki-repo "$GITHUB_SHA"')],
    ['push-if-changed', (w) => steps(w).some((s) => s?.if === "steps.mirror.outputs.changed == 'true'")]]),
    ...(filtered ? ['publish-wiki.yml: paths filter would skip merges; publish on every push to main'] : [])];
}
