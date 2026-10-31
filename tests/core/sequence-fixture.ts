// Helpers the sequence parser tests share: P parses a fence body after its header, and the builders make the exact
// model a test expects. None of them asserts.
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
export const P = (t: string) => parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any

// Model builders; they do not assert. A message takes ->>'s line and ends unless o overrides them.
export const part = (id: string, kind = 'participant', label = id) => ({ id, kind, label })
export const msg = (from: string, to: string, text: string, o: object = {}) => ({
  kind: 'msg',
  from,
  to,
  line: 'solid',
  tail: 'none',
  head: 'arrow',
  text,
  activate: false,
  deactivate: false,
  num: null,
  ...o,
})
export const note = (side: string, ids: string[], text: string) => ({ kind: 'note', side, ids, text })
export const frame = (type: string, ...sections: [string | null, object[]][]) => ({
  kind: 'frame',
  type,
  sections: sections.map(([cond, items]) => ({ cond, items })),
})
export const mark = (kind: string, id: string) => ({ kind, id })
export const seq = (participants: object[], items: object[], o: object = {}) => ({
  title: null,
  participants,
  boxes: [],
  items,
  ...o,
})
export const AB = [part('A'), part('B')]
// Each message's number, frames included, in source order.
export const nums = (items: any[]): (number | null)[] =>
  items.flatMap((i) => {
    if (i.kind === 'msg') {
      return [i.num]
    }

    return i.kind === 'frame' ? i.sections.flatMap((s: any) => nums(s.items)) : []
  })
// The label of a box whose line is `box ${rest}`; it does not assert.
export const boxLabelOf = (rest: string) => P(`box ${rest}\nparticipant A\nend\nA->>A: x`).boxes[0].label
