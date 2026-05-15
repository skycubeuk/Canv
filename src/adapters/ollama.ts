import type {
  LLMAdapter, CompleteParams, CompleteResult, Message, StopReason, ToolCall, ToolSchema,
} from './types'

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}

function ollamaMessages(system: string | undefined, messages: Message[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'tool') {
      for (const r of m.toolResults) {
        out.push({ role: 'tool', content: r.content, tool_call_id: r.id })
      }
    } else if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content ?? '' }
      if (m.toolCalls && m.toolCalls.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          function: { name: c.name, arguments: c.input ?? {} },
        }))
      }
      out.push(msg)
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

function ollamaTools(tools: ToolSchema[] | undefined): Array<Record<string, unknown>> | undefined {
  if (!tools || !tools.length) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

function mapStopReason(reason: string | undefined): { stopReason: StopReason; truncated: boolean } {
  if (reason === 'length') return { stopReason: 'max_tokens', truncated: true }
  if (reason === 'stop') return { stopReason: 'end_turn', truncated: false }
  return { stopReason: 'end_turn', truncated: false }
}

function parseToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return []
  const out: ToolCall[] = []
  raw.forEach((tc, idx) => {
    const fn = (tc as { function?: { name?: unknown; arguments?: unknown } }).function
    if (!fn || typeof fn.name !== 'string') return
    const args = fn.arguments
    // Ollama returns arguments as an object; some compat layers send a JSON string.
    let input: unknown = {}
    if (args && typeof args === 'object') input = args
    else if (typeof args === 'string' && args) {
      try { input = JSON.parse(args) } catch { input = {} }
    }
    out.push({ id: `ollama_tc_${idx}`, name: fn.name, input })
  })
  return out
}

export const ollamaAdapter: LLMAdapter = {
  id: 'ollama',
  name: 'Ollama',
  models: ['llama3.1', 'qwen2.5', 'mistral'],

  async listModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
    const url = `${stripTrailingSlash(baseUrl)}/api/tags`
    const res = await fetch(url, { signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Ollama ${res.status}: ${body || res.statusText}`)
    }
    const data = await res.json() as { models?: Array<{ name?: string }> }
    return (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
  },

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const { messages, system, model, maxTokens = 2048, signal, onToken, baseUrl } = params
    if (!baseUrl) throw new Error('Ollama: missing baseUrl')

    const useStream = typeof onToken === 'function'
    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages(system, messages),
      stream: useStream,
      options: { num_predict: maxTokens },
    }
    const tools = ollamaTools(params.tools)
    if (tools) body.tools = tools

    const url = `${stripTrailingSlash(baseUrl)}/api/chat`

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`Ollama ${res.status}: ${text || res.statusText}`) as Error & { status?: number }
        err.status = res.status
        throw err
      }

      if (!useStream) {
        const data = await res.json() as {
          message?: { content?: string; tool_calls?: unknown }
          done_reason?: string
          prompt_eval_count?: number
          eval_count?: number
        }
        const text = data.message?.content ?? ''
        const { stopReason, truncated } = mapStopReason(data.done_reason)
        const toolCalls = parseToolCalls(data.message?.tool_calls)
        const usage = (typeof data.prompt_eval_count === 'number' && typeof data.eval_count === 'number')
          ? { input: data.prompt_eval_count, output: data.eval_count }
          : null
        return {
          text,
          truncated,
          stopReason: toolCalls.length ? 'tool_use' : stopReason,
          ...(toolCalls.length ? { toolCalls } : {}),
          ...(usage ? { tokenUsage: usage } : {}),
        }
      }

      return await readNDJSON(res, onToken!, params.onToolCallStart, signal, params.chunkDelayMs ?? 0)
    } catch (err) {
      if ((err as Error).name === 'AbortError' && signal?.aborted) {
        return { text: '', truncated: false, stopReason: 'cancelled' }
      }
      throw err
    }
  },
}

// Streaming implementation lands in Task 6.
async function readNDJSON(
  _res: Response,
  _onToken: (chunk: string) => void,
  _onToolCallStart: ((call: { id: string; name: string }) => void) | undefined,
  _signal: AbortSignal | undefined,
  _chunkDelayMs: number,
): Promise<CompleteResult> {
  throw new Error('ollama streaming: not implemented yet')
}
