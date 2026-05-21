'use strict'

// Lazy ESM imports — the @modelcontextprotocol/sdk package is ESM-only.
let sdkClientPromise = null
async function loadSdkClient() {
  if (!sdkClientPromise) {
    sdkClientPromise = import('@modelcontextprotocol/sdk/client/index.js').then((m) => m.Client)
  }
  return sdkClientPromise
}
let sdkStdioPromise = null
async function loadSdkStdio() {
  if (!sdkStdioPromise) {
    sdkStdioPromise = import('@modelcontextprotocol/sdk/client/stdio.js').then((m) => m.StdioClientTransport)
  }
  return sdkStdioPromise
}
let sdkSsePromise = null
async function loadSdkSse() {
  if (!sdkSsePromise) {
    sdkSsePromise = import('@modelcontextprotocol/sdk/client/sse.js').then((m) => m.SSEClientTransport)
  }
  return sdkSsePromise
}

function createMcpService({ getConfig } = {}) {
  // getConfig() → McpServerConfig[]  (live: re-read on each connection diff)

  const handles = new Map()   // name -> { client, transport, tools, cfg }

  async function connectOne(cfg) {
    const Client = await loadSdkClient()
    const client = new Client({ name: 'canv', version: '1.0.0' }, { capabilities: {} })
    let transport
    if (cfg.transport === 'stdio') {
      const Stdio = await loadSdkStdio()
      transport = new Stdio({ command: cfg.command, args: cfg.args ?? [], env: { ...process.env, ...(cfg.env ?? {}) } })
    } else if (cfg.transport === 'http') {
      const SSE = await loadSdkSse()
      transport = new SSE(new URL(cfg.url), { requestInit: { headers: cfg.headers ?? {} } })
    } else {
      throw new Error(`unknown transport: ${cfg.transport}`)
    }
    await client.connect(transport)
    const toolsResponse = await client.listTools()
    const tools = (toolsResponse.tools || []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? { type: 'object' },
    }))
    handles.set(cfg.name, { client, transport, tools, cfg })
  }

  async function disconnectOne(name) {
    const h = handles.get(name)
    if (!h) return
    try { await h.client.close() } catch { /* ignore */ }
    handles.delete(name)
  }

  async function ensureConnected() {
    const cfgs = (typeof getConfig === 'function' ? getConfig() : []) || []
    for (const cfg of cfgs) {
      if (!handles.has(cfg.name)) {
        try { await connectOne(cfg) }
        catch (e) { console.error(`[mcp] failed to connect "${cfg.name}":`, e.message) }
      }
    }
    const stillConfigured = new Set(cfgs.map((c) => c.name))
    for (const name of [...handles.keys()]) {
      if (!stillConfigured.has(name)) {
        await disconnectOne(name)
      }
    }
  }

  async function listTools() {
    await ensureConnected()
    const out = []
    for (const [name, h] of handles) {
      for (const t of h.tools) {
        out.push({ ...t, name: `${name}__${t.name}`, server: name })
      }
    }
    return out
  }

  async function callTool(qualifiedName, args) {
    await ensureConnected()
    const sep = qualifiedName.indexOf('__')
    if (sep < 0) return { ok: false, error: `bad tool name: ${qualifiedName}` }
    const serverName = qualifiedName.slice(0, sep)
    const toolName = qualifiedName.slice(sep + 2)
    const h = handles.get(serverName)
    if (!h) return { ok: false, error: `server not connected: ${serverName}` }
    try {
      const result = await h.client.callTool({ name: toolName, arguments: args ?? {} })
      // The SDK resolves with `{ isError: true, content: [...] }` for tool-
      // reported failures (the transport call succeeded but the tool itself
      // reported an error). Promote that to ok:false so the chat runner and
      // extension callers see it as a failure rather than a successful call
      // returning an error blob.
      if (result && result.isError === true) {
        const msg = Array.isArray(result.content)
          ? result.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).filter(Boolean).join('\n')
          : ''
        return { ok: false, error: msg || 'tool reported an error' }
      }
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  async function shutdown() {
    for (const name of [...handles.keys()]) {
      await disconnectOne(name)
    }
  }

  /**
   * Connect (if not already) and return the cached tool list for one server.
   *
   * **Caveat**: this method is idempotent on the handle — if a previous
   * connect succeeded but the transport has since died silently (e.g. an stdio
   * subprocess crashed without closing the SDK client), `testServer` will
   * report success against the dead handle. Use `reconnectServer` for an
   * unambiguous fresh handshake. The Phase 4.5 UI surfaces a Retry button
   * that calls `reconnectServer` to give the user that escape hatch.
   */
  async function testServer(name) {
    const cfgs = (typeof getConfig === 'function' ? getConfig() : []) || []
    const cfg = cfgs.find((c) => c && c.name === name)
    if (!cfg) return { ok: false, error: `no server named "${name}"` }
    try {
      if (!__test__.handles.has(name)) {
        await __test__.connectOne(cfg)
      }
      const h = __test__.handles.get(name)
      if (!h) return { ok: false, error: 'connection succeeded but no handle was registered' }
      return {
        ok: true,
        tools: h.tools.map((t) => ({
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema ?? { type: 'object' },
        })),
      }
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) }
    }
  }

  async function reconnectServer(name) {
    await __test__.disconnectOne(name)
    return testServer(name)
  }

  // Expose the inner refs as an object so tests can spy on them. testServer /
  // reconnectServer route through this object so the spies actually intercept.
  const __test__ = { handles, connectOne, disconnectOne }

  return { listTools, callTool, ensureConnected, shutdown, testServer, reconnectServer, __test__ }
}

function registerIpcHandlers(ipcMain, _deps) {
  let currentConfig = []
  // Route through `module.exports.createMcpService` so tests can `vi.spyOn`
  // the factory to inject a stub service without spawning real subprocesses.
  const service = module.exports.createMcpService({ getConfig: () => currentConfig })

  ipcMain.handle('canvMcp:setServers', async (_e, cfgs) => {
    currentConfig = Array.isArray(cfgs) ? cfgs : []
    await service.shutdown()
    await service.ensureConnected()
    return { ok: true }
  })
  ipcMain.handle('canvMcp:listTools', async () => service.listTools())
  ipcMain.handle('canvMcp:callTool', async (_e, name, args) => service.callTool(name, args))
  ipcMain.handle('canvMcp:reconnect', async () => {
    await service.shutdown()
    await service.ensureConnected()
    return { ok: true }
  })
  ipcMain.handle('canvMcp:testServer', async (_e, name) => service.testServer(name))
  ipcMain.handle('canvMcp:reconnectServer', async (_e, name) => service.reconnectServer(name))

  return { service }
}

module.exports = { createMcpService, registerIpcHandlers }
