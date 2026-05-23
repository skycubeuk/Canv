import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { applyAccent, resolveTheme } from '../lib/accent'
import { registerContribution, type Contribution } from './index'

const TEMP_LEGACY_TO_NEW: Record<string, string> = {
  dark: 'canv-dark',
  light: 'canv-light',
}

/**
 * Applies the user's accent colour and theme to `<html>`, and listens for
 * system-theme changes while `theme === 'system'`. Replaces two effects that
 * lived in App.tsx pre-Phase-2.
 */
export const theme: Contribution = {
  name: 'theme',
  register(services) {
    const store = new DisposableStore()

    const apply = () => {
      const s = services.settings.settings
      applyAccent(s.accent)
      const resolved = resolveTheme(s.theme)
      // Temporary remap until Phase 2 replaces this whole file.
      document.documentElement.dataset.theme = TEMP_LEGACY_TO_NEW[resolved] ?? resolved
    }
    apply()

    // Re-apply whenever any settings field changes. Cheap and idempotent —
    // overshoots beyond accent/theme but avoids tracking individual fields.
    const unsubSettings = services.settings.subscribe(apply)
    store.add(toDisposable(unsubSettings))

    // System theme listener — only relevant while theme === 'system', but
    // wiring it unconditionally is harmless. apply() is idempotent and
    // resolveTheme returns the explicit choice when theme is light/dark.
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
