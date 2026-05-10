export interface ReplaySSEOpts {
  /** SSE body bytes (pre-encoded as a string of `event:`/`data:` lines + blanks). */
  body: string
  /** AbortController to fire mid-stream. The same controller's signal must
   *  also be passed to the adapter under test (so the catch path triggers). */
  controller: AbortController
  /** After this many cumulative bytes have been pulled, fire `controller.abort()`.
   *  The next pull errors the stream with AbortError, mirroring fetch behaviour. */
  abortAfterBytes?: number
  /** Bytes per pull. Defaults to 64. Smaller = finer-grained abort positioning. */
  chunkSize?: number
}

/** Build a Response whose body is a ReadableStream that streams `body` in
 *  small chunks and (optionally) aborts the supplied controller after
 *  `abortAfterBytes` cumulative bytes have been pulled. The next read after
 *  abort errors the stream with an AbortError, exactly as a real aborted
 *  fetch body does. Useful for testing streaming-adapter cancellation. */
export function replaySSE(opts: ReplaySSEOpts): Response {
  const { body, controller, abortAfterBytes, chunkSize = 64 } = opts
  const encoder = new TextEncoder()
  const bytes = encoder.encode(body)
  let pos = 0
  let pulled = 0

  let streamCtl!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) { streamCtl = c },
    pull(c) {
      if (controller.signal.aborted) {
        c.error(new DOMException('aborted', 'AbortError'))
        return
      }
      if (pos >= bytes.length) { c.close(); return }
      const end = Math.min(pos + chunkSize, bytes.length)
      const chunk = bytes.subarray(pos, end)
      pos = end
      pulled += chunk.length
      c.enqueue(chunk)
      if (abortAfterBytes != null && pulled >= abortAfterBytes && !controller.signal.aborted) {
        controller.abort()
      }
    },
  })

  controller.signal.addEventListener('abort', () => {
    try { streamCtl.error(new DOMException('aborted', 'AbortError')) } catch { /* already closed */ }
  }, { once: true })

  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
