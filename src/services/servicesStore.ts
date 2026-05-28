import type { ICanvServices } from './index'

/**
 * External store backing the services context.
 *
 * The old design put the full `ICanvServices` object directly on a React
 * context, so any change to ANY service's reference (e.g. `editorStats`
 * updating on every selection move) re-rendered every component that called
 * `useService(...)`. With ~30 `useService` call sites across the IDE shell,
 * dragging a paragraph selection caused a global re-render at frame rate.
 *
 * The store gives each `useService(key)` its OWN subscription: a consumer is
 * only notified when the reference for the SPECIFIC key it asked for
 * changes. Per-frame selection updates therefore notify only the StatusBar
 * (the sole `editorStats` consumer), not the entire app.
 *
 * `subscribeAny` exists for `useAllServices`, which the contributions mount
 * uses to fan out a global "services changed" tick to contribution
 * subscribers — that path can't be narrowed without rewriting contribution
 * lifecycle, and it has exactly one consumer, so it stays.
 */
export interface ServicesStore {
  /** Read the current full services snapshot. */
  get(): ICanvServices
  /** Subscribe to changes of a single key. Returns an unsubscribe fn. */
  subscribeKey<K extends keyof ICanvServices>(key: K, listener: () => void): () => void
  /** Subscribe to any services identity change. Returns an unsubscribe fn. */
  subscribeAny(listener: () => void): () => void
  /**
   * Replace the current snapshot. Listeners for keys whose reference changed
   * are notified; `subscribeAny` listeners are notified on any reference
   * change.
   */
  update(next: ICanvServices): void
}

export function createServicesStore(initial: ICanvServices): ServicesStore {
  let current = initial
  const keyListeners = new Map<keyof ICanvServices, Set<() => void>>()
  const anyListeners = new Set<() => void>()

  return {
    get: () => current,
    subscribeKey(key, listener) {
      let set = keyListeners.get(key)
      if (!set) {
        set = new Set()
        keyListeners.set(key, set)
      }
      set.add(listener)
      return () => {
        set!.delete(listener)
      }
    },
    subscribeAny(listener) {
      anyListeners.add(listener)
      return () => {
        anyListeners.delete(listener)
      }
    },
    update(next) {
      if (next === current) return
      const prev = current
      current = next
      // Snapshot listener sets before invoking — a listener that mutates its
      // own subscription set during iteration (rare but legal) won't skip or
      // double-fire its peers.
      for (const [key, set] of keyListeners) {
        if (prev[key] !== next[key] && set.size > 0) {
          for (const l of Array.from(set)) l()
        }
      }
      if (anyListeners.size > 0) {
        for (const l of Array.from(anyListeners)) l()
      }
    },
  }
}
