import type {
  LLMAdapter, Message, ToolCall, ToolResult,
} from '../adapters/types'
import type { ChatMessage, ErrorInfo } from '../components/ChatPanel'
import type { ToolCtx } from '../tools/types'
import { getTool, toolSchemas } from '../tools/registry'
import { readFileContent } from '../lib/fs'
import type { CanvHistory } from '../lib/history'
import { getMcpToolDefs, callMcpTool, isMcpToolName } from './mcp'

function abortableApproval(
  ask: () => Promise<ApprovalDecision>,
  signal: AbortSignal,
): Promise<ApprovalDecision> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
  return new Promise<ApprovalDecision>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    ask().then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

export type ApprovalDecision = 'approve' | 'deny' | 'approve-rest'

function buildTools(): Promise<import('../adapters/types').ToolSchema[]> | import('../adapters/types').ToolSchema[] {
  // Sync return when the MCP bridge is absent (the default — and the case in
  // every unit test). `await` on a non-thenable still ticks the microtask
  // queue once, but skipping the async-wrapper avoids the listTools round-
  // trip and the extra promise allocations that would otherwise push the
  // first real `await` inside `runChatTurnInner` further out — which the
  // abort-during-streaming tests rely on landing inside `adapter.complete`.
  if (typeof window === 'undefined' || !window.canvMcp) return toolSchemas()
  return (async () => {
    const mcp = await getMcpToolDefs()
    const mcpSchemas = mcp.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema && typeof t.inputSchema === 'object'
        ? t.inputSchema
        : { type: 'object' }) as Record<string, unknown>,
    }))
    return [...toolSchemas(), ...mcpSchemas]
  })()
}

const FILE_MUTATING_TOOLS = new Set([
  'create_file', 'edit_file', 'apply_edits', 'create_folder', 'delete_file', 'rename_file',
])
const REGISTRY_TOOLS = new Set(['site_register', 'site_update'])

function pathInSitesSandbox(p: unknown): boolean {
  if (typeof p !== 'string') return false
  const norm = p.replace(/\\/g, '/').replace(/^\.\//, '')
  return norm === '.canv/site_index.yaml' || norm.startsWith('.canv/sites/')
}

export function pathIsAutoApproved(call: { name: string; input: unknown }): boolean {
  if (REGISTRY_TOOLS.has(call.name)) return true
  if (!FILE_MUTATING_TOOLS.has(call.name)) return false
  const input = (call.input ?? {}) as Record<string, unknown>
  if (call.name === 'rename_file') {
    return pathInSitesSandbox(input.from) && pathInSitesSandbox(input.to)
  }
  return pathInSitesSandbox(input.path)
}

/**
 * Discriminated union of preview shapes shown in the chat approval card.
 *
 * Most variants are file-mutating; `mcp` is a tool-call preview, and
 * `apply_edits` is a multi-file anchor-based preview that needs a richer
 * per-edit shape than the single-`path` mutating variants.
 */
export type WritePreview =
  | {
      kind: 'create' | 'edit' | 'delete' | 'rename' | 'mkdir' | 'mcp'
      path: string
      diff?: { before: string; after: string }
      newPath?: string
      size?: number
      contentPreview?: string
    }
  | {
      kind: 'apply_edits'
      /** Per-edit summary — one row per anchor, multiple rows can target the same file. */
      edits: Array<{ path: string; oldText: string; newText: string }>
    }

export interface RunChatTurnParams {
  adapter: LLMAdapter
  provider: 'anthropic' | 'openai' | 'ollama'
  /** Existing chat history INCLUDING the new user message. */
  history: ChatMessage[]
  /** Pre-built inventory block (workspace JSON + helper text). */
  inventoryText: string
  /** Profile chat system preamble. */
  systemPreamble: string
  /** Max tool rounds per user-turn. */
  toolBudget: number
  /** Context passed to tool handlers. */
  toolCtx: ToolCtx
  requestApproval: (call: ToolCall, preview: WritePreview) => Promise<ApprovalDecision>
  onUpdate: (next: ChatMessage[]) => void
  model: string
  maxTokens: number
  apiKey: string
  /** Provider-specific endpoint URL (Ollama). Cloud providers ignore this. */
  baseUrl?: string
  signal: AbortSignal
  chunkDelayMs?: number
  /** When provided, AI turns are bracketed with before/after snapshots. */
  historyClient?: CanvHistory | null
  onHistoryError?: (e: Error) => void
}

function affectedPathsForCall(call: { name: string; input: unknown }): string[] {
  const i = call.input as Record<string, unknown> | undefined
  if (!i) return []
  switch (call.name) {
    case 'create_file':
    case 'edit_file':
    case 'delete_file':
    case 'create_folder':
      return typeof i.path === 'string' ? [i.path] : []
    case 'rename_file':
      return [i.from, i.to].filter((p): p is string => typeof p === 'string')
    case 'apply_edits': {
      const edits = Array.isArray(i.edits) ? i.edits as Array<{ path?: unknown }> : []
      const paths = new Set<string>()
      for (const e of edits) {
        if (e && typeof e.path === 'string') paths.add(e.path)
      }
      return [...paths]
    }
    case 'site_register':
    case 'site_update':
      return typeof i.folder === 'string' ? [i.folder] : []
    default: return []
  }
}

function classifyError(err: unknown): ErrorInfo {
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
    // Should never reach here — abort is handled inline. Defensive only.
    return { kind: 'unknown', message: 'Aborted' }
  }
  // Prefer the provider's parsed `error.message` (e.g. Anthropic's "You have
  // reached your specified API usage limits…") over the wrapper text.
  const apiMessage = (err as { apiMessage?: string })?.apiMessage
  const rawMessage = err instanceof Error ? err.message : String(err)
  const message = apiMessage || rawMessage
  const statusCode = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { status?: number })?.status
  if (typeof statusCode === 'number') {
    if (statusCode === 429) return { kind: 'rate_limited', statusCode, message }
    if (statusCode >= 500) return { kind: 'server', statusCode, message }
    if (statusCode >= 400) return { kind: 'schema', statusCode, message }
  }
  if (/network|fetch|ECONNREF|ENOTFOUND|timeout/i.test(message)) {
    return { kind: 'network', message }
  }
  return { kind: 'unknown', message }
}

