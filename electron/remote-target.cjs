function parseTarget(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('empty target')
  }
  const s = input.trim()
  let rest = s
  let user = null
  const at = rest.indexOf('@')
  const firstColonAfter = rest.indexOf(':')
  if (at !== -1 && firstColonAfter !== -1 && at < firstColonAfter) {
    user = rest.slice(0, at)
    rest = rest.slice(at + 1)
  }
  const firstColon = rest.indexOf(':')
  if (firstColon === -1) throw new Error('target missing :path')
  const host = rest.slice(0, firstColon)
  let after = rest.slice(firstColon + 1)
  let port = null
  const m = after.match(/^(\d+):(.+)$/)
  if (m) { port = Number(m[1]); after = m[2] }
  if (!after) throw new Error('target missing :path')
  if (!after.startsWith('/')) throw new Error('path must be absolute')
  return { user, host, port, path: after }
}

function resolveTarget(t, sshConfigLookup) {
  const cfg = sshConfigLookup(t.host) || {}
  const host = cfg.HostName || t.host
  const user = t.user || cfg.User || process.env.USER || null
  const port = t.port ?? (cfg.Port ? Number(cfg.Port) : null)
  return {
    user,
    host,
    port,
    path: t.path,
    identityFile: cfg.IdentityFile || null,
  }
}

module.exports = { parseTarget, resolveTarget }
