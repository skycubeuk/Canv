import { describe, it, expect } from 'vitest'
import { configuredProviders } from './index'

describe('configuredProviders', () => {
  it('returns providers with non-empty API keys', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: 'sk-x', ollama: '' },
      baseUrls: {},
    })).toEqual(['openai'])
  })

  it('treats ollama as configured when baseUrls.ollama is set AND ollamaModels is non-empty', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: { ollama: 'http://localhost:11434' },
      ollamaModels: ['llama3.1:8b'],
    })).toEqual(['ollama'])
  })

  it('returns multiple providers when several are configured', () => {
    const result = configuredProviders({
      apiKeys: { anthropic: 'a', openai: 'o', ollama: '' },
      baseUrls: { ollama: 'http://localhost:11434' },
      ollamaModels: ['llama3.1:8b'],
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

  it('treats empty-string baseUrls.ollama as unconfigured', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: { ollama: '' },
    })).toEqual([])
  })

  it('treats ollama as unconfigured when baseUrls.ollama is set but ollamaModels is empty', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: { ollama: 'http://localhost:11434' },
      ollamaModels: [],
    })).toEqual([])
  })

  it('treats ollama as unconfigured when ollamaModels is omitted', () => {
    expect(configuredProviders({
      apiKeys: { anthropic: '', openai: '', ollama: '' },
      baseUrls: { ollama: 'http://localhost:11434' },
    })).toEqual([])
  })
})
