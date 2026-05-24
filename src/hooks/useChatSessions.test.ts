import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatSessions, type UseChatSessionsArgs } from './useChatSessions'
import type { Mode } from '../config/types'
import type { DialogContextValue } from '../lib/dialogs'
import type { RunChatTurnParams } from '../agents/chatRunner'

const STORAGE_KEY = 'canv:chatSessions'

function makeArgs(): UseChatSessionsArgs {
  return {
    settings: {
      provider: 'anthropic' as const,
      defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o' },
      apiKeys: { anthropic: 'k', openai: 'k' },
      maxOutputTokens: { anthropic: 4096, openai: 4096 },
      pricingOverrides: {},
      autoScroll: true,
      streamChunkDelayMs: 0,
      chatToolBudget: 8,
    },
    update: () => {},
    workspace: { tree: null, pinned: [], activeMarkdownRel: null, writeFileFromTool: async () => {}, flushAll: () => {} },
    activeProfile: { id: 'p', chatSystemPrompt: '' } as unknown as Mode,
    getActiveEditor: () => null,
    showToast: () => {},
    openSettingsTab: () => {},
    showRetryUndoToast: () => {},
    dismissRetryUndo: () => {},
    dialogs: { confirm: async () => true, prompt: async () => null } as DialogContextValue,
  } as unknown as UseChatSessionsArgs
}

describe('useChatSessions — bootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initialises with exactly one empty session whose provider/model come from settings', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].provider).toBe('anthropic')
    expect(result.current.sessions[0].model).toBe('claude-sonnet-4-6')
    expect(result.current.activeId).toBe(result.current.sessions[0].id)
    expect(result.current.chatMessages).toEqual([])
  })

  it('persists state under canv:chatSessions and reads it back on remount', () => {
    const { result, unmount } = renderHook(() => useChatSessions(makeArgs()))
    const id = result.current.activeId
    unmount()

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.activeId).toBe(id)
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.sessions[0].messages).toEqual([])

    const { result: result2 } = renderHook(() => useChatSessions(makeArgs()))
    expect(result2.current.activeId).toBe(id)
  })

  it('does not read or touch the legacy canv:chat key', () => {
    localStorage.setItem('canv:chat', JSON.stringify([{ id: 'old', role: 'user', content: 'legacy', provider: 'openai' }]))
    renderHook(() => useChatSessions(makeArgs()))
    expect(localStorage.getItem('canv:chat')).toBe(JSON.stringify([{ id: 'old', role: 'user', content: 'legacy', provider: 'openai' }]))
  })
})

import { act } from '@testing-library/react'

describe('useChatSessions — lifecycle', () => {
  beforeEach(() => { localStorage.clear() })

  it('createSession appends a new session with settings defaults and activates it', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const firstId = result.current.activeId
    act(() => { result.current.createSession() })
    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.activeId).not.toBe(firstId)
    const created = result.current.sessions.find((s) => s.id === result.current.activeId)!
    expect(created.provider).toBe('anthropic')
    expect(created.model).toBe('claude-sonnet-4-6')
    expect(created.title).toBe('New chat')
  })

  it('selectSession changes activeId without mutating sessions', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const a = result.current.activeId
    act(() => { result.current.createSession() })
    const b = result.current.activeId
    act(() => { result.current.selectSession(a) })
    expect(result.current.activeId).toBe(a)
    expect(result.current.sessions.map((s) => s.id).sort()).toEqual([a, b].sort())
  })

  it('closeSession of a non-active session leaves activeId untouched', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const a = result.current.activeId
    act(() => { result.current.createSession() })
    const b = result.current.activeId
    act(() => { result.current.closeSession(a) })
    expect(result.current.activeId).toBe(b)
    expect(result.current.sessions.map((s) => s.id)).toEqual([b])
  })

  it('closeSession of the active session activates the most-recently-created remaining session', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const a = result.current.activeId
    act(() => { result.current.createSession() })
    const b = result.current.activeId
    act(() => { result.current.createSession() })
    const c = result.current.activeId
    act(() => { result.current.closeSession(c) })
    expect(result.current.activeId).toBe(b)
    expect(result.current.sessions.map((s) => s.id).sort()).toEqual([a, b].sort())
  })

  it('closing the last remaining session immediately seeds a fresh empty one', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const only = result.current.activeId
    act(() => { result.current.closeSession(only) })
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.activeId).not.toBe(only)
    expect(result.current.sessions[0].title).toBe('New chat')
    expect(result.current.sessions[0].provider).toBe('anthropic')
  })

  it('closing the last session when settings.provider is unconfigured falls back to a configured provider', () => {
    // Repro: user's default provider is openai but only anthropic has a key.
    // The init path uses pickDefaultProviderModel and lands on anthropic, but
    // closing the last session must do the same — not fall back to the raw
    // settings.provider, which would leave the user staring at an openai
    // session they can't send to.
    const args = makeArgs()
    args.settings.provider = 'openai'
    args.settings.apiKeys = { anthropic: 'k', openai: '', ollama: '' }
    args.settings.baseUrls = {}
    const { result } = renderHook(() => useChatSessions(args))
    // Init already correctly chose anthropic — verify, then exercise the close path.
    expect(result.current.sessions[0].provider).toBe('anthropic')
    const only = result.current.activeId
    act(() => { result.current.closeSession(only) })
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].provider).toBe('anthropic')
    expect(result.current.sessions[0].model).toBe('claude-sonnet-4-6')
  })

  it('createSession when settings.provider is unconfigured falls back to a configured provider', () => {
    const args = makeArgs()
    args.settings.provider = 'openai'
    args.settings.apiKeys = { anthropic: 'k', openai: '', ollama: '' }
    args.settings.baseUrls = {}
    const { result } = renderHook(() => useChatSessions(args))
    act(() => { result.current.createSession() })
    const created = result.current.sessions.find((s) => s.id === result.current.activeId)!
    expect(created.provider).toBe('anthropic')
    expect(created.model).toBe('claude-sonnet-4-6')
  })
})

