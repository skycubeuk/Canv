export type PathValidation =
  | { ok: true; rel: string }
  | { ok: false; error: string }

const ALLOWED_CANV_FILES = new Set<string>([
  '.canv/site_index.yaml',
])

export function validateToolPath(input: string): PathValidation {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'Path must be a non-empty string' }
  }
  const normalised = input.replace(/\\/g, '/').replace(/^\.\//, '')
  if (normalised === '') return { ok: false, error: 'Path must be non-empty' }
  if (normalised.startsWith('/')) return { ok: false, error: 'Path must be workspace-relative, not absolute' }
  if (/^[A-Za-z]:/.test(normalised)) return { ok: false, error: 'Path must be workspace-relative, not absolute' }
  const parts = normalised.split('/')
  if (parts.some((p) => p === '..')) return { ok: false, error: 'Path must not traverse outside the workspace' }
  if (parts[0] === '.canv') {
    // Allow only the site-authoring sandbox.
    if (ALLOWED_CANV_FILES.has(normalised)) return { ok: true, rel: normalised }
    if (parts.length >= 3 && parts[1] === 'sites' && parts[2].length > 0) {
      return { ok: true, rel: parts.join('/') }
    }
    return { ok: false, error: 'Path under .canv is reserved (only .canv/sites/<id>/... and .canv/site_index.yaml are writable)' }
  }
  return { ok: true, rel: parts.join('/') }
}
