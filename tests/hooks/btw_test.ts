import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BTW_STATUS,
  forkPrompt,
  isBtw,
  isWindows,
  keepRow,
  KEPT_CHARS,
  KEPT_ROWS,
  markerPath,
  rowFor,
  rowId,
  SIDE_QUESTION,
  takesBtw,
  usesMarker,
} from '../../hooks/btw.ts'

test('A6.command: mermaid-tty takes /btw only in a terminal, outside source mode, for a question', () => {
  assert.equal(takesBtw('why?', true, 'diagram'), true)
  assert.equal(takesBtw('why?', true, 'text'), true)
  assert.equal(takesBtw('why?', true, 'source'), false)
  assert.equal(takesBtw('why?', false, 'diagram'), false)
  assert.equal(takesBtw('', true, 'diagram'), false)
  assert.equal(takesBtw(' \t ', true, 'diagram'), false)
  assert.equal(takesBtw(undefined, true, 'diagram'), false)
  assert.equal(takesBtw(['why?'], true, 'diagram'), false)
})

test('A6.command: the fork is told it answers a side question, with no tools, before the question itself', () => {
  const prompt = forkPrompt('what is X?')

  assert.ok(prompt.startsWith(SIDE_QUESTION))
  assert.ok(prompt.endsWith('what is X?'))
  assert.match(SIDE_QUESTION, /side question/)
  assert.match(SIDE_QUESTION, /no tools/)
})

test('A6.command: a stored answer is read back only whole', () => {
  assert.equal(isBtw({ question: 'q', text: 't' }), true)
  assert.equal(isBtw({ question: 'q' }), false)
  assert.equal(isBtw({ question: 1, text: 't' }), false)
  assert.equal(isBtw(null), false)
  assert.equal(isBtw('q'), false)
})

