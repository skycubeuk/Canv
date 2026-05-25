import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import {
  setDiffHunks,
  clearHunks,
  suggestionField,
  applyHunkInView,
  rejectHunkInView,
  findHunk,
  findAnnotation,
  addAnnotation as addAnnotationEffect,
  setAnnotationEditing,
  updateAnnotationNote,
  patchAnnotation,
  setAnnotationCollapsed,
  setAllAnnotationsCollapsed,
  acceptAnnotationInView,
  dismissAnnotationInView,
  annotationField,
  type SuggestionCallbacks,
} from '../lib/cm/suggestionLayer'
import { computeHunks } from '../lib/suggestions/hunks'
import type { DiffOrigin } from '../lib/suggestions/types'
import { withAiEditSnapshot, type AiEditHistoryClient } from '../lib/history/withAiEditSnapshot'
import { makeAnchor, resolveAnchor } from '../lib/suggestions/anchor'
import { loadAnnotations, saveAnnotations, type AnnotationRecord } from '../lib/annotationStore'

/** Debounce window (ms) for persisting annotation changes to the sidecar. */
const SAVE_DEBOUNCE_MS = 400

export interface UseSuggestionsDeps {
  getActiveEditor: () => EditorView | null
  activeMarkdownRel: string | null
  historyClient: AiEditHistoryClient | null
  flushAll: () => Promise<void>
  /** Persist the active doc text after an in-memory dispatch. */
  saveActive: () => void
  startSeededChat?: (seedText: string) => void
  showChatTab?: () => void
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
  addAnnotation: (range: { from: number; to: number }, note: string, author: string, suggestedReplacement?: string, quote?: string) => string
  updateAnnotation: (id: string, patch: { note?: string; suggestedReplacement?: string }, view?: EditorView) => void
  /** Create an empty user-authored note on a span and open it in edit mode. */
  addUserAnnotation: (range: { from: number; to: number }, text: string) => void
  dismissAnnotation: (id: string, view?: EditorView) => void
  acceptAnnotation: (id: string, view?: EditorView) => Promise<void>
  editAnnotation: (id: string, view?: EditorView) => void
  saveAnnotationNote: (id: string, note: string, view?: EditorView) => void
  toggleAnnotationCollapsed: (id: string, view?: EditorView) => void
  collapseAllAnnotations: (collapsed: boolean, view?: EditorView) => void
  discuss: (id: string, view?: EditorView) => void
  pendingCount: number
  annotationCount: number
  allAnnotationsCollapsed: boolean
  callbacks: SuggestionCallbacks
}

