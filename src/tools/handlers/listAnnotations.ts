import type { Tool, AnnotationView } from '../types'

interface Input { path?: string }
interface Output { annotations: AnnotationView[] }

export const listAnnotationsTool: Tool<Input, Output> = {
  name: 'list_annotations',
  description:
    'List the open annotations (margin notes) on the currently-open document. ' +
    'Returns each note\'s id, the quoted span it refers to, its text, author, and any suggested replacement. ' +
    'Call this first to obtain ids before update_annotation or remove_annotation.',
  mutating: false,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Workspace-relative path; defaults to the open document.' } },
  },
  async handler(input, ctx) {
    const path = input?.path ?? ctx.activeDocPath
    if (!path) throw new Error('no document is open')
    const list = ctx.annotations.list(path)
    if (list === null) throw new Error(`annotations are only available for the open document; ask the user to open ${path} first`)
    return { annotations: list }
  },
}
