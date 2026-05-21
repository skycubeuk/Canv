import type { Tool } from '../types'
import type { AnchorEdit, ApplyEditsResult } from '../../services/workspaceEdits'

interface Input {
  edits: AnchorEdit[]
}

interface Output {
  applied: Array<{ path: string; mtimeMs: number }>
}

export const applyEditsTool: Tool<Input, Output> = {
  name: 'apply_edits',
  description: [
    'Apply one or more anchor-based edits across one or more workspace files atomically.',
    'Each edit is { path, oldText, newText }. `oldText` must occur EXACTLY ONCE in the target file —',
    'include 1–3 lines of unique surrounding context if a short snippet would be ambiguous.',
    'If any edit fails (anchor not found / not unique / file missing / file has unsaved changes),',
    'the WHOLE call is rejected and no file is changed.',
    'Prefer this tool over `edit_file` for: cross-file refactors, small in-place fixes,',
    'anything that would otherwise require a full-file rewrite to change a few characters.',
    'Use `edit_file` only to replace the entire contents of a single file.',
    'Requires user approval.',
  ].join(' '),
  mutating: true,
  inputSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        description: 'One or more edits to apply. Order is preserved within a file.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            oldText: { type: 'string', description: 'Text to replace. Must occur exactly once in the file.' },
            newText: { type: 'string', description: 'Replacement text.' },
            expectedMtimeMs: { type: 'number', description: 'Optional mtime guard from a prior read_file.' },
          },
          required: ['path', 'oldText', 'newText'],
        },
        minItems: 1,
      },
    },
    required: ['edits'],
  },
  async handler(input, ctx) {
    if (!input || !Array.isArray(input.edits) || input.edits.length === 0) {
      throw new Error('apply_edits requires at least one edit')
    }
    const r: ApplyEditsResult = await ctx.workspace.applyEdits(input.edits)
    if (!r.ok) {
      const detail = r.error.matches != null
        ? ` (${r.error.matches} matches)`
        : r.error.detail ? `: ${r.error.detail}` : ''
      throw new Error(`${r.error.reason} for "${r.error.path}"${detail}`)
    }
    return { applied: r.applied }
  },
}
