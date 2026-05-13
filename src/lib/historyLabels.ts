import type { SnapshotEntry, SnapshotReason } from './historyTypes'

/** Human-readable label for each snapshot reason. Shared between the History
 *  sidebar and the diff tab so both surfaces show identical text. */
export const REASON_LABEL: Record<SnapshotReason, string> = {
  manual: 'Manual',
  workspace_init: 'Init',
  before_ai_edit: 'AI: before',
  after_ai_edit: 'AI: after',
  before_rollback: 'Rollback',
  idle_autosave: 'Idle',
}

export function shortTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Format used in the diff-tab toolbar and history hover text.
 *  Stable format so the label looks identical whether it was built at click
 *  time or reconstructed from disk after an app restart. */
export function formatSnapshotLabel(snap: SnapshotEntry): string {
  return `${REASON_LABEL[snap.reason]} · ${snap.summary || 'Snapshot'} · ${shortTime(snap.createdAt)}`
}
