import type { Tool } from '../types'
import { validateToolPath } from '../paths'

interface Input { path: string }
interface Output { path: string }

export const createFolderTool: Tool<Input, Output> = {
  name: 'create_folder',
  description:
    'Create a new folder at a workspace-relative path. Intermediate folders are created as needed by the underlying FS. Requires user approval.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Workspace-relative folder path.' } },
    required: ['path'],
  },
  async handler(input, ctx) {
    const v = validateToolPath(input?.path ?? '')
    if (!v.ok) throw new Error(v.error)
    await ctx.fs.createFolder(v.rel)
    return { path: v.rel }
  },
}
