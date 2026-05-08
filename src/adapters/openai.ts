import type { LLMAdapter, CompleteParams, CompleteResult, Message } from './types'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

function parseOpenAIUsage(raw: unknown): { input: number; output: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as { prompt_tokens?: unknown; completion_tokens?: unknown }
  if (typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') return null
  return { input: u.prompt_tokens, output: u.completion_tokens }
}

function openaiMessages(system: string | undefined, messages: Message[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'tool') {
      for (const r of m.toolResults) {
        out.push({ role: 'tool', tool_call_id: r.id, content: r.content })
      }
    } else if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content ?? '' }
      if (m.toolCalls && m.toolCalls.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
        }))
      }
      out.push(msg)
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

export const openaiAdapter: LLMAdapter = {
  id: 'openai',
  name: 'OpenAI',
  // Edit this list when OpenAI ships new models. https://platform.openai.com/docs/models
  models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4-mini', 'gpt-5.4-nano'],

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const { messages, system, model, maxTokens = 2048, signal, onToken, apiKey } = params

    if (!apiKey) throw new Error('Missing OpenAI API key')

    try {
    const useStream = typeof onToken === 'function'

    const body: Record<string, unknown> = {
      model,
      max_completion_tokens: maxTokens,
      messages: openaiMessages(system, messages),
      stream: useStream,
    }
    if (useStream) body.stream_options = { include_usage: true }
    if (params.tools && params.tools.length) {
      body.tools = params.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
      const err = new Error(`OpenAI ${res.status}: ${apiMessage || text || res.statusText}`) as Error & { status?: number; apiMessage?: string }
      err.status = res.status
      if (apiMessage) err.apiMessage = apiMessage
      throw err
    }

    if (!useStream) {
      const data = await res.json()
      const choice = data?.choices?.[0]
      const message = choice?.message ?? {}
      const text = typeof message.content === 'string' ? message.content : ''
      const rawCalls: Array<{ id?: string; function?: { name?: string; arguments?: string } }> =
        Array.isArray(message.tool_calls) ? message.tool_calls : []
      const toolCalls = rawCalls
        .filter((c) => c.id && c.function?.name)
        .map((c) => {
          let input: unknown = {}
          if (typeof c.function?.arguments === 'string' && c.function.arguments) {
            try { input = JSON.parse(c.function.arguments) } catch { input = {} }
          }
          return { id: c.id!, name: c.function!.name!, input }
        })
      const usage = parseOpenAIUsage(data?.usage)
      const stop = choice?.finish_reason
      const stopReason: CompleteResult['stopReason'] =
        stop === 'length' ? 'max_tokens'
        : stop === 'tool_calls' ? 'tool_use'
        : 'end_turn'
      return {
        text,
        truncated: stop === 'length',
        stopReason,
        ...(toolCalls.length ? { toolCalls } : {}),
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

interface PendingToolCall { id: string; name: string; argsBuf: string; announced: boolean }

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

  // ----- accumulator state (shared between wire reader and dispatch loop) -----
  let buffer = ''
  let full = ''
  let truncated = false
  let usageOut: { input: number; output: number } | null = null
  let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' = 'end_turn'
  const callsByIndex = new Map<number, PendingToolCall>()

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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
          if (!line || !line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          let parsed: unknown
          try { parsed = JSON.parse(payload) } catch { continue }
          const p = parsed as { choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string }>; usage?: unknown }
          const choice = p.choices?.[0]
          const delta = choice?.delta
          if (delta && typeof delta.content === 'string' && delta.content.length) {
            // Push to queue; full += text happens at dispatch time to keep out.text === tokens.join('')
            queue.push(delta.content)
          }
          const tcDeltas = delta?.tool_calls as Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined
          if (tcDeltas) {
            for (const d of tcDeltas) {
              let cur = callsByIndex.get(d.index)
              if (!cur) {
                cur = { id: d.id ?? '', name: d.function?.name ?? '', argsBuf: '', announced: false }
                callsByIndex.set(d.index, cur)
              }
              if (d.id && !cur.id) cur.id = d.id
              if (d.function?.name && !cur.name) cur.name = d.function.name
              if (typeof d.function?.arguments === 'string') cur.argsBuf += d.function.arguments
              // Fire onToolCallStart immediately — not paced
              if (!cur.announced && cur.id && cur.name) {
                cur.announced = true
                onToolCallStart?.({ id: cur.id, name: cur.name })
              }
            }
          }
          if (choice?.finish_reason === 'length') { truncated = true; stopReason = 'max_tokens' }
          else if (choice?.finish_reason === 'tool_calls') stopReason = 'tool_use'
          else if (choice?.finish_reason === 'stop') stopReason = 'end_turn'
          const u = parseOpenAIUsage(p.usage)
          if (u) usageOut = u
        }
      }
    } catch (err) {
      wireError = err as Error
      wireDone = true
    }
  })()

  // ----- dispatch loop: paced -----
  let lastDispatchAt = 0

  try {
    while (!wireDone || queue.length > 0) {
      if (queue.length === 0) {
        if (signal?.aborted) break
        // Yield until wire reader pushes more events or completes
        await Promise.race([wirePromise, sleep(5)])
        continue
      }
      const text = queue.shift()!
      if (chunkDelayMs > 0) {
        const elapsed = Date.now() - lastDispatchAt
        if (elapsed < chunkDelayMs) await sleep(chunkDelayMs - elapsed)
        // Check abort after sleeping — slow-mode cancellation fires here
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      }
      onToken(text)
      full += text
      lastDispatchAt = Date.now()
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError' || signal?.aborted) {
      try { await reader.cancel() } catch { /* already closed */ }
      // Cancel-path policy: drop tool calls whose arguments did not parse,
      // because round-tripping them to the next provider call risks schema
      // errors and dispatching them is meaningless.
      const toolCallsOnAbort: Array<{ id: string; name: string; input: unknown }> = []
      for (const c of callsByIndex.values()) {
        if (!c.id || !c.name) continue
        if (!c.argsBuf) {
          toolCallsOnAbort.push({ id: c.id, name: c.name, input: {} })
          continue
        }
        let parsed: unknown
        try { parsed = JSON.parse(c.argsBuf) } catch { continue }
        toolCallsOnAbort.push({ id: c.id, name: c.name, input: parsed })
      }
      return {
        text: full,
        truncated: false,
        stopReason: 'cancelled',
        ...(toolCallsOnAbort.length ? { toolCalls: toolCallsOnAbort } : {}),
        ...(usageOut ? { tokenUsage: usageOut } : {}),
      }
    }
    throw err
  }

  // Drain complete — check if abort or wire error drove us here
  if (signal?.aborted || wireError?.name === 'AbortError') {
    try { await reader.cancel() } catch { /* already closed */ }
    const toolCallsOnAbort: Array<{ id: string; name: string; input: unknown }> = []
    for (const c of callsByIndex.values()) {
      if (!c.id || !c.name) continue
      if (!c.argsBuf) {
        toolCallsOnAbort.push({ id: c.id, name: c.name, input: {} })
        continue
      }
      let parsed: unknown
      try { parsed = JSON.parse(c.argsBuf) } catch { continue }
      toolCallsOnAbort.push({ id: c.id, name: c.name, input: parsed })
    }
    return {
      text: full,
      truncated: false,
      stopReason: 'cancelled',
      ...(toolCallsOnAbort.length ? { toolCalls: toolCallsOnAbort } : {}),
      ...(usageOut ? { tokenUsage: usageOut } : {}),
    }
  }

  if (wireError) throw wireError

  const completedToolCalls = Array.from(callsByIndex.values())
    .filter((c) => c.id && c.name)
    .map((c) => {
      let input: unknown = {}
      if (c.argsBuf) { try { input = JSON.parse(c.argsBuf) } catch { input = {} } }
      return { id: c.id, name: c.name, input }
    })

  return {
    text: full,
    truncated,
    stopReason,
    ...(completedToolCalls.length ? { toolCalls: completedToolCalls } : {}),
    ...(usageOut ? { tokenUsage: usageOut } : {}),
  }
}
