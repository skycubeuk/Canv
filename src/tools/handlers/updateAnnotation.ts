import type { Tool } from '../types'

interface Input { path?: string; id: string; note?: string; suggestedReplacement?: string }
interface Output { ok: true }

export const updateAnnotationTool: Tool<Input, Output> = {
  name: 'update_annotation',
  description:
    'Update an existing annotation on the open document. Target it by `id` (from list_annotations). ' +
    'Provide `note` to change the text and/or `suggestedReplacement` to change the proposed replacement. At least one is required.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path; defaults to the open document.' },
      id: { type: 'string', description: 'The annotation id from list_annotations.' },
      note: { type: 'string', description: 'New note text.' },
      suggestedReplacement: { type: 'string', description: 'New suggested replacement for the quoted span.' },
    },
    required: ['id'],
  },
  async handler(input, ctx) {
    const path = input?.path ?? ctx.activeDocPath
    if (!path) throw new Error('no document is open')
    if (!input?.id) throw new Error('id is required')
    if (input.note === undefined && input.suggestedReplacement === undefined) throw new Error('nothing to update: provide note and/or suggestedReplacement')
    ctx.annotations.update(path, { id: input.id, note: input.note, suggestedReplacement: input.suggestedReplacement })
    return { ok: true }
  },
}
