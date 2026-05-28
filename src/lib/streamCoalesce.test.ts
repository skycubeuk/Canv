import { describe, it, expect, vi } from 'vitest'
import { makeStreamBuffer } from './streamCoalesce'

/** Manual scheduler so tests can fire frames deterministically. */
function makeManualScheduler() {
  const queue: Array<() => void> = []
  let nextHandle = 1
  const handles = new Map<number, () => void>()
  const schedule = (fn: () => void) => {
    const h = nextHandle++
    handles.set(h, fn)
    queue.push(() => {
      if (handles.has(h)) {
        handles.delete(h)
        fn()
      }
    })
    return h
  }
  const cancel = (h: number) => { handles.delete(h) }
  const frame = () => {
    const todo = queue.splice(0)
    for (const fn of todo) fn()
  }
  return { schedule, cancel, frame }
}

describe('makeStreamBuffer', () => {
  it('coalesces many pushes within a frame into a single commit', () => {
    const { schedule, cancel, frame } = makeManualScheduler()
    const commit = vi.fn()
    const buf = makeStreamBuffer(commit, schedule, cancel)
    for (let i = 0; i < 200; i++) buf.push(`x${i} `)
    expect(commit).not.toHaveBeenCalled()
    frame()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0]).toContain('x0 ')
    expect(commit.mock.calls[0][0]).toContain('x199 ')
  })

  it('commits one batch per frame across multiple frames', () => {
    const { schedule, cancel, frame } = makeManualScheduler()
    const commit = vi.fn()
    const buf = makeStreamBuffer(commit, schedule, cancel)

    buf.push('a')
    buf.push('b')
    frame()
    buf.push('c')
    buf.push('d')
    frame()

    expect(commit).toHaveBeenCalledTimes(2)
    expect(commit.mock.calls[0][0]).toBe('ab')
    expect(commit.mock.calls[1][0]).toBe('cd')
  })

  it('skips the commit when no chunks were pushed in a frame', () => {
    const { schedule, cancel, frame } = makeManualScheduler()
    const commit = vi.fn()
    void makeStreamBuffer(commit, schedule, cancel)
    frame()
    expect(commit).not.toHaveBeenCalled()
  })

  it('ignores empty-string pushes (no frame scheduled)', () => {
    const { schedule, cancel, frame } = makeManualScheduler()
    const scheduleSpy = vi.fn(schedule)
    const commit = vi.fn()
    const buf = makeStreamBuffer(commit, scheduleSpy, cancel)
    buf.push('')
    buf.push('') // second empty push: still no schedule, still no commit
    expect(scheduleSpy).not.toHaveBeenCalled()
    frame()
    expect(commit).not.toHaveBeenCalled()
  })

  it('flush() commits pending chunks immediately and cancels the scheduled frame', () => {
    const { schedule, cancel, frame } = makeManualScheduler()
    const cancelSpy = vi.fn(cancel)
    const commit = vi.fn()
    const buf = makeStreamBuffer(commit, schedule, cancelSpy)

    buf.push('hello')
    buf.flush()

    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0]).toBe('hello')
    expect(cancelSpy).toHaveBeenCalledTimes(1)

    // The previously-scheduled frame should now no-op.
    frame()
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('flush() with nothing pending is a no-op', () => {
    const { schedule, cancel } = makeManualScheduler()
    const commit = vi.fn()
    const buf = makeStreamBuffer(commit, schedule, cancel)
    buf.flush()
    expect(commit).not.toHaveBeenCalled()
  })

  it('cancel() drops pending chunks without committing', () => {
    const { schedule, cancel, frame } = makeManualScheduler()
    const commit = vi.fn()
    const buf = makeStreamBuffer(commit, schedule, cancel)
    buf.push('discarded')
    buf.cancel()
    frame()
    expect(commit).not.toHaveBeenCalled()
  })
})
