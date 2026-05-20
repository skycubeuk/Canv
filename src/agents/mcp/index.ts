export interface McpToolDef {
  name: string            // fully-qualified: "<server>__<tool>"
  server: string
  description: string
  inputSchema: unknown    // JSON Schema
}

declare global {
  interface Window {
    canvMcp?: {
      setServers: (cfgs: unknown[]) => Promise<{ ok: boolean }>
      listTools: () => Promise<McpToolDef[]>
      callTool: (name: string, args: unknown) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>
      reconnect: () => Promise<{ ok: boolean }>
    }
  }
}

export async function getMcpToolDefs(): Promise<McpToolDef[]> {
  if (!window.canvMcp) return []
  try {
    return await window.canvMcp.listTools()
  } catch (e) {
    console.warn('[mcp] listTools failed', e)
    return []
  }
}

export async function callMcpTool(name: string, args: unknown): Promise<unknown> {
  if (!window.canvMcp) throw new Error('MCP bridge not available')
  const r = await window.canvMcp.callTool(name, args)
  if (!r.ok) throw new Error(`MCP tool "${name}" failed: ${r.error}`)
  return r.result
}

export function isMcpToolName(name: string): boolean {
  return name.includes('__')
}
