import { describe, it, expect, vi } from 'vitest'
import { applyEditsTool } from './applyEdits'
import type { ToolCtx } from '../types'
import type { AnchorEdit, ApplyEditsResult } from '../../services/workspaceEdits'

type ApplyFn = (edits: AnchorEdit[]) => Promise<ApplyEditsResult>

function makeCtx(apply: ApplyFn): ToolCtx {
  return {
    fs: {} as ToolCtx['fs'],
    activeDocPath: null,
    getEditorContent: () => null,
    applyEditorEdit: async () => {},
    workspace: { applyEdits: apply },
    signal: new AbortController().signal,
  }
}

describe('applyEditsTool', () => {
  it('routes edits through ctx.workspace.applyEdits and returns the IPC result on success', async () => {
    const apply = vi.fn<ApplyFn>().mockResolvedValue({ ok: true, applied: [{ path: 'a.md', mtimeMs: 2 }] })
    const out = await applyEditsTool.handler(
      { edits: [{ path: 'a.md', oldText: 'old', newText: 'new' }] },
      makeCtx(apply),
    )
    expect(apply).toHaveBeenCalledWith([{ path: 'a.md', oldText: 'old', newText: 'new' }])
    expect(out).toEqual({ applied: [{ path: 'a.md', mtimeMs: 2 }] })
  })

  it('surfaces a structured error message when applyEdits returns ok:false', async () => {
    const apply = vi.fn<ApplyFn>().mockResolvedValue({ ok: false, error: { reason: 'anchor-not-unique', path: 'a.md', matches: 3 } })
    await expect(applyEditsTool.handler(
      { edits: [{ path: 'a.md', oldText: 'foo', newText: 'bar' }] },
      makeCtx(apply),
    )).rejects.toThrow(/anchor-not-unique.*a\.md.*3/)
  })

  it('refuses an empty edits array', async () => {
    const apply = vi.fn<ApplyFn>()
    await expect(applyEditsTool.handler({ edits: [] }, makeCtx(apply))).rejects.toThrow(/at least one edit/i)
    expect(apply).not.toHaveBeenCalled()
  })
})
