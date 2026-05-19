/**
 * Minimal lifecycle utility for Phase 2 contributions. Formalises the existing
 * `subscribe(...) => () => void` pattern used throughout the codebase. Adopt
 * incrementally — `toDisposable(fn)` adapts existing cleanup callbacks.
 *
 * Idempotency split: `toDisposable` is intentionally NOT idempotent — it calls
 * its wrapped function every time `.dispose()` is invoked. Idempotency lives
 * in `DisposableStore.dispose()`. This keeps the adapter trivial and reserves
 * the bookkeeping cost for the place that actually needs it.
 */

export interface Disposable {
  dispose(): void
}

export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn }
}

export class DisposableStore implements Disposable {
  private disposables: Disposable[] = []
  private disposed = false

  add<T extends Disposable>(d: T): T {
    if (this.disposed) {
      // Caller is racing the store's owner. Dispose the new entry immediately
      // so we never leak, then surface the bug.
      try { d.dispose() } catch { /* swallow secondary error */ }
      throw new Error('DisposableStore: add() after dispose()')
    }
    this.disposables.push(d)
    return d
  }

  /** Idempotent. Children are disposed in **registration order** (the order
   *  `add()` was called). Individual disposer errors are logged but never
   *  rethrown, so one broken disposer can't strand the rest of the chain. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const items = this.disposables.splice(0)
    for (const d of items) {
      try {
        d.dispose()
      } catch (e) {
        console.error('DisposableStore: disposer threw', e)
      }
    }
  }

  get size(): number {
    return this.disposables.length
  }

  get isDisposed(): boolean {
    return this.disposed
  }
}