describe('useChatSessions — per-session model lock', () => {
  beforeEach(() => { localStorage.clear() })

  it('setActiveSessionProviderModel updates provider/model when active session is empty', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    act(() => { result.current.setActiveSessionProviderModel('openai', 'gpt-4o') })
    const active = result.current.sessions.find((s) => s.id === result.current.activeId)!
    expect(active.provider).toBe('openai')
    expect(active.model).toBe('gpt-4o')
    expect(result.current.chatProvider).toBe('openai')
    expect(result.current.chatModel).toBe('gpt-4o')
  })

  it('setActiveSessionProviderModel is a no-op once the active session has any messages', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    act(() => { result.current.__test_pushUserMessage('hi') })
    act(() => { result.current.setActiveSessionProviderModel('openai', 'gpt-4o') })
    const active = result.current.sessions.find((s) => s.id === result.current.activeId)!
    expect(active.provider).toBe('anthropic')
    expect(active.model).toBe('claude-sonnet-4-6')
  })
})

describe('useChatSessions — active-session selectors', () => {
  beforeEach(() => { localStorage.clear() })

  it('apiKeyMissing is true only when no provider has credentials anywhere', () => {
    const args = makeArgs()
    args.settings.apiKeys = { anthropic: '', openai: '', ollama: '' }
    args.settings.baseUrls = {}
    const { result } = renderHook(() => useChatSessions(args))
    expect(result.current.apiKeyMissing).toBe(true)
  })

  it('apiKeyMissing is false when any provider is configured, even if the active session is not', () => {
    const args = makeArgs()
    args.settings.apiKeys = { anthropic: '', openai: 'sk-x', ollama: '' }
    args.settings.baseUrls = {}
    const { result } = renderHook(() => useChatSessions(args))
    expect(result.current.apiKeyMissing).toBe(false)
  })

  it('apiKeyMissing is false when only the ollama base URL is set', () => {
    const args = makeArgs()
    args.settings.apiKeys = { anthropic: '', openai: '', ollama: '' }
    args.settings.baseUrls = { ollama: 'http://localhost:11434' }
    const { result } = renderHook(() => useChatSessions(args))
    expect(result.current.apiKeyMissing).toBe(false)
  })

  it('sendChat short-circuits when a LOCKED active session is on an unconfigured provider, even if another provider is configured', async () => {
    // Pre-seed a locked anthropic session before openai becomes the only
    // configured provider. Empty sessions are auto-reseeded to a configured
    // provider at boot (see "useChatSessions — bootstrap"), so this scenario
    // is only reachable for sessions that have already accrued messages.
    const lockedSession = {
      id: 'cs-locked',
      createdAt: 1000,
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-6',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'earlier' }],
    }
    localStorage.setItem('canv:chatSessions', JSON.stringify({ sessions: [lockedSession], activeId: 'cs-locked' }))

    const args = makeArgs()
    args.settings.apiKeys = { anthropic: '', openai: 'sk-x', ollama: '' }
    args.settings.baseUrls = {}
    const openSettingsTab = vi.fn()
    const showToast = vi.fn()
    args.openSettingsTab = openSettingsTab
    args.showToast = showToast
    const { result } = renderHook(() => useChatSessions(args))
    // Session stayed locked on anthropic (messages.length > 0); reseed skips it.
    expect(result.current.sessions[0].provider).toBe('anthropic')
    expect(result.current.apiKeyMissing).toBe(false)
    await act(async () => { await result.current.sendChat('hello') })
    expect(openSettingsTab).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Add an API key first.')
  })

  it('empty sessions follow settings.provider/defaultModel changes after boot', () => {
    const args = makeArgs()
    args.settings.apiKeys = { anthropic: 'k', openai: 'k', ollama: '' }
    args.settings.baseUrls = {}
    args.settings.provider = 'anthropic'
    args.settings.defaultModel = { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o', ollama: 'llama3.1' }
    const { result, rerender } = renderHook(({ s }) => useChatSessions({ ...args, settings: s }), {
      initialProps: { s: args.settings },
    })
    expect(result.current.sessions[0].provider).toBe('anthropic')
    expect(result.current.sessions[0].model).toBe('claude-sonnet-4-6')

    rerender({ s: { ...args.settings, provider: 'openai' } as typeof args.settings })

    expect(result.current.sessions[0].provider).toBe('openai')
    expect(result.current.sessions[0].model).toBe('gpt-4o')

    rerender({ s: { ...args.settings, provider: 'openai', defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o-mini', ollama: 'llama3.1' } } as typeof args.settings })

    expect(result.current.sessions[0].provider).toBe('openai')
    expect(result.current.sessions[0].model).toBe('gpt-4o-mini')
  })

  it('an EMPTY active session whose provider is unconfigured is reseeded to the configured default at boot', async () => {
    // Pre-seed an empty anthropic session, then boot with only openai
    // configured. The reseed should migrate the empty session to openai.
    const emptySession = {
      id: 'cs-empty',
      createdAt: 1000,
      provider: 'anthropic' as const,
      model: 'claude-opus-4-7',
      messages: [],
    }
    localStorage.setItem('canv:chatSessions', JSON.stringify({ sessions: [emptySession], activeId: 'cs-empty' }))

    const args = makeArgs()
    args.settings.apiKeys = { anthropic: '', openai: 'sk-x', ollama: '' }
    args.settings.baseUrls = {}
    const { result } = renderHook(() => useChatSessions(args))
    expect(result.current.sessions[0].id).toBe('cs-empty')
    expect(result.current.sessions[0].provider).toBe('openai')
    // The full session (via getSession) keeps the empty messages array — the
    // reseed only touches provider/model. The exposed `sessions` array on the
    // hook surface is a SessionSummary so we round-trip via getSession.
    const full = result.current.getSession('cs-empty')
    expect(full?.messages).toHaveLength(0)
  })

  it('meterTotals are computed from the active session messages', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    act(() => { result.current.__test_pushUserMessage('hello') })
    expect(result.current.meterTotals).toEqual(expect.objectContaining({ tokens: expect.any(Number), costUsd: expect.any(Number) }))
  })

  it('pendingApprovals defaults to an empty Map per session', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    expect(result.current.pendingApprovals).toBeInstanceOf(Map)
    expect(result.current.pendingApprovals.size).toBe(0)
  })

  it('followLatest mirrors settings.autoScroll on each change', () => {
    const args = makeArgs()
    const { result, rerender } = renderHook(({ a }) => useChatSessions({ ...args, settings: { ...args.settings, autoScroll: a } }), {
      initialProps: { a: true },
    })
    expect(result.current.followLatest).toBe(true)
    rerender({ a: false })
    expect(result.current.followLatest).toBe(false)
  })
})

import { vi } from 'vitest'
import { runChatTurn } from '../agents/chatRunner'

vi.mock('../adapters', () => ({
  getAdapter: (id: string) => ({
    name: 'Mock',
    id,
    // Provider-aware so pickDefaultProviderModel's "clamp model against the
    // adapter's models" step doesn't cross-contaminate (clamping an openai
    // default against an anthropic-only list).
    models: id === 'openai' ? ['gpt-4o', 'gpt-4o-mini'] : ['claude-sonnet-4-6'],
  }),
  // Mirror the real surface — useChatSessions reseeds empty sessions whose
  // provider isn't configured, and that path runs `configuredProviders` to
  // pick the effective default. The mock returns whatever providers the
  // test's settings shape claims to have api keys for, falling back to the
  // settings.provider so empty-state tests still see their default pair.
  configuredProviders: (input: { apiKeys?: Partial<Record<string, string>>; baseUrls?: { ollama?: string }; ollamaModels?: string[] }) => {
    const out: string[] = []
    for (const p of ['anthropic', 'openai'] as const) {
      if (input.apiKeys?.[p]) out.push(p)
    }
    if (input.baseUrls?.ollama && (input.ollamaModels?.length ?? 0) > 0) out.push('ollama')
    return out
  },
}))

vi.mock('../agents/chatRunner', () => ({
  runChatTurn: vi.fn(async (args: RunChatTurnParams) => {
    args.onUpdate([
      ...args.history,
      { id: `a-${Math.random()}`, role: 'assistant', content: 'ok' },
    ])
  }),
}))

vi.mock('../lib/inventory', () => ({
  buildInventory: () => ({ files: [] }),
  formatInventoryForPrompt: () => '',
}))

vi.mock('../lib/fs', () => ({ getFs: () => ({ writeFile: async () => {}, readFile: async () => '' }) }))

type PersistedSession = { id: string; messages: { role: string; content: string }[] }

describe('useChatSessions — sendChat per session', () => {
  beforeEach(() => { localStorage.clear() })

  it('sendChat appends user + assistant messages to the active session only', async () => {
    const args = makeArgs()
    args.workspace.tree = { kind: 'dir', relPath: '', name: 'root', children: [], truncated: false }
    const { result } = renderHook(() => useChatSessions(args))
    const a = result.current.activeId
    act(() => { result.current.createSession() })
    const b = result.current.activeId
    act(() => { result.current.selectSession(a) })

    await act(async () => {
      await result.current.sendChat('hello')
    })

    const persisted = JSON.parse(localStorage.getItem('canv:chatSessions')!)
    const pa = persisted.sessions.find((s: PersistedSession) => s.id === a)
    const pb = persisted.sessions.find((s: PersistedSession) => s.id === b)
    expect(pa.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant'])
    expect(pb.messages).toEqual([])
  })
})

describe('useChatSessions — per-session retry / stop / clear', () => {
  beforeEach(() => { localStorage.clear() })

  it('clearChat resets only the active session messages', async () => {
    const args = makeArgs()
    args.workspace.tree = { kind: 'dir', relPath: '', name: 'root', children: [], truncated: false }
    const { result } = renderHook(() => useChatSessions(args))
    act(() => { result.current.__test_pushUserMessage('first') })
    act(() => { result.current.createSession() })
    act(() => { result.current.__test_pushUserMessage('second') })
    act(() => { result.current.clearChat() })
    const persistedAfter = JSON.parse(localStorage.getItem('canv:chatSessions')!)
    const otherSession = persistedAfter.sessions.find((s: PersistedSession) => s.messages.length > 0)
    expect(otherSession.messages[0].content).toBe('first')
    const activeSession = persistedAfter.sessions.find((s: PersistedSession) => s.id === result.current.activeId)
    expect(activeSession.messages).toEqual([])
  })

  it('chatBusy reflects the active session runtime busy flag', async () => {
    const args = makeArgs()
    args.workspace.tree = { kind: 'dir', relPath: '', name: 'root', children: [], truncated: false }
    const { result } = renderHook(() => useChatSessions(args))
    expect(result.current.chatBusy).toBe(false)
    // After sendChat completes (mocked runner resolves immediately) busy should be back to false.
    await act(async () => {
      await result.current.sendChat('hi')
    })
    expect(result.current.chatBusy).toBe(false)
  })

  it('stopChat is a no-op on a session with no in-flight controller (does not throw)', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    expect(() => act(() => { result.current.stopChat() })).not.toThrow()
  })

  it('closeSession tears down runtime state for that session', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const a = result.current.activeId
    act(() => { result.current.createSession() })
    const b = result.current.activeId
    // closeSession of non-active should still drop the runtime entry.
    act(() => { result.current.closeSession(a) })
    expect(result.current.sessions.map((s) => s.id)).toEqual([b])
  })
})

describe('useChatSessions — per-session abort isolation', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })

  it("aborting one session leaves another session's in-flight stream alone", async () => {
    let resolveSessionA: () => void = () => {}
    const aPromise = new Promise<void>((r) => { resolveSessionA = r })

    vi.mocked(runChatTurn).mockImplementationOnce(async (params: RunChatTurnParams) => {
      // Session A: hangs until we let it go.
      await aPromise
      params.onUpdate([
        ...params.history,
        { id: 'a-resp', role: 'assistant', content: 'A done' },
      ])
    })
    vi.mocked(runChatTurn).mockImplementationOnce(async (params: RunChatTurnParams) => {
      // Session B: completes immediately.
      params.onUpdate([
        ...params.history,
        { id: 'b-resp', role: 'assistant', content: 'B done' },
      ])
    })

    const args = makeArgs()
    args.workspace.tree = { kind: 'dir', relPath: '', name: 'root', children: [], truncated: false }
    const { result } = renderHook(() => useChatSessions(args))

    // Capture session A's id.
    const aId = result.current.activeId

    // Kick off session A's send without awaiting — it will hang on aPromise.
    // We call the function directly to avoid the unawaited-act React warning.
    let aRunPromise: Promise<void>
    await act(async () => {
      // Start A's run but don't await runTurn's inner promise — sendChat itself
      // won't resolve until runTurn resolves, so we just fire it.
      aRunPromise = result.current.sendChat('hi from A')
      // Yield once so runChatTurn's first await (aPromise) is reached.
      await Promise.resolve()
    })

    // Switch to a new session B and send — this should complete immediately.
    act(() => { result.current.createSession() })
    await act(async () => {
      await result.current.sendChat('hi from B')
    })

    // B should be done; A's session should still exist with only the user message.
    const persistedMid = JSON.parse(localStorage.getItem('canv:chatSessions')!)
    const bMid = persistedMid.sessions.find((s: PersistedSession) => s.messages.some((m: { content: string }) => m.content === 'B done'))
    expect(bMid).toBeDefined()
    const aMid = persistedMid.sessions.find((s: PersistedSession) => s.id === aId)
    expect(aMid).toBeDefined()
    // A's assistant message hasn't arrived yet.
    expect(aMid.messages.some((m: { content: string }) => m.content === 'A done')).toBe(false)

    // Now resolve A and let its run finish.
    resolveSessionA()
    await act(async () => { await aRunPromise })

    const persistedFinal = JSON.parse(localStorage.getItem('canv:chatSessions')!)
    const aFinal = persistedFinal.sessions.find((s: PersistedSession) => s.messages.some((m: { content: string }) => m.content === 'A done'))
    expect(aFinal).toBeDefined()
  })
})

