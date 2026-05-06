export interface FuzzyResult {
  score: number
  indices: number[]
}

export interface FuzzySortResult<T> {
  item: T
  score: number
  indices: number[]
}

export function fuzzyScore(query: string, target: string): FuzzyResult {
  if (!query) return { score: 0, indices: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const indices: number[] = []
  let qi = 0
  let score = 0
  let lastMatch = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    indices.push(ti)
    // Base point per matched char.
    score += 1
    // Word-start bonus: previous char is non-alphanumeric, or this is the first char.
    if (ti === 0 || /[^a-z0-9]/.test(t[ti - 1])) score += 4
    // Consecutive-run bonus: matched the previous target char too.
    if (ti === lastMatch + 1) score += 2
    lastMatch = ti
    qi++
  }
  if (qi < q.length) return { score: 0, indices: [] }
  return { score, indices }
}

export function fuzzySort<T>(
  query: string,
  items: T[],
  keyFn: (item: T) => string,
): FuzzySortResult<T>[] {
  if (!query) {
    return items.map((item) => ({ item, score: 0, indices: [] }))
  }
  const out: FuzzySortResult<T>[] = []
  for (const item of items) {
    const r = fuzzyScore(query, keyFn(item))
    if (r.score > 0) out.push({ item, score: r.score, indices: r.indices })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
