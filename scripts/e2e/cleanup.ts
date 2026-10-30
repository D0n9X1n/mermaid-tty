// The e2e runner's sandbox removal. Node built-ins only, so the main suite tests it with nothing installed.
import { rmSync } from 'node:fs'

// Removes a run's sandbox, retrying while a file in it is busy (on Windows, held open by a process still dying: EPERM,
// EBUSY), for up to about 5 s. Returns a warning when it still cannot, and never throws: a run's leftovers end no other run.
export function removeSandbox(base: string): string | undefined {
  try {
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    return undefined
  } catch (e) {
    return `warning: could not remove ${base}: ${e instanceof Error ? e.message : String(e)}`
  }
}
