import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettings } from './useSettings'

describe('useSettings — chatToolBudget', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 10', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.chatToolBudget).toBe(10)
  })

  it('persists overrides', () => {
    const { result } = renderHook(() => useSettings())
    act(() => result.current.update({ chatToolBudget: 5 }))
    expect(result.current.settings.chatToolBudget).toBe(5)
  })
})

describe('useSettings — pricingOverrides', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults to an empty object', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.pricingOverrides).toEqual({})
  })

  it('persists overrides via update()', () => {
    const { result } = renderHook(() => useSettings())
    act(() => {
      result.current.update({ pricingOverrides: { 'anthropic/claude-sonnet-4-6': { input: 4, output: 20 } } })
    })
    const { result: r2 } = renderHook(() => useSettings())
    expect(r2.current.settings.pricingOverrides['anthropic/claude-sonnet-4-6']).toEqual({ input: 4, output: 20 })
  })

  it('drops persisted entries with non-finite values', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      pricingOverrides: {
        'anthropic/claude-sonnet-4-6': { input: 3, output: 15 },
        'anthropic/claude-haiku-4-5-20251001': { input: Number.NaN, output: 20 },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.pricingOverrides).toEqual({
      'anthropic/claude-sonnet-4-6': { input: 3, output: 15 },
    })
  })

  it('upgrades a legacy bare-model-id override to a composite key', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      pricingOverrides: {
        'claude-sonnet-4-6': { input: 4, output: 20 },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.pricingOverrides).toEqual({
      'anthropic/claude-sonnet-4-6': { input: 4, output: 20 },
    })
  })

  it('drops a legacy bare-key override whose model no longer exists', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      pricingOverrides: {
        'unknown-model': { input: 1, output: 2 },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.pricingOverrides).toEqual({})
  })
})

describe('useSettings — perAgentModel migration', () => {
  beforeEach(() => { localStorage.clear() })

  it('upgrades a legacy bare-string override to AgentModelRef', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      perAgentModel: { writing: { grammar: 'gpt-5.4-mini' } },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.perAgentModel.writing.grammar).toEqual({
      provider: 'openai', model: 'gpt-5.4-mini',
    })
  })

  it('passes through an existing AgentModelRef', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      perAgentModel: {
        writing: { grammar: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.perAgentModel.writing.grammar).toEqual({
      provider: 'anthropic', model: 'claude-sonnet-4-6',
    })
  })

  it('replaces an unknown bare-string override with the default ref', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      provider: 'anthropic',
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5' },
      perAgentModel: { writing: { grammar: 'no-such-model' } },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.perAgentModel.writing.grammar).toEqual({
      provider: 'anthropic', model: 'claude-sonnet-4-6',
    })
  })

  it('replaces a ref whose model no longer exists with the default ref', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      provider: 'anthropic',
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5' },
      perAgentModel: {
        writing: { grammar: { provider: 'openai', model: 'gpt-decommissioned' } },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.perAgentModel.writing.grammar).toEqual({
      provider: 'anthropic', model: 'claude-sonnet-4-6',
    })
  })

  it('preserves an ollama ref whose model is in the refreshed ollamaModels cache', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      provider: 'anthropic',
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5', ollama: 'llama3.1' },
      ollamaModels: ['qwen3.5:9b', 'llama3.1:8b'],
      perAgentModel: {
        writing: { grammar: { provider: 'ollama', model: 'qwen3.5:9b' } },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.perAgentModel.writing.grammar).toEqual({
      provider: 'ollama', model: 'qwen3.5:9b',
    })
  })

  it('preserves defaultModel.ollama when it matches a refreshed ollamaModels entry', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      provider: 'ollama',
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5', ollama: 'qwen3.5:9b' },
      ollamaModels: ['qwen3.5:9b', 'llama3.1:8b'],
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.defaultModel.ollama).toBe('qwen3.5:9b')
  })

  it('replaces a seed-only defaultModel.ollama with the first refreshed entry after Refresh', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      provider: 'ollama',
      // qwen2.5 is in the static seed but the user hasn't pulled it; only qwen3.5:9b is.
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5', ollama: 'qwen2.5' },
      ollamaModels: ['qwen3.5:9b'],
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.defaultModel.ollama).toBe('qwen3.5:9b')
  })

  it('replaces a seed-only perAgentModel ollama ref with the fallback after Refresh', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      provider: 'anthropic',
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5', ollama: 'qwen3.5:9b' },
      ollamaModels: ['qwen3.5:9b'],
      perAgentModel: {
        // qwen2.5 is in the seed but the user only pulled qwen3.5:9b — must not survive merge.
        writing: { grammar: { provider: 'ollama', model: 'qwen2.5' } },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.perAgentModel.writing.grammar).toEqual({
      provider: 'anthropic', model: 'claude-sonnet-4-6',
    })
  })
})

describe('useSettings — streamChunkDelayMs', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults to 0', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.streamChunkDelayMs).toBe(0)
  })

  it('persists supported values', () => {
    const { result } = renderHook(() => useSettings())
    act(() => { result.current.update({ streamChunkDelayMs: 100 }) })
    const { result: r2 } = renderHook(() => useSettings())
    expect(r2.current.settings.streamChunkDelayMs).toBe(100)
  })

  it('clamps unsupported persisted values to 0', () => {
    localStorage.setItem('canv:settings', JSON.stringify({ streamChunkDelayMs: 999 }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.streamChunkDelayMs).toBe(0)
  })
})

describe('useSettings — accent', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults accent to indigo (#6366f1)', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.accent).toBe('#6366f1')
  })

  it('persists a new accent value', () => {
    const { result } = renderHook(() => useSettings())
    act(() => { result.current.update({ accent: '#10b981' }) })
    expect(result.current.settings.accent).toBe('#10b981')
  })
})
