'use strict'

const { z } = require('zod')
const { ALL_CAPABILITIES } = require('./capability.cjs')

const ID_RE = /^[a-z][a-z0-9-]{0,63}$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/
const HOSTNAME_RE = /^(?!-)[a-z0-9.-]+(?<!-)$/i

const safeRelPath = z.string().refine((p) => {
  if (typeof p !== 'string' || p.length === 0) return false
  if (p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:/.test(p)) return false
  const normalized = p.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalized.split('/').some((seg) => seg === '..')) return false
  return true
}, { message: 'entry must be a relative path that does not escape the extension directory' })

const PanelContribution = z.object({
  type: z.literal('panel'),
  id: z.string().regex(ID_RE),
  title: z.string().min(1).max(80),
  icon: z.string().min(1).max(40),
  location: z.enum(['right-sidebar', 'left-sidebar', 'bottom-dock']),
  entry: safeRelPath,
})

// Phase 1 only knows about `panel`. Other contribution types validated in Phase 4.
const Contribution = PanelContribution

const Capability = z.string().refine((c) => ALL_CAPABILITIES.includes(c), {
  message: (ctx) => `unknown capability: ${ctx.input}`,
})

const NetworkOrigin = z.string().refine((h) => HOSTNAME_RE.test(h) && !h.includes('/'), {
  message: 'network entries must be bare hostnames (no scheme, no path)',
})

const ManifestSchema = z.object({
  id: z.string().regex(ID_RE),
  name: z.string().min(1).max(80),
  version: z.string().regex(SEMVER_RE),
  description: z.string().max(2000).optional(),
  author: z.string().max(80).optional(),
  createdAt: z.string().datetime().optional(),
  builderPrompt: z.string().max(5000).optional(),
  capabilities: z.array(Capability).default([]),
  network: z.array(NetworkOrigin).default([]),
  activationEvents: z.array(z.string()).default([]),
  contributions: z.array(Contribution).min(1, 'manifest must declare at least one contribution'),
})

function validateManifest(input) {
  const r = ManifestSchema.safeParse(input)
  if (r.success) return { ok: true, manifest: r.data }
  const errors = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
  return { ok: false, errors }
}

module.exports = { validateManifest, ManifestSchema }
