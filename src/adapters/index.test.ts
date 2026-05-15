import { describe, it, expect } from 'vitest'
import { configuredProviders } from './index'

describe('configuredProviders', () => {
  it('returns providers with non-empty API keys', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: 'sk-x', ollama: '' },
      baseUrls: {},
    })).toEqual(['openai'])
  })

  it('treats ollama as configured when baseUrls.ollama is set', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: { ollama: 'http://localhost:11434' },
    })).toEqual(['ollama'])
  })

  it('returns multiple providers when several are configured', () => {
    const result = configuredProviders({
      apiKeys: { anthropic: 'a', openai: 'o', ollama: '' },
      baseUrls: { ollama: 'http://localhost:11434' },
    })
    expect(result).toEqual(expect.arrayContaining(['anthropic', 'openai', 'ollama']))
    expect(result).toHaveLength(3)
  })

  it('returns an empty array when nothing is configured', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: {},
    })).toEqual([])
  })

  it('ignores undefined baseUrls.ollama', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: undefined,
    })).toEqual([])
  })
})
