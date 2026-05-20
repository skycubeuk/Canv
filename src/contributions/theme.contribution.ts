import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { applyAccent, applyTheme, resolveTheme } from '../lib/accent'
import { registerContribution, type Contribution } from './index'

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
      applyTheme(resolveTheme(s.theme))
    }
    apply()

    // Re-apply whenever any settings field changes. Cheap and idempotent —
    // overshoots beyond accent/theme but avoids tracking individual fields.
    const unsubSettings = services.settings.subscribe(apply)
    store.add(toDisposable(unsubSettings))

    // System theme listener — only relevant while theme === 'system', but
    // wiring it unconditionally is harmless (applyTheme is idempotent and
    // resolveTheme returns the explicit choice when theme is light/dark).
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
