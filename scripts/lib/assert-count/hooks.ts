// The preload check.ts passes to node --test, which passes it on to each test file's process. It routes node:test and
// node:assert, imported, required or got by process.getBuiltinModule, to the shims beside it, under which a test whose
// function executes no assertion fails (count.ts). The shims' own imports reach the real modules.
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = new URL('./', import.meta.url).href
const SHIMS = new Map([['node:test', 'runner.ts'], ['node:assert', 'assert.ts'], ['assert', 'assert.ts'],
  ['node:assert/strict', 'strict.ts'], ['assert/strict', 'strict.ts']].map(([id, file]) => [id, new URL(file, here).href]))

registerHooks({
  resolve(specifier, context, next) {
    const url = SHIMS.get(specifier)
    return url && !context.parentURL?.startsWith(here) ? { url, shortCircuit: true } : next(specifier, context)
  },
})
// process.getBuiltinModule finds a builtin by id, past the hooks, so for these ids it loads the shim too.
const load = createRequire(import.meta.url), builtin = process.getBuiltinModule.bind(process)
process.getBuiltinModule = ((id: string) => { const url = SHIMS.get(id); return url ? load(fileURLToPath(url)) : builtin(id) }) as typeof builtin
