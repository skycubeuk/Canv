import { DisposableStore, toDisposable, type Disposable } from '../lib/lifecycle'
import type { ICanvServices } from '../services'

export interface Contribution {
  /** Stable identifier for logging/diagnostics. */
  name: string
  /** Called once when the app mounts. Returns a Disposable that will be
   *  called on unmount to tear down whatever the contribution did. */
  register(services: ICanvServices): Disposable
}

// Contributions register exactly once on mount (see Contributions.tsx).
// Contributions that need to react to state changes — e.g. dock-bridge
// re-broadcasting state to the popout — subscribe to this event. It fires
// every time ServicesProvider's memoized services value changes identity,
// which approximates "anything observable from a service changed".
const servicesChangeListeners = new Set<() => void>()

export function subscribeServicesChange(cb: () => void): Disposable {
  servicesChangeListeners.add(cb)
  return toDisposable(() => { servicesChangeListeners.delete(cb) })
}

export function notifyServicesChange(): void {
  for (const cb of servicesChangeListeners) {
    try { cb() } catch (e) { console.error('servicesChange listener threw', e) }
  }
}

// Contributions register themselves into this list via registerContribution().
// Tasks 5–12 populate this list as individual contribution files migrate in.
const registry: Contribution[] = []

export function registerContribution(c: Contribution): void {
  registry.push(c)
}

export function getContributions(): readonly Contribution[] {
  return registry
}

export function loadContributions(services: ICanvServices): Disposable {
  const store = new DisposableStore()
  for (const c of registry) {
    try {
      store.add(c.register(services))
    } catch (e) {
      console.error(`Contribution "${c.name}" failed to register:`, e)
    }
  }
  return store
}

export { Contributions } from './Contributions'
