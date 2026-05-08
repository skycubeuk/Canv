import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { ChatMessage, ChatProvider, PendingApproval } from '../components/ChatPanel'
import { runChatTurn, type ApprovalDecision, type WritePreview } from '../agents/chatRunner'
import { truncateForRetry, truncateForEditAndRetry } from '../agents/retryOrchestrator'
import { buildInventory, formatInventoryForPrompt } from '../lib/inventory'
import type { ToolCall } from '../adapters/types'
import { getAdapter } from '../adapters'
import { getFs } from '../lib/fs'
import { chatTotals } from '../lib/chatUsage'
import { EditorView } from '@codemirror/view'
import type { Mode } from '../config/types'
import type { useSettings } from './useSettings'
import type { useWorkspace } from './useWorkspace'
import type { useDialogs } from '../lib/dialogs'

type SettingsApi = ReturnType<typeof useSettings>
type WorkspaceApi = ReturnType<typeof useWorkspace>
type DialogsApi = ReturnType<typeof useDialogs>

export interface UseChatSessionArgs {
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
}

export interface UseChatSessionApi {
  chatMessages: ChatMessage[]
  chatBusy: boolean
  pendingApprovals: Map<string, PendingApproval>
  followLatest: boolean
  setFollowLatest: React.Dispatch<React.SetStateAction<boolean>>
  apiKeyMissing: boolean
  chatProvider: string
  chatModel: string
  meterTotals: ReturnType<typeof chatTotals>
  sendChat: (text: string) => Promise<void>
  retryFromAnchor: (anchorId: string) => void
  editAndRetry: (newText: string) => void
  undoRetry: () => void
  stopChat: () => void
  clearChat: () => void
  requestProviderChange: (next: ChatProvider) => Promise<void>
  onApprovalDecide: (callId: string, decision: ApprovalDecision) => void
}

