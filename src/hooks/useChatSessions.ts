import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import type { ChatMessage, ChatProvider, PendingApproval } from '../components/ChatPanel'
import { chatTotals } from '../lib/chatUsage'
import type { Mode } from '../config/types'
import type { EditorView } from '@codemirror/view'
import type { useSettings } from './useSettings'
import type { useWorkspace } from './useWorkspace'
import type { useDialogs } from '../lib/dialogs'
import { runChatTurn, type WritePreview, type ApprovalDecision } from '../agents/chatRunner'
import { truncateForRetry, truncateForEditAndRetry } from '../agents/retryOrchestrator'
import { buildInventory, formatInventoryForPrompt } from '../lib/inventory'
import { buildChatSystemPreamble } from '../lib/buildChatSystemPreamble'
import { getAdapter, configuredProviders } from '../adapters'
import type { Provider, Settings } from './settingsSchema'
import { getFs } from '../lib/fs'
import type { ToolCall } from '../adapters/types'
import type { CanvHistory } from '../lib/history'

type SettingsApi = ReturnType<typeof useSettings>
type WorkspaceApi = ReturnType<typeof useWorkspace>
type DialogsApi = ReturnType<typeof useDialogs>

const STORAGE_KEY = 'canv:chatSessions'

export type ChatSessionId = string

export interface ChatSession {
  id: ChatSessionId
  createdAt: number
  provider: ChatProvider
  model: string
  messages: ChatMessage[]
}

interface PersistedState {
  sessions: ChatSession[]
  activeId: ChatSessionId
}

export interface UseChatSessionsArgs {
  settings: SettingsApi['settings']
  update: SettingsApi['update']
  workspace: WorkspaceApi
  activeProfile: Mode
  getActiveEditor: () => EditorView | null
  showToast: (msg: string) => void
  openSettingsTab: () => void
  showRetryUndoToast: (count: number) => void
  dismissRetryUndo: () => void
  dialogs: DialogsApi
  historyClient?: CanvHistory | null
}

export interface SessionSummary {
  id: ChatSessionId
  title: string
  provider: ChatProvider
  model: string
  busy: boolean
  pendingApprovalCount: number
}

export interface UseChatSessionsApi {
  chatMessages: ChatMessage[]
  chatProvider: ChatProvider
  chatModel: string
  sessions: SessionSummary[]
  /** Full session records for every session (used by the dock pop-out which can't share a closure with main). */
  allSessions: ChatSession[]
  activeId: ChatSessionId
  /** Look up a full session by id. Returns null when the id is unknown. */
  getSession: (id: ChatSessionId) => ChatSession | null
  createSession: () => void
  selectSession: (id: ChatSessionId) => void
  closeSession: (id: ChatSessionId) => void
  setActiveSessionProviderModel: (provider: ChatProvider, model: string) => void
  /** Test seam — appends a user message to the active session. */
  __test_pushUserMessage: (text: string) => void
  apiKeyMissing: boolean
  meterTotals: ReturnType<typeof chatTotals>
  pendingApprovals: Map<string, PendingApproval>
  followLatest: boolean
  setFollowLatest: React.Dispatch<React.SetStateAction<boolean>>
  sendChat: (text: string) => Promise<void>
  chatBusy: boolean
  onApprovalDecide: (callId: string, decision: ApprovalDecision) => void
  retryFromAnchor: (anchorId: string) => void
  editAndRetry: (newText: string) => void
  undoRetry: () => void
  stopChat: () => void
  clearChat: () => void
}

function newSessionId(): ChatSessionId {
  return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeEmptySession(provider: ChatProvider, model: string): ChatSession {
  return { id: newSessionId(), createdAt: Date.now(), provider, model, messages: [] }
}

function readPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) return null
    if (!parsed.sessions.some((s) => s.id === parsed.activeId)) return null
    return parsed
  } catch {
    return null
  }
}

/** Pick the provider+model an empty session should adopt. Chooses the user's
 *  default provider if it's configured; otherwise the first provider that has
 *  an API key (or non-empty ollamaModels list). Falls back to the user's
 *  default if nothing is configured at all so the UI stays self-consistent. */
