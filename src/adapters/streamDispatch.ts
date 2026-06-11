import type { CompleteResult } from './types'

/**
 * Shared streaming harness for the chat adapters (Anthropic SSE, OpenAI SSE,
 * Ollama NDJSON). Owns everything the three wire formats have in common:
 *
 *  - reading the response body and splitting it into lines at full speed
 *  - a queue of text chunks delivered through a paced dispatch loop
 *    (chunkDelayMs > 0 = slow mode; wire reading is never slowed)
 *  - abort semantics: cancelling the reader and reporting `cancelled` so the
 *    adapter can return its partial result, both for mid-dispatch aborts and
 *    for aborts noticed after the queue drains
 *  - propagating non-abort wire errors
 *
 * The adapter supplies only the wire-format-specific pieces: `parseLine`
 * (runs at wire speed; pushes text for paced delivery via `emit`, fires
 * side-effects like onToolCallStart directly) and `buildResult` (assembles
 * the CompleteResult from the adapter's accumulated state).
 */
export interface StreamDispatchOpts {
  res: Response
  onToken: (chunk: string) => void
  signal?: AbortSignal
  chunkDelayMs: number
  /** Called for every wire line, untrimmed, including empty lines (SSE uses
   *  blank lines as event boundaries). Any trailing unterminated line is
   *  flushed here when the stream ends. */
  parseLine: (line: string, emit: (text: string) => void) => void
  /** `text` is exactly the concatenation of what onToken received.
   *  `cancelled` is true when the signal aborted. */
  buildResult: (out: { text: string; cancelled: boolean }) => CompleteResult
}

export async function dispatchStream(opts: StreamDispatchOpts): Promise<CompleteResult> {
  const { res, onToken, signal, chunkDelayMs, parseLine, buildResult } = opts

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()

  // Queue holds only text chunks that need paced dispatch; side-effects
  // (tool-call starts) fire immediately from the wire reader.
  const queue: string[] = []
  let wireDone = false
  let wireError = null as Error | null
  let buffer = ''
  let full = ''

  const emit = (text: string) => { queue.push(text) }
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  // ----- wire reader coroutine: full speed, no pacing -----
  const wirePromise = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          if (buffer.length) parseLine(buffer, emit)
          buffer = ''
          wireDone = true
          return
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) parseLine(line, emit)
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
        // If already aborted, stop waiting for more wire data — the queued
        // items above have been drained so we're done.
        if (signal?.aborted) break
        // Yield until the wire reader pushes more events or completes.
        await Promise.race([wirePromise, sleep(5)])
        continue
      }
      const text = queue.shift()!
      if (chunkDelayMs > 0) {
        const elapsed = Date.now() - lastDispatchAt
        if (elapsed < chunkDelayMs) await sleep(chunkDelayMs - elapsed)
        // Check abort after sleeping — slow-mode cancellation fires here.
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      }
      onToken(text)
      full += text
      lastDispatchAt = Date.now()
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError' || signal?.aborted) {
      try { await reader.cancel() } catch { /* already closed */ }
      return buildResult({ text: full, cancelled: true })
    }
    throw err
  }

  // Drain complete — check whether an abort or wire error drove us here.
  if (signal?.aborted || wireError?.name === 'AbortError') {
    try { await reader.cancel() } catch { /* already closed */ }
    return buildResult({ text: full, cancelled: true })
  }

  if (wireError) throw wireError

  return buildResult({ text: full, cancelled: false })
}
