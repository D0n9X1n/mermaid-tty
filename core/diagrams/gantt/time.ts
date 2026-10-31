// Gantt time (plan C T67; matrix gantt section): dateFormat and axisFormat token lists, dates, durations and tick
// steps. Time is naive wall-clock time: a date is Date.UTC of its fields, so 1d is always 24 h and nothing depends on
// the host. What Mermaid would not read exactly this way is null or a Fail, so the source is drawn instead; nothing
// throws.
import { fail, type Fail } from '../../fail.ts'
import { dec, div, floor, mul, parseDec } from '../../charts/decimal.ts'

// A dateFormat's tokens and literal characters, in order: 'D/M/YYYY' is ['D', '/', 'M', '/', 'YYYY'].
export type DateFmt = readonly string[]
// An axisFormat's % tokens and literal runs, in order: 'at %H:%M' is ['at ', '%H', ':', '%M'].
export type AxisFmt = readonly string[]

// Each dateFormat token, longest first: the Date.UTC field it sets (0 year … 6 ms) and the digits it matches. A
// one-letter token prints with no leading zero, so it matches 0, or 1–99 without one.
const ONE = '0|[1-9]\\d?'
const TOKENS = new Map<string, { field: number; digits: string }>([
  ['YYYY', { field: 0, digits: '\\d{4}' }],
  ['SSS', { field: 6, digits: '\\d{3}' }],
  ['MM', { field: 1, digits: '\\d{2}' }],
  ['DD', { field: 2, digits: '\\d{2}' }],
  ['HH', { field: 3, digits: '\\d{2}' }],
  ['mm', { field: 4, digits: '\\d{2}' }],
  ['ss', { field: 5, digits: '\\d{2}' }],
  ['M', { field: 1, digits: ONE }],
  ['D', { field: 2, digits: ONE }],
  ['H', { field: 3, digits: ONE }],
  ['m', { field: 4, digits: ONE }],
  ['s', { field: 5, digits: ONE }],
])
const LITERALS = '-/.:T '

