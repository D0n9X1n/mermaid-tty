// Reads a gitGraph (plan C, T79; matrix, gitGraph) into its model: the direction, the title, the branches in creation
// order, and one event per branch start, commit, merge or cherry-pick, in source order. Each statement runs Mermaid
// 12.2.0's db rules (gitGraphAst.ts), and whatever the db throws on, or the grammar (gitGraph.langium) rejects or might
// read another way, fails, so the fence draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, type Br, type Mode } from '../../text.ts'
import { unsupported } from '../../width.ts'

export type CommitType = 'NORMAL' | 'REVERSE' | 'HIGHLIGHT'
// from: on a start, the branch that holds the commit it forks from (absent when there is none); on a merge, the branch
// that holds the merged head; on a pick, the source commit's branch. id: a commit's or merge's id, null when Mermaid
// generates one; a pick's is its source commit's. msg: a commit's message, null when absent (Mermaid never draws it).
// type: null on a start, a pick and an untyped merge. line: the source line, 0 for main's start.
export type GitEvent = {
  kind: 'start' | 'commit' | 'merge' | 'pick'
  branch: string
  from?: string
  id: string | null
  msg: string | null
  tags: string[]
  type: CommitType | null
  line: number
}
export type GitGraph = {
  dir: 'LR' | 'TB' | 'BT'
  title: string | null
  branches: { name: string; order: number }[]
  events: GitEvent[]
}

const HEADER = /^gitGraph(?::| (LR|TB|BT):)?$/
const TITLE = /^title[ \t]+(\S.*)$/
const ACC = /^(?:accTitle|accDescr)[ \t]*:/
const ACC_BLOCK = /^accDescr[ \t]*\{(.*)$/
// A token: an attribute key, a double-quoted string with no backslash (Langium's STRING would unescape one), or a word.
// Mermaid's grammar hides only WS /[ \t]+/, so a word runs to a space, tab or quote; one holding other whitespace
// fails.
const TOKEN = /(id|msg|tag|type|order|parent):|"([^"\\]*)"|([^ \t"]+)/y
// The ends of a line Mermaid's WS terminal skips.
const ENDS = /^[ \t]+|[ \t]+$/g
// An unquoted name, as Mermaid's REFERENCE terminal reads it. A keyword, a word Mermaid's INT terminal could take
// first,
// or one its title or accessibility terminals could start on lexes as something else, so it fails.
const NAME = /^\w([-./\w]*[-\w])?$/
const RESERVED = new Set([
  'gitGraph',
  'commit',
  'branch',
  'merge',
  'checkout',
  'switch',
  'cherry-pick',
  'LR',
  'TB',
  'BT',
  'NORMAL',
  'REVERSE',
  'HIGHLIGHT',
  'true',
  'false',
])
const SHADOWED = /^(?:\d|title|accTitle|accDescr)/
const TYPES: readonly string[] = ['NORMAL', 'REVERSE', 'HIGHLIGHT']

type Token = { key?: string; str?: string; word?: string }
// A commit Mermaid's db holds: its branch, its parents' keys, and whether it is a merge. An id-less commit's key starts
// with NUL, which no drawable text holds, so it never meets a user's id.
type Commit = { branch: string; parents: string[]; merge: boolean }
type State = { g: GitGraph; commits: Map<string, Commit>; heads: Map<string, string | null>; cur: string; seq: number }

// Ends the walk: parseGitGraph returns this Fail.
function stop(reason: string): never {
  throw fail(reason)
}

// t, if it draws as Mermaid shows it in its field, on source line n; else 'entity:<n>', 'html:<n>' or
// 'unsupported-char U+XXXX'. Ids, tags and branch names are escaped (text ground truth); a message, which Mermaid never
// draws, is kept as written.
function checked(t: string, n: number, mode: Mode = 'escaped', br: Br = 'literal'): string {
  const f = drawable(t, mode, br)
  if (f) {
    stop(`${f.reason}:${n}`)
  }

  const bad = unsupported(t)
  return bad ? stop(`unsupported-char ${bad}`) : t
}

// The tokens of the trimmed line t, source line n.
function tokens(t: string, n: number): Token[] {
  const out: Token[] = []
  for (let i = 0; i < t.length; ) {
    if (t[i] === ' ' || t[i] === '\t') {
      i++
      continue
    }

    TOKEN.lastIndex = i
    const m = TOKEN.exec(t) ?? stop(`syntax:${n}`)
    if (m[3] !== undefined && /\s/.test(m[3])) {
      stop(`syntax:${n}`)
    }

    out.push(m[1] ? { key: m[1] } : m[2] !== undefined ? { str: m[2] } : { word: m[3]! })
    i = TOKEN.lastIndex
  }

  return out
}

