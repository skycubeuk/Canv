import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toDisposable } from '../lib/lifecycle'
import type { ICanvServices } from '../services'

async function freshContributionsModule() {
  vi.resetModules()
  return await import('./index')
}

describe('loadContributions', () => {
  let mod: Awaited<ReturnType<typeof freshContributionsModule>>

  beforeEach(async () => {
    mod = await freshContributionsModule()
  })

  it('calls register() for each registered contribution', () => {
    const a = { name: 'a', register: vi.fn(() => toDisposable(() => {})) }
    const b = { name: 'b', register: vi.fn(() => toDisposable(() => {})) }
    mod.registerContribution(a)
    mod.registerContribution(b)

    const services = {} as ICanvServices
    mod.loadContributions(services)

    expect(a.register).toHaveBeenCalledWith(services)
    expect(b.register).toHaveBeenCalledWith(services)
  })

  it('disposes every contribution when the returned handle is disposed', () => {
    const disposeA = vi.fn()
    const disposeB = vi.fn()
    mod.registerContribution({ name: 'a', register: () => toDisposable(disposeA) })
    mod.registerContribution({ name: 'b', register: () => toDisposable(disposeB) })

    const handle = mod.loadContributions({} as ICanvServices)
    handle.dispose()

    expect(disposeA).toHaveBeenCalledTimes(1)
    expect(disposeB).toHaveBeenCalledTimes(1)
  })

  it('isolates one contributions register() failure from the others', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const goodDispose = vi.fn()
    mod.registerContribution({
      name: 'bad',
      register: () => { throw new Error('register threw') },
    })
    mod.registerContribution({
      name: 'good',
      register: () => toDisposable(goodDispose),
    })

    const handle = mod.loadContributions({} as ICanvServices)
    handle.dispose()

    expect(goodDispose).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      'Contribution "bad" failed to register:',
      expect.any(Error),
    )
    consoleError.mockRestore()
  })
})
