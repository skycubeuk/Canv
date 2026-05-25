// src/lib/suggestions/types.ts

/** A pending hunk is shown and decidable; an invalidated one was edited
 *  through by the user and is no longer offered (it is dropped on the next
 *  store sync). */
export type HunkStatus = 'pending' | 'invalidated'

/**
 * One accept/reject region of a rewrite. Coordinates are absolute document
 * positions in the *current* document. `[from, to]` is the span the rewrite
 * deletes; `insert` is what replaces it. A pure insertion has `from === to`;
 * a pure deletion has `insert === ''`.
 */
export interface Hunk {
  id: string
  from: number
  to: number
  insert: string
  status: HunkStatus
}

/** Provenance carried so accepts can be attributed in history snapshots. */
export interface DiffOrigin {
  agentId: string
  agentLabel: string
  provider: string
  model: string
}

/** An open annotation is shown; an invalidated one had its anchored text
 *  deleted and is dropped from the document. */
export type AnnotationStatus = 'open' | 'invalidated'

/**
 * A span-anchored note in the document — AI feedback or a user note. `[from,to]`
 * is the anchored span (absolute positions in the current doc). When
 * `suggestedReplacement` is set, the card offers an Accept that replaces the span
 * with it (reusing the inline-diff apply path).
 */
export interface Annotation {
  id: string
  from: number
  to: number
  note: string
  /** Display name of the author — an agent label, or 'You' for a user note. */
  author: string
  suggestedReplacement?: string
  status: AnnotationStatus
  /** Verbatim text the note refers to. Display fallback for the card when the
   *  span can't be anchored (from === to). Session-only — not persisted. */
  quote?: string
  /** Card is collapsed to just author + number badge. Session-only — not persisted. */
  collapsed?: boolean
  /** Card is open in its inline text-editing state. Session-only — not persisted. */
  editing?: boolean
}
