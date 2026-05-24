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
