import type { Tool } from '../types'
import type { SearchResult } from '../../lib/searchTypes'
import { validateToolPath } from '../paths'

interface Input {
  query: string
  regex?: boolean
  caseSensitive?: boolean
  folder?: string
}

export const searchWorkspaceTool: Tool<Input, SearchResult> = {
  name: 'search_workspace',
  description:
    'Search the workspace for a substring or regex. Returns up to 1000 matches across files. ' +
    'Use this to locate where something is defined, mentioned, or used before reading specific files.',
  mutating: false,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text or regex pattern.' },
      regex: { type: 'boolean', description: 'Treat the query as a regular expression. Default false.' },
      caseSensitive: { type: 'boolean', description: 'Default false.' },
      folder: { type: 'string', description: 'Optional workspace-relative folder to scope the search.' },
    },
    required: ['query'],
  },
  async handler(input, ctx) {
    const query = (input?.query ?? '').trim()
    if (!query) throw new Error('query is required and must be non-empty')
    let folder: string | undefined
    if (typeof input.folder === 'string' && input.folder !== '') {
      const v = validateToolPath(input.folder)
      if (!v.ok) throw new Error(v.error)
      folder = v.rel
    }
    return ctx.fs.search({
      query,
      regex: input.regex === true,
      caseSensitive: input.caseSensitive === true,
      ...(folder !== undefined ? { folder } : {}),
    })
  },
}
