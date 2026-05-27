import { describe, it, expect } from 'vitest'
import { placeToolbarTop } from './floatingToolbarPlacement'

// A two-row toolbar is ~80px tall; GAP and MARGIN are 8. The selected line sits at
// selTop..selBottom in viewport coords.
describe('placeToolbarTop', () => {
  it('places the toolbar fully above the selection, clearing its measured height', () => {
    // Regression for the old `selTop - 48` math: a tall toolbar must not overlap the text.
    const top = placeToolbarTop({ selTop: 400, selBottom: 420, toolbarHeight: 80, viewportHeight: 900 })
    expect(top).toBe(400 - 8 - 80) // selTop - GAP - height
    expect(top + 80).toBeLessThanOrEqual(400) // bottom of toolbar is at/above the selection top
  })

  it('flips below the selection when there is no room above', () => {
    // Selection near the top of the viewport — above would be off-screen.
    const top = placeToolbarTop({ selTop: 20, selBottom: 40, toolbarHeight: 80, viewportHeight: 900 })
    expect(top).toBe(40 + 8) // selBottom + GAP
  })

  it('clamps into the viewport when neither above nor below fits', () => {
    const top = placeToolbarTop({ selTop: 10, selBottom: 30, toolbarHeight: 80, viewportHeight: 100 })
    expect(top).toBeGreaterThanOrEqual(8) // never above the top margin
    expect(top + 80).toBeLessThanOrEqual(100) // never past the bottom margin
  })
})