export function parseGitGraph(src: Source): GitGraph | Fail {
  try {
    return walk(src)
  } catch (e) {
    if (isFail(e)) {
      return e
    }

    throw e
  }
}

function walk(src: Source): GitGraph {
  const head = HEADER.exec(src.header) ?? stop('header')
  const main = mainBranch(src)
  const g: GitGraph = { dir: (head[1] ?? 'LR') as GitGraph['dir'], title: src.title, branches: [main], events: [] }
  g.events.push({ kind: 'start', branch: main.name, id: null, msg: null, tags: [], type: null, line: 0 })
  const st: State = { g, commits: new Map(), heads: new Map([[main.name, null]]), cur: main.name, seq: 0 }
  let open = 0 // the line an open accDescr { block starts on, or 0
  for (const { n, text } of src.lines) {
    const t = text.replace(ENDS, '')
    const block = open ? t : ACC_BLOCK.exec(t)?.[1]
    if (block === undefined) {
      statement(st, t, n)
      continue
    }
    // Accessibility text is not drawn.
    const end = block.indexOf('}')
    if (end >= 0 && block.slice(end + 1).replace(ENDS, '')) {
      stop(`syntax:${n}`)
    }

    open = end >= 0 ? 0 : open || n
  }

  if (open) {
    stop(`syntax:${open}`)
  }

  return g
}

// main, named and ordered by the typed config as gitGraphAst's state uses it: a name must be a non-empty string that
// checkout would find under the same name; an order must be a number.
function mainBranch(src: Source): { name: string; order: number } {
  const c = src.config
  const key = 'gitGraph.mainBranchName'
  const okey = 'gitGraph.mainBranchOrder'
  const name = key in c ? c[key] : 'main'
  const order = okey in c ? c[okey] : 0
  if (
    typeof name !== 'string' ||
    name === '' ||
    name.trim() !== name ||
    drawable(name, 'escaped', 'literal') ||
    unsupported(name)
  ) {
    stop(`config:${key}`)
  }

  if (typeof order !== 'number') {
    stop(`config:${okey}`)
  }

  return { name, order }
}

// Reads the trimmed line t, source line n, into st. Accessibility text is not drawn.
function statement(st: State, t: string, n: number): void {
  if (ACC.test(t)) {
    return
  }

  const title = TITLE.exec(t)?.[1]
  if (title !== undefined) {
    // Mermaid's TITLE terminal ends at a %%, and its converter trims and joins runs of spaces and tabs.
    if (st.g.title !== null) {
      stop(`repeat:${n}`)
    }

    if (title.includes('%%')) {
      stop(`syntax:${n}`)
    }

    st.g.title = checked(title.trim().replace(/[\t ]{2,}/g, ' '), n, 'sanitized', 'none')
    return
  }

  const [first, ...rest] = tokens(t, n)
  switch (first?.word) {
    case 'commit':
      return commit(st, attrs(rest, ['id', 'msg', 'tag', 'type'], n, true), n)
    case 'branch':
      return branch(st, name(rest[0], n), attrs(rest.slice(1), ['order'], n), n)
    case 'checkout':
    case 'switch':
      if (rest.length === 1) {
        return checkout(st, name(rest[0], n), n)
      }

      break
    case 'merge':
      return merge(st, name(rest[0], n), attrs(rest.slice(1), ['id', 'tag', 'type'], n), n)
    case 'cherry-pick':
      return pick(st, attrs(rest, ['id', 'tag', 'parent'], n), n)
  }

  stop(`syntax:${n}`)
}

type Attrs = { id?: string; msg?: string; tags: string[]; type?: CommitType; order?: number; parent?: string }

// The attributes ts holds, each key one of allowed, in any order; bare is whether a commit's bare string message is
// allowed. A repeated key other than tag: fails 'repeat:<n>'; anything else out of place fails 'syntax:<n>'.
function attrs(ts: Token[], allowed: readonly string[], n: number, bare = false): Attrs {
  const a: Attrs = { tags: [] }
  const seen = new Set<string>()
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!
    const key = t.str !== undefined && bare ? 'msg' : t.key
    const v = key === t.key ? ts[++i] : t
    if (key === undefined || !allowed.includes(key) || !v) {
      stop(`syntax:${n}`)
    }

    if (key !== 'tag' && seen.has(key)) {
      stop(`repeat:${n}`)
    }

    seen.add(key)
    if (key === 'type') {
      a.type = v.word !== undefined && TYPES.includes(v.word) ? (v.word as CommitType) : stop(`syntax:${n}`)
    } else if (key === 'order') {
      a.order = v.word !== undefined && /^(0|[1-9]\d{0,8})$/.test(v.word) ? Number(v.word) : stop(`syntax:${n}`)
    } else if (v.str === undefined) {
      stop(`syntax:${n}`)
    } else if (key === 'msg') {
      a.msg = checked(v.str, n, 'plain', 'literal')
    } else if (key === 'tag') {
      a.tags.push(label(v.str, n))
    } else {
      a[key as 'id' | 'parent'] = label(v.str, n)
    }
  }

  return a
}

