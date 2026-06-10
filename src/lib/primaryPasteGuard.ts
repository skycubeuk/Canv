// Suppresses the spurious X11 PRIMARY-selection paste that Chromium fires when
// a tab is closed with a middle-click on Linux.
//
// Root cause (verified in the real Electron app): middle-clicking a tab to
// close it makes Chromium issue a `PasteGlobalSelection` for the X11 PRIMARY
// buffer. The newly-focused editor wins the focus race and the last-*selected*
// text lands in it. preventDefault on the tab's mousedown/auxclick does NOT
// cancel this — only cancelling the `paste` event itself does.
//
// Strategy: the tab strip calls markTabMiddleClose() on any middle-click. A
// single capture-phase `paste` listener swallows the one paste that follows
// within a short window. Normal Ctrl+V and intentional middle-click paste
// *inside the editor* never set the flag, so they're untouched.

const SUPPRESS_WINDOW_MS = 300

let lastTabMiddleClose = Number.NEGATIVE_INFINITY

/** Record that a middle-click just landed on the tab strip. */
export function markTabMiddleClose(now: number = performance.now()): void {
  lastTabMiddleClose = now
}

/** Whether a paste arriving `now` should be treated as the spurious one. */
function shouldSuppress(now: number): boolean {
  return now - lastTabMiddleClose < SUPPRESS_WINDOW_MS
}

/**
 * Install the capture-phase guard. Returns an uninstall function.
 * Idempotent per target is not guaranteed — install once at app root.
 */
export function installPrimaryPasteGuard(target: Window | Document = window): () => void {
  const onPaste = (e: Event) => {
    if (shouldSuppress(performance.now())) {
      e.preventDefault()
      e.stopImmediatePropagation()
      lastTabMiddleClose = Number.NEGATIVE_INFINITY // consume: only the next paste
    }
  }
  target.addEventListener('paste', onPaste, true)
  return () => target.removeEventListener('paste', onPaste, true)
}

/** Test-only: reset module state between cases. */
export function __resetPrimaryPasteGuardForTest(): void {
  lastTabMiddleClose = Number.NEGATIVE_INFINITY
}
