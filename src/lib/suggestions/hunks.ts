import type { ChangeSpec } from '@codemirror/state'
import { computeDiff } from '../diff'
import type { Hunk } from './types'

/** If the removed-character ratio exceeds this, show one block hunk for the
 *  whole span instead of many fine-grained regions. */
const ADAPTIVE_THRESHOLD = 0.5

/**
 * Diff `original` against `rewrite` and return accept/reject hunks with absolute
 * document coordinates (offset by `spanFrom`). Adjacent added/removed changes
 * group into one region; a near-total rewrite collapses to a single block hunk.
 */
export function computeHunks(spanFrom: number, original: string, rewrite: string): Hunk[] {
  if (original === rewrite) return []

  const changes = computeDiff(original, rewrite)

  // Ratio = fraction of the original span that is deleted. Counting only
  // removed chars keeps small edits fine-grained, and a pure insertion (zero
  // removed) never collapses.
  let removedChars = 0
  for (const c of changes) if (c.removed) removedChars += c.value.length
  const ratio = removedChars / Math.max(original.length, 1)
  if (ratio > ADAPTIVE_THRESHOLD) {
    return [{ id: '0', from: spanFrom, to: spanFrom + original.length, insert: rewrite, status: 'pending' }]
  }

  const hunks: Hunk[] = []
  let pos = spanFrom // absolute position in the original text
  let regionStart = -1
  let delLen = 0
  let ins = ''

  const flush = () => {
    if (regionStart < 0) return
    hunks.push({
      id: String(hunks.length),
      from: regionStart,
      to: regionStart + delLen,
      insert: ins,
      status: 'pending',
    })
    regionStart = -1
    delLen = 0
    ins = ''
  }

  for (const c of changes) {
    if (!c.added && !c.removed) {
      flush()
      pos += c.value.length
      continue
    }
    if (regionStart < 0) regionStart = pos
    if (c.removed) {
      delLen += c.value.length
      pos += c.value.length
    } else {
      ins += c.value // added text does not advance the original position
    }
  }
  flush()
  return hunks
}

/** CM change specs for the pending hunks (invalidated hunks are skipped). */
export function changesForHunks(hunks: Hunk[]): ChangeSpec[] {
  return hunks
    .filter((h) => h.status === 'pending')
    .map((h) => ({ from: h.from, to: h.to, insert: h.insert }))
}
