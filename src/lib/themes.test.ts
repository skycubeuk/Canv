import { describe, it, expect } from 'vitest'
import { THEMES, DEFAULT_THEME, isThemeId } from './themes'

describe('THEMES catalogue', () => {
  it('lists 10 themes in declared order', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'canv-dark',
      'canv-light',
      'dracula',
      'synthwave-84',
      'solarized-dark',
      'solarized-light',
      'nord',
      'tokyo-night',
      'gruvbox',
      'dark-2026',
    ])
  })

  it('every theme has a name and kind', () => {
    for (const t of THEMES) {
      expect(t.name).toBeTruthy()
      expect(['dark', 'light']).toContain(t.kind)
    }
  })

  it('DEFAULT_THEME is canv-dark', () => {
    expect(DEFAULT_THEME).toBe('canv-dark')
  })
})

describe('isThemeId', () => {
  it('accepts every catalogue id and "system"', () => {
    expect(isThemeId('system')).toBe(true)
    for (const t of THEMES) expect(isThemeId(t.id)).toBe(true)
  })
  it('rejects unknown strings', () => {
    expect(isThemeId('dark')).toBe(false)
    expect(isThemeId('light')).toBe(false)
    expect(isThemeId('mystery')).toBe(false)
  })
})
