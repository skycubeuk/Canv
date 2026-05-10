import { describe, it, expect } from 'vitest'
import { lookupIcon, suggestIcon, ICON_NAMES } from './iconRegistry'

describe('iconRegistry', () => {
  it('resolves a known icon name to a component', () => {
    const cmp = lookupIcon('BookOpen')
    expect(cmp).toBeDefined()
    expect(typeof cmp).toBe('object') // forwardRef object
  })

  it('returns undefined for an unknown name', () => {
    expect(lookupIcon('NotARealIcon')).toBeUndefined()
  })

  it('rejects the *Icon-suffixed alias names', () => {
    // Lucide exports both `BookOpen` and `BookOpenIcon`; we only accept the short form.
    expect(lookupIcon('BookOpenIcon')).toBeUndefined()
  })

  it('exposes a non-empty ICON_NAMES set used for validation', () => {
    expect(ICON_NAMES.size).toBeGreaterThan(1000)
    expect(ICON_NAMES.has('BookOpen')).toBe(true)
    expect(ICON_NAMES.has('BookOpenIcon')).toBe(false)
  })

  it('suggests a close match for a typo', () => {
    expect(suggestIcon('BookOpe')).toBe('BookOpen')
    expect(suggestIcon('ChefHa')).toBe('ChefHat')
  })

  it('returns null when no close match exists', () => {
    expect(suggestIcon('xxxxxxxxxxxx')).toBeNull()
  })
})
