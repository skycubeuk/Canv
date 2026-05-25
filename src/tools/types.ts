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
  /** Read/edit annotations on the active document. */
  annotations: AnnotationsCapability
  signal: AbortSignal
}

/** Chat-safe projection of an annotation. Address by `id` (update/remove) or by `quote` (add). */
export interface AnnotationView {
  id: string
  quote: string
  note: string
  author: string
  status: 'open' | 'invalidated'
  suggestedReplacement?: string
}

/** Annotation operations exposed to chat tools, scoped to the active document. */
export interface AnnotationsCapability {
  /** Open annotations on the active doc; null when `path` is not the active doc. */
  list: (path: string) => AnnotationView[] | null
  /** Anchor a note to a unique `quote`; throws on 0/>1 matches or non-active path. Returns the new id. */
  add: (path: string, a: { quote: string; note: string; suggestedReplacement?: string }) => { id: string }
  /** Patch an existing annotation; throws on unknown id or non-active path. */
  update: (path: string, a: { id: string; note?: string; suggestedReplacement?: string }) => void
  /** Remove an annotation by id; throws on unknown id or non-active path. */
  remove: (path: string, id: string) => void
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
