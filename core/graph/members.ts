// Member rows (plan C T52): a class's members and an ER entity's attribute columns, built fixed, so that sizes.ts and the
// drawing never re-wrap them. A row's id, or a column's, owns its cells: T50 draws them, and T86's members contract checks them.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { wrap } from '../text.ts'
import type { Piece } from '../text.ts'
import { width } from '../width.ts'
import type { NodeRow } from './model.ts'

// A class member as it is displayed, as '+name(p) : int' or 'id$'.
export type Member = { text: string; method: boolean }

// A class's member rows: its attributes, then its methods, each in source order; member k's rows have id `${id}.m<k>`. With
// wrapAt, a member wraps at wrapAt - 1, so that a continuation, indented one cell and joined as its piece, still fits; a word
// wider than that fails word-too-wide.
export function classRows(id: string, members: readonly Member[], wrapAt: number | null): NodeRow[] | Fail {
  const keys = [...members.keys()], order = [...keys.filter(k => !members[k]!.method), ...keys.filter(k => members[k]!.method)]
  const rows: NodeRow[] = []
  for (const k of order) {
    const text = members[k]!.text
    const pieces: Piece[] | null = wrapAt === null ? [{ text, join: '' }] : wrap(text, wrapAt - 1)
    if (!pieces) return fail('word-too-wide')
    pieces.forEach((p, i) => rows.push({ text: p.text, role: 'label', align: 'left', id: `${id}.m${k}`, fixed: true,
      ...(i > 0 ? { indent: 1, join: p.join } : {}) }))
  }
  return rows
}

// An ER attribute's type, name, keys and comment, each '' when it has none.
export type Attr = { type: string; name: string; keys: string; comment: string }

// The attribute columns, in order, and their roles.
const FIELDS = [['type', 'label'], ['name', 'label'], ['keys', 'label'], ['comment', 'note']] as const

// s, then spaces to w cells.
const pad = (s: string, w: number): string => s + ' '.repeat(w - width(s))

// An ER entity's rows: each attribute's columns, its type, name, keys and comment, attribute k's with ids `${id}.a<k>.type` and
// so on. The type, name and keys never wrap, each as wide as its widest text; the comment wraps at wrapAt, as wide as its
// widest piece, and continues on a row blank but for its next piece, joined as that piece. A column blank in every attribute
// is dropped. A row's text is its columns padded, a cell apart, right-trimmed. A comment word wider than wrapAt fails
// word-too-wide.
export function erRows(id: string, attrs: readonly Attr[], wrapAt: number | null): NodeRow[] | Fail {
  const fields = FIELDS.filter(([f]) => attrs.some(a => a[f].trim() !== ''))
  // Each row's attribute k, its text in each field, and its comment piece's join: null on an attribute's first row.
  const lines: { k: number; text: Attr; join: Piece['join'] | null }[] = []
  for (const [k, a] of attrs.entries()) {
    const pieces: Piece[] | null = wrapAt === null ? [{ text: a.comment, join: '' }] : wrap(a.comment, wrapAt)
    if (!pieces) return fail('word-too-wide')
    pieces.forEach((p, i) => lines.push(i === 0 ? { k, text: { ...a, comment: p.text }, join: null }
      : { k, text: { type: '', name: '', keys: '', comment: p.text }, join: p.join }))
  }
  const widths = fields.map(([f]) => Math.max(...lines.map(l => width(l.text[f]))))
  return lines.map(({ k, text, join }): NodeRow => {
    const cols = fields.map(([f, role], j) => ({ text: text[f], role, id: `${id}.a${k}.${f}`, width: widths[j]!,
      ...(f === 'comment' && join !== null ? { join } : {}) }))
    return { text: cols.map(c => pad(c.text, c.width)).join(' ').trimEnd(), role: 'label', align: 'left', fixed: true, cols }
  })
}
