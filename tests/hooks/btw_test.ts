import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BTW_STATUS,
  forkPrompt,
  isBtw,
  isWindows,
  markerPath,
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

test('A6.row: a row id is a plain name the engine takes, apart by the time and the count', () => {
  const id = rowId(1764245000123, 7)

  assert.equal(id, 'btw-1764245000123-7')
  assert.match(id, /^[A-Za-z0-9_-]{1,64}$/)
  assert.match(rowId(8640000000000000, Number.MAX_SAFE_INTEGER), /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(rowId(1764245000123, 8), id)
  assert.notEqual(rowId(1764245000124, 7), id)
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
