import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type RunRecord } from '../components/ResultsPanel'
import type { Action as AgentDef, Mode } from '../config/types'
import type { EditorGroupId } from '../types/workspace'
import { EditorView } from '@codemirror/view'
import { runAgent, buildPrompt } from '../agents/runner'
import { getActionById } from './useModes'
import { getAdapter } from '../adapters'
import { decideApply } from '../lib/applyDecision'
import { useLocalStorage } from './useLocalStorage'
import type { useSettings } from './useSettings'
import type { useWorkspace } from './useWorkspace'
import { getFs, readFileContent } from '../lib/fs'
import type { BottomTab } from './useIdeLayout'

type SettingsApi = ReturnType<typeof useSettings>
type WorkspaceApi = ReturnType<typeof useWorkspace>

const MAX_RUNS = 10

export interface UseSelectionAgentArgs {
  settings: SettingsApi['settings']
  modelForAgent: SettingsApi['modelForAgent']
  activeProfile: Mode
  activeProfileId: string
  workspace: WorkspaceApi
  getActiveEditor: () => EditorView | null
  getActiveEditorForGroup: (groupId: EditorGroupId) => EditorView | null
  showToast: (msg: string) => void
  openSettingsTab: () => void
  showBottomTab: (tab: BottomTab) => void
  /** Emit a finished selection rewrite as an inline diff in the document. */
  emitDiffSuggestion: (
    range: { from: number; to: number },
    original: string,
    rewrite: string,
    origin: { agentId: string; agentLabel: string; provider: string; model: string },
  ) => void
}

export interface UseSelectionAgentApi {
  runs: RunRecord[]
  activeTabId: string | null
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>
  handleAgentFromToolbar: (agent: AgentDef, range: { from: number; to: number }, text: string, instruction?: string) => void
  handleAgentOnDocument: (groupId: EditorGroupId, agent: AgentDef, instruction?: string) => void
  handleApply: (run: RunRecord, replacement: string) => void
  handleRerun: (run: RunRecord) => void
  handleCloseTab: (id: string) => void
  refineRun: (run: RunRecord, message: string) => Promise<void>
}

export function useSelectionAgent(args: UseSelectionAgentArgs): UseSelectionAgentApi {
  const {
    settings, modelForAgent, activeProfile, activeProfileId, workspace,
    getActiveEditor, getActiveEditorForGroup,
    showToast, openSettingsTab, showBottomTab, emitDiffSuggestion,
  } = args

  const [runs, setRuns] = useLocalStorage<RunRecord[]>('canv:runs', [])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const runAbort = useRef<Map<string, AbortController>>(new Map())

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

  // ---- ensurePinnedReady (verbatim, ref-pattern preserved) ----
  const workspaceForPinRef = useRef(workspace)
  // eslint-disable-next-line react-hooks/refs -- keep the ref in sync with the latest workspace so ensurePinnedReady() reads fresh state without listing workspace as a dep
  workspaceForPinRef.current = workspace

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
        const content = await readFileContent(getFs(), p.relPath)
        out.push(content)
      } catch {
        // Skip missing pinned files silently.
      }
    }
    return out
  }, [])

  const triggerAgent = useCallback(
    async (agent: AgentDef, range: { from: number; to: number } | null, text: string, instruction?: string) => {
      if (!text.trim()) {
        showToast('Select some text first')
        return
      }

      // The per-action override carries its provider explicitly so a future
      // adapter exposing the same model id (e.g. Bedrock + direct Anthropic
      // both listing claude-sonnet-4-6) routes unambiguously.
      const { provider, model } = modelForAgent(activeProfileId, agent.id)
      const providerReady = provider === 'ollama'
        ? !!settings.baseUrls?.ollama
        : !!settings.apiKeys[provider]
      if (!providerReady) {
        openSettingsTab()
        showToast(
          provider === 'ollama'
            ? 'Set the Ollama base URL in settings.'
            : `Add an ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in settings.`,
        )
        return
      }
      const adapter = getAdapter(provider)
      // Selection-level plain rewrites render inline; everything else keeps the
      // Runs panel for now (Phase 1).
      const emitInline = agent.outputMode === 'replacement' && range != null
      const freshContextSummaries = await ensurePinnedReady()
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
        provider: adapter.id,
        sourceText: text,
        range,
        response: '',
        status: 'streaming',
        timestamp: Date.now(),
        basePrompt,
        followups: [],
        schemaVersion: 2,
        inlineEmitted: emitInline,
      }

      setRuns((prev) => {
        const next = [initial, ...prev]
        return next.slice(0, MAX_RUNS)
      })
      setActiveTabId(id)
      if (!emitInline) showBottomTab('runs')

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
          apiKey: settings.apiKeys[provider],
          baseUrl: settings.baseUrls?.[provider],
          model,
          maxTokens: settings.maxOutputTokens[provider],
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

        if (emitInline && range && final.trim()) {
          emitDiffSuggestion(
            range,
            text,
            final,
            { agentId: agent.id, agentLabel: agent.label, provider: adapter.id, model },
          )
        } else if (emitInline) {
          // Inline was intended but there's nothing to show (e.g. a
          // whitespace-only response). Surface the run so the user isn't
          // left with neither an inline diff nor a panel.
          showBottomTab('runs')
        }
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
        if (emitInline) showBottomTab('runs')
      } finally {
        runAbort.current.delete(id)
      }
    },
    [activeProfileId, settings, modelForAgent, ensurePinnedReady, getActiveEditor, setRuns, showToast, openSettingsTab, showBottomTab, emitDiffSuggestion],
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
      const decision = decideApply(view.state.doc.toString(), run, replacement)
      switch (decision.kind) {
        case 'replace-doc':
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: replacement },
          })
          setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, applied: true } : r)))
          showToast('Document replaced')
          return
        case 'already-applied':
          showToast('Already applied — re-run to produce a fresh edit')
          return
        case 'stale':
          showToast('Selection changed since this run — re-select and re-run')
          return
        case 'apply':
          view.dispatch({
            changes: { from: decision.from, to: decision.to, insert: replacement },
            selection: { anchor: decision.from + replacement.length },
            scrollIntoView: true,
          })
          setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, applied: true } : r)))
          showToast('Applied')
          return
      }
    },
    [getActiveEditor, showToast, setRuns],
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
      const { provider, model } = modelForAgent(activeProfileId, agent.id)
      const providerReady = provider === 'ollama'
        ? !!settings.baseUrls?.ollama
        : !!settings.apiKeys[provider]
      if (!providerReady) {
        openSettingsTab()
        showToast(
          provider === 'ollama'
            ? 'Set the Ollama base URL in settings.'
            : `Add an ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in settings.`,
        )
        return
      }
      const adapter = getAdapter(provider)

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
        prev.map((r) => (r.id === run.id ? { ...r, status: 'refining' as const, response: '', applied: false } : r)),
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
          apiKey: settings.apiKeys[provider],
          baseUrl: settings.baseUrls?.[provider],
          model,
          system,
          messages,
          maxTokens: settings.maxOutputTokens[provider],
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
    [activeProfileId, settings, modelForAgent, setRuns, showToast, openSettingsTab, activeProfile],
  )

  return useMemo<UseSelectionAgentApi>(() => ({
    runs, activeTabId, setActiveTabId,
    handleAgentFromToolbar, handleAgentOnDocument,
    handleApply, handleRerun, handleCloseTab,
    refineRun,
  }), [
    runs, activeTabId, setActiveTabId,
    handleAgentFromToolbar, handleAgentOnDocument,
    handleApply, handleRerun, handleCloseTab, refineRun,
  ])
}
