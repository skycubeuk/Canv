import { useCallback, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import {
  setDiffHunks,
  clearHunks,
  suggestionField,
  applyHunkInView,
  rejectHunkInView,
  findHunk,
  addAnnotation as addAnnotationEffect,
  acceptAnnotationInView,
  dismissAnnotationInView,
  type SuggestionCallbacks,
} from '../lib/cm/suggestionLayer'
import { computeHunks } from '../lib/suggestions/hunks'
import type { DiffOrigin } from '../lib/suggestions/types'
import { withAiEditSnapshot, type AiEditHistoryClient } from '../lib/history/withAiEditSnapshot'

export interface UseSuggestionsDeps {
  getActiveEditor: () => EditorView | null
  activeMarkdownRel: string | null
  historyClient: AiEditHistoryClient | null
  flushAll: () => Promise<void>
  /** Persist the active doc text after an in-memory dispatch. */
  saveActive: () => void
}

export interface UseSuggestionsApi {
  addDiffSuggestion: (
    range: { from: number; to: number },
    original: string,
    rewrite: string,
    origin: DiffOrigin,
  ) => void
  accept: (hunkId: string, view?: EditorView) => Promise<void>
  reject: (hunkId: string, view?: EditorView) => void
  acceptAll: (view?: EditorView) => Promise<void>
  rejectAll: (view?: EditorView) => void
  addAnnotation: (range: { from: number; to: number }, note: string, author: string, suggestedReplacement?: string) => void
  dismissAnnotation: (id: string, view?: EditorView) => void
  acceptAnnotation: (id: string, view?: EditorView) => Promise<void>
  pendingCount: number
  callbacks: SuggestionCallbacks
}

export function useSuggestions(deps: UseSuggestionsDeps): UseSuggestionsApi {
  const [pendingCount, setPendingCount] = useState(0)
  const originRef = useRef<DiffOrigin | null>(null)
  const annotSeq = useRef(0)

  // Keep deps fresh without re-creating the stable callbacks below.
  const depsRef = useRef(deps)
  // eslint-disable-next-line react-hooks/refs -- callbacks read depsRef only in event handlers (accept/reject), never during render, so syncing here is safe and avoids re-creating the stable facet callbacks
  depsRef.current = deps

  const syncCount = useCallback((view: EditorView | null) => {
    const n = view ? view.state.field(suggestionField).filter((h) => h.status === 'pending').length : 0
    setPendingCount(n)
  }, [])

  const addDiffSuggestion = useCallback(
    (range: { from: number; to: number }, original: string, rewrite: string, origin: DiffOrigin) => {
      const view = depsRef.current.getActiveEditor()
      if (!view) return
      const hunks = computeHunks(range.from, original, rewrite)
      originRef.current = origin
      view.dispatch({ effects: setDiffHunks.of(hunks) })
      syncCount(view)
    },
    [syncCount],
  )

  // Snapshot targets the active markdown file. Phase 1 only ever places suggestions in the active editor, so this matches the operated view in practice.
  const runWithSnapshot = useCallback(async (mutate: () => Promise<void>) => {
    const d = depsRef.current
    const origin = originRef.current
    await withAiEditSnapshot(
      {
        rel: d.activeMarkdownRel,
        client: d.historyClient,
        flush: () => d.flushAll(),
        afterFlush: async () => { d.saveActive(); await d.flushAll() },
        meta: origin ? { source: 'inline_accept', ...origin } : { source: 'inline_accept' },
        summary: origin?.agentLabel ?? 'Inline edit',
      },
      mutate,
    )
  }, [])

  const accept = useCallback(async (hunkId: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view || !findHunk(view, hunkId)) return
    await runWithSnapshot(async () => { applyHunkInView(view, hunkId) })
    syncCount(view)
  }, [runWithSnapshot, syncCount])

  const reject = useCallback((hunkId: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    rejectHunkInView(view, hunkId)
    syncCount(view)
  }, [syncCount])

  const acceptAll = useCallback(async (viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    await runWithSnapshot(async () => {
      let next = view.state.field(suggestionField).find((h) => h.status === 'pending')
      while (next) {
        const id = next.id
        applyHunkInView(view, id)
        // Safety: if the hunk is somehow still present, the apply no-opped —
        // stop rather than loop forever.
        if (view.state.field(suggestionField).some((h) => h.id === id)) break
        next = view.state.field(suggestionField).find((h) => h.status === 'pending')
      }
    })
    syncCount(view)
  }, [runWithSnapshot, syncCount])

  const rejectAll = useCallback((viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    view.dispatch({ effects: clearHunks.of(null) })
    syncCount(view)
  }, [syncCount])

  const addAnnotation = useCallback(
    (range: { from: number; to: number }, note: string, author: string, suggestedReplacement?: string) => {
      const view = depsRef.current.getActiveEditor()
      if (!view) return
      const id = `annot-${Date.now().toString(36)}-${(annotSeq.current++).toString(36)}`
      view.dispatch({
        effects: addAnnotationEffect.of({ id, from: range.from, to: range.to, note, author, suggestedReplacement, status: 'open' }),
      })
    },
    [],
  )

  const dismissAnnotation = useCallback((id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    dismissAnnotationInView(view, id)
  }, [])

  const acceptAnnotation = useCallback(async (id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    // Applies a doc change → route through the history-snapshot bracket.
    await runWithSnapshot(async () => { acceptAnnotationInView(view, id) })
  }, [runWithSnapshot])

  const callbacks = useMemo<SuggestionCallbacks>(
    () => ({
      accept: (hunkId, view) => { void accept(hunkId, view) },
      reject: (hunkId, view) => { reject(hunkId, view) },
      acceptAll: (view) => { void acceptAll(view) },
      rejectAll: (view) => { rejectAll(view) },
      acceptAnnotation: (id, view) => { void acceptAnnotation(id, view) },
      dismissAnnotation: (id, view) => { dismissAnnotation(id, view) },
    }),
    [accept, reject, acceptAll, rejectAll, acceptAnnotation, dismissAnnotation],
  )

  return useMemo<UseSuggestionsApi>(
    () => ({ addDiffSuggestion, accept, reject, acceptAll, rejectAll, addAnnotation, dismissAnnotation, acceptAnnotation, pendingCount, callbacks }),
    [addDiffSuggestion, accept, reject, acceptAll, rejectAll, addAnnotation, dismissAnnotation, acceptAnnotation, pendingCount, callbacks],
  )
}
