import { describe, it, expect, beforeEach } from 'vitest'
import { ACCENTS, DEFAULT_ACCENT, applyAccent, applyTheme, resolveTheme } from './accent'

describe('accent palette', () => {
  it('exposes 6 swatches in declared order', () => {
    expect(ACCENTS.map((a) => a.name)).toEqual([
      'Indigo', 'Emerald', 'Amber', 'Rose', 'Violet', 'Slate',
    ])
  })

  it('default is Indigo #6366f1', () => {
    expect(DEFAULT_ACCENT).toBe('#6366f1')
    expect(ACCENTS[0]).toEqual({ name: 'Indigo', hex: '#6366f1' })
  })
})

describe('applyAccent', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('writes --accent to the documentElement', () => {
    applyAccent('#10b981')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#10b981')
  })
})

describe('resolveTheme + applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('resolves "dark" to "dark"', () => {
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('resolves "light" to "light"', () => {
    expect(resolveTheme('light')).toBe('light')
  })

  it('applyTheme sets the data-theme attribute', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
