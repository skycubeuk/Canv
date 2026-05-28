import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { ICanvServices } from './index'
import type { ServicesStore } from './servicesStore'

export const ServicesStoreContext = createContext<ServicesStore | null>(null)

/**
 * Subscribe a component to a single service key. The component re-renders
 * ONLY when that specific key's reference changes — not on every services
 * identity bump. Eliminates the global-rerender cascade that fired on every
 * `editorStats` update (i.e. every frame during a selection drag).
 */
export function useService<K extends keyof ICanvServices>(key: K): ICanvServices[K] {
  const store = useContext(ServicesStoreContext)
  if (!store) {
    throw new Error(`useService('${String(key)}') called outside ServicesProvider`)
  }
  const subscribe = useCallback((cb: () => void) => store.subscribeKey(key, cb), [store, key])
  const getSnapshot = useCallback(() => store.get()[key], [store, key])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Escape hatch — subscribes to ANY services identity change and returns the
 * full snapshot. Reserved for `<Contributions />` which fans out a
 * "services changed" tick to contribution subscribers and can't be narrowed
 * to a single key. Don't reach for this in normal components: prefer
 * `useService(key)` so your component only wakes for the data it reads.
 */
export function useAllServices(): ICanvServices {
  const store = useContext(ServicesStoreContext)
  if (!store) {
    throw new Error('useAllServices called outside ServicesProvider')
  }
  const subscribe = useCallback((cb: () => void) => store.subscribeAny(cb), [store])
  const getSnapshot = useCallback(() => store.get(), [store])
  return useSyncExternalStore(subscribe, getSnapshot)
}
