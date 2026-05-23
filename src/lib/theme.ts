import { DEFAULT_THEME, type ThemeId } from './themes'

export type { ThemeId }

/** Resolves 'system' to the matching concrete theme id; passes others through.
 *  SSR / no-window fallback is DEFAULT_THEME (canv-dark). */
export function resolveTheme(id: ThemeId): Exclude<ThemeId, 'system'> {
  if (id === 'system') {
    if (typeof window === 'undefined') return DEFAULT_THEME
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'canv-dark'
      : 'canv-light'
  }
  return id
}

/** Writes the resolved theme id to <html>'s data-theme attribute. */
export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolveTheme(id)
}
