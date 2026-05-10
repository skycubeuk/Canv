import type { Tool } from '../types'
import type { SiteEntry } from '../../lib/sites'

interface Input {
  id: string
  patch?: Record<string, unknown>
}
type Output = Record<string, unknown>

export const siteUpdateTool: Tool<Input, Output> = {
  name: 'site_update',
  description: [
    'Update an existing site\'s registry entry after you have rewritten its files in place. Use edit_file (NOT create_file) to overwrite files in .canv/sites/<id>/, then call site_update with that id. The site\'s updated timestamp is bumped automatically; the panel will re-evaluate stale-detection on next refresh.',
    '',
    'Inputs: id (required), patch (optional partial entry — may include name, description, prompt, source_files, pinned). If you have nothing to change in the metadata, omit patch or pass {} — the call still bumps the updated timestamp. Cannot change id or created. Returns the updated entry.',
    '',
    'If you do not know the id: read .canv/site_index.yaml and look up the entry by name. Do NOT call site_register again to update an existing site — that would create a duplicate registry entry.',
  ].join('\n'),
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      patch: { type: 'object', description: 'Optional partial entry; cannot include id or created.' },
    },
    required: ['id'],
  },
  async handler(input) {
    if (!input?.id || typeof input.id !== 'string') throw new Error('id is required')
    if (!window.canvSites) throw new Error('Sites are not available outside Electron')
    const patch = (input.patch && typeof input.patch === 'object') ? input.patch : {}
    return (window.canvSites.update(input.id, patch as Partial<SiteEntry>) as Promise<unknown>) as Promise<Output>
  },
}
