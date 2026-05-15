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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number): string => String(n).padStart(2, '0')

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export function shortTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Context-aware snapshot timestamp. Buckets evaluated against the local
 *  calendar day so "Today" / "Yesterday" match user intuition rather than a
 *  rolling 24-hour window. The optional `now` argument is for test injection. */
export function smartTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  if (isSameLocalDay(d, now)) return time

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameLocalDay(d, yesterday)) return `Yesterday ${time}`

  const dayMonth = `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`
  if (d.getFullYear() === now.getFullYear()) return `${dayMonth} ${time}`
  return `${dayMonth} ${d.getFullYear()} ${time}`
}

/** Full absolute timestamp, used as a hover tooltip wherever smartTime is shown. */
export function fullTime(iso: string): string {
  const d = new Date(iso)
  const date = `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${date}, ${time}`
}

/** Format used in the diff-tab toolbar and history hover text. Live (click-time)
 *  and reconstructed (on-mount from disk) callers go through this function, so
 *  they always agree with each other — the bucket changes as days advance. */
export function formatSnapshotLabel(snap: SnapshotEntry): string {
  return `${REASON_LABEL[snap.reason]} · ${snap.summary || 'Snapshot'} · ${smartTime(snap.createdAt)}`
}
