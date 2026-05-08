import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { Play, MessageSquare, AlertTriangle, FileText } from 'lucide-react'
import { Canvas } from './components/Canvas'
import { FloatingToolbar } from './components/FloatingToolbar'
import { useContextMenu, type ContextMenuItem } from './lib/contextMenu'
import { selectAll as cmSelectAll } from '@codemirror/commands'
import { type RunRecord } from './components/ResultsPanel'
import type { ChatMessage, ChatProvider, PendingApproval } from './components/ChatPanel'
import { runChatTurn, type ApprovalDecision, type WritePreview } from './agents/chatRunner'
import { buildInventory, formatInventoryForPrompt } from './lib/inventory'
import type { ToolCall } from './adapters/types'
import { ProfilePicker } from './components/ProfilePicker'
import { MigrationModal } from './components/MigrationModal'
import { legacyStateExists } from './lib/legacyState'
import { IdeShell, type DockSlot } from './components/ide/IdeShell'
import { DockPlacementMenu } from './components/ide/DockPlacementMenu'
import { LeftSidebar } from './components/ide/LeftSidebar'
import { EditorArea } from './components/ide/EditorArea'
import { BottomPanel, type BottomPanelTabDef } from './components/ide/BottomPanel'
import { StatusBar } from './components/ide/StatusBar'
import { FilesTab } from './components/ide/sidebar/FilesTab'
import { SearchTab } from './components/ide/sidebar/SearchTab'
import { GitTab } from './components/ide/sidebar/GitTab'
import { OutlinePanel } from './components/ide/sidebar/OutlinePanel'
import { useOutline } from './hooks/useOutline'
import { useFocusedDocText, createLiveDocsChannel } from './hooks/useFocusedDocText'
import { DiffTab } from './components/ide/tabs/DiffTab'
import type { SearchMatch } from './lib/searchTypes'
import { findMatchInDoc } from './lib/findMatchInDoc'
import { SettingsTab } from './components/ide/tabs/SettingsTab'
import { RunsTab } from './components/ide/bottom/RunsTab'
import { ChatTab } from './components/ide/bottom/ChatTab'
import { ProblemsTab } from './components/ide/bottom/ProblemsTab'
import { OutputTab } from './components/ide/bottom/OutputTab'
import { useLintIssues, tabSourceFromMarkdown, type OpenTabSource } from './hooks/useLintIssues'
import type { LintIssue } from './lib/lintTypes'
import { useSettings } from './hooks/useSettings'
import { useWorkspace } from './hooks/useWorkspace'
import type { EditorGroupId } from './types/workspace'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useIdeLayout, type BottomLayout } from './hooks/useIdeLayout'
import { useEditorStats } from './hooks/useEditorStats'
import { useCommands } from './hooks/useCommands'
import { CommandPalette, type PaletteMode, type PaletteFile } from './components/ide/CommandPalette'
import { getAdapter } from './adapters'
import { runAgent, buildPrompt, parseAgentResponse } from './agents/runner'
import type { Action as AgentDef } from './config/types'
import { useModes, getActionById, getModeById } from './hooks/useModes'
import { DocumentAgentInstructionModal } from './components/DocumentAgentInstructionModal'
import { isElectron, flattenTree, getFs } from './lib/fs'
import { exportBackup } from './lib/backup'
import { SETTINGS_TAB_KEY, tabKey } from './lib/tabKey'
import { useDialogs } from './lib/dialogs'
import OpenRemoteDialog from './components/dialogs/OpenRemoteDialog'
import type { RecentRemote } from './lib/fs'
import { useDockBridge } from './hooks/useDockBridge'
import type { DockState, DockRun, UserAction } from './lib/dockTypes'
import { applyAccent, applyTheme, resolveTheme } from './lib/accent'
import { TopBar } from './components/ide/TopBar'
import { RunControlsMenu } from './components/ide/RunControlsMenu'
import { chatTotals } from './lib/chatUsage'

const MAX_RUNS = 10

