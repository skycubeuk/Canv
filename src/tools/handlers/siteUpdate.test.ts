import { describe, it, expect, beforeEach, vi } from 'vitest'
import { siteUpdateTool } from './siteUpdate'
import type { ToolCtx } from '../types'

const makeCtx = (): ToolCtx => ({
  fs: {} as never, activeDocPath: null,
  getEditorContent: () => null,
  applyEditorEdit: async () => {},
  signal: new AbortController().signal,
})

describe('site_update', () => {
  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = {
      canvSites: { update: vi.fn(async (_id: string, _patch: Record<string, unknown>) => ({ id: _id, ..._patch, updated: '2026-05-09T12:00:00Z' })) },
    } as unknown
  })

  it('forwards id and patch, returns updated entry', async () => {
    const out = await siteUpdateTool.handler({
      id: 'a3f2', patch: { description: 'new', source_files: ['x.md'] },
    } as never, makeCtx())
    expect(out).toMatchObject({ id: 'a3f2', description: 'new' })
  })

  it('rejects empty id', async () => {
    await expect(siteUpdateTool.handler({ id: '', patch: {} } as never, makeCtx()))
      .rejects.toThrow(/id/i)
  })

  it('is mutating', () => {
    expect(siteUpdateTool.mutating).toBe(true)
  })
})
