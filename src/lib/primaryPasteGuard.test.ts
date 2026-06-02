import { describe, it, expect, afterEach } from 'vitest'
import { installPrimaryPasteGuard, markTabMiddleClose, __resetPrimaryPasteGuardForTest } from './primaryPasteGuard'

function dispatchPaste(): Event {
  const ev = new Event('paste', { cancelable: true, bubbles: true })
  document.body.dispatchEvent(ev)
  return ev
}

describe('primaryPasteGuard', () => {
  afterEach(() => __resetPrimaryPasteGuardForTest())

  it('swallows a paste that arrives right after a tab middle-close', () => {
    const uninstall = installPrimaryPasteGuard(window)
    markTabMiddleClose()
    const ev = dispatchPaste()
    expect(ev.defaultPrevented).toBe(true)
    uninstall()
  })

  it('leaves a normal paste untouched when no tab middle-close preceded it', () => {
    const uninstall = installPrimaryPasteGuard(window)
    const ev = dispatchPaste()
    expect(ev.defaultPrevented).toBe(false)
    uninstall()
  })

  it('only swallows the FIRST paste after a middle-close (consumes the flag)', () => {
    const uninstall = installPrimaryPasteGuard(window)
    markTabMiddleClose()
    expect(dispatchPaste().defaultPrevented).toBe(true)
    // a second paste in the same window must NOT be swallowed
    expect(dispatchPaste().defaultPrevented).toBe(false)
    uninstall()
  })

  it('does not swallow a paste once the suppression window has elapsed', () => {
    const uninstall = installPrimaryPasteGuard(window)
    // mark a middle-close far in the past
    markTabMiddleClose(performance.now() - 5000)
    expect(dispatchPaste().defaultPrevented).toBe(false)
    uninstall()
  })

  it('uninstall removes the listener', () => {
    const uninstall = installPrimaryPasteGuard(window)
    uninstall()
    markTabMiddleClose()
    expect(dispatchPaste().defaultPrevented).toBe(false)
  })
})
