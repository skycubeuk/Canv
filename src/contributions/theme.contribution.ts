import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { applyTheme } from '../lib/theme'
import { type ThemeId } from '../lib/themes'
import { registerContribution, type Contribution } from './index'

// Theme CSS vars are stored as space-separated RGB triples (e.g. "10 11 13").
// Convert to "#rrggbb" for setTitleBarOverlay, which wants a CSS colour string.
function rgbTripleToHex(triple: string): string | null {
  const parts = triple.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return null
  }
  return '#' + parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
}

function syncTitleBarOverlay(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (!window.canvWindow) return
  const cs = getComputedStyle(document.documentElement)
  // Match the topbar (`bg-panel`) so the OS-drawn controls sit on the same
  // surface as the custom title-bar chrome — not the app background.
  const color = rgbTripleToHex(cs.getPropertyValue('--bg-panel'))
  const symbolColor = rgbTripleToHex(cs.getPropertyValue('--text-default'))
  if (!color || !symbolColor) return
  window.canvWindow.setTitleBarOverlay({ color, symbolColor }).catch(() => {})
}

export const theme: Contribution = {
  name: 'theme',
  register(services) {
    const store = new DisposableStore()

    const apply = () => {
      applyTheme(services.settings.settings.theme as ThemeId)
      syncTitleBarOverlay()
    }
    apply()

    const unsubSettings = services.settings.subscribe(apply)
    store.add(toDisposable(unsubSettings))

    // prefers-color-scheme: only matters when theme === 'system', but always
    // wiring is harmless — applyTheme is idempotent.
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystem = () => {
      if (services.settings.settings.theme === 'system') apply()
    }
    mql.addEventListener('change', onSystem)
    store.add(toDisposable(() => mql.removeEventListener('change', onSystem)))

    return store
  },
}

registerContribution(theme)