export function useChatSession(args: UseChatSessionArgs): UseChatSessionApi {
  const {
    settings, update, workspace, activeProfile,
    getActiveEditor, showToast, openSettingsTab,
    showRetryUndoToast, dismissRetryUndo, dialogs,
  } = args

  const lastDiscardedRef = useRef<{ previous: ChatMessage[]; discarded: ChatMessage[] } | null>(null)

  const [chatMessages, setChatMessages] = useLocalStorage<ChatMessage[]>('canv:chat', [])
  const [chatBusy, setChatBusy] = useState(false)
  const chatAbort = useRef<AbortController | null>(null)
  const runningRef = useRef(false)

  const [followLatest, setFollowLatest] = useState(true)
  // Settings → Streaming → Auto-scroll is the master switch. Reset the
  // session-level followLatest to match settings.autoScroll on each change.
  // Within a session, ChatPanel's scroll-up-to-pause logic still overrides
  // this on each scroll event.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the whole point of this effect: mirror persisted setting into ephemeral session state
    setFollowLatest(settings.autoScroll)
  }, [settings.autoScroll])

  const apiKeyMissing = !settings.apiKeys[settings.provider]

  const [pendingApprovals, setPendingApprovals] = useState<Map<string, PendingApproval>>(new Map())
  const approvalResolversRef = useRef<Map<string, (d: ApprovalDecision) => void>>(new Map())
  const requestApprovalRef = useRef<(call: ToolCall, preview: WritePreview) => Promise<ApprovalDecision>>(
    async (call, preview) => {
      const id = call.id
      console.debug('[approval] request', { id, name: call.name, kind: preview.kind, path: preview.path })
      return new Promise<ApprovalDecision>((resolve) => {
        approvalResolversRef.current.set(id, resolve)
        setPendingApprovals((prev) => {
          const m = new Map(prev)
          m.set(id, { callId: id, preview, state: 'pending' })
          return m
        })
      })
    },
  )

  const onApprovalDecide = useCallback((callId: string, decision: ApprovalDecision) => {
    const resolver = approvalResolversRef.current.get(callId)
    if (!resolver) return
    approvalResolversRef.current.delete(callId)
    setPendingApprovals((prev) => {
      const m = new Map(prev)
      const cur = m.get(callId)
      if (cur) m.set(callId, { ...cur, state: decision === 'deny' ? 'denied' : 'approved' })
      return m
    })
    resolver(decision)
  }, [])

  const runTurn = useCallback(
    async (history: ChatMessage[]) => {
      if (runningRef.current) return
      if (!workspace.tree) {
        showToast('Open a workspace first.')
        return
      }
      runningRef.current = true
      const lockedProvider: ChatProvider = (history[0]?.provider ?? settings.provider) as ChatProvider
      setChatBusy(true)

      const adapter = getAdapter(lockedProvider)
      const model = settings.defaultModel[lockedProvider]
      const view = getActiveEditor()
      const lineCount = view ? view.state.doc.lines : 0
      const tree = workspace.tree
      const inventory = buildInventory({
        tree,
        activeDocPath: workspace.activeMarkdownRel ?? null,
        activeDocLineCount: lineCount,
        pinned: workspace.pinned.map((p) => p.relPath),
      })
      const inventoryText = formatInventoryForPrompt(inventory)
      const systemPreamble = `${activeProfile.chatSystemPrompt}

You have tools to read, search, and modify the user's workspace files.

WHEN TO EDIT — read carefully:

Default to answering in chat. Do NOT call mutating tools (\`edit_file\`, \`create_file\`, \`delete_file\`, \`rename_file\`, \`create_folder\`) unless the user has explicitly asked you to modify a file. An explicit ask means one of:

- The user named a file/path ("update README.md", "add this to notes/foo.md").
- The user used a clear file-mutation verb ("edit", "update", "save", "add to <file>", "append to <file>", "create <file>").

A generic request like "write me a function" or "draft a paragraph about X" is NOT an instruction to edit a file — answer in chat.

If a request is ambiguous (e.g., the user says "write X" while a file is open in the editor), do NOT treat the active editor as an implicit target. Either answer in chat, or ask the user where to save it. Do not edit and then ask for forgiveness — \`edit_file\` is expensive because it requires the complete new file body.

Read-only tools (\`read_file\`, search, list) are not gated by this rule — use them freely when they help.

HOW TO EDIT — when an edit is warranted (per the rule above), follow these:

1. To change a file, you MUST emit an \`edit_file\` (or \`create_file\` / \`rename_file\` / \`delete_file\` / \`create_folder\`) tool call. Do not write the new file content as your assistant text — that is forbidden.

2. Never paste full or near-full file content into your reply text. Once you've decided to edit a file, the content goes in the \`content\` parameter of the tool call, not in prose.

3. The user sees a diff before approving every mutating call. You do not need to "show" the change in prose — the diff is the preview.

4. Your assistant text should be SHORT — a one-line summary of what you are about to do, then the tool call. After the tool result returns, you may briefly confirm what was done.

5. To inspect a file, call \`read_file\`. Never guess content.

6. For \`edit_file\`, the \`content\` parameter must be the COMPLETE new file body. Partial edits / patches are not supported. Because this is a full rewrite, prefer one well-scoped edit over several small ones.

Concrete example. User says "update foo.md to include a new section". You should:
- (optional) call \`read_file\` on foo.md if you don't already have it
- emit \`edit_file({ path: "foo.md", content: "<full new file body>" })\`
- in your assistant text, say at most: "I'll add the new section." or similar — do NOT include the file content in the text.

PLANNING. For any task that will take 3 or more tool calls, call \`set_todos\` BEFORE your first action with the full plan. As you work, call \`set_todos\` again to flip exactly one item to \`in_progress\` at a time and mark items \`completed\` as you finish them. Pass the entire list every call — the previous list is replaced, not patched. When the work is fully done, call \`set_todos\` with an empty list. Do not narrate the plan in prose; the todo card IS the plan.`

      const controller = new AbortController()
      chatAbort.current = controller

      try {
        await runChatTurn({
          adapter,
          provider: lockedProvider,
          history,
          inventoryText,
          systemPreamble,
          toolBudget: settings.chatToolBudget,
          toolCtx: {
            // Wrap fs.writeFile so tool-driven writes record the mtime in the
            // workspace's own-write window — otherwise chokidar's 'change'
            // event surfaces a "file changed on disk" conflict for our own
            // edit. Also keeps any open tabs' editor buffers in sync.
            fs: { ...getFs(), writeFile: workspace.writeFileFromTool },
            activeDocPath: workspace.activeMarkdownRel ?? null,
            getEditorContent: (path) => {
              if (path !== workspace.activeMarkdownRel) return null
              const v = getActiveEditor()
              return v ? v.state.doc.toString() : null
            },
            applyEditorEdit: async (path, newContent) => {
              const v = getActiveEditor()
              if (!v) throw new Error('Editor not ready')
              if (path !== workspace.activeMarkdownRel) throw new Error(`Cannot apply editor edit to non-active path: ${path}`)
              v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: newContent } })
            },
            signal: controller.signal,
          },
          requestApproval: (call, preview) => requestApprovalRef.current(call, preview),
          onUpdate: (m) => {
            // If we're in a retry-undo window and the new run has produced any
            // assistant content, the user has committed to the new turn — dismiss
            // the undo offer so they can't accidentally roll it back after
            // meaningful streaming has happened.
            if (lastDiscardedRef.current && m.some((x) => x.role === 'assistant' && x.content.length > 0)) {
              dismissRetryUndo()
              lastDiscardedRef.current = null
            }
            setChatMessages([...m])
          },
          model,
          maxTokens: settings.maxOutputTokens[lockedProvider],
          apiKey: settings.apiKeys[lockedProvider],
          signal: controller.signal,
          chunkDelayMs: settings.streamChunkDelayMs,
        })
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') {
          // Stop button — runner already updated state.
        }
        // Provider errors are now captured as a synthetic ChatMessage by the runner;
        // nothing to do here.
      } finally {
        runningRef.current = false
        setChatBusy(false)
        chatAbort.current = null
      }
    },
    [settings, getActiveEditor, workspace, activeProfile, setChatMessages, showToast, dismissRetryUndo],
  )

  const sendChat = useCallback(
    async (text: string) => {
      if (apiKeyMissing) {
        openSettingsTab()
        showToast('Add an API key first.')
        return
      }
      if (chatBusy) return
      if (!workspace.tree) {
        showToast('Open a workspace first.')
        return
      }

      const lockedProvider: ChatProvider = (chatMessages[0]?.provider ?? settings.provider) as ChatProvider
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        content: text,
        ...(chatMessages.length === 0 ? { provider: lockedProvider } : {}),
      }
      const next = [...chatMessages, userMsg]
      setChatMessages(next)
      await runTurn(next)
    },
    [apiKeyMissing, chatBusy, chatMessages, settings.provider, workspace.tree, openSettingsTab, showToast, setChatMessages, runTurn],
  )

  const retryFromAnchor = useCallback(
    (anchorId: string) => {
      if (apiKeyMissing) {
        openSettingsTab()
        showToast('Add an API key first.')
        return
      }
      if (chatBusy) return
      const { kept, discarded } = truncateForRetry(chatMessages, anchorId)
      lastDiscardedRef.current = { previous: chatMessages, discarded }
      setChatMessages(kept)
      if (discarded.length > 0) showRetryUndoToast(discarded.length)
      void runTurn(kept)
    },
    [apiKeyMissing, openSettingsTab, showToast, chatBusy, chatMessages, setChatMessages, runTurn, showRetryUndoToast],
  )

  const editAndRetry = useCallback(
    (newText: string) => {
      if (apiKeyMissing) {
        openSettingsTab()
        showToast('Add an API key first.')
        return
      }
      if (chatBusy) return
      const { kept, discarded } = truncateForEditAndRetry(chatMessages, newText)
      lastDiscardedRef.current = { previous: chatMessages, discarded }
      setChatMessages(kept)
      if (discarded.length > 0) showRetryUndoToast(discarded.length)
      void runTurn(kept)
    },
    [apiKeyMissing, openSettingsTab, showToast, chatBusy, chatMessages, setChatMessages, runTurn, showRetryUndoToast],
  )

  const undoRetry = useCallback(() => {
    const stash = lastDiscardedRef.current
    if (!stash) return
    // Abort any in-flight new run so it doesn't keep streaming into the
    // restored history.
    chatAbort.current?.abort()
    chatAbort.current = null
    runningRef.current = false
    setChatBusy(false)
    setChatMessages(stash.previous)
    lastDiscardedRef.current = null
    dismissRetryUndo()
  }, [setChatMessages, dismissRetryUndo])

  const stopChat = useCallback(() => {
    console.debug('[stopChat] called; abortable?', !!chatAbort.current, 'pendingApprovals=', approvalResolversRef.current.size)
    chatAbort.current?.abort()
    chatAbort.current = null
    for (const [id, resolve] of approvalResolversRef.current.entries()) {
      setPendingApprovals((prev) => {
        const m = new Map(prev)
        const cur = m.get(id)
        if (cur) m.set(id, { ...cur, state: 'cancelled' })
        return m
      })
      resolve('deny')
    }
    approvalResolversRef.current.clear()
    setChatBusy(false)
  }, [])

  const clearChat = useCallback(() => {
    chatAbort.current?.abort()
    chatAbort.current = null
    for (const [, resolve] of approvalResolversRef.current.entries()) {
      resolve('deny')
    }
    approvalResolversRef.current.clear()
    setPendingApprovals(new Map())
    setChatBusy(false)
    setChatMessages([])
  }, [setChatMessages])

  const requestProviderChange = useCallback(async (next: ChatProvider) => {
    if (chatMessages.length === 0 || chatMessages[0].provider === next) {
      update({ provider: next })
      return
    }
    const ok = await dialogs.confirm({
      title: 'Switch provider?',
      message: `This chat is locked to ${chatMessages[0].provider}. Switching will clear the chat. Continue?`,
      confirmLabel: 'Clear chat & switch',
      danger: true,
    })
    if (!ok) return
    clearChat()
    update({ provider: next })
  }, [chatMessages, update, dialogs, clearChat])

  // Realign settings.provider to the chat's locked provider when the chat has messages.
  useEffect(() => {
    const locked = chatMessages[0]?.provider
    if (locked && settings.provider !== locked) {
      update({ provider: locked })
    }
  }, [chatMessages, settings.provider, update])

  const chatProvider = useMemo(() => getAdapter(settings.provider).name, [settings.provider])
  const chatModel = settings.defaultModel[settings.provider]
  const meterTotals = useMemo(
    () => chatTotals(chatMessages, settings.provider, settings.defaultModel[settings.provider], settings.pricingOverrides),
    [chatMessages, settings.defaultModel, settings.provider, settings.pricingOverrides],
  )

  return useMemo(() => ({
    chatMessages,
    chatBusy,
    pendingApprovals,
    followLatest,
    setFollowLatest,
    apiKeyMissing,
    chatProvider,
    chatModel,
    meterTotals,
    sendChat,
    retryFromAnchor,
    editAndRetry,
    undoRetry,
    stopChat,
    clearChat,
    requestProviderChange,
    onApprovalDecide,
  }), [
    chatMessages,
    chatBusy,
    pendingApprovals,
    followLatest,
    setFollowLatest,
    apiKeyMissing,
    chatProvider,
    chatModel,
    meterTotals,
    sendChat,
    retryFromAnchor,
    editAndRetry,
    undoRetry,
    stopChat,
    clearChat,
    requestProviderChange,
    onApprovalDecide,
  ])
}
