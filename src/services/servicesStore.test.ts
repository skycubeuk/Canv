import { describe, it, expect, vi } from 'vitest'
import { createServicesStore } from './servicesStore'
import type { ICanvServices } from './index'

/** Build a partial services object as ICanvServices for store tests. The
 *  store only inspects keys for reference equality, never invokes any
 *  service method, so any shape that matches the type is fine. */
function svc(overrides: Partial<ICanvServices> = {}): ICanvServices {
  return overrides as ICanvServices
}

describe('createServicesStore', () => {
  it('exposes the initial snapshot via get()', () => {
    const initial = svc({ workspace: { tag: 'ws' } as unknown as ICanvServices['workspace'] })
    const store = createServicesStore(initial)
    expect(store.get()).toBe(initial)
  })

  it('notifies a key listener only when that key reference changes', () => {
    const wsA = { tag: 'wsA' } as unknown as ICanvServices['workspace']
    const wsB = { tag: 'wsB' } as unknown as ICanvServices['workspace']
    const statsA = { wordCount: 1 } as unknown as ICanvServices['editorStats']
    const statsB = { wordCount: 2 } as unknown as ICanvServices['editorStats']

    const store = createServicesStore(svc({ workspace: wsA, editorStats: statsA }))
    const wsListener = vi.fn()
    const statsListener = vi.fn()
    store.subscribeKey('workspace', wsListener)
    store.subscribeKey('editorStats', statsListener)

    // Stats changed, workspace did not: only statsListener fires.
    store.update(svc({ workspace: wsA, editorStats: statsB }))
    expect(wsListener).not.toHaveBeenCalled()
    expect(statsListener).toHaveBeenCalledTimes(1)

    // Workspace changed: only wsListener fires.
    store.update(svc({ workspace: wsB, editorStats: statsB }))
    expect(wsListener).toHaveBeenCalledTimes(1)
    expect(statsListener).toHaveBeenCalledTimes(1)
  })

  it('does NOT notify when the snapshot reference is identical', () => {
    const initial = svc({})
    const store = createServicesStore(initial)
    const listener = vi.fn()
    store.subscribeAny(listener)
    store.update(initial)
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies subscribeAny listeners on any update with a new reference', () => {
    const a = svc({})
    const b = svc({})
    const store = createServicesStore(a)
    const listener = vi.fn()
    store.subscribeAny(listener)
    store.update(b)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('returns an unsubscribe fn that stops further notifications', () => {
    const wsA = { tag: 'wsA' } as unknown as ICanvServices['workspace']
    const wsB = { tag: 'wsB' } as unknown as ICanvServices['workspace']
    const store = createServicesStore(svc({ workspace: wsA }))
    const listener = vi.fn()
    const unsub = store.subscribeKey('workspace', listener)
    store.update(svc({ workspace: wsB }))
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    store.update(svc({ workspace: wsA }))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('proves the perf fix: a one-key change does not wake other-key listeners', () => {
    // Simulates the selection-highlight regression: editorStats churns every
    // frame; workspace / ideLayout / chatSessions consumers must stay silent.
    const stableWs = { tag: 'ws' } as unknown as ICanvServices['workspace']
    const stableLayout = { tag: 'layout' } as unknown as ICanvServices['ideLayout']
    const store = createServicesStore(
      svc({
        workspace: stableWs,
        ideLayout: stableLayout,
        editorStats: { wordCount: 0 } as unknown as ICanvServices['editorStats'],
      }),
    )
    const wsListener = vi.fn()
    const layoutListener = vi.fn()
    store.subscribeKey('workspace', wsListener)
    store.subscribeKey('ideLayout', layoutListener)

    // 60 selection-driven editorStats updates in one drag.
    for (let i = 1; i <= 60; i++) {
      store.update(
        svc({
          workspace: stableWs,
          ideLayout: stableLayout,
          editorStats: { wordCount: i } as unknown as ICanvServices['editorStats'],
        }),
      )
    }

    expect(wsListener).not.toHaveBeenCalled()
    expect(layoutListener).not.toHaveBeenCalled()
  })
})
