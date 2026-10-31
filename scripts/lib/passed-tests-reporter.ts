// A node:test reporter for check.ts's @nt: one JSON line per real test that passed, the names of its suites and parent
// tests, outermost first, then its own name. Not a real test: a suite, a skip, a todo, an expected failure, which
// passes
// when its function throws, or the record that node reports, named by the file's path, for a test file that reported no
// test of its own.
import { resolve } from 'node:path'

type TestEvent = {
  type: string
  data: {
    name: string
    nesting: number
    file?: string
    skip?: unknown
    todo?: unknown
    expectFailure?: unknown
    details?: { type?: string }
  }
}

export default async function* passedTests(events: AsyncIterable<TestEvent>): AsyncGenerator<string> {
  // node reports one file at a time, and each test's start after its parents' starts and
  // before its result, so names[0..nesting-1] then hold the passing test's ancestors.
  const names: string[] = []
  for await (const { type, data } of events) {
    if (type === 'test:start') {
      names[data.nesting] = data.name
    }
    // skip, todo and expectFailure are absent unless set; t.skip('') sets skip to ''.
    else if (
      type === 'test:pass' &&
      data.details?.type === 'test' &&
      data.skip === undefined &&
      data.todo === undefined &&
      data.expectFailure === undefined &&
      data.file !== resolve(data.name)
    ) {
      yield `${JSON.stringify([...names.slice(0, data.nesting), data.name])}\n`
    }
  }
}
