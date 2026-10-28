import { fail, type Fail } from './fail.ts'

// What a parser reads from a fence body (matrix, Common rules 2 and 3): the
// header line, the frontmatter title, and the remaining lines as written, with
// their 1-based source line numbers.
export type Source = { header: string; title: string | null; lines: readonly { n: number; text: string }[] }

// Fails with 'directive' (a `%%{` line, or `%%` after text outside double
// quotes), 'frontmatter' (no closing `---`), 'title' (a second frontmatter
// title) or 'empty' (no header, or nothing after it).
export function readSource(text: string): Source | Fail {
  // The only line-ending normalization in the pipeline.
  const all = text.replace(/\r\n?/g, '\n').split('\n')
  let title: string | null = null
  let start = 0
  // Frontmatter opens with `---` on line 1 and runs to the next `---` line.
  // Only an unindented `title:` is read; every other key is ignored.
  if (all[0] === '---') {
    const end = all.indexOf('---', 1)
    if (end < 0) return fail('frontmatter')
    for (const line of all.slice(1, end)) {
      if (!line.startsWith('title:')) continue
      if (title !== null) return fail('title')
      title = line.slice('title:'.length).trim().replace(/^(["'])(.*)\1$/, '$2')
    }
    start = end + 1
  }
  const kept: { n: number; text: string }[] = []
  for (let i = start; i < all.length; i++) {
    const line = all[i]!
    const t = line.trimStart()
    if (t.startsWith('%%{')) return fail('directive')
    if (t === '' || t.startsWith('%%')) continue
    if (t.replace(/"[^"]*"/g, '').includes('%%')) return fail('directive')
    kept.push({ n: i + 1, text: line })
  }
  const [head, ...lines] = kept
  if (!head || lines.length === 0) return fail('empty')
  return { header: head.text.trim().replace(/;$/, ''), title, lines }
}
