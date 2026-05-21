import { describe, it, expect, beforeEach, vi } from 'vitest'
import { siteRegisterTool } from './siteRegister'
import type { ToolCtx } from '../types'

const makeCtx = (): ToolCtx => ({
  fs: {} as never,
  activeDocPath: null,
  getEditorContent: () => null,
  applyEditorEdit: async () => {},
  workspace: { applyEdits: async () => ({ ok: false, error: { reason: 'write-failed', path: '?', detail: 'no test stub' } }) },
  signal: new AbortController().signal,
})

describe('site_register', () => {
  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = {
      canvSites: {
        register: vi.fn(async (_input: unknown) => ({
          entry: { id: 'timeline-a3f2', name: 'X', folder: '.canv/sites/x', entry: 'index.html' },
          url: 'http://127.0.0.1:1234/site/timeline-a3f2/',
        })),
      },
    } as unknown
  })

  it('forwards the input and returns id + url', async () => {
    const out = await siteRegisterTool.handler({
      name: 'X', folder: '.canv/sites/x', entry: 'index.html',
      prompt: 'do thing', source_files: ['a.md'],
    } as never, makeCtx())
    expect(out).toEqual({ id: 'timeline-a3f2', url: expect.stringMatching(/^http:/) })
  })

  it('propagates errors from main', async () => {
    ;(globalThis as unknown as { window?: { canvSites: { register: () => Promise<unknown> } } }).window!.canvSites.register =
      vi.fn(async () => { throw new Error('boom') })
    await expect(siteRegisterTool.handler({
      name: 'X', folder: '.canv/sites/x', entry: 'index.html',
      prompt: 'p', source_files: [],
    } as never, makeCtx())).rejects.toThrow(/boom/)
  })

  it('is mutating', () => {
    expect(siteRegisterTool.mutating).toBe(true)
  })
})