export async function runChatTurn(p: RunChatTurnParams): Promise<void> {
  const messages = [...p.history]
  try {
    await runChatTurnInner(p, messages)
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError' || p.signal.aborted) {
      // Aborted runs are handled inline by the inner function; nothing to do.
      return
    }
    const errorInfo = classifyError(err)
    const failedId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-err`
    // If the loop had already pushed an assistant message and is mid-stream,
    // mutate that one in place; otherwise append a fresh failed message.
    const last = messages[messages.length - 1]
    const canMutateLast = last && last.role === 'assistant' && !last.synthetic
    const failed: ChatMessage = canMutateLast
      ? { ...last, failureReason: 'provider_error', errorInfo }
      : { id: failedId, role: 'assistant', content: '', provider: p.provider, failureReason: 'provider_error', errorInfo }
    if (canMutateLast) {
      messages[messages.length - 1] = failed
    } else {
      messages.push(failed)
    }
    p.onUpdate(messages)
  }
}

async function runChatTurnInner(p: RunChatTurnParams, messages: ChatMessage[]): Promise<void> {
  const system = `${p.systemPreamble}\n\n${p.inventoryText}`
  let approveAll = false

  const historyClient = p.historyClient ?? null
  const aiMetadata = { provider: p.provider, model: p.model }
  let beforeSnapshotId: string | null = null
  const turnAffectedPaths = new Set<string>()

  const ensureBeforeSnapshot = async (toolName: string) => {
    if (!historyClient || beforeSnapshotId) return
    try {
      const entry = await historyClient.createSnapshot({
        reason: 'before_ai_edit',
        summary: 'Before AI edit',
        files: [],
        metadata: { toolName, ...aiMetadata },
      })
      beforeSnapshotId = entry.id
    } catch (e) {
      console.warn('[chatRunner] before_ai_edit snapshot failed', e)
      p.onHistoryError?.(e as Error)
    }
  }

  const flushAfterSnapshot = async () => {
    if (!historyClient || !beforeSnapshotId) return
    const files = Array.from(turnAffectedPaths).sort()
    try {
      await historyClient.createSnapshot({
        reason: 'after_ai_edit',
        summary: 'After AI edit',
        files,
        metadata: aiMetadata,
      })
      await historyClient.patchSnapshotFiles(beforeSnapshotId, files)
    } catch (e) {
      console.warn('[chatRunner] after_ai_edit snapshot failed', e)
      p.onHistoryError?.(e as Error)
    }
  }

  // Build the tool list once per turn. Native tools come from the static
  // registry; MCP tools are fetched from the host so the model sees the same
  // set the host can dispatch. Concatenated — never merged into the registry.
  const turnTools = await buildTools()
  try {
  for (let round = 0; round < p.toolBudget; round++) {
    if (p.signal.aborted) return
    const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${round}`
    let assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', provider: p.provider }
    messages.push(assistantMsg)
    p.onUpdate(messages)

    console.debug('[chatRunner] >>> adapter.complete round', round, 'historyLen=', messages.length - 1)
    const result = await p.adapter.complete({
      apiKey: p.apiKey, baseUrl: p.baseUrl, model: p.model, maxTokens: p.maxTokens,
      system,
      messages: toAdapterMessages(messages.slice(0, -1)),
      signal: p.signal,
      chunkDelayMs: p.chunkDelayMs,
      tools: turnTools,
      onToken: (chunk) => {
        assistantMsg = { ...assistantMsg, content: assistantMsg.content + chunk }
        messages[messages.length - 1] = assistantMsg
        p.onUpdate(messages)
      },
      onToolCallStart: (call) => {
        // Surface a partial tool_use block as soon as the model starts
        // composing it, so the UI shows a "running" chip while the input
        // streams. The chip becomes a final success/error chip — or an
        // approval card for mutating tools — once the round completes.
        const existing = assistantMsg.toolCalls ?? []
        if (existing.some((c) => c.id === call.id)) return
        assistantMsg = {
          ...assistantMsg,
          toolCalls: [...existing, { id: call.id, name: call.name, input: undefined }],
        }
        messages[messages.length - 1] = assistantMsg
        p.onUpdate(messages)
      },
    })
    console.debug('[chatRunner] <<< adapter.complete round', round, 'returned')

    // Always overwrite toolCalls with the adapter's authoritative completed
    // set. onToolCallStart writes partial entries (input: undefined) for UI
    // chip rendering during streaming; those partials must NOT persist past
    // adapter return. If result.toolCalls is empty (e.g. cancelled before any
    // content_block_stop), the partials are dropped — leaving them in place
    // produces an open tool_use on the next turn (Anthropic 400 / OpenAI 400).
    assistantMsg = {
      ...assistantMsg,
      content: result.text,
      toolCalls: result.toolCalls?.length ? result.toolCalls : undefined,
      ...(result.tokenUsage ? { tokenUsage: result.tokenUsage } : {}),
    }
    messages[messages.length - 1] = assistantMsg
    p.onUpdate(messages)

    console.debug('[chatRunner] round', round, 'stopReason=', result.stopReason, 'toolCalls=', result.toolCalls?.length ?? 0, 'textLen=', result.text.length)

    if (result.stopReason === 'cancelled') {
      const cancelledResults: ToolResult[] = (result.toolCalls ?? []).map((c) => ({
        id: c.id,
        content: 'Cancelled by user',
        isError: true,
      }))
      assistantMsg = {
        ...assistantMsg,
        content: result.text,
        failureReason: 'cancelled',
        ...(result.toolCalls?.length ? { toolCalls: result.toolCalls } : {}),
        ...(cancelledResults.length ? { toolResults: cancelledResults } : {}),
      }
      messages[messages.length - 1] = assistantMsg
      p.onUpdate(messages)
      return
    }

    if (result.stopReason !== 'tool_use' || !result.toolCalls?.length) {
      // If the model hit the token limit without finishing a tool call, the
      // user sees a half-finished prose response and no clue why nothing
      // happened. Append a synthetic note so the failure mode is legible.
      if (result.stopReason === 'max_tokens') {
        const note: ChatMessage = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-trunc`,
          role: 'assistant',
          content: '⚠️ Response was cut off at the model\'s output token limit before a tool call could be emitted. Try a smaller edit, ask the model to break the change into steps, or raise "Max output tokens" in Settings.',
          provider: p.provider,
          synthetic: true,
        }
        messages.push(note)
        p.onUpdate(messages)
      }
      return
    }

    if (p.signal.aborted) {
      const cancelledResults: ToolResult[] = (result.toolCalls ?? []).map((c) => ({
        id: c.id, content: 'Cancelled by user', isError: true,
      }))
      assistantMsg = {
        ...assistantMsg,
        failureReason: 'cancelled',
        ...(cancelledResults.length ? { toolResults: cancelledResults } : {}),
      }
      messages[messages.length - 1] = assistantMsg
      p.onUpdate(messages)
      return
    }

    const toolResults: ToolResult[] = []
    let cancelledMidLoop = false

    for (const call of result.toolCalls) {
      if (p.signal.aborted) {
        toolResults.push({ id: call.id, content: 'Cancelled by user', isError: true })
        cancelledMidLoop = true
        continue
      }

      // MCP tool calls — names use the "<server>::<tool>" form. Always
      // require approval in v1; route to the host MCP service.
      if (isMcpToolName(call.name)) {
        let decision: ApprovalDecision
        if (approveAll) {
          decision = 'approve'
        } else {
          try {
            decision = await abortableApproval(
              () => p.requestApproval(call, {
                kind: 'mcp',
                path: call.name,
                contentPreview: typeof call.input === 'string' ? call.input : JSON.stringify(call.input ?? {}),
              }),
              p.signal,
            )
          } catch (err) {
            if ((err as Error).name === 'AbortError' || p.signal.aborted) {
              toolResults.push({ id: call.id, content: 'Cancelled by user', isError: true })
              cancelledMidLoop = true
              continue
            }
            throw err
          }
        }
        if (decision === 'approve-rest') { approveAll = true; decision = 'approve' }
        if (decision === 'deny') {
          toolResults.push({ id: call.id, content: 'User denied this action', isError: true, isUserDenial: true })
          continue
        }
        try {
          const out = await callMcpTool(call.name, call.input)
          toolResults.push({ id: call.id, content: JSON.stringify(out) })
        } catch (e) {
          // Match the native-tool branch: aborts terminate the loop, real
          // errors become tool results so the model sees them next round.
          if ((e as Error).name === 'AbortError' || p.signal.aborted) {
            toolResults.push({ id: call.id, content: 'Cancelled by user', isError: true })
            cancelledMidLoop = true
            continue
          }
          const msg = e instanceof Error ? e.message : String(e)
          toolResults.push({ id: call.id, content: msg, isError: true })
        }
        continue
      }

      const tool = getTool(call.name)
      if (!tool) {
        toolResults.push({ id: call.id, content: `Unknown tool: ${call.name}`, isError: true })
        continue
      }
      console.debug('[chatRunner] dispatch', call.name, 'id=', call.id, 'mutating=', tool.mutating)

      if (tool.mutating) {
        let decision: ApprovalDecision
        if (approveAll || pathIsAutoApproved(call)) {
          decision = 'approve'
        } else {
          try {
            decision = await abortableApproval(
              async () => {
                const preview = await buildWritePreview(call, p.toolCtx)
                return p.requestApproval(call, preview)
              },
              p.signal,
            )
          } catch (err) {
            if ((err as Error).name === 'AbortError' || p.signal.aborted) {
              toolResults.push({ id: call.id, content: 'Cancelled by user', isError: true })
              cancelledMidLoop = true
              continue
            }
            throw err
          }
        }
        if (decision === 'approve-rest') { approveAll = true; decision = 'approve' }
        if (decision === 'deny') {
          toolResults.push({ id: call.id, content: 'User denied this action', isError: true, isUserDenial: true })
          continue
        }
        await ensureBeforeSnapshot(call.name)
        try {
          const out = await tool.handler(call.input, p.toolCtx)
          toolResults.push({ id: call.id, content: JSON.stringify(out) })
          affectedPathsForCall(call).forEach((pp) => turnAffectedPaths.add(pp))
        } catch (e) {
          if ((e as Error).name === 'AbortError' || p.signal.aborted) {
            toolResults.push({ id: call.id, content: 'Cancelled by user', isError: true })
            cancelledMidLoop = true
            continue
          }
          const msg = e instanceof Error ? e.message : String(e)
          toolResults.push({ id: call.id, content: msg, isError: true })
        }
        continue
      }

      // Read-only tools.
      try {
        const out = await tool.handler(call.input, p.toolCtx)
        console.debug('[chatRunner] dispatch done', call.name, 'id=', call.id)
        toolResults.push({ id: call.id, content: JSON.stringify(out) })
      } catch (e) {
        if ((e as Error).name === 'AbortError' || p.signal.aborted) {
          toolResults.push({ id: call.id, content: 'Cancelled by user', isError: true })
          cancelledMidLoop = true
          continue
        }
        const msg = e instanceof Error ? e.message : String(e)
        toolResults.push({ id: call.id, content: msg, isError: true })
      }
    }

    assistantMsg = {
      ...assistantMsg,
      toolResults,
      ...(cancelledMidLoop ? { failureReason: 'cancelled' as const } : {}),
    }
    messages[messages.length - 1] = assistantMsg
    p.onUpdate(messages)

    if (cancelledMidLoop) return
  }
  // Budget exhausted — request a final answer with tools dropped.
  if (p.signal.aborted) return
  const finaliserId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-final`
  let finalMsg: ChatMessage = { id: finaliserId, role: 'assistant', content: '', provider: p.provider }
  messages.push(finalMsg)
  p.onUpdate(messages)

  const finalResult = await p.adapter.complete({
    apiKey: p.apiKey, baseUrl: p.baseUrl, model: p.model, maxTokens: p.maxTokens,
    system: `${system}\n\nYou have used your tool budget — write your final answer without further tool calls.`,
    messages: toAdapterMessages(messages.slice(0, -1)),
    signal: p.signal,
    chunkDelayMs: p.chunkDelayMs,
    onToken: (chunk) => {
      finalMsg = { ...finalMsg, content: finalMsg.content + chunk }
      messages[messages.length - 1] = finalMsg
      p.onUpdate(messages)
    },
  })
  finalMsg = {
    ...finalMsg,
    content: finalResult.text,
    ...(finalResult.tokenUsage ? { tokenUsage: finalResult.tokenUsage } : {}),
  }
  messages[messages.length - 1] = finalMsg
  p.onUpdate(messages)
  } finally {
    await flushAfterSnapshot()
  }
}

function toAdapterMessages(history: ChatMessage[]): Message[] {
  const out: Message[] = []
  for (const m of history) {
    // Drop failed/cancelled/denied turns wholesale — they have no clean
    // content for the provider and may carry orphan tool_use blocks. Any
    // partial toolResults (e.g. tools that ran before a mid-turn cancel)
    // are intentionally dropped along with them; the next turn re-runs from
    // the user's preceding prompt. Synthetic notes (e.g. the max-tokens
    // warning) are also dropped — they're UI-only markers.
    if (m.failureReason || m.synthetic) continue
    if (m.role === 'assistant') {
      const am: Message = m.toolCalls && m.toolCalls.length
        ? { role: 'assistant', content: m.content, toolCalls: m.toolCalls }
        : { role: 'assistant', content: m.content }
      out.push(am)
      if (m.toolResults && m.toolResults.length) {
        out.push({ role: 'tool', toolResults: m.toolResults })
      }
    } else {
      out.push({ role: 'user', content: m.content })
    }
  }
  return out
}

// Re-export types used by callers (avoids App.tsx importing from adapters/types).
export type { ToolResult, ToolCall }

async function buildWritePreview(call: ToolCall, ctx: ToolCtx): Promise<WritePreview> {
  const input = (call.input ?? {}) as Record<string, unknown>
  const path = typeof input.path === 'string' ? input.path : ''
  const newContent = typeof input.content === 'string' ? input.content : ''
  switch (call.name) {
    case 'create_file':
      return {
        kind: 'create',
        path,
        size: newContent.length,
        contentPreview: newContent.split('\n').slice(0, 20).join('\n'),
      }
    case 'edit_file': {
      let before: string
      try {
        if (ctx.activeDocPath === path) {
          before = ctx.getEditorContent(path) ?? ''
        } else {
          before = await readFileContent(ctx.fs, path)
        }
      } catch { before = '' }
      return { kind: 'edit', path, diff: { before, after: newContent } }
    }
    case 'apply_edits': {
      const rawEdits = Array.isArray(input.edits) ? input.edits as Array<Record<string, unknown>> : []
      const edits = rawEdits.map((e) => ({
        path: typeof e.path === 'string' ? e.path : '',
        oldText: typeof e.oldText === 'string' ? e.oldText : '',
        newText: typeof e.newText === 'string' ? e.newText : '',
      }))
      return { kind: 'apply_edits', edits }
    }
    case 'delete_file':
      return { kind: 'delete', path }
    case 'rename_file':
      return {
        kind: 'rename',
        path,
        newPath: typeof input.to === 'string' ? input.to : '',
      }
    case 'create_folder':
      return { kind: 'mkdir', path }
    default:
      return { kind: 'edit', path }
  }
}
