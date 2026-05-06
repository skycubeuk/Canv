import type { Tool } from '../types'
import { validateToolPath } from '../paths'

interface Input { from: string; to: string }
interface Output { from: string; to: string }

export const renameFileTool: Tool<Input, Output> = {
  name: 'rename_file',
  description: 'Rename or move a workspace file. Requires user approval. Fails if the destination already exists.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Current workspace-relative path.' },
      to: { type: 'string', description: 'New workspace-relative path.' },
    },
    required: ['from', 'to'],
  },
  async handler(input, ctx) {
    const fv = validateToolPath(input?.from ?? '')
    if (!fv.ok) throw new Error(fv.error)
    const tv = validateToolPath(input?.to ?? '')
    if (!tv.ok) throw new Error(tv.error)
    await ctx.fs.rename(fv.rel, tv.rel)
    return { from: fv.rel, to: tv.rel }
  },
}
