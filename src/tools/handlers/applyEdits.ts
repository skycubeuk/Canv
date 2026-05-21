import type { Tool } from '../types'
import type { AnchorEdit, ApplyEditsErrorPayload, ApplyEditsResult } from '../../services/workspaceEdits'

interface Input {
  edits: AnchorEdit[]
}

interface Output {
  applied: Array<{ path: string; mtimeMs: number }>
}

/**
 * Human-readable failure messages. The model copy-pastes these into chat, so
 * the prose IS the user experience — keep them explanatory, not jargony.
 * Each message still carries the keywords ("appears N times", "changed on
 * disk", "not found") the model can use to choose a retry strategy.
 */
export function formatApplyEditsError(error: ApplyEditsErrorPayload): string {
  const rollback = error.rollbackFailed && error.rollbackFailed.length > 0
    ? ` The rollback of ${error.rollbackFailed.join(', ')} also failed, so the workspace may be in a half-written state — ask the user to verify those files.`
    : ''
  switch (error.reason) {
    case 'anchor-not-found':
      return `Could not edit "${error.path}": the text to replace was not found. Re-read the file before retrying.${rollback}`
    case 'anchor-not-unique':
      return `Could not edit "${error.path}": the text to replace appears ${error.matches} times in the file, so it's ambiguous which occurrence to change. Add 1–3 lines of surrounding context to oldText to make the match unique, then retry.${rollback}`
    case 'file-not-found':
      return `Could not edit "${error.path}": the file does not exist in this workspace.${rollback}`
    case 'path-outside-workspace':
      return `Could not edit "${error.path}": the path is outside the workspace${error.detail ? ` (${error.detail})` : ''}.${rollback}`
    case 'stale-mtime':
      return `Could not edit "${error.path}": the file changed on disk since you last read it. Re-read the file and retry.${rollback}`
    case 'file-dirty':
      return `Could not edit "${error.path}": the user has unsaved changes in this file. Ask them to save first, then retry.${rollback}`
    case 'write-failed':
      return `Could not edit "${error.path}": the file write failed${error.detail ? ` (${error.detail})` : ''}. No files were changed.${rollback}`
    case 'unsupported-remote':
      return `Could not edit "${error.path}": apply_edits does not yet support remote (SSH) workspaces. Ask the user to open this workspace locally.`
    default:
      return `Could not edit "${error.path}": ${error.reason}${error.detail ? ` (${error.detail})` : ''}.${rollback}`
  }
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
      throw new Error(formatApplyEditsError(r.error))
    }
    return { applied: r.applied }
  },
}
