import { describe, it, expect, vi } from 'vitest'
import { withAiEditSnapshot } from './withAiEditSnapshot'

function makeDeps() {
  const calls: string[] = []
  const client = {
    createSnapshot: vi.fn(async (o: { reason: string }) => {
      calls.push(o.reason)
      return { id: o.reason }
    }),
    patchSnapshotFiles: vi.fn(async () => {}),
  }
  return { calls, client }
}

describe('withAiEditSnapshot', () => {
  it('brackets the mutation with before and after snapshots', async () => {
    const { calls, client } = makeDeps()
    const order: string[] = []
    await withAiEditSnapshot(
      {
        rel: 'a.md',
        client: client as never,
        flush: async () => { order.push('flush') },
        afterFlush: async () => { order.push('afterFlush') },
        meta: { source: 'x' },
        summary: 'test',
      },
      async () => { order.push('mutate') },
    )
    expect(calls).toEqual(['before_ai_edit', 'after_ai_edit'])
    expect(order).toEqual(['flush', 'mutate', 'afterFlush'])
    expect(client.patchSnapshotFiles).toHaveBeenCalledOnce()
  })

  it('runs the mutation directly when there is no client', async () => {
    let ran = false
    await withAiEditSnapshot(
      { rel: 'a.md', client: null, flush: async () => {}, afterFlush: async () => {}, meta: {}, summary: '' },
      async () => { ran = true },
    )
    expect(ran).toBe(true)
  })
})
