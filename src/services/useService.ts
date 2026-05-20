import { createContext, useContext } from 'react'
import type { ICanvServices } from './index'

export const ServicesContext = createContext<ICanvServices | null>(null)

export function useService<K extends keyof ICanvServices>(key: K): ICanvServices[K] {
  const ctx = useContext(ServicesContext)
  if (!ctx) {
    throw new Error(`useService('${String(key)}') called outside ServicesProvider`)
  }
  return ctx[key]
}

/** Escape hatch — pulls the full ICanvServices. Reserved for the
 *  <Contributions /> mounting component which needs the whole object. */
export function useAllServices(): ICanvServices {
  const ctx = useContext(ServicesContext)
  if (!ctx) {
    throw new Error('useAllServices called outside ServicesProvider')
  }
  return ctx
}
