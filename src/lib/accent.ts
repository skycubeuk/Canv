import type { Theme } from '../hooks/useSettings'

export interface AccentSwatch {
  name: string
  hex: string
}

export const ACCENTS: readonly AccentSwatch[] = [
  { name: 'Indigo',  hex: '#6366f1' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber',   hex: '#f59e0b' },
  { name: 'Rose',    hex: '#f43f5e' },
  { name: 'Violet',  hex: '#a78bfa' },
  { name: 'Slate',   hex: '#e2e8f0' },
] as const

export const DEFAULT_ACCENT = ACCENTS[0].hex

export function applyAccent(hex: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--accent', hex)
}

export type ResolvedTheme = 'dark' | 'light'

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'dark' || theme === 'light') return theme
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}
