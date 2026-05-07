import { describe, it, expect, vi } from 'vitest'
import { parseAgentResponse, runAgent } from './runner'
import type { LLMAdapter } from '../adapters/types'

describe('parseAgentResponse', () => {
  it('replacement agents return the whole response as rewrite, no feedback', () => {
    const refine = { outputMode: 'replacement' }
    const result = parseAgentResponse(refine, '  the rewritten line  ')
    expect(result.rewrite).toBe('the rewritten line')
    expect(result.feedback).toBeUndefined()
  })

  it('feedback-and-rewrite agents split NOTES and SUGGESTED REWRITE', () => {
    const grammar = { outputMode: 'feedback-and-rewrite' }
    const raw = 'ISSUES:\n- missing comma\n\nCORRECTED:\nHello, world.'
    const result = parseAgentResponse(grammar, raw)
    expect(result.feedback).toBe('- missing comma')
    expect(result.rewrite).toBe('Hello, world.')
  })

  it('feedback-only agents strip a NOTES: header and return only feedback', () => {
    const story = { outputMode: 'feedback-only' }
    const raw = 'NOTES:\n- the opening drags\n- character voice is strong'
    const result = parseAgentResponse(story, raw)
    expect(result.feedback).toBe('- the opening drags\n- character voice is strong')
    expect(result.rewrite).toBeUndefined()
  })

  it('feedback-only agents without a NOTES header return the whole response as feedback', () => {
    const summarise = { outputMode: 'feedback-only' }
    const raw = 'A two-sentence summary of the document.'
    const result = parseAgentResponse(summarise, raw)
    expect(result.feedback).toBe('A two-sentence summary of the document.')
    expect(result.rewrite).toBeUndefined()
  })

  it('feedback-only never populates rewrite even if the response contains SUGGESTED REWRITE-looking text', () => {
    const logic = { outputMode: 'feedback-only' }
    const raw =
      'NOTES:\n- contradiction in paragraph 2\n\nThe author should consider rewriting that paragraph.'
    const result = parseAgentResponse(logic, raw)
    expect(result.feedback).toContain('contradiction in paragraph 2')
    expect(result.rewrite).toBeUndefined()
  })

  it('feedback-only does not populate rewrite even when the model hallucinates a CORRECTED: section', () => {
    const story = { outputMode: 'feedback-only' }
    const raw = 'NOTES:\n- pacing is uneven\n\nCORRECTED:\nA fixed version of the text.'
    const result = parseAgentResponse(story, raw)
    expect(result.rewrite).toBeUndefined()
    expect(result.feedback).toContain('pacing is uneven')
  })
})

describe('runAgent — chunkDelayMs forwarding', () => {
  it('passes chunkDelayMs through to adapter.complete', async () => {
    const complete = vi.fn(async () => ({ text: 'ok', truncated: false, stopReason: 'end_turn' as const }))
    const adapter: LLMAdapter = { id: 'x', name: 'x', models: ['m'], complete }
    await runAgent({
      agent: { id: 'a', name: 'a', outputMode: 'replacement', actions: [] } as never,
      text: 't',
      promptTemplate: '{{text}}',
      adapter, apiKey: 'k', model: 'm', maxTokens: 100,
      chunkDelayMs: 75,
    })
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ chunkDelayMs: 75 }))
  })
})