describe('useChatSessions — getSession', () => {
  beforeEach(() => { localStorage.clear() })

  it('getSession returns the full session for a known id', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    const activeId = result.current.activeId
    const session = result.current.getSession(activeId)
    expect(session).not.toBeNull()
    expect(session!.id).toBe(activeId)
    expect(Array.isArray(session!.messages)).toBe(true)
  })

  it('getSession returns null for unknown ids', () => {
    const { result } = renderHook(() => useChatSessions(makeArgs()))
    expect(result.current.getSession('cs-does-not-exist')).toBeNull()
  })
})

describe('useChatSessions — startSeededChat', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })

  it('startSeededChat creates a new session, activates it, and sends the seed text as the first user message', async () => {
    const args = makeArgs()
    args.workspace.tree = { kind: 'dir', relPath: '', name: 'root', children: [], truncated: false }
    const { result } = renderHook(() => useChatSessions(args))
    const originalId = result.current.activeId

    await act(async () => {
      await result.current.startSeededChat('discuss this change')
    })

    // A new session must have been created and made active.
    expect(result.current.activeId).not.toBe(originalId)
    expect(result.current.sessions.length).toBe(2)

    // The NEW active session must contain the seed text as a user message.
    const newSession = result.current.getSession(result.current.activeId)
    expect(newSession).not.toBeNull()
    const userMessages = newSession!.messages.filter((m) => m.role === 'user')
    expect(userMessages).toHaveLength(1)
    expect(userMessages[0].content).toBe('discuss this change')
  })

  it('startSeededChat does not mutate or send into the previously-active session', async () => {
    const args = makeArgs()
    args.workspace.tree = { kind: 'dir', relPath: '', name: 'root', children: [], truncated: false }
    const { result } = renderHook(() => useChatSessions(args))
    const originalId = result.current.activeId

    // Give the original session a message so we can verify it stays untouched.
    act(() => { result.current.__test_pushUserMessage('original message') })

    await act(async () => {
      await result.current.startSeededChat('discuss this change')
    })

    const originalSession = result.current.getSession(originalId)
    expect(originalSession).not.toBeNull()
    expect(originalSession!.messages).toHaveLength(1)
    expect(originalSession!.messages[0].content).toBe('original message')
  })
})
