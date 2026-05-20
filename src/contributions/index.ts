import { DisposableStore, type Disposable } from '../lib/lifecycle'
import type { ICanvServices } from '../services'

export interface Contribution {
  /** Stable identifier for logging/diagnostics. */
  name: string
  /** Called once when the app mounts. Returns a Disposable that will be
   *  called on unmount to tear down whatever the contribution did. */
  register(services: ICanvServices): Disposable
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
