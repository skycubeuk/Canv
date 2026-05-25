import type { Tool } from '../types'

interface Input { path?: string; id: string }
interface Output { ok: true }

export const removeAnnotationTool: Tool<Input, Output> = {
  name: 'remove_annotation',
  description: 'Remove an annotation from the open document by `id` (from list_annotations).',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path; defaults to the open document.' },
      id: { type: 'string', description: 'The annotation id from list_annotations.' },
    },
    required: ['id'],
  },
  async handler(input, ctx) {
    const path = input?.path ?? ctx.activeDocPath
    if (!path) throw new Error('no document is open')
    if (!input?.id) throw new Error('id is required')
    ctx.annotations.remove(path, input.id)
    return { ok: true }
  },
}
