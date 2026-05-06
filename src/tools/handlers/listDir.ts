import type { Tool } from '../types'
import { validateToolPath } from '../paths'

interface Input { path?: string }
interface Entry { name: string; kind: 'dir' | 'file'; size?: number }
interface Output { entries: Entry[] }

export const listDirTool: Tool<Input, Output> = {
  name: 'list_dir',
  description:
    'List the immediate contents of a workspace folder. Use an empty string or "." to list the workspace root. ' +
    'Use this to discover what files exist before reading them.',
  mutating: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative folder path. Empty or "." for root.' },
    },
    required: [],
  },
  async handler(input, ctx) {
    const raw = input?.path ?? ''
    if (raw === '' || raw === '.') {
      const node = await ctx.fs.listDir('')
      return { entries: node.children.map(toEntry) }
    }
    const v = validateToolPath(raw)
    if (!v.ok) throw new Error(v.error)
    const node = await ctx.fs.listDir(v.rel)
    return { entries: node.children.map(toEntry) }
  },
}

function toEntry(c: { name: string; kind: 'dir' | 'file'; size?: number }): Entry {
  return c.kind === 'file'
    ? { name: c.name, kind: 'file', size: c.size }
    : { name: c.name, kind: 'dir' }
}
