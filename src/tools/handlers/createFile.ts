import type { Tool } from '../types'
import { validateToolPath } from '../paths'

interface Input { path: string; content?: string }
interface Output { path: string; mtimeMs: number }

export const createFileTool: Tool<Input, Output> = {
  name: 'create_file',
  description:
    'Create a new file at a workspace-relative path with optional initial content. ' +
    'Fails if the path already exists. Requires user approval.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path of the new file.' },
      content: { type: 'string', description: 'Initial file content. Empty string if omitted.' },
    },
    required: ['path'],
  },
  async handler(input, ctx) {
    const v = validateToolPath(input?.path ?? '')
    if (!v.ok) throw new Error(v.error)
    const r = await ctx.fs.createFile(v.rel, input.content ?? '')
    return { path: v.rel, mtimeMs: r.mtimeMs }
  },
}
