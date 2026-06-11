import type {
  LLMAdapter, CompleteParams, CompleteResult, Message, StopReason, ToolCall, ToolSchema,
} from './types'
import { dispatchStream } from './streamDispatch'

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
    const tcObj = tc as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
    const fn = tcObj.function
    if (!fn || typeof fn.name !== 'string') return
    const args = fn.arguments
    // Ollama returns arguments as an object; some compat layers send a JSON string.
    let input: unknown = {}
    if (args && typeof args === 'object') input = args
    else if (typeof args === 'string' && args) {
      try { input = JSON.parse(args) } catch { input = {} }
    }
    // Ollama 0.23+ supplies a native id (`call_*`); fall back to synthesising
    // one for older daemons where the wire format didn't carry one.
    const nativeId = typeof tcObj.id === 'string' && tcObj.id ? tcObj.id : null
    out.push({ id: nativeId ?? `ollama_tc_${idx}`, name: fn.name, input })
  })
  return out
}

export const ollamaAdapter: LLMAdapter = {
  id: 'ollama',
  name: 'Ollama',
  models: [],

  async listModels(auth: { baseUrl?: string }, signal?: AbortSignal): Promise<string[]> {
    if (!auth.baseUrl) throw new Error('Ollama: missing baseUrl')
    const url = `${stripTrailingSlash(auth.baseUrl)}/api/tags`
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
      // num_ctx default is 4096 in current Ollama; Canv's chat preamble +
      // workspace inventory + tool schemas routinely exceed that. When the
      // prompt overflows num_ctx, Ollama silently drops the oldest tokens —
      // which often includes the tool definitions appended high in context.
      // Result: the model "forgets" it has tools and answers from memory.
      //
      // 32768 lets us fit a full chapter (~5K tokens) plus preamble, inventory,
      // tools, and meaningful history. Pair this with q8_0 KV-cache quant on
      // the daemon (OLLAMA_FLASH_ATTENTION=1, OLLAMA_KV_CACHE_TYPE=q8_0) to
      // keep KV memory around ~900 MB on a 9B model — comfortable on a 12 GB
      // GPU.
      options: { num_predict: maxTokens, num_ctx: 32768 },
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

async function readNDJSON(
  res: Response,
  onToken: (chunk: string) => void,
  onToolCallStart: ((call: { id: string; name: string }) => void) | undefined,
  signal: AbortSignal | undefined,
  chunkDelayMs: number,
): Promise<CompleteResult> {
  // ----- accumulator state (filled by parseLine, read by buildResult) -----
  let truncated = false
  let stopReason: StopReason = 'end_turn'
  let usageOut: { input: number; output: number } | null = null
  let finalToolCalls: ToolCall[] = []

  const parseLine = (line: string, emit: (text: string) => void): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: unknown
    try { parsed = JSON.parse(trimmed) } catch { return }
    const p = parsed as {
      message?: { content?: string; tool_calls?: unknown }
      done?: boolean
      done_reason?: string
      prompt_eval_count?: number
      eval_count?: number
    }
    const chunk = p.message?.content
    if (typeof chunk === 'string' && chunk.length) emit(chunk)
    // Extract tool_calls on ANY line, not just done:true. Ollama 0.23+ emits
    // them mid-stream; earlier versions only on the final line. The spec
    // assumed final-only — that assumption no longer holds.
    if (p.message?.tool_calls) {
      const tcs = parseToolCalls(p.message.tool_calls)
      if (tcs.length) {
        finalToolCalls = tcs
        stopReason = 'tool_use'
        for (const c of tcs) onToolCallStart?.({ id: c.id, name: c.name })
      }
    }
    if (p.done) {
      const mapped = mapStopReason(p.done_reason)
      // Don't clobber 'tool_use' set above when a tool call arrived earlier
      // in the stream and the daemon then closes with done_reason:'stop'.
      if (!finalToolCalls.length) {
        stopReason = mapped.stopReason
        truncated = mapped.truncated
      }
      if (typeof p.prompt_eval_count === 'number' && typeof p.eval_count === 'number') {
        usageOut = { input: p.prompt_eval_count, output: p.eval_count }
      }
    }
  }

  return dispatchStream({
    res,
    onToken,
    signal,
    chunkDelayMs,
    parseLine,
    buildResult: ({ text, cancelled }) => cancelled
      ? {
          text,
          truncated: false,
          stopReason: 'cancelled',
          ...(usageOut ? { tokenUsage: usageOut } : {}),
        }
      : {
          text,
          truncated,
          stopReason,
          ...(finalToolCalls.length ? { toolCalls: finalToolCalls } : {}),
          ...(usageOut ? { tokenUsage: usageOut } : {}),
        },
  })
}
