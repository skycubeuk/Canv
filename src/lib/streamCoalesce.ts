/**
 * Coalesce a high-frequency stream of string chunks into at most one commit
 * per animation frame.
 *
 * The streaming agent path used to call `setRuns` per token, which made the
 * Runs panel re-run regex-based parsers (`parseAgentResponse`,
 * `parseReviewNotes`) on the entire growing response string for every token.
 * That's O(tokens × response_length) work and pinned the CPU at >50% during
 * long grammar / review runs.
 *
 * Push chunks here and the buffer combines them, then fires `commit` once on
 * the next animation frame with the concatenated payload. The buffer is
 * idempotent across `push` calls: a second push inside the same frame just
 * appends to the pending payload — no extra frame scheduled.
 *
 * The scheduler/canceller are injected so tests can drive the buffer
 * synchronously without a real rAF loop.
 */
export interface StreamBuffer {
  push(chunk: string): void
  /** Commit any pending chunks now and cancel the scheduled flush. */
  flush(): void
  /** Cancel any scheduled flush and discard pending chunks. */
  cancel(): void
}

type Schedule = (fn: () => void) => number
type Cancel = (handle: number) => void

const defaultSchedule: Schedule = (fn) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : (setTimeout(fn, 16) as unknown as number)
const defaultCancel: Cancel = (h) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h)
  else clearTimeout(h as unknown as ReturnType<typeof setTimeout>)
}

export function makeStreamBuffer(
  commit: (combined: string) => void,
  schedule: Schedule = defaultSchedule,
  cancel: Cancel = defaultCancel,
): StreamBuffer {
  let pending = ''
  let handle: number | null = null

  const doCommit = () => {
    handle = null
    if (pending === '') return
    const out = pending
    pending = ''
    commit(out)
  }

  return {
    push(chunk: string) {
      if (chunk === '') return
      pending += chunk
      if (handle != null) return
      handle = schedule(doCommit)
    },
    flush() {
      if (handle != null) {
        cancel(handle)
        handle = null
      }
      if (pending === '') return
      const out = pending
      pending = ''
      commit(out)
    },
    cancel() {
      if (handle != null) {
        cancel(handle)
        handle = null
      }
      pending = ''
    },
  }
}
