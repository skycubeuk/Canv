import type {
  LLMAdapter, Message, ToolCall, ToolResult,
} from '../adapters/types'
import type { ChatMessage, ErrorInfo } from '../components/ChatPanel'
import type { ToolCtx } from '../tools/types'
import { getTool, toolSchemas } from '../tools/registry'

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

export interface WritePreview {
  kind: 'create' | 'edit' | 'delete' | 'rename' | 'mkdir'
  path: string
  diff?: { before: string; after: string }
  newPath?: string
  size?: number
  contentPreview?: string
}

export interface RunChatTurnParams {
  adapter: LLMAdapter
  provider: 'anthropic' | 'openai'
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
  signal: AbortSignal
  chunkDelayMs?: number
}

function classifyError(err: unknown): ErrorInfo {
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
    // Should never reach here — abort is handled inline. Defensive only.
    return { kind: 'unknown', message: 'Aborted' }
  }
  const message = err instanceof Error ? err.message : String(err)
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

  for (let round = 0; round < p.toolBudget; round++) {
    if (p.signal.aborted) return
    const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${round}`
    let assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', provider: p.provider }
    messages.push(assistantMsg)
    p.onUpdate(messages)

    console.debug('[chatRunner] >>> adapter.complete round', round, 'historyLen=', messages.length - 1)
    const result = await p.adapter.complete({
      apiKey: p.apiKey, model: p.model, maxTokens: p.maxTokens,
      system,
      messages: toAdapterMessages(messages.slice(0, -1)),
      signal: p.signal,
      chunkDelayMs: p.chunkDelayMs,
      tools: toolSchemas(),
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

      const tool = getTool(call.name)
      if (!tool) {
        toolResults.push({ id: call.id, content: `Unknown tool: ${call.name}`, isError: true })
        continue
      }
      console.debug('[chatRunner] dispatch', call.name, 'id=', call.id, 'mutating=', tool.mutating)

      if (tool.mutating) {
        let decision: ApprovalDecision
        if (approveAll) {
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
        try {
          const out = await tool.handler(call.input, p.toolCtx)
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
    apiKey: p.apiKey, model: p.model, maxTokens: p.maxTokens,
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
  finalMsg = { ...finalMsg, content: finalResult.text }
  messages[messages.length - 1] = finalMsg
  p.onUpdate(messages)
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
          const r = await ctx.fs.readFile(path)
          before = r.content
        }
      } catch { before = '' }
      return { kind: 'edit', path, diff: { before, after: newContent } }
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
