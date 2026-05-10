import { useEffect, useState } from 'react'

export interface LiveDocsChannel {
  publish: (key: string, text: string) => void
  read: (key: string) => string | undefined
  subscribe: (listener: (key: string) => void) => () => void
}

export function createLiveDocsChannel(): LiveDocsChannel {
  const map = new Map<string, string>()
  const listeners = new Set<(key: string) => void>()
  return {
    publish(key, text) {
      map.set(key, text)
      for (const l of listeners) l(key)
    },
    read(key) {
      return map.get(key)
    },
    subscribe(l) {
      listeners.add(l)
      return () => { listeners.delete(l) }
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
