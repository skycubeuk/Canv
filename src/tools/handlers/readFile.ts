import type { Tool } from '../types'
import { validateToolPath } from '../paths'
import { findEntry } from '../../lib/fs'

const MAX_READ_BYTES = 1024 * 1024

interface Input { path: string }
interface Output { content: string; mtimeMs: number }

export const readFileTool: Tool<Input, Output> = {
  name: 'read_file',
  description:
    'Read the full text of a workspace file. Caps: ≤1MB, non-binary. ' +
    'For very large files use search_workspace to find the relevant region first. ' +
    "When the requested path matches the user's currently-open document, you receive the live editor buffer (which may differ from disk).",
  mutating: false,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Workspace-relative file path.' } },
    required: ['path'],
  },
  async handler(input, ctx) {
    const v = validateToolPath(input?.path ?? '')
    if (!v.ok) throw new Error(v.error)

    const root = await ctx.fs.listDir('')
    const entry = findEntry(root, v.rel)
    if (!entry) throw new Error(`File not found: ${v.rel}`)
    if (entry.kind !== 'file') throw new Error(`Not a file: ${v.rel}`)
    if (entry.binary) throw new Error(`File is binary: ${v.rel}. Try search_workspace or ask the user.`)
    if (entry.size > MAX_READ_BYTES) {
      throw new Error(`File too large (${entry.size} bytes, limit ${MAX_READ_BYTES}): ${v.rel}. Try search_workspace.`)
    }

    if (ctx.activeDocPath === v.rel) {
      const live = ctx.getEditorContent(v.rel)
      if (live !== null) return { content: live, mtimeMs: entry.mtimeMs }
    }
    const r = await ctx.fs.readFile(v.rel)
    return { content: r.content, mtimeMs: r.mtimeMs }
  },
}
