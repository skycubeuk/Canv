'use strict'
const { createMcpService } = require('./index.cjs')

// Spawn a tiny in-process MCP stdio server via the SDK's server SDK, talking
// over stdin/stdout. Cross-platform: uses `node -e <script>`.
// Note: SDK 1.x's setRequestHandler takes a Zod schema (ListToolsRequestSchema /
// CallToolRequestSchema), not a method-name string.
const SERVER_SCRIPT = `
  (async () => {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
    const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')
    const server = new Server({ name: 'test-srv', version: '0.0.1' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: 'echo', description: 'echo input', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } }],
    }))
    server.setRequestHandler(CallToolRequestSchema, async (req) => ({
      content: [{ type: 'text', text: 'echo:' + (req.params.arguments && req.params.arguments.msg) }],
    }))
    await server.connect(new StdioServerTransport())
  })().catch((e) => { console.error(e); process.exit(1) })
`

describe('MCP stdio client', () => {
  it('lists and calls a tool from a spawned stdio server', async () => {
    const service = createMcpService({
      getConfig: () => [{
        name: 'srv',
        transport: 'stdio',
        command: process.execPath,
        args: ['-e', SERVER_SCRIPT],
      }],
    })
    try {
      const tools = await service.listTools()
      expect(tools.find((t) => t.name === 'srv::echo')).toBeTruthy()
      const r = await service.callTool('srv::echo', { msg: 'hi' })
      expect(r.ok).toBe(true)
      expect(JSON.stringify(r.result)).toMatch(/echo:hi/)
    } finally {
      await service.shutdown()
    }
  }, 30000)
})
