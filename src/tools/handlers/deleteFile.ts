import type { Tool } from '../types'
import { validateToolPath } from '../paths'

interface Input { path: string }
interface Output { path: string }

export const deleteFileTool: Tool<Input, Output> = {
  name: 'delete_file',
  description: 'Delete a workspace file. Requires user approval. Cannot be undone by the tool.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Workspace-relative file path.' } },
    required: ['path'],
  },
  async handler(input, ctx) {
    const v = validateToolPath(input?.path ?? '')
    if (!v.ok) throw new Error(v.error)
    await ctx.fs.delete(v.rel)
    return { path: v.rel }
  },
}
