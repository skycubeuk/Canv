import type { ChatMessage } from '../components/ChatPanel'

export interface TruncateResult {
  kept: ChatMessage[]
  discarded: ChatMessage[]
}

/**
 * Truncate `messages` so a re-run from the user turn anchored at-or-before
 * `anchorId` produces a clean replacement.
 *
 * - If `anchorId` is a user message: keep up to and including it.
 * - If `anchorId` is an assistant message: walk back to the user message
 *   immediately preceding it; keep up to and including that user message.
 *
 * Throws if the anchor is not found, or if no user message precedes the
 * assistant anchor.
 */
export function truncateForRetry(
  messages: ChatMessage[],
  anchorId: string,
): TruncateResult {
  const anchorIdx = messages.findIndex((m) => m.id === anchorId)
  if (anchorIdx < 0) throw new Error(`Retry anchor not found: ${anchorId}`)

  const anchor = messages[anchorIdx]
  let cutAfter: number
  if (anchor.role === 'user') {
    cutAfter = anchorIdx
  } else {
    let j = anchorIdx - 1
    while (j >= 0 && messages[j].role !== 'user') j--
    if (j < 0) throw new Error(`No preceding user message for assistant anchor: ${anchorId}`)
    cutAfter = j
  }
  return {
    kept: messages.slice(0, cutAfter + 1),
    discarded: messages.slice(cutAfter + 1),
  }
}

/**
 * Replace the content of the most-recent user message with `newText` and drop
 * everything after it. Throws when no user message exists.
 *
 * The user message's id, provider, and other fields are preserved.
 */
export function truncateForEditAndRetry(
  messages: ChatMessage[],
  newText: string,
): TruncateResult {
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break }
  }
  if (lastUserIdx < 0) throw new Error('No user message to edit')
  const editedUser: ChatMessage = { ...messages[lastUserIdx], content: newText }
  const kept = [...messages.slice(0, lastUserIdx), editedUser]
  const discarded = messages.slice(lastUserIdx + 1)
  return { kept, discarded }
}
