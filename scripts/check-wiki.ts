// B2 wiki rules on the GFM tree (D15c), ported from SonicTerm scripts/check-wiki.py (pairs, nesting, heading parity,
// links) plus
// B2's exact openers, page-name links only, per-unit language rules with no exemption, and the wiki grammar (D15b).
// Exit 1 lists every failure.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CTRL_O, LOCAL, grammarErrors } from './lib/doc-rules.ts'
import { type Node, CJK, all, parse, text } from './docs/markdown.ts'
const ZH = '-zh-CN'
const REQUIRED = ['Home', 'Usage', 'Configuration-and-Themes', 'Architecture', 'Development-and-Release']
const dir = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../wiki/', import.meta.url))
const errors: string[] = []
const pages = new Map<string, string>()
const twin = (p: string) => (p.endsWith(ZH) ? p.slice(0, -ZH.length) : p + ZH)
let names: string[] = []
try {
  names = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.md'))
} catch {
  errors.push('wiki/: directory missing')
}

for (const f of names) {
  if (/[\\/]/.test(f)) {
    errors.push(`wiki/${f.replaceAll('\\', '/')}: nested pages are not allowed`)
  } else {
    pages.set(f.slice(0, -3), readFileSync(join(dir, f), 'utf8'))
  }
}

for (const p of REQUIRED.flatMap((p) => [p, p + ZH])) {
  if (!pages.has(p)) {
    errors.push(`wiki/${p}.md: required page missing`)
  }
}

for (const p of ['Usage', 'Usage-zh-CN']) {
  for (const os of ['Windows', 'macOS', 'Linux', '/mermaid-tty source', '/mermaid-tty diagram', '/copy']) {
    if (pages.has(p) && !pages.get(p)!.includes(os)) {
      errors.push(`wiki/${p}.md: does not cover ${os}`)
    }
  }
}

for (const p of ['Development-and-Release', 'Development-and-Release-zh-CN']) {
  for (const c of LOCAL) {
    if (pages.has(p) && !pages.get(p)!.includes(c)) {
      errors.push(`wiki/${p}.md: does not show ${c}`)
    }
  }
}

for (const [p, t] of pages) {
  if (CTRL_O.test(t)) {
    errors.push(`wiki/${p}.md: claims ctrl+o shows the source`)
  }
}

const trees = new Map([...pages].map(([p, t]) => [p, parse(t)]))
const src = (md: string, n: Node) => md.slice(n.position!.start.offset, n.position!.end.offset)
const levels = (p: string) =>
  all(trees.get(p)!, 'heading')
    .map((h) => h.depth)
    .join()
for (const [page, md] of pages) {
  const f = `wiki/${page}.md`
  const zh = page.endsWith(ZH)
  const tree = trees.get(page)!
  errors.push(...grammarErrors(f, md, false))
  if (!pages.has(twin(page))) {
    errors.push(`${f}: missing language counterpart ${twin(page)}`)
    continue
  }

  const [h1, second] = tree.children!
  const opener = h1?.type === 'heading' && h1.depth === 1 ? second : h1
  const want = zh ? `[英文版](${twin(page)})` : `[Chinese (Simplified)](${twin(page)})`
  if (opener?.type !== 'paragraph' || src(md, opener) !== want) {
    errors.push(`${f}: must open with exactly ${want}`)
  }

  let crossing = 0
  let chinese = 0
  for (const l of all(tree, 'link')) {
    if (!/^[A-Za-z0-9-]+$/.test(l.url!)) {
      continue
    } // any other target is checked by grammarErrors (D15b)

    if (!pages.has(l.url!)) {
      errors.push(`${f}:${l.position!.start.line}: link target does not exist: ${l.url}`)
    } else if (l.url!.endsWith(ZH) !== zh) {
      crossing++
    }
  }

  if (crossing > 1) {
    errors.push(`${f}: ${crossing} cross-language links; only the opening twin link is allowed`)
  }
  // Language units, outside code: each heading, paragraph (list items hold paragraphs) and table row.
  for (const u of ['heading', 'paragraph', 'tableRow'].flatMap((t) => all(tree, t))) {
    const t = text(u)
    const has = CJK.test(t)
    const at = `${f}:${u.position!.start.line}`
    const shown = src(md, u).trim().slice(0, 60)
    if (zh && has && u.type === 'paragraph' && u !== opener) {
      chinese++
    }

    if (zh && !has && /\p{L}/u.test(t)) {
      errors.push(`${at}: untranslated, no CJK: ${shown}`)
    }

    if (!zh && has) {
      errors.push(`${at}: CJK outside code: ${shown}`)
    }
  }

  if (zh && !chinese) {
    errors.push(`${f}: no Chinese prose`)
  }

  if (!zh && levels(page) !== levels(twin(page))) {
    errors.push(`${f}: heading levels [${levels(page)}] differ from ${twin(page)} [${levels(twin(page))}]`)
  }
}

for (const e of errors.sort()) {
  console.error(`check-wiki: ${e}`)
}

if (errors.length) {
  process.exit(1)
}

console.log(`check-wiki: ok (${pages.size} pages)`)
