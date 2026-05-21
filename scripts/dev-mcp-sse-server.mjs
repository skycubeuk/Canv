#!/usr/bin/env node
// Dev-only HTTP/SSE MCP server for smoke-testing the http transport.
// Run: node scripts/dev-mcp-sse-server.mjs [port]
//   port defaults to 9000.
// Then configure a Canv MCP server entry with:
//   { name: 'dev-sse', transport: 'http', url: 'http://127.0.0.1:9000/sse' }
//
// Tools exposed:
//   ping       — returns 'pong'
//   echo       — returns the `text` argument verbatim
//   add        — returns a + b (numbers)
//
// Ctrl+C to stop.

import http from 'node:http'

const PORT = Number.parseInt(process.argv[2] ?? '9000', 10)

const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js')
const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')

const server = new Server(
  { name: 'dev-sse-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'ping', description: 'Returns "pong".', inputSchema: { type: 'object', properties: {}, required: [] } },
    {
      name: 'echo',
      description: 'Echoes the provided text argument back.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'add',
      description: 'Adds two numbers and returns the sum.',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params
  switch (name) {
    case 'ping':
      return { content: [{ type: 'text', text: 'pong' }] }
    case 'echo':
      return { content: [{ type: 'text', text: String(args.text ?? '') }] }
    case 'add': {
      const a = Number(args.a)
      const b = Number(args.b)
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return { content: [{ type: 'text', text: 'error: a and b must be numbers' }], isError: true }
      }
      return { content: [{ type: 'text', text: String(a + b) }] }
    }
    default:
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true }
  }
})

let activeTransport = null

const httpServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/sse') {
      console.log(`[mcp-sse] client connected from ${req.socket.remoteAddress}`)
      activeTransport = new SSEServerTransport('/messages', res)
      res.on('close', () => {
        console.log('[mcp-sse] client disconnected')
        activeTransport = null
      })
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
      res.end('not found')
    }
  } catch (e) {
    console.error('[mcp-sse] handler error:', e)
    try { res.statusCode = 500; res.end(String(e?.message ?? e)) } catch { /* socket gone */ }
  }
})

httpServer.listen(PORT, '127.0.0.1', () => {
  const addr = httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : PORT
  console.log(`[mcp-sse] listening on http://127.0.0.1:${port}/sse`)
  console.log('[mcp-sse] configure Canv mcpServers with:')
  console.log(JSON.stringify({ name: 'dev-sse', transport: 'http', url: `http://127.0.0.1:${port}/sse` }, null, 2))
  console.log('[mcp-sse] press Ctrl+C to stop')
})

process.on('SIGINT', () => {
  console.log('\n[mcp-sse] shutting down')
  httpServer.close(() => process.exit(0))
})
