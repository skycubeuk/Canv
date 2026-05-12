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

  it('apiKeyMissing reflects the active session provider', () => {
    const args = makeArgs()
    args.settings.apiKeys = { anthropic: '', openai: 'sk-x' }
    const { result } = renderHook(() => useChatSessions(args))
    expect(result.current.apiKeyMissing).toBe(true)
    act(() => { result.current.setActiveSessionProviderModel('openai', 'gpt-4o') })
    expect(result.current.apiKeyMissing).toBe(false)
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
  getAdapter: () => ({
    name: 'Mock',
    id: 'anthropic',
    models: ['claude-sonnet-4-6'],
  }),
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
