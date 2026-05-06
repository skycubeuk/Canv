import { useCallback, useEffect, useState } from 'react'

function isQuotaExceeded(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false
  // Browsers report this either by name or by legacy code 22 / 1014.
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  )
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initial
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      if (isQuotaExceeded(e)) {
        window.dispatchEvent(new CustomEvent('canv:quota-error', { detail: { key } }))
      }
    }
  }, [key, value])

  const update = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof v === 'function' ? (v as (p: T) => T)(prev) : v))
  }, [])

  return [value, update]
}
