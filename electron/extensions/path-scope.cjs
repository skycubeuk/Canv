'use strict'

const path = require('node:path')

class ScopeError extends Error {
  constructor(reason, input) {
    super(`path scope violation (${reason}): ${JSON.stringify(input)}`)
    this.name = 'ScopeError'
    this.code = 'SCOPE_VIOLATION'
  }
}

function scopeToDir(root, rel) {
  if (typeof rel !== 'string') throw new ScopeError('not a string', rel)
  if (rel.includes('\0')) throw new ScopeError('NUL byte', rel)
  if (rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) {
    throw new ScopeError('absolute path', rel)
  }
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalized.split('/').some((seg) => seg === '..')) {
    throw new ScopeError('parent traversal', rel)
  }
  const abs = normalized.length === 0 ? root : path.resolve(root, normalized)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new ScopeError('resolved escape', rel)
  }
  return abs
}

module.exports = { scopeToDir, ScopeError }
