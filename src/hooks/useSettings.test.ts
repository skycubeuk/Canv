import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('useSettings — boot toast (onDropped) pathway', () => {
  beforeEach(() => { localStorage.clear() })

  it('calls onDropped exactly once with the list of dropped fields when raw has an invalid value', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      fontSize: 'broken',
      apiKeys: { anthropic: 'sk-key', openai: '', ollama: '' },
    }))
    const onDropped = vi.fn()
    renderHook(() => useSettings({ onDropped }))
    expect(onDropped).toHaveBeenCalledTimes(1)
    const callArg = onDropped.mock.calls[0][0] as string[]
    expect(callArg).toContain('fontSize')
    // Valid sibling fields salvage cleanly: apiKey survived the round-trip.
    const persisted = JSON.parse(localStorage.getItem('canv:settings') ?? '{}')
    expect(persisted.apiKeys.anthropic).toBe('sk-key')
  })

  it('does NOT call onDropped when the raw blob is fully valid', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      fontSize: 18,
      apiKeys: { anthropic: '', openai: '', ollama: '' },
    }))
    const onDropped = vi.fn()
    renderHook(() => useSettings({ onDropped }))
    expect(onDropped).not.toHaveBeenCalled()
  })

  it('persists the salvaged shape back to localStorage so the broken value is gone', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      fontSize: 'broken',
    }))
    renderHook(() => useSettings())
    const persisted = JSON.parse(localStorage.getItem('canv:settings') ?? '{}')
    // The broken value is replaced; the value is now the schema default (16).
    expect(persisted.fontSize).toBe(16)
  })
})

describe('useSettings — legacy-key cleanup on first mount', () => {
  beforeEach(() => { localStorage.clear() })

  it('strips legacy top-level keys (e.g. `prompts`) silently when the rest of the blob is valid', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      fontSize: 18,
      prompts: { legacy: true },
      promptOverrides: { also: 'gone' },
    }))
    const onDropped = vi.fn()
    renderHook(() => useSettings({ onDropped }))
    // Silent cleanup: no toast fires when nothing was reset.
    expect(onDropped).not.toHaveBeenCalled()
    const persisted = JSON.parse(localStorage.getItem('canv:settings') ?? '{}')
    expect('prompts' in persisted).toBe(false)
    expect('promptOverrides' in persisted).toBe(false)
    // Legitimate fields survive.
    expect(persisted.fontSize).toBe(18)
  })
})

describe("useSettings — mcpServers permissive editor storage", () => {
  beforeEach(() => { localStorage.clear() })

  it("preserves every stored entry, including partial ones (storage is permissive on purpose)", () => {
    // The schema's mcpServers field is z.array(z.unknown()) so a partially
    // typed in-progress row from the auto-gen UI doesn't fail the whole-array
    // parse and wipe valid siblings. The renderer needs to see ALL items
    // (including the in-progress one) so the user can finish filling it in.
    // Per-row validation happens downstream in mcp.contribution.ts before
    // anything is handed to the MCP service for an actual connect.
    localStorage.setItem("canv:settings", JSON.stringify({
      mcpServers: [
        { name: "good-stdio", transport: "stdio", command: "echo" },
        { name: "huh", transport: "mystery" },                    // invalid discriminator
        { name: "", transport: "stdio", command: "" },            // partially-typed (UI in-progress)
        { name: "good-http", transport: "http", url: "http://localhost:9000" },
      ],
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.mcpServers).toHaveLength(4)
  })

  it("an empty new row appended via update() does NOT wipe the existing valid rows", () => {
    // This is the exact UX from the auto-gen '+ Add' button — was wiping the
    // array on the next render before the permissive-storage fix landed.
    localStorage.setItem("canv:settings", JSON.stringify({
      mcpServers: [
        { name: "fs", transport: "stdio", command: "mcp-server-filesystem" },
      ],
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.mcpServers).toHaveLength(1)

    act(() => result.current.update({
      mcpServers: [
        ...result.current.settings.mcpServers,
        { name: "", transport: "stdio", command: "" } as never,
      ],
    }))

    // BOTH rows persist — the valid one and the new empty one. The empty
    // one is visible to the editor so the user can complete it. The mcp
    // contribution filters before pushing to the MCP service, so the empty
    // entry never reaches a subprocess spawn.
    expect(result.current.settings.mcpServers).toHaveLength(2)
    expect(result.current.settings.mcpServers[0].name).toBe("fs")
    expect(result.current.settings.mcpServers[1].name).toBe("")
  })
})
