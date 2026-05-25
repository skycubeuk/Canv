import type { Tool } from '../types'

interface Input { path?: string; quote: string; note: string; suggestedReplacement?: string }
interface Output { id: string }

export const addAnnotationTool: Tool<Input, Output> = {
  name: 'add_annotation',
  description:
    'Add a margin note to the open document, anchored to an exact quoted span. ' +
    'Provide `quote` (a verbatim substring of the document that uniquely identifies where the note belongs) and `note` (the note text). ' +
    'Optionally provide `suggestedReplacement` to offer the user a one-click replacement of the quoted span.',
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path; defaults to the open document.' },
      quote: { type: 'string', description: 'Exact, verbatim, unique substring of the document to anchor the note to.' },
      note: { type: 'string', description: 'The annotation text.' },
      suggestedReplacement: { type: 'string', description: 'Optional replacement for the quoted span (adds an Accept button).' },
    },
    required: ['quote', 'note'],
  },
  async handler(input, ctx) {
    const path = input?.path ?? ctx.activeDocPath
    if (!path) throw new Error('no document is open')
    if (!input?.quote) throw new Error('quote is required and must be a verbatim substring of the document')
    if (typeof input?.note !== 'string' || input.note.length === 0) throw new Error('note is required')
    return ctx.annotations.add(path, {
      quote: input.quote,
      note: input.note,
      suggestedReplacement: input.suggestedReplacement,
    })
  },
}
