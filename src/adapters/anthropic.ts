import type { LLMAdapter, CompleteParams, CompleteResult, Message } from './types'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

function parseAnthropicUsage(raw: unknown): { input: number; output: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as { input_tokens?: unknown; output_tokens?: unknown }
  if (typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null
  return { input: u.input_tokens, output: u.output_tokens }
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
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      const blocks: Array<Record<string, unknown>> = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const c of m.toolCalls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input })
      return { role: 'assistant', content: blocks }
    }
    return { role: m.role, content: m.content }
  })
}

export const anthropicAdapter: LLMAdapter = {
  id: 'anthropic',
  name: 'Anthropic',
  models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],

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
        throw new Error(`Anthropic ${res.status}: ${text || res.statusText}`)
      }

      if (!useStream) {
        const data = await res.json()
        const blocks: Array<Record<string, unknown>> = Array.isArray(data?.content) ? data.content : []
        let text = ''
        const toolCalls: Array<{ id: string; name: string; input: unknown }> = []
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string') text += b.text
          else if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
            toolCalls.push({ id: b.id, name: b.name, input: b.input ?? {} })
          }
        }
        const usage = parseAnthropicUsage(data?.usage)
        const stop = data?.stop_reason
        const stopReason: CompleteResult['stopReason'] =
          stop === 'tool_use' ? 'tool_use'
          : stop === 'max_tokens' ? 'max_tokens'
          : stop === 'stop_sequence' ? 'stop_sequence'
          : 'end_turn'
        return {
          text,
          truncated: stop === 'max_tokens',
          stopReason,
          ...(toolCalls.length ? { toolCalls } : {}),
          ...(usage ? { tokenUsage: usage } : {}),
        }
      }

      return await readSSE(res, onToken!, params.onToolCallStart, signal)
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
  onToolCallStart?: (call: { id: string; name: string }) => void,
  signal?: AbortSignal,
): Promise<CompleteResult> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let truncated = false
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let currentEvent = 'message'
  let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' = 'end_turn'

  const blocksByIndex = new Map<number, PendingToolBlock>()
  const completedToolCalls: Array<{ id: string; name: string; input: unknown }> = []

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
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
            onToolCallStart?.({ id: block.id, name: block.name })
          }
        } else if (currentEvent === 'content_block_delta') {
          const idx = p.index as number
          const delta = p.delta as { type?: string; text?: string; partial_json?: string } | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            onToken(delta.text); full += delta.text
          } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            const blk = blocksByIndex.get(idx)
            if (blk) blk.jsonBuf += delta.partial_json
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
        } else if (currentEvent === 'message_delta') {
          const stop = (p.delta as { stop_reason?: string } | undefined)?.stop_reason
          if (stop === 'max_tokens') { truncated = true; stopReason = 'max_tokens' }
          else if (stop === 'tool_use') stopReason = 'tool_use'
          else if (stop === 'stop_sequence') stopReason = 'stop_sequence'
          else if (stop === 'end_turn') stopReason = 'end_turn'
          const usage = (p.usage as { output_tokens?: number } | undefined)
          if (usage && typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError' || signal?.aborted) {
      try { await reader.cancel() } catch { /* already closed */ }
      return {
        text: full,
        truncated: false,
        stopReason: 'cancelled',
        ...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
        ...(inputTokens != null && outputTokens != null
          ? { tokenUsage: { input: inputTokens, output: outputTokens } }
          : {}),
      }
    }
    throw err
  }

  return {
    text: full,
    truncated,
    stopReason,
    ...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
    ...(inputTokens != null && outputTokens != null
      ? { tokenUsage: { input: inputTokens, output: outputTokens } }
      : {}),
  }
}