function editorMapKey(groupId: EditorGroupId, rel: string): string {
  return `${groupId}:${rel}`
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

function dockSlotForPlacement(bottom: BottomLayout): DockSlot {
  if (!bottom.visible) return 'none'
  if (bottom.placement === 'popout') return 'none'
  return bottom.placement // 'bottom' | 'right'
}

export default function App() {
  const dialogs = useDialogs()
  const { settings, update, modelForAgent } = useSettings()

  useEffect(() => {
    applyAccent(settings.accent)
    applyTheme(resolveTheme(settings.theme))
  }, [settings.accent, settings.theme])

  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings.theme])

  const [profile, setProfile] = useLocalStorage<string | null>('canv:profile', null)
  const { modes, defaultModeId } = useModes()
  const activeProfileId = profile ?? defaultModeId
  const activeProfile = modes.find((m) => m.id === activeProfileId) ?? modes.find((m) => m.id === defaultModeId)!
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'first-launch' | 'switch'>('first-launch')
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false)
  const [recentRemotes, setRecentRemotes] = useState<RecentRemote[]>([])

  const [migrationOpen, setMigrationOpen] = useState(() => isElectron() && legacyStateExists())

  const [runs, setRuns] = useLocalStorage<RunRecord[]>('canv:runs', [])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [chatMessages, setChatMessages] = useLocalStorage<ChatMessage[]>('canv:chat', [])
  const [chatBusy, setChatBusy] = useState(false)
  const chatAbort = useRef<AbortController | null>(null)

  const runAbort = useRef<Map<string, AbortController>>(new Map())

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const workspace = useWorkspace({ onToast: showToast })
  const { openSettingsTab } = workspace
  const ideLayout = useIdeLayout(workspace.root)

  const commands = useCommands()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('commands')
  const [followLatest, setFollowLatest] = useState(true)
  const [runMenuOpen, setRunMenuOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [revealFolderRel, setRevealFolderRel] = useState<string | null>(null)
  const [pendingDocAgent, setPendingDocAgent] = useState<AgentDef | null>(null)

  // Map from `${groupId}:${rel}` → EditorView instance, populated when a Canvas mounts.
  const editorsRef = useRef<Map<string, EditorView>>(new Map())
  // Force a re-render after editor map mutation so consumers (FloatingToolbar) get a fresh editor reference.
  const [editorsBump, bumpEditorRev] = useState(0)

  const liveDocsChannel = useMemo(() => createLiveDocsChannel(), [])
  const bumpEditors = useCallback(() => bumpEditorRev((n) => n + 1), [])

  const openSources = useMemo<OpenTabSource[]>(() => {
    const seen = new Set<string>()
    const out: OpenTabSource[] = []
    for (const g of workspace.editorGroups) {
      for (const t of g.openTabs) {
        if (t.kind !== 'markdown') continue
        if (seen.has(t.relPath)) continue
        seen.add(t.relPath)
        // eslint-disable-next-line react-hooks/refs -- editorsBump in deps re-runs this memo on editor mount/unmount, so editorsRef.current is fresh
        const ed = editorsRef.current.get(editorMapKey(g.id, t.relPath))
        const md = ed ? ed.state.doc.toString() : t.loadedMarkdown
        out.push(tabSourceFromMarkdown(t.relPath, md))
      }
    }
    return out
    // editorsBump bumps when an editor mounts/unmounts so getHTML() picks up
    // newly-mounted editors. ESLint can't see this dependency because the value
    // is read from editorsRef.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.editorGroups, editorsBump])

  const lintIssuesApi = useLintIssues({
    openSources,
    tree: workspace.tree,
    opts: settings.lintRules,
  })

  const getActiveEditor = useCallback((): EditorView | null => {
    if (!workspace.activeMarkdownRel) return null
    return editorsRef.current.get(editorMapKey(workspace.activeGroupId, workspace.activeMarkdownRel)) ?? null
  }, [workspace.activeGroupId, workspace.activeMarkdownRel])

  const getActiveEditorForGroup = useCallback(
    (groupId: EditorGroupId): EditorView | null => {
      const group = workspace.editorGroups.find((g) => g.id === groupId)
      if (!group || !group.activeTabKey) return null
      const tab = group.openTabs.find((t) => tabKey(t) === group.activeTabKey)
      if (!tab || tab.kind !== 'markdown') return null
      return editorsRef.current.get(editorMapKey(groupId, tab.relPath)) ?? null
    },
    [workspace.editorGroups],
  )

  const handleEditorReady = useCallback((groupId: EditorGroupId, rel: string, view: EditorView) => {
    editorsRef.current.set(editorMapKey(groupId, rel), view)
    bumpEditors()
  }, [bumpEditors])

  const handleEditorDestroy = useCallback((groupId: EditorGroupId, rel: string) => {
    editorsRef.current.delete(editorMapKey(groupId, rel))
    bumpEditors()
  }, [bumpEditors])

  const handleJumpToMatch = useCallback(async (match: SearchMatch, q: { query: string; regex: boolean; caseSensitive: boolean }, ordinalInFile: number) => {
    await workspace.openTab(match.rel)
    let attempts = 0
    const tryJump = () => {
      const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, match.rel))
      if (!view) {
        if (attempts++ < 20) setTimeout(tryJump, 30)
        return
      }
      const range = findMatchInDoc(view, q.query, { regex: q.regex, caseSensitive: q.caseSensitive }, ordinalInFile)
      if (range) {
        view.dispatch({
          selection: { anchor: range.from, head: range.to },
          scrollIntoView: true,
        })
        view.focus()
      } else {
        view.focus()
      }
    }
    setTimeout(tryJump, 0)
  }, [workspace])

  const handleJumpToProblem = useCallback(async (issue: LintIssue) => {
    await workspace.openTab(issue.rel)

    // Two issues with the same `match` text on different lines (e.g. the same
    // broken link repeated twice) need different ordinals — otherwise both
    // clicks jump to the first occurrence. Mirrors handleJumpToMatch's logic.
    const sameFileSameMatch = lintIssuesApi.issues
      .filter((i) => i.rel === issue.rel && i.match === issue.match)
      .sort((a, b) => a.line - b.line)
    const ordinalInFile = Math.max(0, sameFileSameMatch.indexOf(issue))

    let attempts = 0
    const tryJump = () => {
      const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, issue.rel))
      if (!view) {
        if (attempts++ < 20) setTimeout(tryJump, 30)
        return
      }
      const range = findMatchInDoc(view, issue.match, { regex: false, caseSensitive: true }, ordinalInFile)
      if (range) {
        view.dispatch({
          selection: { anchor: range.from, head: range.to },
          scrollIntoView: true,
        })
        view.focus()
      } else {
        view.focus()
      }
    }
    setTimeout(tryJump, 0)
  }, [workspace, lintIssuesApi.issues])

  const handleClickBreadcrumbFolder = useCallback((folderRel: string) => {
    ideLayout.setSidebarTab('files')
    if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar()
    setRevealFolderRel(folderRel)
    // Clear in a microtask so consecutive clicks on the same folder still
    // bump the prop and re-trigger the FileTree expand effect.
    setTimeout(() => setRevealFolderRel(null), 0)
  }, [ideLayout])

  const handleOpenDiff = useCallback((rel: string, baseRef: string = 'HEAD') => {
    workspace.openDiffTab(rel, baseRef)
  }, [workspace])

  const handleOutlineJump = useCallback((line: number) => {
    const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, workspace.activeMarkdownRel ?? ''))
    if (!view) return
    const doc = view.state.doc
    const safeLine = Math.max(1, Math.min(line, doc.lines))
    const linePos = doc.line(safeLine).from
    view.dispatch({
      selection: { anchor: linePos },
      effects: EditorView.scrollIntoView(linePos, { y: 'start', yMargin: 8 }),
    })
    view.focus()
  }, [workspace.activeGroupId, workspace.activeMarkdownRel])

  // Focus the active group's editor whenever the active group or active
  // markdown rel changes.
  useEffect(() => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    const groupId = workspace.activeGroupId
    let cancelled = false
    let attempts = 0
    const tryFocus = () => {
      if (cancelled) return
      const view = editorsRef.current.get(editorMapKey(groupId, rel))
      if (!view) {
        if (attempts++ < 10) setTimeout(tryFocus, 16)
        return
      }
      setTimeout(() => {
        if (cancelled) return
        view.focus()
      }, 0)
    }
    setTimeout(tryFocus, 0)
    return () => { cancelled = true }
  }, [workspace.activeGroupId, workspace.activeMarkdownRel])

  // First-launch profile picker (only after migration / workspace ready).
  const profileBootstrappedRef = useRef(false)
  useEffect(() => {
    if (profileBootstrappedRef.current) return
    if (!workspace.ready) return
    if (migrationOpen) return
    if (profile) {
      profileBootstrappedRef.current = true
      return
    }
    profileBootstrappedRef.current = true
    setTimeout(() => {
      setPickerMode('first-launch')
      setPickerOpen(true)
    }, 0)
  }, [profile, workspace.ready, migrationOpen])

  // Surface localStorage QuotaExceededError as a toast.
  useEffect(() => {
    const handler = () =>
      showToast('Storage full — export your runs/chat or trim them')
    window.addEventListener('canv:quota-error', handler)
    return () => window.removeEventListener('canv:quota-error', handler)
  }, [showToast])

  // Sanitize runs that were mid-stream when the page was last closed.
  const sanitizedRunsRef = useRef(false)
  useEffect(() => {
    if (sanitizedRunsRef.current) return
    sanitizedRunsRef.current = true
    setRuns((prev) =>
      prev.map((r) =>
        r.status === 'streaming' || r.status === 'refining'
          ? { ...r, status: 'error' as const, error: 'Interrupted (page reloaded)' }
          : r,
      ),
    )
  }, [setRuns])

  // Track recent files for the palette file-open mode.
  useEffect(() => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- functional updater; runs only when activeMarkdownRel changes, no cascade risk
    setRecentFiles((prev) => {
      if (prev[0] === rel) return prev
      const next = [rel, ...prev.filter((r) => r !== rel)]
      return next.slice(0, 30)
    })
  }, [workspace.activeMarkdownRel])

  const handleEditorChange = useCallback(
    (groupId: EditorGroupId, rel: string, markdown: string) => {
      workspace.saveTab(rel, markdown, groupId)
      liveDocsChannel.publish(`${groupId}:${rel}`, markdown)
    },
    [workspace, liveDocsChannel],
  )

  const [selectionTick, setSelectionTick] = useState(0)
  const handleEditorSelectionChange = useCallback(() => {
    setSelectionTick((n) => n + 1)
  }, [])

  const focusedRel = workspace.activeMarkdownRel
  const focusedGroupId = workspace.activeGroupId
  const focusedKey = focusedRel ? `${focusedGroupId}:${focusedRel}` : null

  const focusedFallbackText = useMemo<string | null>(() => {
    if (!focusedRel) return null
    const group = workspace.editorGroups.find((g) => g.id === focusedGroupId)
    if (!group) return null
    const tab = group.openTabs.find((t) => t.kind === 'markdown' && t.relPath === focusedRel)
    if (!tab || tab.kind !== 'markdown') return null
    return tab.loadedMarkdown
  }, [focusedGroupId, focusedRel, workspace.editorGroups])

  const focusedDocText = useFocusedDocText(liveDocsChannel, focusedKey, focusedFallbackText)
  const outlineNodes = useOutline(focusedDocText)

  const apiKeyMissing = !settings.apiKeys[settings.provider]

  const paletteFiles = useMemo<PaletteFile[]>(() => {
    if (!workspace.tree) return []
    const out: PaletteFile[] = []
    for (const entry of flattenTree(workspace.tree)) {
      if (entry.kind === 'file' && /\.(md|markdown)$/i.test(entry.relPath)) {
        out.push({ rel: entry.relPath, basename: entry.name })
      }
    }
    return out
  }, [workspace.tree])

  const paletteRecents = useMemo<PaletteFile[]>(() => {
    return recentFiles.map((rel) => {
      const i = rel.lastIndexOf('/')
      return { rel, basename: i >= 0 ? rel.slice(i + 1) : rel }
    })
  }, [recentFiles])

  // Reads raw pinned file contents before an agent run / chat send.
  // Returns the content of each pinned file (excluding the active markdown tab).
  const ensurePinnedReady = useCallback(async (): Promise<string[]> => {
    const pins = workspaceForPinRef.current.pinned
    if (!pins.length) return []
    const activeRel = workspaceForPinRef.current.activeMarkdownRel
    const out: string[] = []
    for (const p of pins) {
      if (p.relPath === activeRel) continue
      try {
        const r = await getFs().readFile(p.relPath)
        out.push(r.content)
      } catch {
        // Skip missing pinned files silently.
      }
    }
    return out
  }, [])

  const { showBottomTab } = ideLayout

  const setBottomPlacementBottom = useCallback(() => {
    ideLayout.setDockPlacement('bottom')
    if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
  }, [ideLayout])

  const setBottomPlacementRight = useCallback(() => {
    ideLayout.setDockPlacement('right')
    if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
  }, [ideLayout])

  const gitBadge = null  // TODO(0.7.1): wire to actual git diff count

  // TODO(0.7.1): wire cursor line/col from Canvas's CodeMirror via onCursorChange prop.
  const [cursorPos] = useState<{ line: number; col: number } | null>(null)

  const meterTotals = useMemo(
    () => chatTotals(chatMessages, settings.defaultModel[settings.provider], settings.pricingOverrides),
    [chatMessages, settings.defaultModel, settings.provider, settings.pricingOverrides],
  )
  const runMeterTokens = meterTotals.tokens
  const runMeterCost = meterTotals.costUsd

  const handleRunMain = useCallback(() => {
    if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
    ideLayout.showBottomTab('chat')
    queueMicrotask(() => {
      const el = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')
      el?.focus()
    })
  }, [ideLayout])

  const triggerAgent = useCallback(
    async (agent: AgentDef, range: { from: number; to: number } | null, text: string, instruction?: string) => {
      if (apiKeyMissing) {
        openSettingsTab()
        showToast(`Add an ${settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in settings.`)
        return
      }
      if (!text.trim()) {
        showToast('Select some text first')
        return
      }

      const freshContextSummaries = await ensurePinnedReady()
      const adapter = getAdapter(settings.provider)
      const model = modelForAgent(activeProfileId, agent.id)
      const promptTemplate = agent.prompt

      const id = `${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const view = getActiveEditor()
      const documentBody = range && view ? view.state.doc.toString() : ''
      const basePrompt = buildPrompt({
        template: promptTemplate,
        text,
        instruction,
        contextSummaries: freshContextSummaries,
        documentBody,
      })

      const initial: RunRecord = {
        id,
        agentId: agent.id,
        agentLabel: agent.label,
        modeId: activeProfileId,
        model,
        provider: adapter.name,
        sourceText: text,
        range,
        response: '',
        status: 'streaming',
        timestamp: Date.now(),
        basePrompt,
        followups: [],
        schemaVersion: 2,
      }

      setRuns((prev) => {
        const next = [initial, ...prev]
        return next.slice(0, MAX_RUNS)
      })
      setActiveTabId(id)
      showBottomTab('runs')

      const startedAt = Date.now()
      const controller = new AbortController()
      runAbort.current.set(id, controller)

      try {
        const onToken = settings.streaming
          ? (chunk: string) => {
              setRuns((prev) =>
                prev.map((r) => (r.id === id ? { ...r, response: r.response + chunk } : r)),
              )
            }
          : undefined

        const { text: final, truncated, rawMessages, tokenUsage } = await runAgent({
          agent,
          adapter,
          apiKey: settings.apiKeys[settings.provider],
          model,
          maxTokens: settings.maxOutputTokens[settings.provider],
          text,
          instruction,
          contextSummaries: freshContextSummaries,
          documentBody,
          promptTemplate,
          signal: controller.signal,
          onToken,
          chunkDelayMs: settings.streamChunkDelayMs,
        })

        setRuns((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  response: final,
                  originalResponse: final,
                  status: 'done' as const,
                  truncated,
                  rawMessages,
                  tokenUsage,
                  elapsedMs: Date.now() - startedAt,
                }
              : r,
          ),
        )
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        const msg = e instanceof Error ? e.message : String(e)
        setRuns((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: aborted ? ('aborted' as const) : ('error' as const),
                  error: aborted ? undefined : msg,
                  elapsedMs: Date.now() - startedAt,
                }
              : r,
          ),
        )
      } finally {
        runAbort.current.delete(id)
      }
    },
    [apiKeyMissing, activeProfileId, settings, modelForAgent, ensurePinnedReady, getActiveEditor, setRuns, showToast, openSettingsTab, showBottomTab],
  )

  const handleAgentFromToolbar = useCallback(
    (agent: AgentDef, range: { from: number; to: number }, text: string, instruction?: string) => {
      triggerAgent(agent, range, text, instruction)
    },
    [triggerAgent],
  )

  const handleAgentOnDocument = useCallback(
    (groupId: EditorGroupId, agent: AgentDef, instruction?: string) => {
      const view = getActiveEditorForGroup(groupId)
      if (!view) return
      const text = view.state.doc.toString()
      if (!text.trim()) {
        showToast('Document is empty')
        return
      }
      triggerAgent(agent, null, text, instruction)
    },
    [getActiveEditorForGroup, triggerAgent, showToast],
  )

  const handleApply = useCallback(
    (run: RunRecord, replacement: string) => {
      const view = getActiveEditor()
      if (!view) {
        showToast('Editor not ready')
        return
      }
      if (!run.range) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: replacement },
        })
        showToast('Document replaced')
        return
      }
      const { from, to } = run.range
      const docLen = view.state.doc.length
      const safeFrom = Math.max(0, Math.min(from, docLen))
      const safeTo = Math.max(safeFrom, Math.min(to, docLen))
      const currentMd = view.state.sliceDoc(safeFrom, safeTo).trim()
      const originalMd = run.sourceText.trim()
      if (originalMd && currentMd !== originalMd) {
        showToast('Selection changed since this run — re-select and re-run')
        return
      }
      view.dispatch({
        changes: { from: safeFrom, to: safeTo, insert: replacement },
        selection: { anchor: safeFrom + replacement.length },
        scrollIntoView: true,
      })
      showToast('Applied')
    },
    [getActiveEditor, showToast],
  )

  const handleRerun = useCallback(
    (run: RunRecord) => {
      const agent = getActionById(activeProfile, run.agentId)
      if (!agent) {
        showToast('Action no longer exists in current mode')
        return
      }
      triggerAgent(agent, run.range, run.sourceText)
    },
    [triggerAgent, activeProfile, showToast],
  )

  const handleCloseTab = useCallback(
    (id: string) => {
      runAbort.current.get(id)?.abort()
      runAbort.current.delete(id)
      setRuns((prev) => prev.filter((r) => r.id !== id))
      setActiveTabId((prev) => (prev === id ? null : prev))
    },
    [setRuns],
  )

  const refineRun = useCallback(
    async (run: RunRecord, message: string) => {
      if (apiKeyMissing) {
        openSettingsTab()
        showToast(`Add an ${settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in settings.`)
        return
      }
      if (!run.basePrompt || !run.originalResponse) {
        showToast('This result has no conversation context')
        return
      }
      if (run.status === 'streaming' || run.status === 'refining') return

      const agent = getActionById(activeProfile, run.agentId) ?? null
      if (!agent) {
        showToast('Action no longer exists in current mode')
        return
      }
      const adapter = getAdapter(settings.provider)
      const model = modelForAgent(activeProfileId, agent.id)

      const formatHint =
        agent.outputMode === 'feedback-and-rewrite'
          ? 'When you produce an updated edit, keep the same response format you used before (NOTES: ... then SUGGESTED REWRITE: ...).'
          : agent.outputMode === 'feedback-only'
            ? 'When you produce updated thoughts, keep the same response format you used before (NOTES: followed by your bullets) — do not propose a rewrite.'
            : 'When you produce an updated edit, output ONLY the rewritten text — no preamble, no commentary.'
      const system = `You previously suggested an edit. The user is now discussing it with you and may ask for tweaks, clarifications, or a revised version. ${formatHint}`

      const priorFollowups = run.followups ?? []
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: run.basePrompt },
        { role: 'assistant', content: run.originalResponse },
        ...priorFollowups.flatMap((f) => [
          { role: 'user' as const, content: f.user },
          { role: 'assistant' as const, content: f.assistant },
        ]),
        { role: 'user', content: message },
      ]

      setRuns((prev) =>
        prev.map((r) => (r.id === run.id ? { ...r, status: 'refining' as const, response: '' } : r)),
      )

      const startedAt = Date.now()
      const controller = new AbortController()
      runAbort.current.set(run.id, controller)

      try {
        let buffer = ''
        const onToken = settings.streaming
          ? (chunk: string) => {
              buffer += chunk
              setRuns((prev) =>
                prev.map((r) => (r.id === run.id ? { ...r, response: r.response + chunk } : r)),
              )
            }
          : undefined

        const { text: final, truncated, tokenUsage } = await adapter.complete({
          apiKey: settings.apiKeys[settings.provider],
          model,
          system,
          messages,
          maxTokens: settings.maxOutputTokens[settings.provider],
          signal: controller.signal,
          onToken,
          chunkDelayMs: settings.streamChunkDelayMs,
        })

        const assistantText = final || buffer
        const elapsedMs = Date.now() - startedAt
        setRuns((prev) =>
          prev.map((r) =>
            r.id === run.id
              ? {
                  ...r,
                  response: assistantText,
                  status: 'done' as const,
                  truncated,
                  tokenUsage,
                  elapsedMs,
                  rawMessages: messages,
                  system,
                  followups: [...(r.followups ?? []), { user: message, assistant: assistantText, tokenUsage, elapsedMs }],
                }
              : r,
          ),
        )
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        const msg = e instanceof Error ? e.message : String(e)
        setRuns((prev) =>
          prev.map((r) =>
            r.id === run.id
              ? {
                  ...r,
                  status: aborted ? ('aborted' as const) : ('error' as const),
                  error: aborted ? undefined : msg,
                  elapsedMs: Date.now() - startedAt,
                }
              : r,
          ),
        )
      } finally {
        runAbort.current.delete(run.id)
      }
    },
    [apiKeyMissing, activeProfileId, settings, modelForAgent, setRuns, showToast, openSettingsTab, activeProfile],
  )

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
      setChatBusy(true)

      const adapter = getAdapter(lockedProvider)
      const model = settings.defaultModel[lockedProvider]
      const view = getActiveEditor()
      const lineCount = view ? view.state.doc.lines : 0
      const inventory = buildInventory({
        tree: workspace.tree,
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
          history: next,
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
          onUpdate: (m) => setChatMessages([...m]),
          model,
          maxTokens: settings.maxOutputTokens[lockedProvider],
          apiKey: settings.apiKeys[lockedProvider],
          signal: controller.signal,
          chunkDelayMs: settings.streamChunkDelayMs,
        })
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') {
          // Stop button — runner already updated state.
        } else {
          const msg = e instanceof Error ? e.message : String(e)
          setChatMessages((prev) => [...prev, {
            id: `a-${Date.now()}-err`, role: 'assistant', content: `Error: ${msg}`, provider: lockedProvider,
          }])
        }
      } finally {
        setChatBusy(false)
        chatAbort.current = null
      }
    },
    [apiKeyMissing, chatBusy, chatMessages, settings, getActiveEditor, workspace, activeProfile, openSettingsTab, showToast, setChatMessages],
  )

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

  const handleExport = useCallback(
    (fmt: 'txt' | 'md') => {
      const view = getActiveEditor()
      if (!view || !workspace.activeMarkdownRel) return
      const text = view.state.doc.toString()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const name = basename(workspace.activeMarkdownRel).replace(/\.(md|markdown)$/i, '')
      a.href = url
      a.download = `${name || 'document'}.${fmt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    [getActiveEditor, workspace.activeMarkdownRel],
  )

  const handlePickProfile = useCallback(
    (profileId: string) => {
      setProfile(profileId)
      setPickerOpen(false)
    },
    [setProfile],
  )

  const handlePickerCancel = useCallback(() => {
    if (pickerMode === 'switch') setPickerOpen(false)
  }, [pickerMode])

  const openProfileSwitcher = useCallback(() => {
    setPickerMode('switch')
    setPickerOpen(true)
  }, [])

  const handleChangeWorkspace = useCallback(async () => {
    await workspace.flushAll()
    const ok = await workspace.pickWorkspace()
    if (!ok) return
  }, [workspace])

  const handleOpenRemoteWorkspace = useCallback(async () => {
    await workspace.flushAll()
    try {
      const list = await getFs().listRecentRemotes()
      setRecentRemotes(list)
    } catch {
      setRecentRemotes([])
    }
    setRemoteDialogOpen(true)
  }, [workspace])

  const handleConnectRemote = useCallback(async (raw: string) => {
    await workspace.openRemote(raw)
  }, [workspace])

  const handleCreateFile = useCallback(async (parentRel: string) => {
    const name = await dialogs.prompt({
      title: 'New file',
      message: parentRel ? `In folder ${parentRel}` : undefined,
      initialValue: 'untitled.md',
      placeholder: 'name.md',
      submitLabel: 'Create',
      validate: (v) => {
        const trimmed = v.trim()
        if (!trimmed) return 'Name cannot be empty'
        if (!/\.(md|markdown)$/i.test(trimmed)) return 'Must end in .md or .markdown'
        return null
      },
    })
    if (!name) return
    const trimmed = name.trim()
    const rel = parentRel ? `${parentRel}/${trimmed}` : trimmed
    try {
      await workspace.createFile(rel, '')
      await workspace.openTab(rel)
    } catch (e) {
      showToast(`Could not create file: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast, dialogs])

  const handleCreateFolder = useCallback(async (parentRel: string) => {
    const name = await dialogs.prompt({
      title: 'New folder',
      message: parentRel ? `In folder ${parentRel}` : undefined,
      initialValue: 'folder',
      placeholder: 'folder name',
      submitLabel: 'Create',
      validate: (v) => (v.trim() ? null : 'Name cannot be empty'),
    })
    if (!name) return
    const trimmed = name.trim()
    const rel = parentRel ? `${parentRel}/${trimmed}` : trimmed
    try {
      await workspace.createFolder(rel)
    } catch (e) {
      showToast(`Could not create folder: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast, dialogs])

  const handleRename = useCallback(async (oldRel: string, newRel: string) => {
    try {
      await workspace.rename(oldRel, newRel)
    } catch (e) {
      showToast(`Could not rename: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast])

  const handleDelete = useCallback(async (rel: string) => {
    try {
      await workspace.remove(rel)
    } catch (e) {
      showToast(`Could not delete: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast])

  const chatModel = settings.defaultModel[settings.provider]
  const chatProvider = useMemo(() => getAdapter(settings.provider).name, [settings.provider])
  // eslint-disable-next-line react-hooks/refs -- editorsRef is bumped via bumpEditors() on mount/unmount, so accessing .current here re-runs on each relevant render.
  const activeEditor = getActiveEditor()
  const { wordCount, selectionWordCount } = useEditorStats(activeEditor)

  const ctxMenu = useContextMenu()


  useEffect(() => {
    const view = activeEditor
    if (!view) return
    const dom = view.dom
    const handler = (e: MouseEvent) => {
      const sel = view.state.selection.main
      const hasSel = !sel.empty
      const items: ContextMenuItem[] = [
        {
          id: 'cut',
          label: 'Cut',
          disabled: !hasSel,
          onClick: () => {
            const text = view.state.sliceDoc(sel.from, sel.to)
            void navigator.clipboard.writeText(text).catch(() => {})
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: '' },
              selection: { anchor: sel.from },
            })
            view.focus()
          },
        },
        {
          id: 'copy',
          label: 'Copy',
          disabled: !hasSel,
          onClick: () => {
            const text = view.state.sliceDoc(sel.from, sel.to)
            void navigator.clipboard.writeText(text).catch(() => {})
            view.focus()
          },
        },
        {
          id: 'paste',
          label: 'Paste',
          onClick: () => {
            void (async () => {
              try {
                const text = await navigator.clipboard.readText()
                view.dispatch({
                  changes: { from: sel.from, to: sel.to, insert: text },
                  selection: { anchor: sel.from + text.length },
                })
              } catch { /* ignore */ }
              view.focus()
            })()
          },
        },
        { separator: true },
        {
          id: 'select-all',
          label: 'Select all',
          onClick: () => {
            view.focus()
            cmSelectAll(view)
          },
        },
      ]
      ctxMenu.open(e, items)
    }
    dom.addEventListener('contextmenu', handler)
    return () => { dom.removeEventListener('contextmenu', handler) }
  }, [activeEditor, ctxMenu])

  // Register all M1 + M2 commands via the command registry.
  useEffect(() => {
    const disposers: Array<() => void> = []
    const reg = (cmd: Parameters<typeof commands.register>[0]) => disposers.push(commands.register(cmd))

    reg({
      id: 'view.toggleSidebar', label: 'View: Toggle Sidebar', group: 'View',
      shortcut: 'Ctrl+B', run: () => ideLayout.toggleSidebar(),
    })
    reg({
      id: 'view.toggleBottomPanel', label: 'View: Toggle Bottom Panel', group: 'View',
      shortcut: 'Ctrl+`', runInEditable: true,
      run: () => ideLayout.toggleBottom(),
    })
    reg({
      id: 'view.focusSearchTab', label: 'View: Focus Search', group: 'View',
      shortcut: 'Ctrl+Shift+F', runInEditable: true,
      run: () => { ideLayout.setSidebarTab('search'); if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar() },
    })
    reg({
      id: 'view.focusFilesTab', label: 'View: Focus Files', group: 'View',
      shortcut: 'Ctrl+Shift+E',
      run: () => { ideLayout.setSidebarTab('files'); if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar() },
    })
    reg({
      id: 'view.focusGitTab', label: 'View: Focus Git', group: 'View',
      shortcut: 'Ctrl+Shift+G',
      run: () => { ideLayout.setSidebarTab('git'); if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar() },
    })
    reg({
      id: 'view.focusRunsTab', label: 'View: Focus Runs', group: 'View',
      run: () => ideLayout.showBottomTab('runs'),
    })
    reg({
      id: 'view.focusChatTab', label: 'View: Focus Chat', group: 'View',
      run: () => ideLayout.showBottomTab('chat'),
    })
    reg({
      id: 'view.focusProblemsTab', label: 'View: Focus Problems', group: 'View',
      run: () => ideLayout.showBottomTab('problems'),
    })
    reg({
      id: 'view.focusOutputTab', label: 'View: Focus Output', group: 'View',
      run: () => ideLayout.showBottomTab('output'),
    })
    reg({
      id: 'view.dockToBottom', label: 'View: Dock at Bottom', group: 'View',
      shortcut: 'Ctrl+Shift+ArrowDown', runInEditable: true,
      run: () => {
        ideLayout.setDockPlacement('bottom')
        if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'view.dockToRight', label: 'View: Dock at Right', group: 'View',
      shortcut: 'Ctrl+Shift+ArrowRight', runInEditable: true,
      run: () => {
        ideLayout.setDockPlacement('right')
        if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'view.popOutDock', label: 'View: Pop Out Dock', group: 'View',
      shortcut: 'Ctrl+Shift+O', runInEditable: true,
      when: () => isElectron(),
      run: () => {
        ideLayout.setDockPlacement('popout')
        if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'palette.open', label: 'Open Command Palette', group: 'Palette',
      shortcut: 'Ctrl+Shift+P', runInEditable: true,
      run: () => { setPaletteMode('commands'); setPaletteOpen(true) },
    })
    reg({
      id: 'palette.openFile', label: 'Open File…', group: 'Palette',
      shortcut: 'Ctrl+P', runInEditable: true,
      run: () => { setPaletteMode('files'); setPaletteOpen(true) },
    })
    reg({
      id: 'workspace.openSettings', label: 'Open Settings', group: 'Workspace',
      shortcut: 'Ctrl+,', runInEditable: true,
      run: () => openSettingsTab(),
    })
    reg({
      id: 'workspace.changeWorkspace', label: 'Change Workspace…', group: 'Workspace',
      run: () => { handleChangeWorkspace() },
    })
    reg({
      id: 'workspace.openRemote', label: 'Open Remote Workspace…', group: 'Workspace',
      run: () => { handleOpenRemoteWorkspace() },
    })
    reg({
      id: 'tab.close', label: 'Close Active Tab', group: 'Tabs',
      shortcut: 'Ctrl+W',
      runInEditable: true,
      when: () => workspace.activeTabKey != null,
      run: () => {
        const key = workspace.activeTabKey
        if (!key) return
        const rel = workspace.activeMarkdownRel
        void (async () => {
          if (rel && workspace.dirtySet.has(rel)) {
            const ok = await dialogs.confirm({
              title: 'Discard changes?',
              message: `Discard unsaved changes to "${rel}"?`,
              confirmLabel: 'Discard',
              danger: true,
            })
            if (!ok) return
          }
          await workspace.closeTabByKey(key)
        })()
      },
    })
    reg({
      id: 'editor.forceSave', label: 'Save Active File', group: 'Editor',
      shortcut: 'Ctrl+S',
      runInEditable: true,
      when: () => workspace.activeMarkdownRel != null,
      run: () => { void workspace.flushAll() },
    })
    reg({
      id: 'profile.switch', label: 'Switch Profile…', group: 'Workspace',
      run: () => openProfileSwitcher(),
    })
    reg({
      id: 'editor.splitRight', label: 'Split Right', group: 'Editor',
      shortcut: 'Ctrl+\\', runInEditable: true,
      when: () => workspace.activeTabKey != null && workspace.editorGroups.length === 1,
      run: () => workspace.splitRight(),
    })
    reg({
      id: 'editor.focusGroup1', label: 'Focus Group 1', group: 'Editor',
      shortcut: 'Ctrl+1', runInEditable: true,
      when: () => workspace.editorGroups.length >= 1,
      run: () => workspace.setActiveGroupId('g1'),
    })
    reg({
      id: 'editor.focusGroup2', label: 'Focus Group 2', group: 'Editor',
      shortcut: 'Ctrl+2', runInEditable: true,
      when: () => workspace.editorGroups.length === 2,
      run: () => workspace.setActiveGroupId('g2'),
    })
    reg({
      id: 'editor.closeOtherGroup', label: 'Close Other Group', group: 'Editor',
      when: () => workspace.editorGroups.length === 2,
      run: () => {
        const other: EditorGroupId = workspace.activeGroupId === 'g1' ? 'g2' : 'g1'
        const otherGroup = workspace.editorGroups.find((g) => g.id === other)
        if (!otherGroup) return
        // Close every tab in the other group, which collapses it.
        for (const t of [...otherGroup.openTabs]) {
          const key = t.kind === 'markdown' ? t.relPath : SETTINGS_TAB_KEY
          void workspace.closeTabByKey(key, other)
        }
      },
    })
    reg({
      id: 'export.markdown',
      label: 'Export as .md',
      group: 'Workspace',
      when: () => workspace.activeMarkdownRel != null && getActiveEditor() != null,
      run: () => handleExport('md'),
    })
    reg({
      id: 'export.text',
      label: 'Export as .txt',
      group: 'Workspace',
      when: () => workspace.activeMarkdownRel != null && getActiveEditor() != null,
      run: () => handleExport('txt'),
    })

    return () => { for (const d of disposers) d() }
  }, [commands, ideLayout, workspace, handleChangeWorkspace, handleOpenRemoteWorkspace, openProfileSwitcher, openSettingsTab, getActiveEditor, handleExport, dialogs])

  // Document-agent palette commands. Registered separately so the big effect
  // above doesn't re-run (and re-fire ~30 register/dispose notifies) every
  // time handleAgentOnDocument's identity changes — that path was hitting
  // React's max-update-depth via useSyncExternalStore notifications.
  const agentRunRef = useRef(handleAgentOnDocument)
  // eslint-disable-next-line react-hooks/refs -- keep the ref in sync with the latest callback so the agent-command effect doesn't need it as a dep
  agentRunRef.current = handleAgentOnDocument
  const agentWorkspaceRef = useRef(workspace)
  // eslint-disable-next-line react-hooks/refs -- keep the ref in sync with the latest workspace so when()/run() closures see fresh state without re-registering
  agentWorkspaceRef.current = workspace
  const workspaceForPinRef = useRef(workspace)
  // eslint-disable-next-line react-hooks/refs, react-hooks/immutability -- keep the ref in sync with the latest workspace so ensurePinnedReady() reads fresh state without listing workspace as a dep
  workspaceForPinRef.current = workspace
  useEffect(() => {
    const disposers: Array<() => void> = []
    const enabledDocAgents = activeProfile.actions.filter(
      (a) => a.inputMode === 'document' || a.inputMode === 'selection-or-document',
    )
    for (const agent of enabledDocAgents) {
      disposers.push(commands.register({
        id: `agent.runOnDocument.${agent.id}`,
        label: `Run "${agent.label}" on document`,
        group: 'Agent',
        when: () => agentWorkspaceRef.current.activeMarkdownRel != null,
        run: () => {
          if (agent.needsInstruction) {
            setPendingDocAgent(agent)
          } else {
            agentRunRef.current(agentWorkspaceRef.current.activeGroupId, agent)
          }
        },
      }))
    }
    return () => { for (const d of disposers) d() }
  }, [commands, activeProfile.actions])

  const openRels = useMemo(() => {
    const out = new Set<string>()
    for (const g of workspace.editorGroups) {
      for (const t of g.openTabs) {
        if (t.kind === 'markdown') out.add(t.relPath)
      }
    }
    return out
  }, [workspace.editorGroups])
  const pinnedRels = useMemo(
    () => new Set(workspace.pinned.map((p) => p.relPath)),
    [workspace.pinned],
  )

  const saveState = workspace.conflict
    ? 'conflict' as const
    : workspace.dirtySet.size > 0
      ? 'saving' as const
      : 'saved' as const

  const bottomPanelTabs = useMemo<BottomPanelTabDef[]>(() => {
    return [
      {
        id: 'runs',
        label: 'Runs',
        icon: Play,
        badge: runs.length > 0 ? runs.length : undefined,
        render: () => (
          <RunsTab
            runs={runs}
            activeId={activeTabId}
            onSelect={setActiveTabId}
            onClose={handleCloseTab}
            onApply={handleApply}
            onRerun={handleRerun}
            onRefine={refineRun}
            pricingOverrides={settings.pricingOverrides}
          />
        ),
      },
      {
        id: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        badge: chatMessages.length > 0 ? chatMessages.length : undefined,
        render: () => (
          <ChatTab
            messages={chatMessages}
            busy={chatBusy}
            provider={chatProvider}
            model={chatModel}
            onSend={sendChat}
            onClear={clearChat}
            onStop={stopChat}
            pendingApprovals={pendingApprovals}
            onApprovalDecide={onApprovalDecide}
            pricingOverrides={settings.pricingOverrides}
            followLatest={followLatest}
            onSetFollowLatest={setFollowLatest}
            contextFileName={workspace.activeMarkdownRel ? basename(workspace.activeMarkdownRel) : null}
          />
        ),
      },
      {
        id: 'problems',
        label: 'Problems',
        icon: AlertTriangle,
        badge: lintIssuesApi.issues.length > 0 ? lintIssuesApi.issues.length : undefined,
        render: () => (
          <ProblemsTab
            issues={lintIssuesApi.issues}
            scanState={lintIssuesApi.scanState}
            scanError={lintIssuesApi.scanError}
            onScan={() => { void lintIssuesApi.scanWorkspace() }}
            onClear={lintIssuesApi.clearWorkspaceIssues}
            onJump={handleJumpToProblem}
          />
        ),
      },
      {
        id: 'output',
        label: 'Output',
        icon: FileText,
        render: () => <OutputTab runs={runs} />,
      },
    ]
  }, [runs, activeTabId, handleCloseTab, handleApply, handleRerun, refineRun, chatMessages, chatBusy, chatProvider, chatModel, sendChat, clearChat, stopChat, pendingApprovals, onApprovalDecide, lintIssuesApi, handleJumpToProblem, settings.pricingOverrides, followLatest, setFollowLatest, workspace.activeMarkdownRel])

  // ----- Dock pop-out bridge wiring -------------------------------------------------
  // Parse each run on the main side so the popout can render Notes / Rewrite / Diff
  // sections without needing useModes() of its own.
  const dockRuns = useMemo<DockRun[]>(() => {
    return runs.map((r) => {
      const mode = getModeById(modes, r.modeId) ?? getModeById(modes, defaultModeId)
      const agent = mode ? getActionById(mode, r.agentId) : null
      if (!agent) return { ...r }
      const parsed = parseAgentResponse(agent, r.response)
      return {
        ...r,
        parsedFeedback: parsed.feedback,
        parsedRewrite: parsed.rewrite,
        outputMode: agent.outputMode,
      }
    })
  }, [runs, modes, defaultModeId])

  // Assemble the snapshot the pop-out window mirrors. Recomputed on any input change;
  // useDockBridge throttles broadcasts to ~30fps so streaming token updates don't flood IPC.
  const dockState = useMemo<DockState>(() => {
    const streamingRunId = dockRuns.find((r) => r.status === 'streaming' || r.status === 'refining')?.id ?? null
    return {
      activeTab: ideLayout.layout.bottom.activeTab,
      activeRunId: activeTabId,
      runs: dockRuns,
      chatMessages,
      chatProvider,
      chatModel,
      chatBusy,
      problems: lintIssuesApi.issues,
      output: '', // OutputTab is derived from runs in v1; popout shows runs in its Runs tab.
      streamingRunId,
      ui: {
        theme: settings.theme,
        fontSize: settings.fontSize,
        profileLabel: activeProfile?.label ?? null,
      },
    }
  }, [
    ideLayout.layout.bottom.activeTab,
    activeTabId,
    dockRuns,
    chatMessages,
    chatProvider,
    chatModel,
    chatBusy,
    lintIssuesApi.issues,
    settings.theme,
    settings.fontSize,
    activeProfile,
  ])

  const dockBridge = useDockBridge({ mode: 'main' })

  // Push every snapshot change to the pop-out (no-op when no pop-out is open).
  useEffect(() => {
    dockBridge.broadcastState(dockState)
  }, [dockBridge, dockState])

  // Round-trip guard: the pop-out's `closed` event fires for both external
  // closes (user clicked the X) AND renderer-initiated closes (we just called
  // closePopout because placement changed). Only revert when placement is
  // STILL 'popout' at the time the close arrives.
  //
  // Declaration order matters: this ref-sync effect must run BEFORE the
  // placement → openPopout/closePopout effect below, so the ref is always
  // current before anything could trigger closePopout. That keeps the guard
  // correctness order-independent w.r.t. IPC sync/async behaviour and
  // potential future React concurrent-flush changes.
  const placement = ideLayout.layout.bottom.placement
  const placementRef = useRef(placement)
  useEffect(() => { placementRef.current = placement }, [placement])

  // Open / close the pop-out window when placement or visibility changes.
  // - placement === 'popout' && visible → open (covers cold boot restore AND
  //   re-show after the user closed the popout and then triggered a show-dock
  //   action such as Ctrl+`, a focus-tab shortcut, or the chat button).
  // - anything else → close (no-op when no window exists).
  const visible = ideLayout.layout.bottom.visible
  useEffect(() => {
    if (!dockBridge.isAvailable) return
    if (placement === 'popout' && visible) {
      void dockBridge.openPopout()
    } else {
      void dockBridge.closePopout()
    }
  }, [dockBridge, placement, visible])

  useEffect(() => {
    if (!dockBridge.isAvailable) return
    dockBridge.setPopoutClosedHandler(() => {
      // External close (e.g. user clicked the OS close button on the popped window).
      // Hide the dock entirely — same as clicking the X on the in-app bottom panel.
      // Placement stays 'popout' so the next show-dock action (Ctrl+`, focus-tab
      // shortcut, etc.) re-opens the popout window.
      if (placementRef.current === 'popout' && ideLayout.layout.bottom.visible) {
        ideLayout.toggleBottom()
      }
    })
  }, [dockBridge, ideLayout])

  // Dispatch user actions arriving from the pop-out through the same handlers
  // the in-app UI uses.
  useEffect(() => {
    if (!dockBridge.isAvailable) return
    dockBridge.setActionHandler((action: UserAction) => {
      switch (action.type) {
        case 'select-tab':
          ideLayout.setBottomTab(action.tabId)
          return
        case 'select-run':
          setActiveTabId(action.runId)
          return
        case 'send-chat':
          void sendChat(action.text)
          return
        case 'rerun-agent': {
          const run = runs.find((r) => r.id === action.runId)
          if (run) handleRerun(run)
          return
        }
        case 'delete-run':
          handleCloseTab(action.runId)
          return
        case 'apply-run': {
          const run = runs.find((r) => r.id === action.runId)
          if (!run) return
          const dock = dockRuns.find((r) => r.id === action.runId)
          const text = dock?.parsedRewrite ?? run.response
          if (text) handleApply(run, text)
          return
        }
        case 'refine-run': {
          const run = runs.find((r) => r.id === action.runId)
          if (run) void refineRun(run, action.message)
          return
        }
        case 'clear-chat':
          clearChat()
          return
        case 'stop-chat':
          stopChat()
          return
        case 'set-placement':
          ideLayout.setDockPlacement(action.placement)
          return
      }
    })
  }, [dockBridge, ideLayout, runs, dockRuns, sendChat, handleRerun, handleCloseTab, handleApply, refineRun, clearChat, stopChat])

  // Push an immediate snapshot when the pop-out signals ready, so the freshly
  // mounted window doesn't render an empty UI before the next state change.
  const dockStateRef = useRef(dockState)
  useEffect(() => { dockStateRef.current = dockState }, [dockState])

  useEffect(() => {
    if (!dockBridge.isAvailable) return
    dockBridge.setPopoutReadyHandler(() => {
      dockBridge.broadcastState(dockStateRef.current)
    })
  }, [dockBridge])

  // Browser-only build: show a simple banner instead of the workspace UI.
  if (!isElectron()) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-app text-default">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">Canv 0.2 needs the desktop app</h1>
          <p className="text-sm opacity-80">
            This version stores your writing on disk, which the browser preview can't do.
            Download the desktop build (macOS / Windows / Linux) to use file workspaces.
          </p>
          {legacyStateExists() && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setMigrationOpen(true)}
            >
              Export legacy backup
            </button>
          )}
        </div>
        {migrationOpen && (
          <MigrationModal
            onComplete={() => {
              setMigrationOpen(false)
              window.location.reload()
            }}
          />
        )}
      </div>
    )
  }

  const outlineNode = outlineNodes.length > 0 ? (
    <OutlinePanel
      nodes={outlineNodes}
      resetKey={focusedKey}
      onJump={handleOutlineJump}
      collapsed={ideLayout.layout.outline.collapsed}
      onToggleSectionCollapsed={ideLayout.toggleOutlineCollapsed}
    />
  ) : null

  return (
    <div className="h-full flex flex-col">
      {workspace.remoteStatus?.state === 'offline' && (
        <div className="bg-amber-900/40 text-amber-100 px-3 py-1.5 text-sm flex items-center justify-between border-b border-amber-800">
          <span>Remote workspace offline — attempting to reconnect…</span>
          <button
            type="button"
            onClick={() => workspace.reconnect()}
            className="underline hover:no-underline"
          >
            Reconnect now
          </button>
        </div>
      )}
      <div className="relative">
        <TopBar
          workspaceName={workspace.root}
          activeSidebarTab={ideLayout.layout.sidebar.activeTab}
          onSelectSidebarTab={(tab) => {
            ideLayout.setSidebarTab(tab)
            if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar()
          }}
          onOpenCommandPalette={() => { setPaletteMode('commands'); setPaletteOpen(true) }}
          onRunMain={handleRunMain}
          onOpenRunMenu={() => setRunMenuOpen(true)}
          sidebarVisible={ideLayout.layout.sidebar.visible}
          bottomVisible={ideLayout.layout.bottom.visible}
          bottomPlacement={ideLayout.layout.bottom.placement}
          onToggleSidebar={ideLayout.toggleSidebar}
          onSetBottomPlacementBottom={setBottomPlacementBottom}
          onSetBottomPlacementRight={setBottomPlacementRight}
          gitBadge={gitBadge}
        />
        <RunControlsMenu
          open={runMenuOpen}
          onClose={() => setRunMenuOpen(false)}
          provider={settings.provider}
          model={settings.defaultModel[settings.provider]}
          availableModels={getAdapter(settings.provider).models}
          onChangeModel={(m) => update({ defaultModel: { ...settings.defaultModel, [settings.provider]: m } })}
          streamChunkDelayMs={settings.streamChunkDelayMs}
          onChangeDelay={(d) => update({ streamChunkDelayMs: d })}
          followLatest={followLatest}
          onToggleFollow={() => setFollowLatest((v) => !v)}
          meterTotalTokens={runMeterTokens}
          meterCostUsd={runMeterCost}
        />
      </div>
      <div className="flex-1 min-h-0">
        <IdeShell
          sidebar={(
            <LeftSidebar
              activeTab={ideLayout.layout.sidebar.activeTab}
              onSelectTab={ideLayout.setSidebarTab}
              search={<SearchTab onJumpToMatch={handleJumpToMatch} />}
              git={<GitTab onOpenDiff={handleOpenDiff} />}
              settings={settings}
              onUpdateSettings={update}
              workspaceName={workspace.root}
              files={(
                <FilesTab
                  root={workspace.root}
                  tree={workspace.tree}
                  truncated={workspace.treeTruncated}
                  openRels={openRels}
                  activeRel={workspace.activeMarkdownRel}
                  pinnedRels={pinnedRels}
                  onOpen={(rel) => workspace.openTab(rel)}
                  onPin={(rel) => workspace.pin(rel)}
                  onUnpin={(rel) => workspace.unpin(rel)}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onChangeWorkspace={handleChangeWorkspace}
                  revealRel={revealFolderRel}
                />
              )}
              outline={outlineNode}
              outlineSize={ideLayout.layout.outline.size}
              onOutlineSizeChange={ideLayout.setOutlineSize}
              onNewFile={() => handleCreateFile('')}
              onNewFolder={() => handleCreateFolder('')}
              onUpload={() => { /* TODO(0.7.1): wire upload action */ }}
            />
          )}
          sidebarVisible={ideLayout.layout.sidebar.visible}
          sidebarSize={ideLayout.layout.sidebar.size}
          editor={(
            <main className="h-full flex flex-col min-w-0 overflow-hidden bg-app">
              <div className="flex-1 min-h-0">
                <EditorArea
                  workspaceRoot={workspace.root}
                  groups={workspace.editorGroups}
                  activeGroupId={workspace.activeGroupId}
                  dirtySet={workspace.dirtySet}
                  onSelectTab={(groupId, key) => workspace.setActiveTabByKey(key, groupId)}
                  onCloseTab={(groupId, key) => workspace.closeTabByKey(key, groupId)}
                  onFocusGroup={(groupId) => workspace.setActiveGroupId(groupId)}
                  onMoveTab={(fromGroupId, key, toGroupId) => workspace.moveTab(key, fromGroupId, toGroupId)}
                  groupSizes={ideLayout.layout.editor.sizes}
                  onGroupSizesChange={(sizes) => ideLayout.setEditorSizes(sizes)}
                  onClickFolder={handleClickBreadcrumbFolder}
                  profile={activeProfile}
                  onRunDocAgent={handleAgentOnDocument}
                  renderTabContent={(groupId, t, isActive, viewMode) => {
                    if (t.kind === 'settings') {
                      return (
                        <SettingsTab
                          settings={settings}
                          onUpdate={(patch) => {
                            if ('provider' in patch && patch.provider !== undefined) {
                              void requestProviderChange(patch.provider as ChatProvider)
                              // Pass through everything else in the patch (without provider).
                              const { provider: _p, ...rest } = patch
                              if (Object.keys(rest).length > 0) update(rest)
                            } else {
                              update(patch)
                            }
                          }}
                          onExportBackup={() => {
                            workspace.flushAll()
                            exportBackup()
                          }}
                        />
                      )
                    }
                    if (t.kind === 'diff') {
                      return <DiffTab relPath={t.relPath} baseRef={t.baseRef} isActive={isActive} />
                    }
                    return (
                      <Canvas
                        groupId={groupId}
                        tab={t}
                        isActive={isActive}
                        fontSize={settings.fontSize}
                        lineWidth={settings.lineWidth}
                        viewMode={viewMode}
                        onChange={handleEditorChange}
                        onSelectionChange={handleEditorSelectionChange}
                        onEditorReady={handleEditorReady}
                        onEditorDestroy={handleEditorDestroy}
                      />
                    )
                  }}
                  emptyState={(
                    <EmptyState
                      hasWorkspace={!!workspace.root}
                      onChooseWorkspace={handleChangeWorkspace}
                    />
                  )}
                />
              </div>
            </main>
          )}
          dock={(
            <BottomPanel
              tabs={bottomPanelTabs}
              activeTab={ideLayout.layout.bottom.activeTab}
              onSelectTab={ideLayout.setBottomTab}
              onClose={ideLayout.toggleBottom}
              headerRight={(
                <DockPlacementMenu
                  placement={ideLayout.layout.bottom.placement}
                  canPopOut={isElectron()}
                  onChange={(next) => ideLayout.setDockPlacement(next)}
                />
              )}
            />
          )}
          dockSlot={dockSlotForPlacement(ideLayout.layout.bottom)}
          bottomSize={ideLayout.layout.bottom.size}
          rightSize={ideLayout.layout.bottom.rightSize}
          onSidebarSizeChange={ideLayout.setSidebarSize}
          onBottomSizeChange={ideLayout.setBottomSize}
          onRightSizeChange={ideLayout.setRightSize}
          statusBar={(
            <StatusBar
              saveState={saveState}
              profile={activeProfile}
              workspaceName={workspace.root}
              kind={workspace.kind}
              wordCount={wordCount}
              selectionWordCount={selectionWordCount}
              onClickProfile={openProfileSwitcher}
              apiKeyMissing={apiKeyMissing}
              onClickApiKeyWarning={() => openSettingsTab()}
              cursorLine={cursorPos?.line ?? null}
              cursorCol={cursorPos?.col ?? null}
              branch={null}
              diffStats={null}
              chatVisible={ideLayout.layout.bottom.visible && ideLayout.layout.bottom.activeTab === 'chat'}
              onToggleChat={() => {
                if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
                ideLayout.showBottomTab('chat')
              }}
              meterTokens={meterTotals.tokens || null}
              meterCostUsd={meterTotals.costUsd || null}
            />
          )}
        />
      </div>

      <FloatingToolbar
        view={activeEditor}
        selectionVersion={selectionTick}
        profile={activeProfile}
        onAgent={handleAgentFromToolbar}
      />

      <ProfilePicker
        open={pickerOpen}
        mode={pickerMode === 'first-launch' ? 'first-launch' : 'new'}
        onPick={handlePickProfile}
        onCancel={pickerMode === 'switch' ? handlePickerCancel : undefined}
      />

      {workspace.conflict && (
        <ConflictDialog
          rel={workspace.conflict.relPath}
          onReload={async () => {
            await workspace.reloadTabFromDisk(workspace.conflict!.relPath)
            workspace.resolveConflict()
          }}
          onOverwrite={() => {
            const rel = workspace.conflict!.relPath
            const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, rel))
            if (view) workspace.saveTab(rel, view.state.doc.toString())
            workspace.resolveConflict()
          }}
          onDismiss={workspace.resolveConflict}
        />
      )}

      {migrationOpen && (
        <MigrationModal
          onComplete={() => {
            setMigrationOpen(false)
            window.location.reload()
          }}
        />
      )}

      <OpenRemoteDialog
        open={remoteDialogOpen}
        recent={recentRemotes}
        onClose={() => setRemoteDialogOpen(false)}
        onConnect={handleConnectRemote}
      />

      {pendingDocAgent && (
        <DocumentAgentInstructionModal
          agent={pendingDocAgent}
          canRun={workspace.activeMarkdownRel != null}
          onSubmit={(instruction) => {
            handleAgentOnDocument(workspace.activeGroupId, pendingDocAgent, instruction)
            setPendingDocAgent(null)
          }}
          onCancel={() => setPendingDocAgent(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgb(var(--text-default))] text-[rgb(var(--bg-app))] text-sm rounded-md shadow-lg">
          {toast}
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        commands={commands.list()}
        files={paletteFiles}
        recentFiles={paletteRecents}
        onClose={() => setPaletteOpen(false)}
        onRunCommand={(id) => { commands.runById(id) }}
        onOpenFile={(rel) => { void workspace.openTab(rel) }}
      />
    </div>
  )
}

function EmptyState({ hasWorkspace, onChooseWorkspace }: { hasWorkspace: boolean; onChooseWorkspace: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-center px-6">
      <div className="max-w-md space-y-3 text-muted">
        {hasWorkspace ? (
          <>
            <p className="text-base font-medium text-default">No file open</p>
            <p className="text-sm">
              Pick a file from the sidebar, or use the New file button to create one. Pin files in the tree to feed
              them to the AI as background context.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-medium text-default">Welcome to Canv 0.2</p>
            <p className="text-sm">Choose a folder on your computer to use as your writing workspace.</p>
            <button type="button" className="btn-primary" onClick={onChooseWorkspace}>
              Choose folder
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ConflictDialog({
  rel,
  onReload,
  onOverwrite,
  onDismiss,
}: {
  rel: string
  onReload: () => void
  onOverwrite: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-sm w-full bg-elev rounded-lg shadow-xl p-5 space-y-3">
        <h3 className="text-base font-semibold">File changed on disk</h3>
        <p className="text-sm text-muted">
          "{rel}" was modified outside Canv. Choose what to keep.
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn-ghost" onClick={onDismiss}>Dismiss</button>
          <button type="button" className="btn-secondary" onClick={onOverwrite}>Keep my edits</button>
          <button type="button" className="btn-primary" onClick={onReload}>Reload from disk</button>
        </div>
      </div>
    </div>
  )
}
