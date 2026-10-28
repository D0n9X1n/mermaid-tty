// A least-recently-used cache: a Map kept in recency order, least recent first.
export type Lru<K, V> = { get(k: K): V | undefined; set(k: K, v: V): void; readonly size: number }

export function createLru<K, V>(capacity: number): Lru<K, V> {
  const m = new Map<K, V>()
  return {
    get(k) {
      if (!m.has(k)) return undefined
      const v = m.get(k) as V
      m.delete(k); m.set(k, v)
      return v
    },
    set(k, v) {
      m.delete(k); m.set(k, v)
      if (m.size > capacity) m.delete(m.keys().next().value!)
    },
    get size() { return m.size },
  }
}