function pickDefaultProviderModel(settings: Settings): { provider: ChatProvider; model: string } {
  const configured = new Set<Provider>(configuredProviders(settings))
  const provider: Provider = configured.has(settings.provider)
    ? settings.provider
    : ((['anthropic', 'openai', 'ollama'] as Provider[]).find((p) => configured.has(p)) ?? settings.provider)
  const models = provider === 'ollama' ? settings.ollamaModels : (getAdapter(provider).models ?? [])
  const stored = settings.defaultModel[provider]
  const model = models.length === 0
    ? stored
    : (models.includes(stored) ? stored : models[0])
  return { provider: provider as ChatProvider, model }
}

/** An empty session whose provider is no longer configured (e.g. the user
 *  removed that API key after creating it) becomes impossible to send to —
 *  it'd hit a "not configured" error. Reseed empty sessions to the current
 *  effective default at boot so the user isn't stuck looking at an impossible
 *  provider+model combo in the chat header. Sessions with messages are left
 *  alone — they're intentionally locked to their original pair. */
function reseedEmptyStaleSessions(state: PersistedState, settings: Settings): PersistedState {
  const configured = new Set<Provider>(configuredProviders(settings))
  if (configured.size === 0) return state  // nothing to reseed against
  let changed = false
  const next = state.sessions.map((s) => {
    if (s.messages.length > 0) return s   // locked — leave alone
    if (configured.has(s.provider as Provider)) return s   // already on a usable provider
    changed = true
    const fresh = pickDefaultProviderModel(settings)
    return { ...s, provider: fresh.provider, model: fresh.model }
  })
  if (!changed) return state
  return { ...state, sessions: next }
}

function deriveTitle(session: ChatSession): string {
  const firstUser = session.messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New chat'
  const oneLine = firstUser.content.replace(/\s+/g, ' ').trim()
  return oneLine.length > 40 ? oneLine.slice(0, 40).trimEnd() + '…' : (oneLine || 'New chat')
}