test('A6.row: a row id is a plain name the engine takes, unique by the count and the time', () => {
  const id = rowId(7, 1764245000123)

  assert.equal(id, 'btw-7-1764245000123')
  assert.match(id, /^[A-Za-z0-9_-]{1,64}$/)
  assert.match(rowId(Number.MAX_SAFE_INTEGER, 8640000000000000), /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(rowId(8, 1764245000123), id)
  assert.notEqual(rowId(7, 1764245000124), id)
})

test('A6.row: each answer is kept under a row of its own, numbered on from the store, and read back by id', () => {
  const one = keepRow(undefined, { question: 'q1', text: 't1' }, 5)
  const two = keepRow(one.store, { question: 'q2', text: 't2' }, 5)

  assert.equal(one.id, 'btw-1-5')
  assert.equal(two.id, 'btw-2-5')
  assert.deepEqual(two.store, {
    seq: 2,
    rows: [
      { id: 'btw-1-5', question: 'q1', text: 't1' },
      { id: 'btw-2-5', question: 'q2', text: 't2' },
    ],
  })
  assert.deepEqual(rowFor(two.store, one.id), { question: 'q1', text: 't1' })
  assert.deepEqual(rowFor(two.store, two.id), { question: 'q2', text: 't2' })
  assert.equal(rowFor(two.store, 'btw-3-5'), undefined)
})

test('A6.row: the count goes on past the rows let go, so a reload at the same time never reuses an id', () => {
  let store: unknown = undefined
  const ids = new Set<string>()
  for (let i = 0; i < KEPT_ROWS + 5; i++) {
    const kept = keepRow(store, { question: 'q', text: 't' }, 0)
    ids.add(kept.id)
    store = kept.store
  }

  assert.equal(ids.size, KEPT_ROWS + 5)
  assert.equal((store as { seq: number }).seq, KEPT_ROWS + 5)
})

test('A6.row: only the newest answers are kept, so the store stays bounded', () => {
  let store: unknown = undefined
  const ids: string[] = []
  for (let i = 1; i <= KEPT_ROWS + 2; i++) {
    const kept = keepRow(store, { question: `q${i}`, text: `t${i}` }, 0)
    ids.push(kept.id)
    store = kept.store
  }

  assert.equal((store as { rows: unknown[] }).rows.length, KEPT_ROWS)
  assert.equal(rowFor(store, ids[0]!), undefined)
  assert.equal(rowFor(store, ids[1]!), undefined)
  assert.deepEqual(rowFor(store, ids[2]!), { question: 'q3', text: 't3' })
  assert.deepEqual(rowFor(store, ids.at(-1)!), { question: `q${KEPT_ROWS + 2}`, text: `t${KEPT_ROWS + 2}` })
})

test('A6.row: long answers let the oldest go past the size kept, and the newest stays whole however long', () => {
  const big = 'x'.repeat(Math.floor(KEPT_CHARS / 3))
  let store: unknown = undefined
  const ids: string[] = []
  for (let i = 0; i < 4; i++) {
    const kept = keepRow(store, { question: `q${i}`, text: big }, 0)
    ids.push(kept.id)
    store = kept.store
  }

  const huge = keepRow(store, { question: 'huge', text: 'y'.repeat(KEPT_CHARS * 2) }, 0)
  const rows = (store as { rows: { id: string }[] }).rows

  assert.deepEqual(
    rows.map((r) => r.id),
    ids.slice(2),
  )
  assert.ok(JSON.stringify(rows).length <= KEPT_CHARS)
  assert.deepEqual(
    huge.store.rows.map((r) => r.id),
    [huge.id],
  )
  assert.equal(rowFor(huge.store, huge.id)?.text.length, KEPT_CHARS * 2)
})

test('A6.row: a store that is not whole is read for what is whole in it, its count from 0 when unreadable', () => {
  const kept = keepRow(
    { seq: 3, rows: [{ id: 'a', question: 'q' }, null, 'x', { id: 'b', question: 'qb', text: 'tb' }] },
    { question: 'q', text: 't' },
    9,
  )

  assert.deepEqual(kept.store, {
    seq: 4,
    rows: [
      { id: 'b', question: 'qb', text: 'tb' },
      { id: 'btw-4-9', question: 'q', text: 't' },
    ],
  })
  assert.equal(keepRow([{ id: 'a', question: 'q', text: 't' }], { question: 'q', text: 't' }, 9).id, 'btw-1-9')
  assert.equal(keepRow({ seq: -1, rows: [] }, { question: 'q', text: 't' }, 9).id, 'btw-1-9')
  assert.equal(keepRow({ seq: 1.5, rows: [] }, { question: 'q', text: 't' }, 9).id, 'btw-1-9')
  assert.equal(rowFor('nonsense', 'a'), undefined)
  assert.equal(rowFor({ seq: 1, rows: [{ id: 'a', question: 'q' }] }, 'a'), undefined)
})

test('A6.status: the status row names the /btw being answered', () => {
  assert.match(BTW_STATUS, /\/btw/)
  assert.match(BTW_STATUS, /answering/)
})

test('A6.status: the marker sits in the home cache, named by the session, as a status line spells it', () => {
  const id = '69712be4-0d07-4be9-af9e-2498d779f9fc'

  assert.equal(markerPath('/Users/x', id), `/Users/x/.cache/mermaid-tty/btw-${id}`)
  assert.equal(markerPath('/Users/x/', id), `/Users/x/.cache/mermaid-tty/btw-${id}`)
  assert.equal(markerPath('/', id), `/.cache/mermaid-tty/btw-${id}`)
})

test('A6.status: no marker without a POSIX home, or for a session id that is not a plain lowercase name', () => {
  const id = 'abc_def-123'

  assert.equal(markerPath(undefined, id), null)
  assert.equal(markerPath('', id), null)
  assert.equal(markerPath('C:\\Users\\x', id), null)
  assert.equal(markerPath('relative/home', id), null)
  assert.equal(markerPath('/home/x', ''), null)
  assert.equal(markerPath('/home/x', '../etc/passwd'), null)
  assert.equal(markerPath('/home/x', 'a/b'), null)
  assert.equal(markerPath('/home/x', 'a b'), null)
  assert.equal(markerPath('/home/x', id), `/home/x/.cache/mermaid-tty/btw-${id}`)
  // A disk that ignores case would give OTHER and other one file, so only lowercase ids, as session ids are, get one.
  assert.equal(markerPath('/home/x', 'ABC_def-123'), null)
  assert.equal(markerPath('/home/x', 'abc_dEf-123'), null)
})

test('A6.status: the marker is used only when the switch says file, and never where Windows shows', () => {
  const unix = { os: undefined, systemRoot: undefined, windir: undefined }

  assert.equal(usesMarker('file', unix), true)
  assert.equal(usesMarker('file', { ...unix, os: 'Windows_NT' }), false)
  assert.equal(usesMarker('file', { ...unix, systemRoot: 'C:\\Windows' }), false)
  assert.equal(usesMarker('file', { ...unix, windir: 'C:\\Windows' }), false)
  assert.equal(usesMarker(undefined, unix), false)
  assert.equal(usesMarker('', unix), false)
  assert.equal(usesMarker('row', unix), false)
  assert.equal(usesMarker('FILE', unix), false)
})

test('A6.status: Windows shows in any of its own variables', () => {
  assert.equal(isWindows({ os: undefined, systemRoot: undefined, windir: undefined }), false)
  assert.equal(isWindows({ os: 'Darwin', systemRoot: undefined, windir: undefined }), false)
  assert.equal(isWindows({ os: 'Windows_NT', systemRoot: undefined, windir: undefined }), true)
  assert.equal(isWindows({ os: undefined, systemRoot: 'C:\\Windows', windir: undefined }), true)
  assert.equal(isWindows({ os: undefined, systemRoot: undefined, windir: 'C:\\Windows' }), true)
  assert.equal(isWindows({ os: undefined, systemRoot: '', windir: undefined }), true)
  assert.equal(isWindows({ os: undefined, systemRoot: undefined, windir: '' }), true)
})
