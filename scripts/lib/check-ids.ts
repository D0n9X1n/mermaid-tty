// The one parser for the acceptance doc's check IDs, following B7's rules. scripts/check-ids.ts (A's parity CLI) and
// B's check-ci-coverage.ts import it.

// A label is bold text with the colon inside the bold: **No build:**
const LABEL = /\*\*([^*:]+):\*\*/g
// A table row of spec A or B: | A8 | …
const ROW = /\| ([AB]\d+) \|/
// The sections that hold check IDs; any other `## ` heading ends one.
const SECTION = /^## (Spec A|Spec B|Visual review)\b/

// Lowercase; each run outside [a-z0-9] becomes one '-'; trim '-' from both ends.
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Row IDs plus <row>.<slug> per label in the row (spec A and B), and VR.<slug> per label in the visual review section,
// in document order.
export function parseIds(md: string): string[] {
  const ids: string[] = []
  let section = ''
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      section = SECTION.exec(line)?.[1] ?? ''
      continue
    }

    const labels = [...line.matchAll(LABEL)].map((m) => slug(m[1]!))
    if (section === 'Visual review') {
      ids.push(...labels.map((l) => `VR.${l}`))
    } else if (section) {
      const row = ROW.exec(line)?.[1]
      if (row) {
        ids.push(row, ...labels.map((l) => `${row}.${l}`))
      }
    }
  }

  return ids
}

// IDs the doc has and the rows lack, and IDs the rows have and the doc lacks.
export function diffIds(doc: string[], rows: string[]): { missing: string[]; extra: string[] } {
  return { missing: doc.filter((id) => !rows.includes(id)), extra: rows.filter((id) => !doc.includes(id)) }
}
