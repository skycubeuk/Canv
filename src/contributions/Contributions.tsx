import { useEffect, useMemo, useRef } from 'react'
import { useAllServices } from '../services/useService'
import { loadContributions, notifyServicesChange } from './index'
import type { ICanvServices } from '../services'

/** Side-effect component. Mount once near the top of the tree, inside
 *  ServicesProvider. On mount, registers every contribution; on unmount,
 *  disposes them.
 *
 *  Contributions register exactly once for the whole app lifetime. We can't
 *  use `[services]` as the effect's dep array because ServicesProvider's
 *  memoized services value changes identity any time a service hook's
 *  return value changes (e.g. settings.update fires → new settings object
 *  → new services identity). Re-running `loadContributions` on every such
 *  change creates an infinite loop when a contribution causes a state
 *  change inside its `register()` (e.g. ollama refreshes models and writes
 *  back via settings.update).
 *
 *  Instead we register once with a Proxy that reads through a ref. The ref
 *  always points at the current services, so contributions see live values
 *  through their captured `services` argument. */
export function Contributions() {
  const services = useAllServices()
  const ref = useRef(services)
  ref.current = services

  const stableServices = useMemo(
    () =>
      new Proxy({} as ICanvServices, {
        get(_target, key) {
          return ref.current[key as keyof ICanvServices]
        },
        has(_target, key) {
          return key in ref.current
        },
        ownKeys() {
          return Reflect.ownKeys(ref.current)
        },
        getOwnPropertyDescriptor(_target, key) {
          return Reflect.getOwnPropertyDescriptor(ref.current, key)
        },
      }),
    [],
  )

  useEffect(() => {
    const handle = loadContributions(stableServices)
    return () => handle.dispose()
  }, [stableServices])

  // Fire on every services identity change. Contributions that need to react
  // to state changes (dock-bridge, etc.) subscribe via subscribeServicesChange.
  // This intentionally runs on the mount tick too — the dock-bridge's initial
  // broadcast happens via this path, not inside register().
  useEffect(() => {
    notifyServicesChange()
  }, [services])

  return null
}
