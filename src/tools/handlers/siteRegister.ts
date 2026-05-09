import type { Tool } from '../types'
import type {} from '../../lib/sites'

interface Input {
  name: string
  description?: string
  folder: string
  entry: string
  prompt: string
  source_files: string[]
  pinned?: boolean
}

interface Output {
  id: string
  url: string
}

export const siteRegisterTool: Tool<Input, Output> = {
  name: 'site_register',
  description: [
    'Register a generated static site so it appears in the user\'s Sites panel and can be served back at a stable URL.',
    '',
    'Workflow for a NEW site: (1) pick a folder under .canv/sites/ — a slug of the site name is fine (e.g. .canv/sites/timeline/). Use create_file directly — parent directories are created automatically, do NOT call create_folder for the .canv/sites/ tree. (2) call site_register with that folder path. The registry generates a unique id like <slug>-<4hex> and renames your folder to .canv/sites/<id>/ so the id and folder always match. Remember the returned id — you will need it to update this site later.',
    '',
    'Workflow for an UPDATE (a site that has already been registered): use edit_file (NOT create_file) on existing files inside .canv/sites/<id>/, where <id> is the same id returned from the original site_register. If you don\'t remember the id, read .canv/site_index.yaml and look up the entry by name. After your edits, call site_update with the id. Do NOT call site_register again — that would create a duplicate.',
    '',
    'Writes inside .canv/sites/ are pre-approved — the user will not be prompted per file, so build or rebuild the whole site (typically 5–20 files) in one pass.',
    '',
    'Available at served URLs: /_lib/d3.v7.min.js (D3 v7) and /_lib/chart.umd.min.js (Chart.js v4 UMD). Reference these with <script src="/_lib/...">. No other libraries are guaranteed; for anything else, write vanilla JS and CSS. Do not fetch from CDNs.',
    '',
    'Fields:',
    '- name: short user-facing title (e.g. "Story Timeline").',
    '- description: one-sentence summary of what the site shows.',
    '- folder: workspace-relative path under .canv/sites/.',
    '- entry: the HTML file to open (almost always "index.html").',
    '- prompt: the user\'s original request, verbatim. Used for regenerate.',
    '- source_files: glob patterns (relative to workspace root) of the files this site is derived from. Used for stale-detection. Example: ["chapters/*.md", "characters.yaml"].',
    '- pinned (optional): pin to top of the panel.',
    '',
    'Returns { id, url }. The url opens the site in the user\'s browser.',
  ].join('\n'),
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      folder: { type: 'string', description: 'Workspace-relative path under .canv/sites/' },
      entry: { type: 'string', description: 'HTML file to open, e.g. index.html' },
      prompt: { type: 'string', description: 'The user\'s original request, verbatim.' },
      source_files: { type: 'array', items: { type: 'string' }, description: 'Globs for stale-detection.' },
      pinned: { type: 'boolean' },
    },
    required: ['name', 'folder', 'entry', 'prompt', 'source_files'],
  },
  async handler(input) {
    if (!window.canvSites) throw new Error('Sites are not available outside Electron')
    const result = await window.canvSites.register(input)
    return { id: result.entry.id, url: result.url }
  },
}
