// Markdown as GitHub renders it (D15c): a spec-compliant CommonMark + GFM tree, so every docs rule reads what the
// renderer reads.
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
type Point = { line: number; offset: number }
export type Node = {
  type: string
  value?: string
  url?: string
  alt?: string
  depth?: number
  children?: Node[]
  parent?: Node
  position?: { start: Point; end: Point }
}
export function parse(md: string): Node {
  const tree = fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as Node
  const link = (n: Node): void =>
    n.children?.forEach((c) => {
      c.parent = n
      link(c)
    })
  link(tree)
  return tree
}
export const all = (n: Node, type: string): Node[] => [
  ...(n.type === type ? [n] : []),
  ...(n.children ?? []).flatMap((c) => all(c, type)),
]
export const within = (n: Node, type: string): boolean =>
  !!n.parent && (n.parent.type === type || within(n.parent, type))
// Visible text: code, inline code and raw HTML count as a space.
export const text = (n: Node): string =>
  ['code', 'inlineCode', 'html'].includes(n.type) ? ' ' : (n.value ?? (n.children ?? []).map(text).join(''))
// A node's first line. The GFM transform makes literal autolinks with no position; a node without one takes its nearest
// positioned ancestor's.
export const lineOf = (n: Node): number => n.position?.start.line ?? lineOf(n.parent!)
export const headings = (md: string) =>
  all(parse(md), 'heading').map((h) => ({ depth: h.depth!, text: text(h), line: lineOf(h) }))
export const links = (md: string) =>
  all(parse(md), 'link').map((l) => ({ line: lineOf(l), label: text(l), target: l.url! }))
// The raw text of a level-2 section, from the line after its heading to the next h1 or h2.
export function section(md: string, title: string): string | null {
  const hs = all(parse(md), 'heading').filter((h) => h.depth! <= 2)
  const i = hs.findIndex((h) => h.depth === 2 && text(h) === title)
  if (i < 0) {
    return null
  }

  const nl = md.indexOf('\n', hs[i]!.position!.end.offset)
  return md.slice(nl < 0 ? md.length : nl + 1, hs[i + 1]?.position!.start.offset ?? md.length)
}
const R = [
  [0x3040, 0x30ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
]
export const CJK = new RegExp(
  `[${R.map(([a, b]) => `${String.fromCharCode(a!)}-${String.fromCharCode(b!)}`).join('')}]`,
)
