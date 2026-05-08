import { describe, it, expect } from 'vitest'
import type { ChatMessage } from '../components/ChatPanel'
import { truncateForRetry, truncateForEditAndRetry } from './retryOrchestrator'

const u = (id: string, content: string): ChatMessage => ({ id, role: 'user', content })
const a = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, role: 'assistant', content, ...extra })

describe('truncateForRetry', () => {
  it('drops the failed assistant turn and keeps everything up to the preceding user message', () => {
    const messages: ChatMessage[] = [
      u('u1', 'hi'),
      a('a1', 'reply 1'),
      u('u2', 'follow up'),
      a('a2', '', { failureReason: 'cancelled' }),
    ]
    const { kept, discarded } = truncateForRetry(messages, 'a2')
    expect(kept.map((m) => m.id)).toEqual(['u1', 'a1', 'u2'])
    expect(discarded.map((m) => m.id)).toEqual(['a2'])
  })

  it('walks back to the preceding user turn when anchored on an earlier assistant message', () => {
    const messages: ChatMessage[] = [
      u('u1', 'hi'),
      a('a1', 'reply 1'),
      u('u2', 'follow up'),
      a('a2', 'reply 2'),
      u('u3', 'third'),
      a('a3', 'reply 3'),
    ]
    const { kept, discarded } = truncateForRetry(messages, 'a2')
    expect(kept.map((m) => m.id)).toEqual(['u1', 'a1', 'u2'])
    expect(discarded.map((m) => m.id)).toEqual(['a2', 'u3', 'a3'])
  })

  it('keeps an earlier user message when anchored on it', () => {
    const messages: ChatMessage[] = [
      u('u1', 'hi'),
      a('a1', 'reply 1'),
      u('u2', 'follow up'),
      a('a2', 'reply 2'),
    ]
    const { kept, discarded } = truncateForRetry(messages, 'u2')
    expect(kept.map((m) => m.id)).toEqual(['u1', 'a1', 'u2'])
    expect(discarded.map((m) => m.id)).toEqual(['a2'])
  })

  it('discards a multi-tool turn cleanly', () => {
    const messages: ChatMessage[] = [
      u('u1', 'do stuff'),
      a('a1', 'on it', {
        toolCalls: [{ id: 't1', name: 'x', input: {} }, { id: 't2', name: 'y', input: {} }],
        toolResults: [{ id: 't1', content: 'r1' }, { id: 't2', content: 'r2' }],
        failureReason: 'cancelled',
      }),
    ]
    const { kept, discarded } = truncateForRetry(messages, 'a1')
    expect(kept.map((m) => m.id)).toEqual(['u1'])
    expect(discarded.map((m) => m.id)).toEqual(['a1'])
  })

  it('handles an anchor on a synthetic provider-error message', () => {
    const messages: ChatMessage[] = [
      u('u1', 'hi'),
      a('a1', '', { failureReason: 'provider_error',
        errorInfo: { kind: 'server', message: 'boom' } }),
    ]
    const { kept, discarded } = truncateForRetry(messages, 'a1')
    expect(kept.map((m) => m.id)).toEqual(['u1'])
    expect(discarded.map((m) => m.id)).toEqual(['a1'])
  })

  it('throws on an anchor that does not exist', () => {
    const messages: ChatMessage[] = [u('u1', 'hi')]
    expect(() => truncateForRetry(messages, 'nope')).toThrow(/anchor/i)
  })

  it('throws when no preceding user message exists for an assistant anchor', () => {
    const messages: ChatMessage[] = [a('a1', 'orphan')]
    expect(() => truncateForRetry(messages, 'a1')).toThrow(/user/i)
  })
})

describe('truncateForEditAndRetry', () => {
  it('replaces the most-recent user message text and drops everything after', () => {
    const messages: ChatMessage[] = [
      u('u1', 'first'),
      a('a1', 'reply'),
      u('u2', 'second'),
      a('a2', 'reply 2'),
    ]
    const { kept, discarded } = truncateForEditAndRetry(messages, 'second EDITED')
    expect(kept.map((m) => `${m.id}:${m.content}`)).toEqual([
      'u1:first', 'a1:reply', 'u2:second EDITED',
    ])
    expect(discarded.map((m) => m.id)).toEqual(['a2'])
  })

  it('throws when no user message exists', () => {
    const messages: ChatMessage[] = []
    expect(() => truncateForEditAndRetry(messages, 'x')).toThrow(/user/i)
  })

  it('preserves the user message id and provider field when editing', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first', provider: 'anthropic' },
    ]
    const { kept } = truncateForEditAndRetry(messages, 'edited')
    expect(kept[0].id).toBe('u1')
    expect(kept[0].provider).toBe('anthropic')
    expect(kept[0].content).toBe('edited')
  })

  it('produces empty discarded when the last message is already the user message', () => {
    const messages: ChatMessage[] = [
      u('u1', 'first'),
      a('a1', 'reply'),
      u('u2', 'second'),
    ]
    const { kept, discarded } = truncateForEditAndRetry(messages, 'second EDITED')
    expect(kept.map((m) => m.id)).toEqual(['u1', 'a1', 'u2'])
    expect(kept[2].content).toBe('second EDITED')
    expect(discarded).toEqual([])
  })
})

describe('purity', () => {
  it('truncateForRetry does not mutate the input array', () => {
    const messages: ChatMessage[] = [
      u('u1', 'hi'),
      a('a1', 'reply 1'),
      u('u2', 'follow up'),
      a('a2', 'reply 2', { failureReason: 'cancelled' }),
    ]
    const snapshot = JSON.parse(JSON.stringify(messages))
    truncateForRetry(messages, 'a2')
    expect(messages).toEqual(snapshot)
  })

  it('truncateForEditAndRetry does not mutate the input array', () => {
    const messages: ChatMessage[] = [
      u('u1', 'first'),
      a('a1', 'reply'),
      u('u2', 'second'),
    ]
    const snapshot = JSON.parse(JSON.stringify(messages))
    truncateForEditAndRetry(messages, 'edited')
    expect(messages).toEqual(snapshot)
  })
})