// f as a token list, read longest token first. A character that is neither a token nor a literal fails format-token,
// and so do a repeated field (MMM, HH … HH) and a one-letter token right before another token (Hmm): Mermaid's Day.js
// reads MMM as a month name and each repeat of a field, and takes a one-letter token's 1–2 digits greedily where a
// pattern backtracks. Year, month and day are all present or all absent, else format-ymd.
export function parseDateFormat(f: string): DateFmt | Fail {
  const out: string[] = []
  for (let i = 0; i < f.length; ) {
    const c = f.charAt(i)
    const token = [...TOKENS.keys()].find((k) => f.startsWith(k, i)) ?? (LITERALS.includes(c) ? c : null)
    if (token === null) {
      return fail('format-token')
    }

    out.push(token)
    i += token.length
  }

  const fields = out.flatMap((t) => TOKENS.get(t)?.field ?? [])
  const greedy = out.some((t, i) => t.length === 1 && TOKENS.has(t) && TOKENS.has(out[i + 1] ?? ''))
  if (new Set(fields).size < fields.length || greedy) {
    return fail('format-token')
  }

  const ymd = fields.filter((field) => field <= 2).length
  return ymd === 0 || ymd === 3 ? out : fail('format-ymd')
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// s read under fmt with an anchored pattern, as ms: Date.UTC of its fields, an absent field taken from 1970-01-01
// 00:00. Null unless s matches and every field reads back from that date, so a field out of range, a day its month
// lacks (02-30) and a year below 100, which Date.UTC reads as 19xx, are null.
export function parseDate(s: string, fmt: DateFmt): number | null {
  const pattern = fmt
    .map((p) => {
      const t = TOKENS.get(p)
      return t ? `(${t.digits})` : escapeRegExp(p)
    })
    .join('')
  const match = new RegExp(`^${pattern}$`).exec(s)
  if (!match) {
    return null
  }

  const v: [number, number, number, number, number, number, number] = [1970, 0, 1, 0, 0, 0, 0]
  let group = 1
  for (const p of fmt) {
    const t = TOKENS.get(p)
    if (t) {
      v[t.field] = Number(match[group++]) - (t.field === 1 ? 1 : 0)
    } // Date.UTC's months start at 0
  }

  const d = new Date(Date.UTC(...v))
  const back = [
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  ]
  return back.every((x, i) => x === v[i]) ? d.getTime() : null
}

// Each axisFormat token's printer, with d3-time-format's widths (Mermaid draws its axis with d3): %e pads with a space,
// %Y is the year mod 10000 and %y the year mod 100, so every token has a fixed width; %b and %a print English names.
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec'
const DAYS = 'SunMonTueWedThuFriSat'
const pad = (n: number, width: number, fill = '0') => String(n).padStart(width, fill)
// The day of d's year, from 1. Its 1 January is set with setUTCFullYear, since Date.UTC reads years 0–99 as 19xx.
function dayOfYear(d: Date): number {
  const jan1 = new Date(0)
  jan1.setUTCFullYear(d.getUTCFullYear(), 0, 1)
  return Math.floor((d.getTime() - jan1.getTime()) / 86_400_000) + 1
}

const AXIS = new Map<string, (d: Date) => string>([
  ['%Y', (d) => pad(d.getUTCFullYear() % 10000, 4)],
  ['%y', (d) => pad(d.getUTCFullYear() % 100, 2)],
  ['%m', (d) => pad(d.getUTCMonth() + 1, 2)],
  ['%d', (d) => pad(d.getUTCDate(), 2)],
  ['%e', (d) => pad(d.getUTCDate(), 2, ' ')],
  ['%H', (d) => pad(d.getUTCHours(), 2)],
  ['%M', (d) => pad(d.getUTCMinutes(), 2)],
  ['%S', (d) => pad(d.getUTCSeconds(), 2)],
  ['%L', (d) => pad(d.getUTCMilliseconds(), 3)],
  ['%j', (d) => pad(dayOfYear(d), 3)],
  ['%b', (d) => MONTHS.slice(3 * d.getUTCMonth(), 3 * d.getUTCMonth() + 3)],
  ['%a', (d) => DAYS.slice(3 * d.getUTCDay(), 3 * d.getUTCDay() + 3)],
])
// The tokens a date-free dateFormat allows: its times sit on 1970-01-01, where Mermaid's sit on the day it renders.
const TIME_TOKENS = ['%H', '%M', '%S', '%L']

// f as % tokens and literal runs. Any other % (%s, %%, %-d, a lone %) fails axis-format, and so does a date token when
// dated is false, for a date-free dateFormat.
export function parseAxisFormat(f: string, dated: boolean): AxisFmt | Fail {
  const parts = f.match(/%.?|[^%]+/g) ?? []
  const ok = parts.every((p) => !p.startsWith('%') || (dated ? AXIS.has(p) : TIME_TOKENS.includes(p)))
  return ok ? parts : fail('axis-format')
}

// The label of the tick at t, ms, under fmt, read with UTC getters.
export function formatAxis(t: number, fmt: AxisFmt): string {
  const d = new Date(t)
  return fmt.map((p) => AXIS.get(p)?.(d) ?? p).join('')
}

// Each duration unit, ms. M and y have no fixed length, so they are absent.
const UNIT_MS = new Map([
  ['ms', 1],
  ['s', 1000],
  ['m', 60_000],
  ['h', 3_600_000],
  ['d', 86_400_000],
  ['w', 604_800_000],
])

// s as exact ms: null unless s is <n><unit> and gives a whole number of ms below 2^53, so the number is exact. Only ms,
// s, m and h take a decimal point (1.5h): Mermaid's Day.js rounds a fractional d or w to whole days (matrix amendment),
// and the subset gives d and w none.
export function parseDuration(s: string): number | null {
  const [, num = '', unit = ''] = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(s) ?? []
  const n = parseDec(num)
  const per = UNIT_MS.get(unit)
  if (n === null || per === undefined || ((unit === 'd' || unit === 'w') && num.includes('.'))) {
    return null
  }

  const ms = mul(n, dec(per))
  const whole = Number(ms.n)
  return ms.d === 1n && Number.isSafeInteger(whole) ? whole : null
}

// The matrix's tick steps, ms: 1 5 10 50 100 500 ms; 1 5 15 30 s; 1 5 15 30 min; 1 3 6 12 h; 1 2 7 14 30 90 180 365 730
// 1825 3650 7300 18250 36500 d.
const STEPS = [
  1,
  5,
  10,
  50,
  100,
  500,
  ...[1, 5, 15, 30].map((n) => n * 1000),
  ...[1, 5, 15, 30].map((n) => n * 60_000),
  ...[1, 3, 6, 12].map((n) => n * 3_600_000),
  ...[1, 2, 7, 14, 30, 90, 180, 365, 730, 1825, 3650, 7300, 18250, 36500].map((n) => n * 86_400_000),
]

// The first step whose ticks, at cells ⌊w·k·step/m⌋ of a w-cell field spanning m ms, sit at least l + 1 cells apart, so
// a label l cells wide fits between them: ⌊w·step/m⌋ ≥ l + 1, exact, as the matrix's cells are. Null when no step
// qualifies, and then only t0 is labeled; null too when m or w is not an integer, since dec takes only integers.
export function tickStep(m: number, w: number, l: number): number | null {
  if (!Number.isInteger(m) || !Number.isInteger(w)) {
    return null
  }

  return (
    STEPS.find((step) => {
      const cells = div(mul(dec(w), dec(step)), dec(m))
      return cells !== null && floor(cells) >= l + 1
    }) ?? null
  )
}
