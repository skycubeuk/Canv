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

function hexToTriplet(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex  // pass-through if it's already a triplet or unrecognised
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `${r} ${g} ${b}`
}

export function applyAccent(hex: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--accent', hexToTriplet(hex))
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
