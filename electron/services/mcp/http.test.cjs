'use strict'

const http = require('node:http')
const { createMcpService } = require('./index.cjs')

// Spin up a tiny SSE-transport MCP server using the SDK's own SSEServerTransport.
// The test exercises createMcpService's HTTP/SSE branch end-to-end: listTools
// over a real HTTP connection + a callTool roundtrip.

let httpServer
let activeTransport

async function startSseServer() {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js')
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')

  const server = new Server(
    { name: 'http-test-srv', version: '0.0.1' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'ping', description: 'simple ping', inputSchema: { type: 'object' } }],
  }))
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }))

  httpServer = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/sse') {
        activeTransport = new SSEServerTransport('/messages', res)
        await server.connect(activeTransport)
      } else if (req.method === 'POST' && req.url && req.url.startsWith('/messages')) {
        if (activeTransport) {
          await activeTransport.handlePostMessage(req, res)
        } else {
          res.statusCode = 503
          res.end('no active transport')
        }
      } else {
        res.statusCode = 404
        res.end()
      }
    } catch (e) {
      try { res.statusCode = 500; res.end(String(e?.message ?? e)) } catch { /* socket already closed */ }
    }
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  return httpServer.address().port
}

describe('MCP HTTP/SSE client', () => {
  let port

  beforeAll(async () => {
    port = await startSseServer()
  }, 20000)

  afterAll(async () => {
    if (httpServer) await new Promise((r) => httpServer.close(r))
  })

  it('lists tools and calls one over a real SSE transport', async () => {
    const service = createMcpService({
      getConfig: () => [{
        name: 'http',
        transport: 'http',
        url: `http://127.0.0.1:${port}/sse`,
      }],
    })
    try {
      const tools = await service.listTools()
      const ping = tools.find((t) => t.name === 'http__ping')
      expect(ping).toBeTruthy()
      expect(ping.server).toBe('http')

      const r = await service.callTool('http__ping', {})
      expect(r.ok).toBe(true)
      expect(JSON.stringify(r.result)).toMatch(/pong/)
    } finally {
      await service.shutdown()
    }
  }, 30000)
})
