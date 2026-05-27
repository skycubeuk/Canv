'use strict'

/**
 * Split `text` into chunks no longer than `limit` characters, preferring
 * sentence boundaries. A single sentence longer than `limit` is hard-split.
 * Whitespace-only input (or a nonsensical `limit < 1`) yields [].
 *
 * Note: leading sentence-terminator characters are not preserved (a string
 * starting with `.`/`!`/`?` loses them). This is an accepted limitation since
 * we only feed it cleaned prose.
 */
function chunkText(text, limit) {
  const trimmed = String(text).trim()
  if (!trimmed) return []
  if (limit < 1) return []
  if (trimmed.length <= limit) return [trimmed]

  // Split into sentences keeping the terminator; fall back to the whole string.
  const sentences = trimmed.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [trimmed]
  const chunks = []
  let cur = ''
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = '' }

  for (const piece of sentences) {
    if (piece.length > limit) {
      push()
      // Hard-split the oversized sentence.
      for (let i = 0; i < piece.trim().length; i += limit) {
        chunks.push(piece.trim().slice(i, i + limit))
      }
      continue
    }
    if ((cur + piece).length > limit) push()
    cur += piece
  }
  push()
  return chunks
}

module.exports = { chunkText }
