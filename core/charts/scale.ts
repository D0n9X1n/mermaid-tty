// Chart scales (plan C, T44): where a value lands on a field of w cells or h rows at scale m, and its share of a total.
// Each is exact on Dec, a Number only at the end; half up is ⌊x + ½⌋ (shared rule 6). m > 0 is the caller's duty, since
// each layout fails `domain` before it scales.
import { dec, mul, div, floor, ceil, roundHalfUp, toFixed, type Dec } from './decimal.ts'

// k·v/m, exact. k is a small integer: w, 8·w, h or 100.
const scaled = (v: Dec, m: Dec, k: number): Dec => div(mul(dec(k), v), m)!

// The eighths a bar of v shows on a field of w cells: round(8·w·v/m), half up.
export const eighths = (v: Dec, m: Dec, w: number): number => roundHalfUp(scaled(v, m, 8 * w))
// The cell v falls in on a field of w cells: ⌊w·v/m⌋, unclamped, so v = m is cell w.
export const cellOf = (v: Dec, m: Dec, w: number): number => floor(scaled(v, m, w))
// The row of v on a field of h rows, counted from 1: ⌈h·v/m⌉, but at least 1, so v = 0 is row 1.
export const rowAt = (v: Dec, m: Dec, h: number): number => Math.max(1, ceil(scaled(v, m, h)))
// v's share of total in percent, one decimal, half up: '79.4%'.
export const percent = (v: Dec, total: Dec): string => toFixed(scaled(v, total, 100), 1) + '%'
