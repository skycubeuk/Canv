import { useCallback, useRef } from 'react'
import type { Action as AgentDef } from '../config/types'
import type { EditorGroupId } from '../types/workspace'
import { EditorView } from '@codemirror/view'
import { runAgent, buildPrompt, parseAgentResponse } from '../agents/runner'
import { routeSelectionAgentResult } from '../agents/selectionRouting'
import { getAdapter } from '../adapters'
import type { useSettings } from './useSettings'
import type { useWorkspace } from './useWorkspace'
import { getFs, readFileContent } from '../lib/fs'

type SettingsApi = ReturnType<typeof useSettings>
type WorkspaceApi = ReturnType<typeof useWorkspace>

export interface UseSelectionAgentArgs {
  settings: SettingsApi['settings']
  modelForAgent: SettingsApi['modelForAgent']
  activeProfileId: string
  workspace: WorkspaceApi
  getActiveEditor: () => EditorView | null
  getActiveEditorForGroup: (groupId: EditorGroupId) => EditorView | null
  showToast: (msg: string) => void
  openSettingsTab: () => void
  /** Emit a finished selection rewrite as an inline diff in the document. */
  emitDiffSuggestion: (
    range: { from: number; to: number },
    original: string,
    rewrite: string,
    origin: { agentId: string; agentLabel: string; provider: string; model: string },
  ) => void
  /** Emit a finished run's notes as an inline annotation. */
  emitAnnotation: (range: { from: number; to: number }, note: string, author: string) => void
}

export interface UseSelectionAgentApi {
  handleAgentFromToolbar: (agent: AgentDef, range: { from: number; to: number }, text: string, instruction?: string) => void
  handleAgentOnDocument: (groupId: EditorGroupId, agent: AgentDef, instruction?: string) => void
}

export function useSelectionAgent(args: UseSelectionAgentArgs): UseSelectionAgentApi {
  const {
    settings, modelForAgent, activeProfileId, workspace,
    getActiveEditor, getActiveEditorForGroup,
    showToast, openSettingsTab, emitDiffSuggestion, emitAnnotation,
  } = args

  const runAbort = useRef<Map<string, AbortController>>(new Map())

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

      const startedAt = Date.now()
      const controller = new AbortController()
      runAbort.current.set(id, controller)

      try {
        const { text: final } = await runAgent({
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
          chunkDelayMs: settings.streamChunkDelayMs,
        })

        const parsed = parseAgentResponse(agent, final)
        const rewrite = agent.outputMode === 'replacement' ? final.trim() : parsed.rewrite
        const routing = routeSelectionAgentResult({
          outputMode: agent.outputMode,
          hasRange: range != null,
          original: text,
          rewrite,
          feedback: parsed.feedback,
        })

        if (routing.emitDiff && range && rewrite) {
          emitDiffSuggestion(range, text, rewrite, {
            agentId: agent.id,
            agentLabel: agent.label,
            provider: adapter.id,
            model,
          })
        }
        if (routing.emitAnnotation && range && parsed.feedback) {
          emitAnnotation({ from: range.from, to: range.to }, parsed.feedback, agent.label)
        }
        // Whole-document runs (no range) show a toast on completion since there's no inline target.
        if (range == null) {
          showToast(`${agent.label}: done (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`)
        }
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        if (!aborted) {
          const msg = e instanceof Error ? e.message : String(e)
          showToast(`${agent.label} failed: ${msg}`)
        }
      } finally {
        runAbort.current.delete(id)
      }

      // Discard basePrompt to suppress the unused-var lint warning — it's
      // computed above for future use (e.g. seeding the Discuss chat).
      void basePrompt
    },
    [activeProfileId, settings, modelForAgent, ensurePinnedReady, getActiveEditor, showToast, openSettingsTab, emitDiffSuggestion, emitAnnotation],
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

  return { handleAgentFromToolbar, handleAgentOnDocument }
}
