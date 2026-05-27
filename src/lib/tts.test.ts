import { describe, it, expect, afterEach } from 'vitest'
import { isTtsAvailable, getTts } from './tts'

afterEach(() => { delete (window as unknown as { canvTTS?: unknown }).canvTTS })

describe('tts bridge', () => {
  it('reports availability based on window.canvTTS', () => {
    expect(isTtsAvailable()).toBe(false)
    ;(window as unknown as { canvTTS?: unknown }).canvTTS = {}
    expect(isTtsAvailable()).toBe(true)
  })

  it('getTts throws when unavailable', () => {
    expect(() => getTts()).toThrow()
  })
})
