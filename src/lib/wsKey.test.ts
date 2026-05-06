import { describe, it, expect } from 'vitest'
import { wsKey } from './wsKey'

describe('wsKey', () => {
  it('returns a deterministic key for the same root + suffix', () => {
    const a = wsKey('/home/me/Notes', 'tabs')
    const b = wsKey('/home/me/Notes', 'tabs')
    expect(a).toBe(b)
  })

  it('produces different keys for different roots', () => {
    const a = wsKey('/home/me/A', 'tabs')
    const b = wsKey('/home/me/B', 'tabs')
    expect(a).not.toBe(b)
  })

  it('produces different keys for different suffixes', () => {
    const a = wsKey('/home/me/A', 'tabs')
    const b = wsKey('/home/me/A', 'pinned')
    expect(a).not.toBe(b)
  })

  it('uses the canv:ws prefix', () => {
    expect(wsKey('/x', 'y')).toMatch(/^canv:ws:/)
  })
})
