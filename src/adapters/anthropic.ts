import type { LLMAdapter, CompleteParams, CompleteResult, Message } from './types'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

function parseAnthropicUsage(raw: unknown): { input: number; output: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as { input_tokens?: unknown; output_tokens?: unknown }
  if (typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null
  return { input: u.input_tokens, output: u.output_tokens }
}

function parseStopDetails(raw: unknown): { category: string | null; explanation: string | null } {
  const d = (raw && typeof raw === 'object' ? raw : {}) as { category?: unknown; explanation?: unknown }
  return {
    category: typeof d.category === 'string' ? d.category : null,
    explanation: typeof d.explanation === 'string' ? d.explanation : null,
  }
}

function anthropicMessages(messages: Message[]): Array<{ role: 'user' | 'assistant'; content: unknown }> {
  return messages.map((m) => {
    if (m.role === 'system') return { role: 'user', content: m.content }
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: m.toolResults.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      }
    }
    if (m.role === 'assistant' && (m.toolCalls?.length || m.thinkingBlocks?.length)) {
      const blocks: unknown[] = []
      // Thinking blocks must be passed back exactly as received — the API
      // verifies the signature and rejects modified blocks. They go first:
      // a thinking block must precede the tool_use it reasoned about.
      if (m.thinkingBlocks) blocks.push(...m.thinkingBlocks)
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input })
      return { role: 'assistant', content: blocks }
    }
    return { role: m.role, content: m.content }
  })
}

export const anthropicAdapter: LLMAdapter = {
  id: 'anthropic',
  name: 'Anthropic',
  models: ['claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const { messages, system, model, maxTokens = 2048, signal, onToken, apiKey } = params

    if (!apiKey) throw new Error('Missing Anthropic API key')

    try {
      const useStream = typeof onToken === 'function'

      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages(messages),
        stream: useStream,
      }
      if (system) body.system = system
      if (params.tools && params.tools.length) {
        body.tools = params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }))
      }

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let apiMessage: string | undefined
        try {
          const j = JSON.parse(text) as { error?: { message?: string } }
          if (typeof j.error?.message === 'string') apiMessage = j.error.message
        } catch { /* not JSON */ }
        const err = new Error(`Anthropic ${res.status}: ${apiMessage || text || res.statusText}`) as Error & { status?: number; apiMessage?: string }
        err.status = res.status
        if (apiMessage) err.apiMessage = apiMessage
        throw err
      }

      if (!useStream) {
        const data = await res.json()
        const blocks: Array<Record<string, unknown>> = Array.isArray(data?.content) ? data.content : []
        let text = ''
        const toolCalls: Array<{ id: string; name: string; input: unknown }> = []
        const thinkingBlocks: unknown[] = []
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string') text += b.text
          else if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
            toolCalls.push({ id: b.id, name: b.name, input: b.input ?? {} })
          } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
            // Kept verbatim — the signature must round-trip unmodified.
            thinkingBlocks.push(b)
          }
        }
        const usage = parseAnthropicUsage(data?.usage)
        const stop = data?.stop_reason
        const stopReason: CompleteResult['stopReason'] =
          stop === 'tool_use' ? 'tool_use'
          : stop === 'max_tokens' ? 'max_tokens'
          : stop === 'stop_sequence' ? 'stop_sequence'
          : stop === 'refusal' ? 'refusal'
          : 'end_turn'
        return {
          text,
          truncated: stop === 'max_tokens',
          stopReason,
          ...(toolCalls.length ? { toolCalls } : {}),
          ...(thinkingBlocks.length ? { thinkingBlocks } : {}),
          ...(stopReason === 'refusal' ? { refusal: parseStopDetails(data?.stop_details) } : {}),
          ...(usage ? { tokenUsage: usage } : {}),
        }
      }

      return await readSSE(res, onToken!, params.onToolCallStart, signal, params.chunkDelayMs ?? 0)
    } catch (err) {
      if ((err as Error).name === 'AbortError' && signal?.aborted) {
        return { text: '', truncated: false, stopReason: 'cancelled' }
      }
      throw err
    }
  },
}

interface PendingToolBlock { id: string; name: string; jsonBuf: string }

