import type { CanvFs } from '../lib/fs'
import type { ToolSchema } from '../adapters/types'
import type { AnchorEdit, ApplyEditsResult } from '../services/workspaceEdits'

export type JSONSchema = Record<string, unknown>

export interface ToolCtx {
  fs: CanvFs
  /** Workspace-relative path of the active editor doc, or null if none open. */
  activeDocPath: string | null
  /** Returns the live editor buffer when `path` matches the active doc; null otherwise. */
  getEditorContent: (path: string) => string | null
  /** Replaces the active editor's full document; only valid when `path === activeDocPath`. */
  applyEditorEdit: (path: string, newContent: string) => Promise<void>
  /** Workspace-service surface for tools that need cross-file primitives. */
  workspace: {
    applyEdits: (edits: AnchorEdit[]) => Promise<ApplyEditsResult>
  }
  signal: AbortSignal
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  inputSchema: JSONSchema
  mutating: boolean
  handler: (input: TInput, ctx: ToolCtx) => Promise<TOutput>
}

/** Convert a Tool to the provider-neutral schema sent to LLM adapters. */
export function toToolSchema(tool: Tool): ToolSchema {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema }
}
