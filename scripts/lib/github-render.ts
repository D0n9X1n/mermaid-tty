// D15d: GitHub's own render of each page must show exactly the GFM tree's links and images, so any micromark/cmark-gfm divergence (such as code spans past 1,000 backticks) fails in CI.
import { spawnSync } from 'node:child_process'
import { all, parse } from '../docs/markdown.ts'
const REPO = 'D0n9X1n/mermaid-tty'
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? decode(m[1]!) : undefined
}
// Live links and images in GitHub's HTML, minus its image wrappers (<a target="_blank" href="<the img src>">) and heading anchors; a proxied image keeps data-canonical-src.
export function githubRefs(html: string): string[] {
  const out: string[] = []
  for (const [, a, img, one] of html.matchAll(/(<a\s[^>]*>)(<img\s[^>]*>)|(<(?:a|img)\s[^>]*>)/g)) {
    for (const t of a ? [a, img!] : [one!]) {
      if (t.startsWith('<img')) {
        out.push(`image ${attr(t, 'data-canonical-src') ?? attr(t, 'src')}`)
        continue
      }
      const href = attr(t, 'href')
      const wrapper = !!img && href === attr(img, 'src') && /\starget="_blank"/.test(t)
      if (href !== undefined && !wrapper && !/\sclass="anchor"/.test(t)) {
        out.push(`link ${href}`)
      }
    }
  }
  return out
}
// What the checker sees: link and image nodes, plus <a href> and <img src> inside raw HTML (the README hero).
export function treeRefs(md: string): string[] {
  const tree = parse(md)
  const html = all(tree, 'html')
    .flatMap((h) => [...h.value!.matchAll(/<(a|img)\s[^>]*>/g)])
    .flatMap(([t, k]) => {
      const v = attr(t!, k === 'a' ? 'href' : 'src')
      return v === undefined ? [] : [`${k === 'a' ? 'link' : 'image'} ${v}`]
    })
  return [...all(tree, 'link').map((l) => `link ${l.url}`), ...all(tree, 'image').map((i) => `image ${i.url}`), ...html]
}
const minus = (a: string[], b: string[]) => {
  const rest = [...b]
  return a.filter((x) => {
    const i = rest.indexOf(x)
    if (i >= 0) {
      rest.splice(i, 1)
    }
    return i < 0
  })
}
export function renderErrors(where: string, md: string, html: string): string[] {
  const gh = githubRefs(html)
  const ours = treeRefs(md)
  return [
    ...minus(gh, ours).map((r) => `${where}: GitHub renders ${r}, which the checker does not see (D15d)`),
    ...minus(ours, gh).map((r) => `${where}: the checker sees ${r}, which GitHub does not render (D15d)`),
  ]
}
// GitHub's render of a repo file, as `gh api markdown` returns it; CI passes the job's GITHUB_TOKEN as GH_TOKEN.
export function githubHtml(file: string, cwd: string): string {
  const r = spawnSync('gh', ['api', 'markdown', '-F', `text=@${file}`, '-f', 'mode=gfm', '-f', `context=${REPO}`], {
    cwd,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    throw new Error(`gh api markdown failed: ${(r.stderr || r.error?.message || 'no output').trim()}`)
  }
  return r.stdout
}
