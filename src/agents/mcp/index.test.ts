import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMcpToolDefs, callMcpTool, isMcpToolName } from './index'

describe('mcp adapter', () => {
  beforeEach(() => {
    ;(window as unknown as { canvMcp?: unknown }).canvMcp = undefined
  })

  it('returns [] when the bridge is not present', async () => {
    expect(await getMcpToolDefs()).toEqual([])
  })

  it('forwards to the bridge', async () => {
    ;(window as unknown as { canvMcp: unknown }).canvMcp = {
      listTools: vi.fn().mockResolvedValue([{ name: 's__t', server: 's', description: '', inputSchema: {} }]),
      callTool: vi.fn().mockResolvedValue({ ok: true, result: 42 }),
    }
    const tools = await getMcpToolDefs()
    expect(tools).toHaveLength(1)
    const r = await callMcpTool('s__t', {})
    expect(r).toBe(42)
  })

  it('throws on tool failure', async () => {
    ;(window as unknown as { canvMcp: unknown }).canvMcp = {
      listTools: vi.fn(),
      callTool: vi.fn().mockResolvedValue({ ok: false, error: 'nope' }),
    }
    await expect(callMcpTool('s__t', {})).rejects.toThrow(/nope/)
  })

  it('isMcpToolName uses the __ separator', () => {
    expect(isMcpToolName('foo__bar')).toBe(true)
    expect(isMcpToolName('readFile')).toBe(false)
  })
})
