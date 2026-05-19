import { useEffect, useState } from 'react'

export interface LiveDocsChannel {
  publish: (key: string, text?: string) => void
  read: (key: string) => string | undefined
  /** Drop any stored text for `key`. Used when the underlying file's disk
   *  snapshot moves on (reload, external write, tool write) — the channel
   *  entry is no longer a safe seed for a fresh editor. */
  clear: (key: string) => void
  subscribe: (listener: (key: string) => void) => () => void
  /** Register a pull-on-demand getter. Replaces the previous getter.
   *  Pass `null` to unregister (e.g. on unmount). */
  setGetter: (getter: ((key: string) => string | undefined) | null) => void
}

export function createLiveDocsChannel(): LiveDocsChannel {
  // Track which keys have live edits so `clear` can remain a no-op when a
  // key was never published (avoids spurious subscriber notifications).
  const liveKeys = new Set<string>()
  const listeners = new Set<(key: string) => void>()
  let getter: ((key: string) => string | undefined) | null = null
  return {
    /** `_text` is intentionally ignored — kept only for source-compatibility
     *  with callers that pass the new markdown value. */
    publish(key, _text?) {
      liveKeys.add(key)
      for (const l of listeners) l(key)
    },
    read(key) {
      // Returning undefined for an unseen key lets callers distinguish
      // "no live edits yet" from "live edits exist — look up current text."
      if (!liveKeys.has(key)) return undefined
      return getter ? getter(key) : undefined
    },
    clear(key) {
      if (!liveKeys.delete(key)) return
      for (const l of listeners) l(key)
    },
    subscribe(l) {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
    setGetter(g) {
      getter = g
    },
  }
}

export function useFocusedDocText(
  channel: LiveDocsChannel,
  focusedKey: string | null,
  fallbackText: string | null,
  debounceMs = 250,
): string | null {
  const [, setTick] = useState(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = channel.subscribe((changedKey) => {
      if (changedKey !== focusedKey) return
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        setTick((n) => n + 1)
      }, debounceMs)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [channel, focusedKey, debounceMs])

  if (focusedKey == null) return fallbackText
  const live = channel.read(focusedKey)
  return live ?? fallbackText
}
