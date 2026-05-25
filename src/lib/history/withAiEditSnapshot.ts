/** Minimal slice of the canv-history client used here. */
export interface AiEditHistoryClient {
  createSnapshot(opts: {
    reason: string
    summary: string
    files: string[]
    metadata: Record<string, unknown>
  }): Promise<{ id: string }>
  patchSnapshotFiles(id: string, files: string[]): Promise<void>
}

export interface AiEditSnapshotDeps {
  /** Active markdown rel path, or null when none. */
  rel: string | null
  /** History client, or null when RA is disabled / unavailable. */
  client: AiEditHistoryClient | null
  /** Persist pending edits before the before-snapshot. */
  flush: () => Promise<void>
  /** Persist the doc again after the mutation, before the after-snapshot. */
  afterFlush: () => Promise<void>
  meta: Record<string, unknown>
  summary: string
}

/**
 * Bracket `mutate` with `before_ai_edit` / `after_ai_edit` snapshots on
 * canv-history. When there is no client or no active file, just runs `mutate`.
 * Snapshot failures are swallowed (logged) so they never block the edit.
 */
export async function withAiEditSnapshot(deps: AiEditSnapshotDeps, mutate: () => Promise<void>): Promise<void> {
  const { rel, client } = deps
  if (!client || !rel) {
    await mutate()
    return
  }

  try { await deps.flush() } catch (e) { console.warn('[ai-edit] flush failed', e) }

  let beforeId: string | null = null
  try {
    const e = await client.createSnapshot({
      reason: 'before_ai_edit',
      summary: `Before · ${deps.summary}`,
      files: [rel],
      metadata: deps.meta,
    })
    beforeId = e.id
  } catch (e) {
    console.warn('[ai-edit] before snapshot failed', e)
  }

  await mutate()

  try { await deps.afterFlush() } catch (e) { console.warn('[ai-edit] after flush failed', e) }

  if (beforeId) {
    try {
      await client.createSnapshot({
        reason: 'after_ai_edit',
        summary: `After · ${deps.summary}`,
        files: [rel],
        metadata: deps.meta,
      })
      await client.patchSnapshotFiles(beforeId, [rel])
    } catch (e) {
      console.warn('[ai-edit] after snapshot failed', e)
    }
  }
}