export function useSuggestions(deps: UseSuggestionsDeps): UseSuggestionsApi {
  const [pendingCount, setPendingCount] = useState(0)
  const [annotationCount, setAnnotationCount] = useState(0)
  const [allAnnotationsCollapsed, setAllCollapsed] = useState(false)
  const originRef = useRef<DiffOrigin | null>(null)
  const annotSeq = useRef(0)
  // Which file's annotations are already loaded — guards a single load per open.
  const loadedRelRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep deps fresh without re-creating the stable callbacks below.
  const depsRef = useRef(deps)
  // eslint-disable-next-line react-hooks/refs -- callbacks read depsRef only in event handlers (accept/reject), never during render, so syncing here is safe and avoids re-creating the stable facet callbacks
  depsRef.current = deps

  const syncCount = useCallback((view: EditorView | null) => {
    const n = view ? view.state.field(suggestionField).filter((h) => h.status === 'pending').length : 0
    setPendingCount(n)
    const open = view ? view.state.field(annotationField).filter((a) => a.status === 'open') : []
    setAnnotationCount(open.length)
    setAllCollapsed(open.length > 0 && open.every((a) => a.collapsed === true))
  }, [])

  // Debounce-persist the current open annotations for the active file. Each
  // open annotation is serialised as a content anchor (not raw offsets) so it
  // can be re-located after the text changes. Empty list deletes the sidecar.
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const view = depsRef.current.getActiveEditor()
      const rel = depsRef.current.activeMarkdownRel
      if (!view || !rel) return
      const docText = view.state.doc.toString()
      const records: AnnotationRecord[] = view.state.field(annotationField)
        .filter((a) => a.status === 'open')
        .map((a) => ({
          id: a.id,
          anchor: makeAnchor(docText, a.from, a.to),
          note: a.note,
          author: a.author,
          ...(a.suggestedReplacement !== undefined ? { suggestedReplacement: a.suggestedReplacement } : {}),
        }))
      void saveAnnotations(rel, records)
    }, SAVE_DEBOUNCE_MS)
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
    (range: { from: number; to: number }, note: string, author: string, suggestedReplacement?: string, quote?: string): string => {
      const view = depsRef.current.getActiveEditor()
      const id = `annot-${Date.now().toString(36)}-${(annotSeq.current++).toString(36)}`
      if (!view) return id
      view.dispatch({
        effects: addAnnotationEffect.of({ id, from: range.from, to: range.to, note, author, suggestedReplacement, quote, status: 'open' }),
      })
      syncCount(view)
      scheduleSave()
      return id
    },
    [scheduleSave, syncCount],
  )

  const addUserAnnotation = useCallback((range: { from: number; to: number }, text: string) => {
    const view = depsRef.current.getActiveEditor()
    if (!view) return
    const id = `annot-${Date.now().toString(36)}-${(annotSeq.current++).toString(36)}`
    view.dispatch({
      effects: addAnnotationEffect.of({
        id, from: range.from, to: range.to, note: '', author: 'You', quote: text, editing: true, status: 'open',
      }),
      // Collapse the native selection so its highlight doesn't blend with the
      // new annotation highlight (mirrors the AI emit path).
      selection: { anchor: range.from },
    })
    syncCount(view)
    scheduleSave()
  }, [scheduleSave, syncCount])

  const dismissAnnotation = useCallback((id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    dismissAnnotationInView(view, id)
    syncCount(view)
    scheduleSave()
  }, [scheduleSave, syncCount])

  const editAnnotation = useCallback((id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    view.dispatch({ effects: setAnnotationEditing.of({ id, editing: true }) })
  }, [])

  const saveAnnotationNote = useCallback((id: string, note: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    view.dispatch({ effects: [updateAnnotationNote.of({ id, note }), setAnnotationEditing.of({ id, editing: false })] })
    scheduleSave()
  }, [scheduleSave])

  const updateAnnotation = useCallback(
    (id: string, patch: { note?: string; suggestedReplacement?: string }, viewArg?: EditorView) => {
      const view = viewArg ?? depsRef.current.getActiveEditor()
      if (!view) return
      view.dispatch({ effects: patchAnnotation.of({ id, ...patch }) })
      syncCount(view)
      scheduleSave()
    },
    [scheduleSave, syncCount],
  )

  const toggleAnnotationCollapsed = useCallback((id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    const current = findAnnotation(view, id)
    view.dispatch({ effects: setAnnotationCollapsed.of({ id, collapsed: !current?.collapsed }) })
    syncCount(view)
  }, [syncCount])

  const collapseAllAnnotations = useCallback((collapsed: boolean, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    view.dispatch({ effects: setAllAnnotationsCollapsed.of(collapsed) })
    syncCount(view)
  }, [syncCount])

  const acceptAnnotation = useCallback(async (id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    // Applies a doc change → route through the history-snapshot bracket.
    await runWithSnapshot(async () => { acceptAnnotationInView(view, id) })
    syncCount(view)
    scheduleSave()
  }, [runWithSnapshot, scheduleSave, syncCount])

  // Load persisted annotations once per file open: when activeMarkdownRel
  // becomes a new non-null value and the editor is available, read the sidecar,
  // re-anchor each record against the current doc text, and add the ones that
  // still resolve (orphaned/unresolved records are skipped for now).
  useEffect(() => {
    const rel = deps.activeMarkdownRel
    if (!rel) return
    if (loadedRelRef.current === rel) return
    const view = deps.getActiveEditor()
    if (!view) return
    loadedRelRef.current = rel

    let cancelled = false
    void (async () => {
      const records = await loadAnnotations(rel)
      if (cancelled) return
      const current = depsRef.current.getActiveEditor()
      if (!current || depsRef.current.activeMarkdownRel !== rel) return
      const docText = current.state.doc.toString()
      for (const rec of records) {
        const span = resolveAnchor(docText, rec.anchor)
        if (!span) continue
        current.dispatch({
          effects: addAnnotationEffect.of({
            id: rec.id,
            from: span.from,
            to: span.to,
            note: rec.note,
            author: rec.author,
            suggestedReplacement: rec.suggestedReplacement,
            status: 'open',
          }),
        })
      }
      syncCount(current)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per rel; getActiveEditor read live via depsRef inside the async body
  }, [deps.activeMarkdownRel])

  const discuss = useCallback((id: string, viewArg?: EditorView) => {
    const view = viewArg ?? depsRef.current.getActiveEditor()
    if (!view) return
    const ann = findAnnotation(view, id)
    const hunk = ann ? undefined : findHunk(view, id)
    let seed: string | null = null
    if (ann) {
      const quoted = view.state.sliceDoc(ann.from, ann.to)
      seed = `Let's discuss this note from ${ann.author} on "${quoted}":\n\n${ann.note}`
    } else if (hunk) {
      const original = view.state.sliceDoc(hunk.from, hunk.to)
      seed = `Let's discuss this suggested edit.\n\nReplace:\n"${original}"\n\nWith:\n"${hunk.insert}"`
    }
    if (!seed) return
    depsRef.current.startSeededChat?.(seed)
    depsRef.current.showChatTab?.()
  }, [])

  const callbacks = useMemo<SuggestionCallbacks>(
    () => ({
      accept: (hunkId, view) => { void accept(hunkId, view) },
      reject: (hunkId, view) => { reject(hunkId, view) },
      acceptAll: (view) => { void acceptAll(view) },
      rejectAll: (view) => { rejectAll(view) },
      acceptAnnotation: (id, view) => { void acceptAnnotation(id, view) },
      dismissAnnotation: (id, view) => { dismissAnnotation(id, view) },
      editAnnotation: (id, view) => { editAnnotation(id, view) },
      saveAnnotationNote: (id, note, view) => { saveAnnotationNote(id, note, view) },
      toggleAnnotationCollapsed: (id, view) => { toggleAnnotationCollapsed(id, view) },
      discuss: (id, view) => { discuss(id, view) },
    }),
    [accept, reject, acceptAll, rejectAll, acceptAnnotation, dismissAnnotation, editAnnotation, saveAnnotationNote, toggleAnnotationCollapsed, discuss],
  )

  return useMemo<UseSuggestionsApi>(
    () => ({ addDiffSuggestion, accept, reject, acceptAll, rejectAll, addAnnotation, addUserAnnotation, dismissAnnotation, acceptAnnotation, editAnnotation, saveAnnotationNote, updateAnnotation, toggleAnnotationCollapsed, collapseAllAnnotations, discuss, pendingCount, annotationCount, allAnnotationsCollapsed, callbacks }),
    [addDiffSuggestion, accept, reject, acceptAll, rejectAll, addAnnotation, addUserAnnotation, dismissAnnotation, acceptAnnotation, editAnnotation, saveAnnotationNote, updateAnnotation, toggleAnnotationCollapsed, collapseAllAnnotations, discuss, pendingCount, annotationCount, allAnnotationsCollapsed, callbacks],
  )
}