async function readSSE(
  res: Response,
  onToken: (chunk: string) => void,
  onToolCallStart: ((call: { id: string; name: string }) => void) | undefined,
  signal: AbortSignal | undefined,
  chunkDelayMs: number,
): Promise<CompleteResult> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()

  // Queue holds only text chunks that need paced dispatch.
  // onToolCallStart is fired immediately from the wire reader (no pacing needed).
  const queue: string[] = []
  let wireDone = false
  let wireError = null as Error | null

  // ----- accumulator state (filled by wire reader, read by both paths) -----
  let buffer = ''
  let full = ''
  let truncated = false
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let currentEvent = 'message'
  let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'refusal' = 'end_turn'
  let refusal: { category: string | null; explanation: string | null } | null = null
  const blocksByIndex = new Map<number, PendingToolBlock>()
  const completedToolCalls: Array<{ id: string; name: string; input: unknown }> = []
  // Thinking blocks are accumulated per index (thinking_delta + signature_delta)
  // and pushed on content_block_stop so completed blocks round-trip verbatim.
  const thinkingByIndex = new Map<number, Record<string, unknown>>()
  const completedThinking: unknown[] = []

  // ----- wire reader coroutine: full speed, no pacing -----
  const wirePromise = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) { wireDone = true; return }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const raw of lines) {
          const line = raw.trim()
          if (!line) { currentEvent = 'message'; continue }
          if (line.startsWith('event:')) { currentEvent = line.slice(6).trim(); continue }
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          let parsed: unknown
          try { parsed = JSON.parse(payload) } catch { continue }
          const p = parsed as Record<string, unknown>

          if (currentEvent === 'message_start') {
            const usage = (p.message as { usage?: { input_tokens?: number } } | undefined)?.usage
            if (usage && typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens
          } else if (currentEvent === 'content_block_start') {
            const block = p.content_block as { type?: string; id?: string; name?: string } | undefined
            const idx = p.index as number
            if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
              blocksByIndex.set(idx, { id: block.id, name: block.name, jsonBuf: '' })
              // Fire immediately — tool-call starts are not paced
              onToolCallStart?.({ id: block.id, name: block.name })
            } else if (block?.type === 'thinking') {
              thinkingByIndex.set(idx, { type: 'thinking', thinking: '', signature: '' })
            } else if (block?.type === 'redacted_thinking') {
              // Arrives complete in content_block_start — keep it verbatim.
              thinkingByIndex.set(idx, { ...(block as Record<string, unknown>) })
            }
          } else if (currentEvent === 'content_block_delta') {
            const idx = p.index as number
            const delta = p.delta as { type?: string; text?: string; partial_json?: string; thinking?: string; signature?: string } | undefined
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              // full is updated at dispatch time so out.text matches what onToken received
              queue.push(delta.text)
            } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
              const blk = blocksByIndex.get(idx)
              if (blk) blk.jsonBuf += delta.partial_json
            } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
              const blk = thinkingByIndex.get(idx)
              if (blk) blk.thinking = String(blk.thinking ?? '') + delta.thinking
            } else if (delta?.type === 'signature_delta' && typeof delta.signature === 'string') {
              const blk = thinkingByIndex.get(idx)
              if (blk) blk.signature = delta.signature
            }
          } else if (currentEvent === 'content_block_stop') {
            const idx = p.index as number
            const blk = blocksByIndex.get(idx)
            if (blk) {
              let input: unknown = {}
              if (blk.jsonBuf) { try { input = JSON.parse(blk.jsonBuf) } catch { input = {} } }
              completedToolCalls.push({ id: blk.id, name: blk.name, input })
              blocksByIndex.delete(idx)
            }
            const think = thinkingByIndex.get(idx)
            if (think) {
              completedThinking.push(think)
              thinkingByIndex.delete(idx)
            }
          } else if (currentEvent === 'message_delta') {
            const d = p.delta as { stop_reason?: string; stop_details?: unknown } | undefined
            const stop = d?.stop_reason
            if (stop === 'max_tokens') { truncated = true; stopReason = 'max_tokens' }
            else if (stop === 'tool_use') stopReason = 'tool_use'
            else if (stop === 'stop_sequence') stopReason = 'stop_sequence'
            else if (stop === 'end_turn') stopReason = 'end_turn'
            else if (stop === 'refusal') {
              stopReason = 'refusal'
              refusal = parseStopDetails(d?.stop_details ?? (p as { stop_details?: unknown }).stop_details)
            }
            const usage = (p.usage as { output_tokens?: number } | undefined)
            if (usage && typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens
          }
        }
      }
    } catch (err) {
      wireError = err as Error
      wireDone = true
    }
  })()

  // ----- dispatch loop: paced -----
  let lastDispatchAt = 0
  const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

  try {
    while (!wireDone || queue.length > 0) {
      if (queue.length === 0) {
        // If already aborted, stop waiting for more wire data — but the queued
        // items above have already been drained so we're done.
        if (signal?.aborted) break
        // Yield until the wire reader either pushes more events or completes.
        await Promise.race([wirePromise, sleep(5)])
        continue
      }
      const text = queue.shift()!
      if (chunkDelayMs > 0) {
        const elapsed = Date.now() - lastDispatchAt
        if (elapsed < chunkDelayMs) await sleep(chunkDelayMs - elapsed)
        // Check abort after sleeping — this is where slow-mode cancellation fires
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      }
      onToken(text)
      full += text
      lastDispatchAt = Date.now()
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError' || signal?.aborted) {
      try { await reader.cancel() } catch { /* already closed */ }
      return {
        text: full,
        truncated: false,
        stopReason: 'cancelled',
        ...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
        ...(completedThinking.length ? { thinkingBlocks: completedThinking } : {}),
        ...(inputTokens != null && outputTokens != null
          ? { tokenUsage: { input: inputTokens, output: outputTokens } }
          : {}),
      }
    }
    throw err
  }

  // Drain complete — check if abort or wire error drove us here
  if (signal?.aborted || wireError?.name === 'AbortError') {
    try { await reader.cancel() } catch { /* already closed */ }
    return {
      text: full,
      truncated: false,
      stopReason: 'cancelled',
      ...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
      ...(completedThinking.length ? { thinkingBlocks: completedThinking } : {}),
      ...(inputTokens != null && outputTokens != null
        ? { tokenUsage: { input: inputTokens, output: outputTokens } }
        : {}),
    }
  }

  if (wireError) throw wireError

  return {
    text: full,
    truncated,
    stopReason,
    ...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
    ...(completedThinking.length ? { thinkingBlocks: completedThinking } : {}),
    ...(refusal ? { refusal } : {}),
    ...(inputTokens != null && outputTokens != null
      ? { tokenUsage: { input: inputTokens, output: outputTokens } }
      : {}),
  }
}
