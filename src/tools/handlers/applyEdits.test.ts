import { describe, it, expect, vi } from 'vitest'
import { applyEditsTool, formatApplyEditsError } from './applyEdits'
import type { ToolCtx } from '../types'
import type { AnchorEdit, ApplyEditsErrorPayload, ApplyEditsResult } from '../../services/workspaceEdits'

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

  it('throws a human-readable error message when applyEdits returns ok:false', async () => {
    const apply = vi.fn<ApplyFn>().mockResolvedValue({ ok: false, error: { reason: 'anchor-not-unique', path: 'a.md', matches: 3 } })
    await expect(applyEditsTool.handler(
      { edits: [{ path: 'a.md', oldText: 'foo', newText: 'bar' }] },
      makeCtx(apply),
    )).rejects.toThrow(/Could not edit "a\.md".*appears 3 times.*ambiguous.*surrounding context/)
  })

  it('refuses an empty edits array', async () => {
    const apply = vi.fn<ApplyFn>()
    await expect(applyEditsTool.handler({ edits: [] }, makeCtx(apply))).rejects.toThrow(/at least one edit/i)
    expect(apply).not.toHaveBeenCalled()
  })
})

describe('formatApplyEditsError', () => {
  const cases: Array<{ name: string; payload: ApplyEditsErrorPayload; expectPattern: RegExp }> = [
    {
      name: 'anchor-not-unique mentions match count and asks for more context',
      payload: { reason: 'anchor-not-unique', path: 'docs/x.md', matches: 6 },
      expectPattern: /appears 6 times.*ambiguous.*surrounding context/,
    },
    {
      name: 'anchor-not-found asks for a re-read',
      payload: { reason: 'anchor-not-found', path: 'docs/x.md' },
      expectPattern: /not found.*Re-read/i,
    },
    {
      name: 'stale-mtime asks for a re-read',
      payload: { reason: 'stale-mtime', path: 'docs/x.md' },
      expectPattern: /changed on disk.*Re-read/i,
    },
    {
      name: 'file-dirty asks the user to save first',
      payload: { reason: 'file-dirty', path: 'docs/x.md' },
      expectPattern: /unsaved changes.*save first/i,
    },
    {
      name: 'file-not-found is plain English',
      payload: { reason: 'file-not-found', path: 'missing.md' },
      expectPattern: /does not exist/i,
    },
    {
      name: 'write-failed mentions no files changed',
      payload: { reason: 'write-failed', path: 'a.md', detail: 'EACCES' },
      expectPattern: /write failed.*EACCES.*No files were changed/,
    },
    {
      name: 'write-failed with partial rollback surfaces the half-state',
      payload: { reason: 'write-failed', path: 'b.md', detail: 'EACCES', rollbackFailed: ['a.md'] },
      expectPattern: /rollback of a\.md also failed.*half-written/,
    },
    {
      name: 'unsupported-remote points at the workaround',
      payload: { reason: 'unsupported-remote', path: 'a.md' },
      expectPattern: /remote.*SSH.*open this workspace locally/,
    },
    {
      name: 'path-outside-workspace is plain English',
      payload: { reason: 'path-outside-workspace', path: '../escape.md' },
      expectPattern: /outside the workspace/,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const msg = formatApplyEditsError(c.payload)
      expect(msg).toMatch(c.expectPattern)
    })
  }
})
