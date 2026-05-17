'use strict'

const path = require('node:path')
const fsp = require('node:fs/promises')
const { scopeToDir, ScopeError } = require('./path-scope.cjs')

const SHARED_HOST = 'canv-shared'

function resolveProtocolRequest(url, ctx) {
  // Reject traversal attempts in the raw string BEFORE URL normalises them away.
  // Check both literal '..' and percent-encoded variants in any path segment position.
  if (/(?:^|\/|%2f)(?:\.\.|%2e%2e)(?:\/|$|%2f)/i.test(url)) {
    return { status: 403, error: 'path traversal detected' }
  }

  let u
  try { u = new URL(url) } catch { return { status: 400, error: 'malformed URL' } }
  if (u.protocol !== 'canv-extension:') return { status: 400, error: 'wrong scheme' }

  const id = u.hostname
  let relPath
  try { relPath = decodeURIComponent(u.pathname.replace(/^\/+/, '')) }
  catch { return { status: 400, error: 'malformed percent-encoding' } }

  if (id === SHARED_HOST) {
    try {
      const abs = scopeToDir(ctx.sharedDir, relPath)
      return { status: 200, filePath: abs, extensionId: null }
    } catch (e) {
      if (e instanceof ScopeError) return { status: 403, error: e.message }
      throw e
    }
  }

  const extDir = ctx.extensionDirFor(id)
  if (!extDir) return { status: 404, error: `unknown extension "${id}"` }

  try {
    const target = relPath === '' ? path.join(extDir, 'index.html') : scopeToDir(extDir, relPath)
    return { status: 200, filePath: target, extensionId: id }
  } catch (e) {
    if (e instanceof ScopeError) return { status: 403, error: e.message }
    throw e
  }
}

function buildCspHeader(manifest) {
  const origins = Array.isArray(manifest?.network) ? manifest.network : []
  // 'self' (the extension's own origin) and canv-extension://canv-shared (for the
  // auto-injected <canv-icon> icons.json fetch) are always allowed. Extension-
  // declared external origins are appended after. With no declared origins,
  // there is still no external network reach — only same-extension and shared.
  const baseConnect = `'self' canv-extension://canv-shared`
  const connectSrc = origins.length === 0
    ? `connect-src ${baseConnect}`
    : `connect-src ${baseConnect} ${origins.map((h) => `https://${h}`).join(' ')}`

  return [
    `default-src 'self'`,
    // 'self' here is the extension's own canv-extension://<id>/ origin.
    // canv-extension://canv-shared/ is a different origin (different host) so it
    // must be allowed explicitly — that's where the auto-injected canv-ui.css
    // and <canv-icon> script live. The icons.json fetch also goes there.
    `script-src 'self' canv-extension://canv-shared`,        // no 'unsafe-inline' for scripts ever
    `style-src 'self' 'unsafe-inline' canv-extension://canv-shared`,
    `img-src 'self' data: blob: canv-extension://canv-shared`,
    `font-src 'self' data: canv-extension://canv-shared`,
    `media-src 'self'`,
    connectSrc,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ')
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js':   return 'text/javascript; charset=utf-8'
    case '.css':  return 'text/css; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg':  return 'image/svg+xml'
    case '.png':  return 'image/png'
    case '.jpg': case '.jpeg': return 'image/jpeg'
    case '.gif':  return 'image/gif'
    case '.webp': return 'image/webp'
    case '.woff': return 'font/woff'
    case '.woff2': return 'font/woff2'
    default: return 'application/octet-stream'
  }
}

// HTML responses get the canv-ui.css / canv-icon.js link injected.
async function readAndMaybeInject(filePath) {
  const buf = await fsp.readFile(filePath)
  if (!filePath.toLowerCase().endsWith('.html')) return { body: buf, mime: mimeFor(filePath) }
  const html = buf.toString('utf-8')
  const inject =
    `<link rel="stylesheet" href="canv-extension://canv-shared/canv-ui.css">` +
    `<script type="module" src="canv-extension://canv-shared/canv-icon.js"></script>`
  let injected
  if (/<head[^>]*>/i.test(html)) {
    injected = html.replace(/<head[^>]*>/i, (m) => m + inject)
  } else {
    injected = inject + html
  }
  return { body: Buffer.from(injected, 'utf-8'), mime: mimeFor(filePath) }
}

function registerProtocol(protocol, ctx) {
  protocol.handle('canv-extension', async (request) => {
    const r = resolveProtocolRequest(request.url, ctx)
    if (r.status !== 200) {
      return new Response(r.error || 'error', { status: r.status })
    }
    let payload
    try {
      payload = await readAndMaybeInject(r.filePath)
    } catch (e) {
      if (e.code === 'ENOENT') return new Response('not found', { status: 404 })
      return new Response(String(e.message || e), { status: 500 })
    }
    const manifest = r.extensionId ? ctx.manifestFor(r.extensionId) : null
    const headers = new Headers({
      'content-type': payload.mime,
      'content-security-policy': buildCspHeader(manifest),
      'x-content-type-options': 'nosniff',
    })
    return new Response(payload.body, { status: 200, headers })
  })
}

module.exports = { resolveProtocolRequest, buildCspHeader, mimeFor, readAndMaybeInject, registerProtocol }
