import test from 'node:test'; import assert from 'node:assert/strict'
import { GLYPHS, isAllowed } from '../../core/glyphs.ts'; import { width } from '../../core/width.ts'
const C = [...'▏▎▍▌▋▊▉█▁▂▃▄▅▆▇✓▸◆■○△□⊗◎·«»↑↓▷◁▽']
test("A8.platforms: C's section glyphs are allowed, one cell wide, and none has the Emoji property", () => {
  assert.equal(C.length, 32)
  for (const g of C) { assert.ok(isAllowed(g), g); assert.equal(width(g), 1, g); assert.ok(!/\p{Emoji}/u.test(g), g) }
  assert.equal(GLYPHS.size, 262)
})
