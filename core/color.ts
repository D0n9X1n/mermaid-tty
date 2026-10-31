// Color math on '#rrggbb' strings: the WCAG 2 contrast ratio and the distance in OKLab.

// Channel i (0 red, 1 green, 2 blue) of a '#rrggbb', as linear-light sRGB.
const lin = (h: string, i: number) => { const c = parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (h: string) => 0.2126 * lin(h, 0) + 0.7152 * lin(h, 1) + 0.0722 * lin(h, 2)

// The WCAG 2 contrast ratio, 1 to 21, whichever color is lighter.
export function contrast(a: string, b: string): number { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }

// Björn Ottosson's OKLab from linear sRGB: L, a, b.
function oklab(h: string): [number, number, number] {
  const [r, g, b] = [lin(h, 0), lin(h, 1), lin(h, 2)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
const  m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

// The Euclidean distance in OKLab; black to white is 1.
export function oklabDistance(a: string, b: string): number { const p = oklab(a)
const  q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }
