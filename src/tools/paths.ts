export type PathValidation =
  | { ok: true; rel: string }
  | { ok: false; error: string }

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
  if (parts[0] === '.canv') return { ok: false, error: 'Path .canv is reserved for app metadata' }
  return { ok: true, rel: parts.join('/') }
}