export function useChatSessions(args: UseChatSessionsArgs): UseChatSessionsApi {
  const { settings } = args

  const [state, setState] = useState<PersistedState>(() => {
    const persisted = readPersisted()
    if (persisted) return reseedEmptyStaleSessions(persisted, settings)
    const seed = pickDefaultProviderModel(settings)
    const session = makeEmptySession(seed.provider, seed.model)
    return { sessions: [session], activeId: session.id }
  })

  // If the user's API keys change at runtime (added a key, removed a key),
  // re-evaluate empty sessions so they migrate off any provider that just
  // became unconfigured. Sessions with messages are intentionally not
  // touched — they're locked to their original pair.
  useEffect(() => {
    setState((prev) => reseedEmptyStaleSessions(prev, settings))
    // Only react to apiKeys + ollamaModels changes; broader settings shifts
    // (font size, theme) shouldn't churn the chat session shape.
  }, [settings.apiKeys, settings.baseUrls, settings.ollamaModels])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore quota errors; storage layer can surface them later if needed.
    }
  }, [state])

  interface RuntimeState {
    busy: boolean
    abort: AbortController | null
    pendingApprovals: Map<string, PendingApproval>
    approvalResolvers: Map<string, (d: ApprovalDecision) => void>
    lastDiscarded: { previous: ChatMessage[]; discarded: ChatMessage[] } | null
  }

  const runtimeRef = useRef<Map<ChatSessionId, RuntimeState>>(new Map())
  const [runtimeVersion, setRuntimeVersion] = useState(0)
  const bumpRuntime = useCallback(() => setRuntimeVersion((v) => v + 1), [])

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const getRuntime = useCallback((id: ChatSessionId): RuntimeState => {
    let rt = runtimeRef.current.get(id)
    if (!rt) {
      rt = {
        busy: false,
        abort: null,
        pendingApprovals: new Map(),
        approvalResolvers: new Map(),
        lastDiscarded: null,
      }
      runtimeRef.current.set(id, rt)
    }
    return rt
  }, [])

  const patchSession = useCallback((id: ChatSessionId, patch: (s: ChatSession) => ChatSession) => {
    setState((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const next = [...prev.sessions]
      next[idx] = patch(next[idx])
      return { ...prev, sessions: next }
    })
  }, [])

  const getSession = useCallback((id: ChatSessionId): ChatSession | null => {
    return stateRef.current.sessions.find((s) => s.id === id) ?? null
  }, [])

  const active = useMemo(
    () => state.sessions.find((s) => s.id === state.activeId) ?? state.sessions[0],
    [state],
  )

  const sessions: SessionSummary[] = useMemo(() => {
    void runtimeVersion
    // eslint-disable-next-line react-hooks/refs -- runtimeVersion bump triggers recompute when ref mutates
    return state.sessions.map((s) => {
      const rt = runtimeRef.current.get(s.id)
      return {
        id: s.id,
        title: deriveTitle(s),
        provider: s.provider,
        model: s.model,
        busy: rt?.busy ?? false,
        pendingApprovalCount: rt?.pendingApprovals.size ?? 0,
      }
    })
  }, [state.sessions, runtimeVersion])

  const createSession = useCallback(() => {
    setState((prev) => {
      const seed = makeEmptySession(settings.provider, settings.defaultModel[settings.provider])
      return { sessions: [...prev.sessions, seed], activeId: seed.id }
    })
  }, [settings.provider, settings.defaultModel])

  const selectSession = useCallback((id: ChatSessionId) => {
    setState((prev) => (prev.sessions.some((s) => s.id === id) ? { ...prev, activeId: id } : prev))
  }, [])

  const closeSession = useCallback((id: ChatSessionId) => {
    const rt = runtimeRef.current.get(id)
    if (rt) {
      rt.abort?.abort()
      for (const [, resolve] of rt.approvalResolvers.entries()) resolve('deny')
      rt.approvalResolvers.clear()
    }
    runtimeRef.current.delete(id)
    setState((prev) => {
      const remaining = prev.sessions.filter((s) => s.id !== id)
      if (remaining.length === 0) {
        const seed = makeEmptySession(settings.provider, settings.defaultModel[settings.provider])
        return { sessions: [seed], activeId: seed.id }
      }
      if (prev.activeId !== id) return { ...prev, sessions: remaining }
      const newest = remaining[remaining.length - 1]
      return { sessions: remaining, activeId: newest.id }
    })
  }, [settings.provider, settings.defaultModel])

  const setActiveSessionProviderModel = useCallback((provider: ChatProvider, model: string) => {
    setState((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === prev.activeId)
      if (idx < 0) return prev
      const cur = prev.sessions[idx]
      if (cur.messages.length > 0) return prev
      const next = [...prev.sessions]
      next[idx] = { ...cur, provider, model }
      return { ...prev, sessions: next }
    })
  }, [])

  const __test_pushUserMessage = useCallback((text: string) => {
    setState((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === prev.activeId)
      if (idx < 0) return prev
      const cur = prev.sessions[idx]
      const next = [...prev.sessions]
      next[idx] = {
        ...cur,
        messages: [...cur.messages, {
          id: `u-test-${Math.random().toString(36).slice(2, 7)}`,
          role: 'user',
          content: text,
          provider: cur.provider,
        }],
      }
      return { ...prev, sessions: next }
    })
  }, [])

  const activeSessionApiKeyMissing = active.provider === 'ollama'
    ? !settings.baseUrls?.ollama
    : !settings.apiKeys[active.provider]
  const apiKeyMissing =
    !settings.baseUrls?.ollama &&
    !Object.values(settings.apiKeys).some((k) => !!k)
  const missingProviderToast = active.provider === 'ollama'
    ? 'Set the Ollama base URL first.'
    : 'Add an API key first.'

  const meterTotals = useMemo(
    () => chatTotals(active.messages, active.provider, active.model, settings.pricingOverrides),
    [active.messages, active.provider, active.model, settings.pricingOverrides],
  )

  const pendingApprovals = useMemo(() => {
    void runtimeVersion
    // eslint-disable-next-line react-hooks/refs -- runtimeVersion bump triggers recompute when ref mutates
    return getRuntime(active.id).pendingApprovals
  }, [active.id, runtimeVersion, getRuntime])

  const requestApproval = useCallback(
    async (sessionId: ChatSessionId, call: ToolCall, preview: WritePreview): Promise<ApprovalDecision> => {
      return new Promise<ApprovalDecision>((resolve) => {
        const rt = getRuntime(sessionId)
        rt.approvalResolvers.set(call.id, resolve)
        const next = new Map(rt.pendingApprovals)
        next.set(call.id, { callId: call.id, preview, state: 'pending' })
        rt.pendingApprovals = next
        bumpRuntime()
      })
    },
    [bumpRuntime, getRuntime],
  )

  const runTurn = useCallback(
    async (sessionId: ChatSessionId, history: ChatMessage[]) => {
      const rt = getRuntime(sessionId)
      if (rt.busy) return
      if (!args.workspace.tree) {
        args.showToast('Open a workspace first.')
        return
      }
      const session = stateRef.current.sessions.find((s) => s.id === sessionId)
      if (!session) return

      const lockedProvider: ChatProvider = (history[0]?.provider ?? session.provider) as ChatProvider
      rt.busy = true
      rt.abort = new AbortController()
      bumpRuntime()

      const adapter = getAdapter(lockedProvider)
      const model = session.model
      const view = args.getActiveEditor()
      const lineCount = view ? view.state.doc.lines : 0
      const inventory = buildInventory({
        tree: args.workspace.tree,
        activeDocPath: args.workspace.activeMarkdownRel ?? null,
        activeDocLineCount: lineCount,
        pinned: args.workspace.pinned.map((p) => p.relPath),
      })
      const inventoryText = formatInventoryForPrompt(inventory)

      const systemPreamble = buildChatSystemPreamble({ activeProfile: args.activeProfile })

      try {
        await runChatTurn({
          adapter,
          provider: lockedProvider,
          history,
          inventoryText,
          systemPreamble,
          toolBudget: args.settings.chatToolBudget,
          toolCtx: {
            fs: { ...getFs(), writeFile: args.workspace.writeFileFromTool },
            activeDocPath: args.workspace.activeMarkdownRel ?? null,
            getEditorContent: (path) => {
              if (path !== args.workspace.activeMarkdownRel) return null
              const v = args.getActiveEditor()
              return v ? v.state.doc.toString() : null
            },
            applyEditorEdit: async (path, newContent) => {
              const v = args.getActiveEditor()
              if (!v) throw new Error('Editor not ready')
              if (path !== args.workspace.activeMarkdownRel) throw new Error(`Cannot apply editor edit to non-active path: ${path}`)
              v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: newContent } })
            },
            workspace: { applyEdits: args.workspace.applyEdits },
            signal: rt.abort.signal,
          },
          requestApproval: (call, preview) => requestApproval(sessionId, call, preview),
          onUpdate: (m) => {
            if (rt.lastDiscarded && m.some((x) => x.role === 'assistant' && x.content.length > 0)) {
              args.dismissRetryUndo()
              rt.lastDiscarded = null
            }
            patchSession(sessionId, (s) => ({ ...s, messages: [...m] }))
          },
          model,
          maxTokens: args.settings.maxOutputTokens[lockedProvider],
          apiKey: args.settings.apiKeys[lockedProvider],
          baseUrl: args.settings.baseUrls?.[lockedProvider],
          signal: rt.abort.signal,
          chunkDelayMs: args.settings.streamChunkDelayMs,
          historyClient: args.historyClient ?? null,
          onHistoryError: (e) => args.showToast(`History error: ${e.message}`),
        })
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') {
          // Stop button — runner already updated state.
        }
      } finally {
        rt.busy = false
        rt.abort = null
        bumpRuntime()
      }
    },
    [args, requestApproval, bumpRuntime, getRuntime, patchSession],
  )

  const sendChat = useCallback(async (text: string) => {
    if (activeSessionApiKeyMissing) {
      args.openSettingsTab()
      args.showToast(missingProviderToast)
      return
    }
    const sessionId = active.id
    const rt = getRuntime(sessionId)
    if (rt.busy) return
    if (!args.workspace.tree) {
      args.showToast('Open a workspace first.')
      return
    }
    const lockedProvider: ChatProvider = (active.messages[0]?.provider ?? active.provider) as ChatProvider
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: text,
      ...(active.messages.length === 0 ? { provider: lockedProvider } : {}),
    }
    const next = [...active.messages, userMsg]
    patchSession(sessionId, (s) => ({ ...s, messages: next }))
    await runTurn(sessionId, next)
  }, [active, activeSessionApiKeyMissing, args, runTurn, getRuntime, patchSession, missingProviderToast])

  const onApprovalDecide = useCallback((callId: string, decision: ApprovalDecision) => {
    const rt = runtimeRef.current.get(active.id)
    if (!rt) return
    const resolver = rt.approvalResolvers.get(callId)
    if (!resolver) return
    rt.approvalResolvers.delete(callId)
    const cur = rt.pendingApprovals.get(callId)
    if (cur) {
      const next = new Map(rt.pendingApprovals)
      next.set(callId, { ...cur, state: decision === 'deny' ? 'denied' : 'approved' })
      rt.pendingApprovals = next
    }
    bumpRuntime()
    resolver(decision)
  }, [active.id, bumpRuntime])

  const retryFromAnchor = useCallback((anchorId: string) => {
    if (activeSessionApiKeyMissing) { args.openSettingsTab(); args.showToast(missingProviderToast); return }
    const rt = getRuntime(active.id)
    if (rt.busy) return
    const { kept, discarded } = truncateForRetry(active.messages, anchorId)
    rt.lastDiscarded = { previous: active.messages, discarded }
    patchSession(active.id, (s) => ({ ...s, messages: kept }))
    if (discarded.length > 0) args.showRetryUndoToast(discarded.length)
    void runTurn(active.id, kept)
  }, [active, activeSessionApiKeyMissing, args, runTurn, getRuntime, patchSession, missingProviderToast])

  const editAndRetry = useCallback((newText: string) => {
    if (activeSessionApiKeyMissing) { args.openSettingsTab(); args.showToast(missingProviderToast); return }
    const rt = getRuntime(active.id)
    if (rt.busy) return
    const { kept, discarded } = truncateForEditAndRetry(active.messages, newText)
    rt.lastDiscarded = { previous: active.messages, discarded }
    patchSession(active.id, (s) => ({ ...s, messages: kept }))
    if (discarded.length > 0) args.showRetryUndoToast(discarded.length)
    void runTurn(active.id, kept)
  }, [active, activeSessionApiKeyMissing, args, runTurn, getRuntime, patchSession, missingProviderToast])

  const undoRetry = useCallback(() => {
    const rt = getRuntime(active.id)
    if (!rt.lastDiscarded) return
    rt.abort?.abort()
    rt.abort = null
    rt.busy = false
    patchSession(active.id, (s) => ({ ...s, messages: rt.lastDiscarded!.previous }))
    rt.lastDiscarded = null
    args.dismissRetryUndo()
    bumpRuntime()
  }, [active.id, args, bumpRuntime, getRuntime, patchSession])

  const stopChat = useCallback(() => {
    const rt = getRuntime(active.id)
    rt.abort?.abort()
    rt.abort = null
    const nextApprovals = new Map(rt.pendingApprovals)
    for (const [id, resolve] of rt.approvalResolvers.entries()) {
      const cur = nextApprovals.get(id)
      if (cur) nextApprovals.set(id, { ...cur, state: 'cancelled' })
      resolve('deny')
    }
    rt.pendingApprovals = nextApprovals
    rt.approvalResolvers.clear()
    rt.busy = false
    bumpRuntime()
  }, [active.id, bumpRuntime, getRuntime])

  const clearChat = useCallback(() => {
    const rt = getRuntime(active.id)
    rt.abort?.abort()
    rt.abort = null
    for (const [, resolve] of rt.approvalResolvers.entries()) resolve('deny')
    rt.approvalResolvers.clear()
    rt.pendingApprovals = new Map()
    rt.busy = false
    patchSession(active.id, (s) => ({ ...s, messages: [] }))
    bumpRuntime()
  }, [active.id, bumpRuntime, getRuntime, patchSession])

  const chatBusy = useMemo(() => {
    void runtimeVersion
    // eslint-disable-next-line react-hooks/refs -- runtimeVersion bump triggers recompute when ref mutates
    return getRuntime(active.id).busy
  }, [active.id, runtimeVersion, getRuntime])

  const [followLatest, setFollowLatest] = useState(settings.autoScroll)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror persisted setting into ephemeral session state
    setFollowLatest(settings.autoScroll)
  }, [settings.autoScroll])

  return useMemo(
    () => ({
      chatMessages: active.messages,
      chatProvider: active.provider,
      chatModel: active.model,
      sessions,
      allSessions: state.sessions,
      activeId: active.id,
      getSession,
      createSession,
      selectSession,
      closeSession,
      setActiveSessionProviderModel,
      __test_pushUserMessage,
      apiKeyMissing,
      meterTotals,
      pendingApprovals,
      followLatest,
      setFollowLatest,
      sendChat,
      chatBusy,
      onApprovalDecide,
      retryFromAnchor,
      editAndRetry,
      undoRetry,
      stopChat,
      clearChat,
    }),
    [active, sessions, state.sessions, getSession, createSession, selectSession, closeSession, setActiveSessionProviderModel, __test_pushUserMessage, apiKeyMissing, meterTotals, pendingApprovals, followLatest, sendChat, chatBusy, onApprovalDecide, retryFromAnchor, editAndRetry, undoRetry, stopChat, clearChat],
  )
}

