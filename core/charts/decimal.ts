// Exact decimal arithmetic for chart numbers (matrix common rule 8). A Dec is a BigInt fraction n/d with d > 0n,
// reduced by its gcd, so each value has one form and 0.1 + 0.2 is exactly 0.3.
export type Dec = { readonly n: bigint; readonly d: bigint }

const abs = (x: bigint): bigint => (x < 0n ? -x : x)
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a)
  b = abs(b)
  while (b !== 0n) {
    ;[a, b] = [b, a % b]
  }

  return a
}
// n/d in lowest terms, with the sign on n. d is never 0n.
function make(n: bigint, d: bigint): Dec {
  if (d < 0n) {
    n = -n
    d = -d
  }

  const g = gcd(n, d)
  return { n: n / g, d: d / g }
}

const pow10 = (k: number): bigint => 10n ** BigInt(k)

export const dec = (i: number): Dec => ({ n: BigInt(i), d: 1n })

// A plain decimal: a sign, digits, and digits after a point. NaN, Infinity, exponents and hex are null, so every Dec is
// finite.
const DECIMAL = /^[+-]?(\d+(\.\d+)?|\.\d+)$/
export function parseDec(s: string): Dec | null {
  if (!DECIMAL.test(s)) {
    return null
  }

  const [whole = '', frac = ''] = s.replace(/^[+-]/, '').split('.')
  const n = BigInt(whole + frac)
  return make(s.startsWith('-') ? -n : n, pow10(frac.length))
}

export const add = (a: Dec, b: Dec): Dec => make(a.n * b.d + b.n * a.d, a.d * b.d)
export const sub = (a: Dec, b: Dec): Dec => make(a.n * b.d - b.n * a.d, a.d * b.d)
export const mul = (a: Dec, b: Dec): Dec => make(a.n * b.n, a.d * b.d)
export const div = (a: Dec, b: Dec): Dec | null => (b.n === 0n ? null : make(a.n * b.d, a.d * b.n))
// Both d are positive, so cross-multiplying keeps the order.
export function cmp(a: Dec, b: Dec): -1 | 0 | 1 {
  const l = a.n * b.d
  const r = b.n * a.d
  if (l === r) {
    return 0
  }

  return l < r ? -1 : 1
}

// BigInt division truncates toward 0; the remainder's sign corrects it toward −∞ or +∞.
const floorBig = (a: Dec): bigint => a.n / a.d - (a.n % a.d < 0n ? 1n : 0n)
const ceilBig = (a: Dec): bigint => a.n / a.d + (a.n % a.d > 0n ? 1n : 0n)
const HALF: Dec = { n: 1n, d: 2n }
// Half up is ⌊a + ½⌋, so −2.5 rounds to −2 (resolved ambiguity 6).
const roundBig = (a: Dec): bigint => floorBig(add(a, HALF))
// Numbers, since callers keep them small.
export const floor = (a: Dec): number => Number(floorBig(a))
export const ceil = (a: Dec): number => Number(ceilBig(a))
export const roundHalfUp = (a: Dec): number => Number(roundBig(a))

// v / 10^k with k decimals, a leading 0 and a sign: digits(-34n, 2) is '-0.34'.
function digits(v: bigint, k: number): string {
  const s = abs(v)
    .toString()
    .padStart(k + 1, '0')
  return (v < 0n ? '-' : '') + (k === 0 ? s : `${s.slice(0, -k)}.${s.slice(-k)}`)
}
// How many times p divides x, and what is left.
function strip(x: bigint, p: bigint): [number, bigint] {
  let k = 0
  while (x % p === 0n) {
    x /= p
    k++
  }

  return [k, x]
}
// The shortest decimal, or null unless d's only prime factors are 2 and 5. A reduced n/d then ends in a nonzero digit
// after max(twos, fives) decimals, so none can be dropped.
export function toExact(a: Dec): string | null {
  const [twos, rest] = strip(a.d, 2n)
  const [fives, one] = strip(rest, 5n)
  if (one !== 1n) {
    return null
  }

  const k = Math.max(twos, fives)
  return digits((a.n * pow10(k)) / a.d, k)
}
// roundHalfUp(a·10^p) printed with p decimals, rounded in BigInt so it stays exact at any magnitude.
export const toFixed = (a: Dec, p: number): string => digits(roundBig(mul(a, { n: pow10(p), d: 1n })), p)
