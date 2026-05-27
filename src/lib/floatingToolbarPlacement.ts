/** Spacing for the floating selection toolbar, shared by the placement math and its tests. */
export const GAP = 8
export const MARGIN = 8

/** Pure vertical placement: prefer just above the selection; flip below if there's no
 * room above, then clamp into the viewport. Anchors by the toolbar's measured height so
 * a tall (multi-row) toolbar never overlaps the selected text. */
export function placeToolbarTop(opts: {
  selTop: number
  selBottom: number
  toolbarHeight: number
  viewportHeight: number
}): number {
  const { selTop, selBottom, toolbarHeight, viewportHeight } = opts
  const above = selTop - GAP - toolbarHeight
  if (above >= MARGIN) return above
  const below = selBottom + GAP
  if (below + toolbarHeight <= viewportHeight - MARGIN) return below
  return Math.max(MARGIN, Math.min(above, viewportHeight - MARGIN - toolbarHeight))
}
