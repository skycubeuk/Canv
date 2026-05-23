import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ICanvServices } from '../services'
import type { McpServerConfig } from '../hooks/settingsSchema'

interface CanvMcpWindowApi {
  setServers: (cfgs: McpServerConfig[]) => Promise<void>
}

describe('mcp contribution — push filter', () => {
  let setServers: ReturnType<typeof vi.fn>
  let originalCanvMcp: unknown

  beforeEach(() => {
    setServers = vi.fn().mockResolvedValue(undefined)
    originalCanvMcp = (window as unknown as { canvMcp?: CanvMcpWindowApi }).canvMcp
    ;(window as unknown as { canvMcp: CanvMcpWindowApi }).canvMcp = {
      setServers: setServers as unknown as CanvMcpWindowApi['setServers'],
    }
  })

  afterEach(() => {
    if (originalCanvMcp === undefined) {
      delete (window as unknown as { canvMcp?: unknown }).canvMcp
    } else {
      ;(window as unknown as { canvMcp: unknown }).canvMcp = originalCanvMcp
    }
  })

  function buildServices(mcpServers: unknown[]): { services: ICanvServices; fire: () => void } {
    let subscriber: () => void = () => {}
    const services = {
      settings: {
        settings: { mcpServers },
        subscribe: (cb: () => void) => {
          subscriber = cb
          return () => {}
        },
      },
    } as unknown as ICanvServices
    return { services, fire: () => subscriber() }
  }

  it('drops in-progress / invalid rows before pushing to the MCP service', async () => {
    const { mcp } = await import('./mcp.contribution')
    const { services } = buildServices([
      { name: 'good', transport: 'stdio', command: 'echo' },
      { name: '', transport: 'stdio', command: '' },                          // partial
      { name: 'bad-discriminator', transport: 'mystery' },                    // invalid
      { name: 'good-http', transport: 'http', url: 'http://localhost:9000' }, // valid
    ])
    mcp.register(services)
    expect(setServers).toHaveBeenCalledTimes(1)
    const pushed = setServers.mock.calls[0][0] as McpServerConfig[]
    expect(pushed).toHaveLength(2)
    expect(pushed.map((c) => c.name)).toEqual(['good', 'good-http'])
  })

  it('does not re-push when an unrelated keystroke changes settings (diff guard)', async () => {
    const { mcp } = await import('./mcp.contribution')
    const { services, fire } = buildServices([
      { name: 'good', transport: 'stdio', command: 'echo' },
    ])
    mcp.register(services)
    expect(setServers).toHaveBeenCalledTimes(1)
    fire()  // simulate a settings change with the SAME mcpServers shape
    expect(setServers).toHaveBeenCalledTimes(1)
  })
})
