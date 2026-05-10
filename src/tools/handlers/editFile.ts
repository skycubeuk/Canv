import type { Tool } from '../types'
import { validateToolPath } from '../paths'

interface Input { path: string; content: string; expectedMtimeMs?: number }
interface Output { path: string; mtimeMs?: number }

export const editFileTool: Tool<Input, Output> = {
  name: 'edit_file',
  description:
    'Replace the entire contents of an existing workspace file. ' +
    'Provide the full new content; partial / patch edits are not supported. ' +
    'Requires user approval. ' +
    'When editing the user\'s currently-open document, the change is applied to the editor (not directly to disk); ' +
    'the disk write happens when the user saves the editor as normal.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      content: { type: 'string', description: 'Full new file content.' },
      expectedMtimeMs: { type: 'number', description: 'Optional mtime guard from a prior read_file. If present and stale, the write is rejected so the model can re-read.' },
    },
    required: ['path', 'content'],
  },
  async handler(input, ctx) {
    const v = validateToolPath(input?.path ?? '')
    if (!v.ok) throw new Error(v.error)
    if (typeof input.content !== 'string') throw new Error('content must be a string')

    if (ctx.activeDocPath === v.rel) {
      await ctx.applyEditorEdit(v.rel, input.content)
      return { path: v.rel }
    }
    const r = await ctx.fs.writeFile(v.rel, input.content, input.expectedMtimeMs)
    return { path: v.rel, mtimeMs: r.mtimeMs }
  },
}
