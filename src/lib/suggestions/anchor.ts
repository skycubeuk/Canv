// src/lib/suggestions/anchor.ts
// Pure content-anchor serialisation/resolution — no DOM, no IO.
//
// An annotation's position is persisted as a content anchor: the exact quoted
// text plus a bounded slice of surrounding context. On reload we re-resolve the
// anchor against the (possibly changed) document text. This survives offset
// shifts from edits elsewhere in the file, and disambiguates a repeated quote
// by its surrounding context.

const DEFAULT_CTX = 32

export interface ContentAnchor {
  /** The exact anchored text slice `docText[from..to]`. */
  quote: string
  /** Up to `ctx` chars immediately before `from`. */
  prefix: string
  /** Up to `ctx` chars immediately after `to`. */
  suffix: string
}

/**
 * Capture the text at `[from, to]` in `docText` plus surrounding context.
 * `ctx` bounds prefix and suffix length (default 32). Prefix/suffix are clamped
 * at the document edges.
 */
export function makeAnchor(docText: string, from: number, to: number, ctx = DEFAULT_CTX): ContentAnchor {
  const quote = docText.slice(from, to)
  const prefix = docText.slice(Math.max(0, from - ctx), from)
  const suffix = docText.slice(to, Math.min(docText.length, to + ctx))
  return { quote, prefix, suffix }
}

/**
 * Resolve `anchor` to a `{ from, to }` in `docText`, or `null` if it can't be
 * located. Strategy, in order of preference:
 *   1. Among all positions where `quote` occurs, prefer the one whose actual
 *      surrounding text matches `prefix`+`suffix` best. If exactly one
 *      candidate has the maximal (non-zero) context score, take it.
 *   2. If the quote occurs exactly once, take it regardless of context (handles
 *      context drift, e.g. edits adjacent to the span).
 *   3. Otherwise null.
 */
export function resolveAnchor(
  docText: string,
  anchor: ContentAnchor,
): { from: number; to: number } | null {
  const { quote, prefix, suffix } = anchor
  if (!quote) return null

  // Collect every position where `quote` appears.
  const positions: number[] = []
  let searchFrom = 0
  for (;;) {
    const idx = docText.indexOf(quote, searchFrom)
    if (idx === -1) break
    positions.push(idx)
    searchFrom = idx + 1
  }
  if (positions.length === 0) return null

  // Unique quote — accept regardless of context drift.
  if (positions.length === 1) {
    return { from: positions[0], to: positions[0] + quote.length }
  }

  // Context score = matching chars of prefix (counted right-to-left from the
  // span start) + matching chars of suffix (counted left-to-right from the
  // span end). Higher is a better contextual fit.
  function contextScore(pos: number): number {
    let score = 0
    const actualPrefix = docText.slice(Math.max(0, pos - prefix.length), pos)
    for (let i = 1; i <= Math.min(actualPrefix.length, prefix.length); i++) {
      if (actualPrefix[actualPrefix.length - i] === prefix[prefix.length - i]) score++
      else break
    }
    const end = pos + quote.length
    const actualSuffix = docText.slice(end, Math.min(docText.length, end + suffix.length))
    for (let i = 0; i < Math.min(actualSuffix.length, suffix.length); i++) {
      if (actualSuffix[i] === suffix[i]) score++
      else break
    }
    return score
  }

  let bestPos = -1
  let bestScore = -1
  let tieCount = 0
  for (const pos of positions) {
    const score = contextScore(pos)
    if (score > bestScore) {
      bestScore = score
      bestPos = pos
      tieCount = 1
    } else if (score === bestScore) {
      tieCount++
    }
  }

  // Unambiguous best contextual fit wins.
  if (bestScore > 0 && tieCount === 1) {
    return { from: bestPos, to: bestPos + quote.length }
  }

  // Ambiguous (no context distinguishes the candidates) — give up.
  return null
}
