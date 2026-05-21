import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyEdits, type AnchorEdit } from './workspaceEdits'

interface MockBridge {
  readFile: ReturnType<typeof vi.fn>
  applyEdits: ReturnType<typeof vi.fn>
}

function setBridge(): MockBridge {
  const bridge: MockBridge = {
    readFile: vi.fn(),
    applyEdits: vi.fn(),
  }
  ;(globalThis as unknown as { canvFS: MockBridge }).canvFS = bridge
  return bridge
}

beforeEach(() => {
  setBridge()
})

describe('applyEdits (renderer client)', () => {
  it('replaces a unique anchor and forwards a single fileWrite to the IPC', async () => {
    const bridge = (globalThis as unknown as { canvFS: MockBridge }).canvFS
    bridge.readFile.mockResolvedValue({ ok: true, content: 'hello world', mtimeMs: 1, eol: 'lf', bom: false })
    bridge.applyEdits.mockResolvedValue({ ok: true, applied: [{ path: 'a.md', mtimeMs: 2 }] })
    const edits: AnchorEdit[] = [{ path: 'a.md', oldText: 'world', newText: 'planet' }]
    const r = await applyEdits(edits, { isDirty: () => false })
    expect(r.ok).toBe(true)
    expect(bridge.applyEdits).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'a.md', newContent: 'hello planet', opts: { eol: 'lf', bom: false } }),
    ])
  })

  it('refuses on anchor-not-found before any IPC call', async () => {
    const bridge = (globalThis as unknown as { canvFS: MockBridge }).canvFS
    bridge.readFile.mockResolvedValue({ ok: true, content: 'hello world', mtimeMs: 1, eol: 'lf', bom: false })
    const edits: AnchorEdit[] = [{ path: 'a.md', oldText: 'missing', newText: 'x' }]
    const r = await applyEdits(edits, { isDirty: () => false })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.reason).toBe('anchor-not-found')
    expect(bridge.applyEdits).not.toHaveBeenCalled()
  })

  it('refuses on anchor-not-unique with the match count', async () => {
    const bridge = (globalThis as unknown as { canvFS: MockBridge }).canvFS
    bridge.readFile.mockResolvedValue({ ok: true, content: 'foo foo foo', mtimeMs: 1, eol: 'lf', bom: false })
    const edits: AnchorEdit[] = [{ path: 'a.md', oldText: 'foo', newText: 'bar' }]
    const r = await applyEdits(edits, { isDirty: () => false })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.reason).toBe('anchor-not-unique')
    expect(r.error.matches).toBe(3)
  })

  it('refuses on dirty file before any IPC call', async () => {
    const bridge = (globalThis as unknown as { canvFS: MockBridge }).canvFS
    bridge.readFile.mockResolvedValue({ ok: true, content: 'hello', mtimeMs: 1, eol: 'lf', bom: false })
    const edits: AnchorEdit[] = [{ path: 'a.md', oldText: 'hello', newText: 'hi' }]
    const r = await applyEdits(edits, { isDirty: (p) => p === 'a.md' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.reason).toBe('file-dirty')
    expect(bridge.applyEdits).not.toHaveBeenCalled()
  })

  it('applies multiple edits to the same file in declaration order', async () => {
    const bridge = (globalThis as unknown as { canvFS: MockBridge }).canvFS
    bridge.readFile.mockResolvedValue({ ok: true, content: 'A B C D', mtimeMs: 1, eol: 'lf', bom: false })
    bridge.applyEdits.mockResolvedValue({ ok: true, applied: [{ path: 'a.md', mtimeMs: 2 }] })
    const edits: AnchorEdit[] = [
      { path: 'a.md', oldText: 'A', newText: '1' },
      { path: 'a.md', oldText: 'C', newText: '3' },
    ]
    const r = await applyEdits(edits, { isDirty: () => false })
    expect(r.ok).toBe(true)
    expect(bridge.applyEdits).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'a.md', newContent: '1 B 3 D' }),
    ])
  })

  it('batches edits across two files into a single IPC call with distinct entries', async () => {
    const bridge = (globalThis as unknown as { canvFS: MockBridge }).canvFS
    bridge.readFile.mockImplementation(async (rel: string) => {
      if (rel === 'a.md') return { ok: true, content: 'hello world', mtimeMs: 10, eol: 'lf', bom: false }
      if (rel === 'b.md') return { ok: true, content: 'foo bar', mtimeMs: 20, eol: 'crlf', bom: true }
      throw new Error(`unexpected readFile: ${rel}`)
    })
    bridge.applyEdits.mockResolvedValue({
      ok: true,
      applied: [{ path: 'a.md', mtimeMs: 11 }, { path: 'b.md', mtimeMs: 21 }],
    })
    const edits: AnchorEdit[] = [
      { path: 'a.md', oldText: 'world', newText: 'planet' },
      { path: 'b.md', oldText: 'foo', newText: 'baz' },
    ]
    const r = await applyEdits(edits, { isDirty: () => false })
    expect(r.ok).toBe(true)
    expect(bridge.applyEdits).toHaveBeenCalledTimes(1)
    const [forwarded] = bridge.applyEdits.mock.calls[0] as [Array<{ path: string; newContent: string; opts: { eol: string; bom: boolean } }>]
    expect(forwarded).toHaveLength(2)
    expect(forwarded[0]).toMatchObject({ path: 'a.md', newContent: 'hello planet', opts: { eol: 'lf', bom: false } })
    expect(forwarded[1]).toMatchObject({ path: 'b.md', newContent: 'baz bar', opts: { eol: 'crlf', bom: true } })
  })
})