// A drawn id, tag or name: escaped, and with no space SVG would collapse (a leading, trailing or doubled one, or any
// other whitespace).
function label(s: string, n: number): string {
  if (/^\s|\s$|\s\s|[^\S ]/.test(s)) {
    stop(`syntax:${n}`)
  }

  return checked(s, n)
}

// A branch name: a quoted string, or a word Mermaid's REFERENCE terminal reads whole. NAME's ASCII word characters
// always draw as written.
function name(t: Token | undefined, n: number): string {
  if (t?.str !== undefined && t.str !== '') {
    return label(t.str, n)
  }

  const w = t?.word
  return w === undefined || !NAME.test(w) || RESERVED.has(w) || SHADOWED.test(w) ? stop(`syntax:${n}`) : w
}

// Records a new commit on the current branch under id, or a generated key, and moves the branch's head to it.
function advance(st: State, id: string | null, parents: string[], merge: boolean): void {
  const key = id ?? `\0${st.seq}`
  st.seq++
  st.commits.set(key, { branch: st.cur, parents, merge })
  st.heads.set(st.cur, key)
}

const headOf = (st: State, b: string): string | null => st.heads.get(b) ?? null

function commit(st: State, a: Attrs, n: number): void {
  const id = a.id || null
  const h = headOf(st, st.cur)
  if (id !== null && st.commits.has(id)) {
    stop(`repeat:${n}`)
  } // Mermaid overwrites the first silently

  advance(st, id, h ? [h] : [], false)
  st.g.events.push({
    kind: 'commit',
    branch: st.cur,
    id,
    msg: a.msg ?? null,
    tags: a.tags,
    type: a.type ?? 'NORMAL',
    line: n,
  })
}

// A new branch starts at the current head, and is checked out.
function branch(st: State, name: string, a: Attrs, n: number): void {
  if (st.heads.has(name)) {
    stop(`branch:${n}`)
  }

  const h = headOf(st, st.cur)
  st.heads.set(name, h)
  st.g.branches.push({ name, order: a.order ?? 0 })
  st.cur = name
  const from = h ? { from: st.commits.get(h)!.branch } : {}
  st.g.events.push({ kind: 'start', branch: name, ...from, id: null, msg: null, tags: [], type: null, line: n })
}

function checkout(st: State, name: string, n: number): void {
  if (!st.heads.has(name)) {
    stop(`checkout:${n}`)
  }

  st.cur = name
}

// Mermaid's merge checks, in its order: the current head on the merged branch, a self merge, a current branch with no
// commits, an unknown branch, a merged branch with no commits, the same head; then a reused id.
function merge(st: State, other: string, a: Attrs, n: number): void {
  const curKey = headOf(st, st.cur)
  const otherKey = headOf(st, other)
  const cur = curKey ? st.commits.get(curKey) : undefined
  const from = otherKey ? st.commits.get(otherKey) : undefined
  if (
    (cur && from && cur.branch === other) ||
    st.cur === other ||
    !cur ||
    !st.heads.has(other) ||
    !from ||
    curKey === otherKey
  ) {
    stop(`merge:${n}`)
  }

  const id = a.id || null
  if (id !== null && st.commits.has(id)) {
    stop(`repeat:${n}`)
  }

  advance(st, id, [curKey!, otherKey!], true)
  st.g.events.push({
    kind: 'merge',
    branch: st.cur,
    from: from.branch,
    id,
    msg: null,
    tags: a.tags,
    type: a.type ?? null,
    line: n,
  })
}

// Mermaid's cherry-pick checks, in its order: an unknown id, a parent: that is not a direct parent, a merge with no
// parent:, a source on the current branch, a current branch with no commits.
function pick(st: State, a: Attrs, n: number): void {
  const src = a.id ? st.commits.get(a.id) : undefined
  const parent = a.parent || undefined
  const h = headOf(st, st.cur)
  if (!src || (parent && !src.parents.includes(parent)) || (src.merge && !parent) || src.branch === st.cur || !h) {
    stop(`pick:${n}`)
  }

  const tags = a.tags.length ? a.tags.filter(Boolean) : [`cherry-pick:${a.id}${src.merge ? `|parent:${parent}` : ''}`]
  advance(st, null, [h, a.id!], false)
  st.g.events.push({ kind: 'pick', branch: st.cur, from: src.branch, id: a.id!, msg: null, tags, type: null, line: n })
}
