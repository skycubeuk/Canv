import { describe, it, expect, vi } from 'vitest'
import { DisposableStore, toDisposable, type Disposable } from './lifecycle'

describe('toDisposable', () => {
  it('wraps a function into a Disposable that calls it once', () => {
    const fn = vi.fn()
    const d = toDisposable(fn)
    d.dispose()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls the wrapped function each time dispose() is called (caller-managed idempotency)', () => {
    const fn = vi.fn()
    const d = toDisposable(fn)
    d.dispose()
    d.dispose()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('DisposableStore', () => {
  it('disposes registered children in registration order', () => {
    const order: number[] = []
    const store = new DisposableStore()
    store.add(toDisposable(() => order.push(1)))
    store.add(toDisposable(() => order.push(2)))
    store.add(toDisposable(() => order.push(3)))
    store.dispose()
    expect(order).toEqual([1, 2, 3])
  })

  it('is idempotent on repeated dispose()', () => {
    const fn = vi.fn()
    const store = new DisposableStore()
    store.add(toDisposable(fn))
    store.dispose()
    store.dispose()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not strand subsequent disposers if one throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const calledAfter = vi.fn()
    const store = new DisposableStore()
    store.add(toDisposable(() => { throw new Error('first disposer threw') }))
    store.add(toDisposable(calledAfter))
    store.dispose()
    expect(calledAfter).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      'DisposableStore: disposer threw',
      expect.any(Error),
    )
    consoleError.mockRestore()
  })

  it('throws and immediately disposes the entry on add() after dispose()', () => {
    const store = new DisposableStore()
    store.dispose()
    const lateFn = vi.fn()
    expect(() => store.add(toDisposable(lateFn))).toThrowError(/after dispose/)
    expect(lateFn).toHaveBeenCalledTimes(1)
  })

  it('add() returns the disposable it was given', () => {
    const store = new DisposableStore()
    const d: Disposable = toDisposable(() => {})
    expect(store.add(d)).toBe(d)
    store.dispose()
  })

  it('reports size and disposed status', () => {
    const store = new DisposableStore()
    expect(store.size).toBe(0)
    expect(store.isDisposed).toBe(false)
    store.add(toDisposable(() => {}))
    store.add(toDisposable(() => {}))
    expect(store.size).toBe(2)
    store.dispose()
    expect(store.isDisposed).toBe(true)
    expect(store.size).toBe(0)
  })
})
