import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ICanvServices } from '../services'

type EngineMismatchPayload = { id: string; message: string }

interface CanvExtensionsWindowApi {
  onEngineMismatch?: (cb: (p: EngineMismatchPayload) => void) => () => void
}

describe('extension-engine-mismatch contribution', () => {
  let listener: ((p: EngineMismatchPayload) => void) | null = null
  let off: () => void
  let offCalls: number
  let originalCanvExtensions: unknown

  beforeEach(() => {
    listener = null
    offCalls = 0
    off = () => { offCalls++ }
    originalCanvExtensions = (window as unknown as { canvExtensions?: CanvExtensionsWindowApi }).canvExtensions
    ;(window as unknown as { canvExtensions: CanvExtensionsWindowApi }).canvExtensions = {
      onEngineMismatch: (cb) => {
        listener = cb
        return off
      },
    }
  })

  afterEach(() => {
    if (originalCanvExtensions === undefined) {
      delete (window as unknown as { canvExtensions?: unknown }).canvExtensions
    } else {
      ;(window as unknown as { canvExtensions: unknown }).canvExtensions = originalCanvExtensions
    }
  })

  it('subscribes on register and surfaces engineMismatch payload as a toast', async () => {
    const { extensionEngineMismatch } = await import('./extension-engine-mismatch.contribution')
    const showToast = vi.fn()
    const services = { notifications: { showToast } } as unknown as ICanvServices

    const disposable = extensionEngineMismatch.register(services)
    expect(listener).not.toBeNull()

    listener?.({ id: 'foo', message: 'engines.canv "^99.0.0" not compatible with host API 1.0.0' })

    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][0]).toContain('foo')
    expect(showToast.mock.calls[0][0]).toContain('not compatible')

    disposable.dispose()
    expect(offCalls).toBe(1)
  })

  it('is a no-op when the preload API is unavailable', async () => {
    delete (window as unknown as { canvExtensions?: unknown }).canvExtensions
    const { extensionEngineMismatch } = await import('./extension-engine-mismatch.contribution')
    const showToast = vi.fn()
    const services = { notifications: { showToast } } as unknown as ICanvServices

    const disposable = extensionEngineMismatch.register(services)
    expect(() => disposable.dispose()).not.toThrow()
    expect(showToast).not.toHaveBeenCalled()
  })
})
