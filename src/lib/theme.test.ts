import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveTheme, applyTheme } from './theme'
import { DEFAULT_THEME } from './themes'

describe('resolveTheme', () => {
  let originalMatchMedia: typeof window.matchMedia
  beforeEach(() => { originalMatchMedia = window.matchMedia })
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia })
    document.documentElement.removeAttribute('data-theme')
  })

  it('returns concrete theme ids unchanged', () => {
    expect(resolveTheme('canv-dark')).toBe('canv-dark')
    expect(resolveTheme('dracula')).toBe('dracula')
    expect(resolveTheme('solarized-light')).toBe('solarized-light')
  })

  it('resolves "system" via prefers-color-scheme: dark → canv-dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, value: (q: string) => ({ matches: true, media: q }),
    })
    expect(resolveTheme('system')).toBe('canv-dark')
  })

  it('resolves "system" via prefers-color-scheme: light → canv-light', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, value: (q: string) => ({ matches: false, media: q }),
    })
    expect(resolveTheme('system')).toBe('canv-light')
  })

  it('SSR fallback returns DEFAULT_THEME', () => {
    expect(typeof window).toBe('object')
    expect(DEFAULT_THEME).toBe('canv-dark')
  })
})

describe('applyTheme', () => {
  afterEach(() => { document.documentElement.removeAttribute('data-theme') })

  it('writes the resolved id to data-theme', () => {
    applyTheme('dracula')
    expect(document.documentElement.dataset.theme).toBe('dracula')
  })

  it('writes the system-resolved id (not "system") to data-theme', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, value: (q: string) => ({ matches: true, media: q }),
    })
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('canv-dark')
  })
})
