'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller } = require('./active-doc.cjs')

const DANGEROUS_HEADERS = new Set(['cookie'])

function createNetHandlers({ runtime, fetchImpl = globalThis.fetch, onRequest = (/** @type {string} */ _callerId) => {} }) {
  return {
    'canvExt:net.fetch': async (event, url, init = {}) => {
      const { id: callerId, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'net')
      if (typeof url !== 'string') throw new TypeError('url must be a string')

      let parsed
      try { parsed = new URL(url) } catch { throw new Error(`invalid url: ${url}`) }
      if (parsed.protocol !== 'https:') {
        throw new Error(`canv.net.fetch only allows https:// URLs (got ${parsed.protocol})`)
      }
      const allowed = Array.isArray(manifest.network) ? manifest.network : []
      if (!allowed.includes(parsed.hostname)) {
        throw new Error(`origin not whitelisted: ${parsed.hostname} (manifest.network: ${allowed.join(', ') || '(none)'})`)
      }

      const safeHeaders = {}
      const hIn = init.headers || {}
      for (const [k, v] of Object.entries(hIn)) {
        if (DANGEROUS_HEADERS.has(String(k).toLowerCase())) continue
        safeHeaders[k] = v
      }
      const safeInit = { ...init, headers: safeHeaders }

      try { onRequest(callerId) } catch { /* ignore */ }
      let res
      try {
        res = await fetchImpl(url, safeInit)
      } catch (err) {
        // Node's fetch wraps the real network error in `.cause`. Surface it so
        // the extension sees "ENOTFOUND wttr.in" / "self-signed cert" / etc.
        // rather than the unhelpful "TypeError: fetch failed".
        const cause = err && err.cause
        const causeMsg = cause
          ? (typeof cause === 'object' ? (cause.code || cause.message || String(cause)) : String(cause))
          : err.message
        const detailed = new Error(`fetch failed: ${causeMsg}`)
        detailed.cause = cause
        throw detailed
      }
      const body = await res.text()
      const headersOut = {}
      if (res.headers && typeof res.headers.entries === 'function') {
        for (const [k, v] of res.headers.entries()) headersOut[k] = v
      }
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: headersOut,
        body,
      }
    },
  }
}

module.exports = { createNetHandlers }
