// The image path against a real executable: a fake mmdc on PATH, run through a $ backed by node:child_process and
// node:fs (tests are not bound by the hooks' portability rules). It covers the lookup on PATH, the version probe, the
// source on stdin, the output file, a nonzero exit, a timeout and the temp dir's removal. POSIX only: images are off
// on Windows, and the image path runs mktemp and rm.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createPictures, pictureFor } from '../../hooks/image.ts'

const SKIP = process.platform === 'win32' && 'images are off on Windows, and the image path runs mktemp and rm'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAAKAAQAAAADF65wuAAAAMElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4NGaAAAE2fUvuAAAAAElFTkSuQmCC'

// mmdc: --version prints FAKE_MMDC_VERSION. A render appends its argv and stdin to FAKE_MMDC_LOG as a JSON line, then
// fails when stdin holds FAIL, sleeps when it holds SLEEP, and otherwise writes a whole 320 x 640 PNG to its -o.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs'), a = process.argv.slice(2)
if (a[0] === '--version') { console.log(process.env.FAKE_MMDC_VERSION); process.exit(0) }
let stdin = ''; process.stdin.on('data', d => { stdin += d }); process.stdin.on('end', () => {
  fs.appendFileSync(process.env.FAKE_MMDC_LOG, JSON.stringify({ argv: a, stdin }) + '\\n')
  if (stdin.includes('FAIL')) { console.error('Error: Parse error on line 2:'); process.exit(1) }
  if (stdin.includes('SLEEP')) { setTimeout(() => {}, 60000); return }
  fs.writeFileSync(a[a.indexOf('-o') + 1], Buffer.from('${PNG}', 'base64'))
})
`

// A fresh bin dir holding mmdc (or none), a fresh TMPDIR, and a $ over them. run caps each child at capMs, so a test's
// timeout is short while the timeoutMs the code asked for is recorded.
function world(o: { version?: string; mmdc?: boolean; capMs?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mtty-it-')), bin = join(root, 'bin'), tmp = join(root, 'tmp'), log = join(root, 'mmdc.log')
  mkdirSync(bin); mkdirSync(tmp)
  if (o.mmdc !== false) { writeFileSync(join(bin, 'mmdc'), FAKE); chmodSync(join(bin, 'mmdc'), 0o755) }
  const timeouts: number[] = [], logs: string[] = [], redraws: string[] = []
  const PATH = [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(':')
  const $ = {
    env: { get: async (n: string) => ({ TERM: 'xterm-kitty', TMPDIR: tmp } as Record<string, string>)[n] },
    config: { list: async () => [{ key: 'theme', value: 'dark' }] },
    process: { run: (argv: string[], init: any = {}) => new Promise((resolve, reject) => {
      if (argv[0] === 'mmdc') timeouts.push(init.timeoutMs)
      const c = spawn(argv[0]!, argv.slice(1), { env: { PATH, FAKE_MMDC_VERSION: o.version ?? '11.17.1', FAKE_MMDC_LOG: log } })
      let stdout = '', stderr = '', killed = false
      const t = setTimeout(() => { killed = true; c.kill('SIGKILL') }, Math.min(init.timeoutMs ?? 30000, o.capMs ?? 10000))
      c.stdout.on('data', d => { stdout += d }); c.stderr.on('data', d => { stderr += d })
      c.on('error', e => { clearTimeout(t); reject(e) })
      c.on('close', code => { clearTimeout(t); if (killed) reject(new Error(`${argv[0]} timed out`)); else resolve({ exitCode: code ?? 1, stdout, stderr }) })
      c.stdin.on('error', () => {}); c.stdin.end(init.stdin ?? '')
    }) },
    fs: {
      write: async (p: string, t: string) => writeFileSync(p, t),
      stat: async (p: string) => ({ kind: 'file', size: statSync(p).size }),
      read: async (p: string) => ({ base64: readFileSync(p).toString('base64') }),
    },
    ui: { invalidate: (e: string) => { redraws.push(e) } },
  }
  const calls = (): { argv: string[]; stdin: string }[] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []
  return { $, timeouts, logs, redraws, calls, left: () => readdirSync(tmp), log: (r: string) => { logs.push(r) }, done: () => rmSync(root, { recursive: true, force: true }) }
}

test('A6.hook-tests: a real mmdc 11 on PATH gets the source on stdin, -p and -w, and its PNG becomes the picture; the temp dir goes', { skip: SKIP }, async () => {
  const w = world(), s = createPictures(), body = 'flowchart TD\nA --> B'
  try {
    assert.equal(pictureFor(w.$, s, body, 'dark', 80, w.log), undefined); await s.idle()
    const [c] = w.calls(); assert.equal(w.calls().length, 1); assert.equal(c!.stdin, body)
    for (const flag of ['-p', '-c', '-o']) assert.ok(c!.argv.includes(flag), flag)
    assert.deepEqual(c!.argv.slice(c!.argv.indexOf('-w'), c!.argv.indexOf('-w') + 2), ['-w', '960'])
    assert.deepEqual(pictureFor(w.$, s, body, 'dark', 80, w.log), { png: PNG, columns: 20, rows: 20 })
    assert.deepEqual(w.redraws, ['ui.render']); assert.deepEqual(w.logs, []); assert.deepEqual(w.left(), [])
    assert.ok(w.timeouts.every(t => t > 0)); assert.equal(Math.max(...w.timeouts), 30000)
  } finally { w.done() }
})

test('A6.hook-tests: a real mmdc 12 on PATH gets no -w', { skip: SKIP }, async () => {
  const w = world({ version: '12.0.0' }), s = createPictures()
  try {
    pictureFor(w.$, s, 'flowchart TD\nA --> B', 'dark', 80, w.log); await s.idle()
    assert.equal(w.calls()[0]!.argv.includes('-w'), false); assert.ok(pictureFor(w.$, s, 'flowchart TD\nA --> B', 'dark', 80, w.log))
    assert.deepEqual(w.left(), [])
  } finally { w.done() }
})

test('A5.errors: a real mmdc that exits 1 logs its first stderr line; the temp dir goes', { skip: SKIP }, async () => {
  const w = world(), s = createPictures()
  try {
    pictureFor(w.$, s, 'flowchart TD\nFAIL --> B', 'dark', 80, w.log); await s.idle()
    assert.deepEqual(w.logs, ['image: mmdc exited 1: Error: Parse error on line 2:']); assert.deepEqual(w.redraws, []); assert.deepEqual(w.left(), [])
    assert.equal(pictureFor(w.$, s, 'flowchart TD\nFAIL --> B', 'dark', 80, w.log), undefined)
  } finally { w.done() }
})

test('A5.errors: a real mmdc that hangs is killed at the timeout, logged, and its temp dir goes', { skip: SKIP }, async () => {
  const w = world({ capMs: 1500 }), s = createPictures()
  try {
    pictureFor(w.$, s, 'flowchart TD\nSLEEP --> B', 'dark', 80, w.log); await s.idle()
    assert.equal(w.logs.length, 1); assert.match(w.logs[0]!, /^image: .*timed out/); assert.deepEqual(w.redraws, []); assert.deepEqual(w.left(), [])
  } finally { w.done() }
})

test('A5.errors: no mmdc on PATH logs once and runs nothing else', { skip: SKIP }, async () => {
  const w = world({ mmdc: false }), s = createPictures()
  try {
    pictureFor(w.$, s, 'flowchart TD\nA --> B', 'dark', 80, w.log); await s.idle()
    pictureFor(w.$, s, 'flowchart TD\nC --> D', 'dark', 80, w.log); await s.idle()
    assert.equal(w.logs.length, 1); assert.match(w.logs[0]!, /^image: no usable mmdc/); assert.deepEqual(w.calls(), []); assert.deepEqual(w.left(), [])
  } finally { w.done() }
})
