/**
 * Pure decision helper for applying an agent run's rewrite to the editor.
 *
 * Lives outside React/CodeMirror so the duplicate-prepend regression that
 * motivated it has a deterministic, dependency-free unit test.
 *
 * Background: the previous staleness guard sliced the doc only at the run's
 * ORIGINAL `[from, to]`. After a successful apply, the doc has grown past
 * `to` (when `replacement` is longer than `sourceText`). On a second click,
 * `slice(from, to)` returned the leading `len(sourceText)` chars of the
 * already-applied replacement, which equals `sourceText` whenever the
 * replacement starts with the source — so the guard passed and Apply ran
 * again, prepending another delta. Multiple silent clicks produced the
 * 4×-paragraph artefact seen in the wild.
 */
export interface RunForApply {
  range: { from: number; to: number } | null
  sourceText: string
  applied?: boolean
}

export type ApplyDecision =
  | { kind: 'replace-doc' }
  | { kind: 'apply'; from: number; to: number }
  | { kind: 'already-applied' }
  | { kind: 'stale' }

export function decideApply(
  docText: string,
  run: RunForApply,
  replacement: string,
): ApplyDecision {
  if (!run.range) return { kind: 'replace-doc' }

  if (run.applied) return { kind: 'already-applied' }

  const docLen = docText.length
  const { from, to } = run.range
  const safeFrom = Math.max(0, Math.min(from, docLen))
  const safeTo = Math.max(safeFrom, Math.min(to, docLen))

  // Defense in depth: even when the `applied` flag is missing (older runs,
  // pop-out / main race, future code paths that forget to set it), detect
  // post-apply state by checking whether `replacement` is already sitting at
  // the run anchor verbatim. This is the check that closes the original
  // duplicate-prepend bug.
  if (replacement.length > 0) {
    const replEnd = Math.min(safeFrom + replacement.length, docLen)
    if (docText.slice(safeFrom, replEnd) === replacement) {
      return { kind: 'already-applied' }
    }
  }

  const currentMd = docText.slice(safeFrom, safeTo).trim()
  const originalMd = run.sourceText.trim()
  if (originalMd && currentMd !== originalMd) return { kind: 'stale' }

  return { kind: 'apply', from: safeFrom, to: safeTo }
}
