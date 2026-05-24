import {
  StateField,
  StateEffect,
  Facet,
  type Range,
  type Extension,
} from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { Hunk, Annotation } from '../suggestions/types'

// ---- callbacks facet: the editor calls back into the React store ----------

export interface SuggestionCallbacks {
  accept: (hunkId: string, view: EditorView) => void
  reject: (hunkId: string, view: EditorView) => void
  acceptAll: (view: EditorView) => void
  rejectAll: (view: EditorView) => void
  /** Apply an annotation's suggested replacement. Optional until the store wires it. */
  acceptAnnotation?: (id: string, view: EditorView) => void
  /** Drop an annotation without changing the document. Optional until the store wires it. */
  dismissAnnotation?: (id: string, view: EditorView) => void
  /** Open a seeded chat discussion about this change. Optional until the store wires it. */
  discuss?: (id: string, view: EditorView) => void
  /** Resolve the chat approval for a chat-edit preview as approved. Optional until wired. */
  approveEdit?: (callId: string, view: EditorView) => void
  /** Resolve the chat approval for a chat-edit preview as denied. Optional until wired. */
  rejectEdit?: (callId: string, view: EditorView) => void
}

export const suggestionCallbacks = Facet.define<SuggestionCallbacks, SuggestionCallbacks | null>({
  combine: (values) => (values.length ? values[0] : null),
})

// ---- effects --------------------------------------------------------------

export const setDiffHunks = StateEffect.define<Hunk[]>()
export const removeHunk = StateEffect.define<string>()
export const clearHunks = StateEffect.define<null>()

export const addAnnotation = StateEffect.define<Annotation>()
export const removeAnnotation = StateEffect.define<string>()
export const clearAnnotations = StateEffect.define<null>()

// ---- chat-edit preview effects + field ------------------------------------

export interface EditPreviewHunk {
  from: number
  to: number
  rewrite: string
}

export interface EditPreviewState {
  callId: string
  hunks: EditPreviewHunk[]
}

export const setEditPreview = StateEffect.define<EditPreviewState>()
export const clearEditPreview = StateEffect.define<null>()

export const editPreviewField = StateField.define<EditPreviewState | null>({
  create: () => null,
  update(preview, tr) {
    // Process explicit effects first.
    for (const e of tr.effects) {
      if (e.is(setEditPreview)) return e.value
      if (e.is(clearEditPreview)) return null
    }
    if (!tr.docChanged || !preview) return preview

    // Map all hunks through the change set, invalidating the whole preview
    // when any edit overlaps any hunk (same rule as hunk and annotation fields).
    let invalid = false
    for (const hunk of preview.hunks) {
      tr.changes.iterChanges((fromA, toA) => {
        if (toA > fromA) {
          // Deletion/replacement: invalidate if it overlaps (fromA,toA) ∩ (hunk.from,hunk.to)
          if (fromA < hunk.to && toA > hunk.from) invalid = true
        } else {
          // Pure insertion: invalidate only if strictly inside the span
          if (fromA > hunk.from && fromA < hunk.to) invalid = true
        }
      })
      if (invalid) break
    }
    if (invalid) return null

    // Map each hunk's positions through the change set
    const mappedHunks = preview.hunks.map((hunk) => ({
      ...hunk,
      from: tr.changes.mapPos(hunk.from, 1),
      to: tr.changes.mapPos(hunk.to, -1),
    }))
    return { ...preview, hunks: mappedHunks }
  },
  provide: (f) => EditorView.decorations.from(f, (preview) => buildEditPreviewDecorations(preview)),
})

// ---- state field: holds the current hunks, kept live with mapPos ----------

export const suggestionField = StateField.define<Hunk[]>({
  create: () => [],
  update(hunks, tr) {
    if (tr.docChanged && hunks.length) {
      hunks = hunks.map((h): Hunk => {
        if (h.status !== 'pending') return h
        // Invalidate only when a change reaches the hunk's content: a deletion/
        // replacement overlapping [from,to], or an insertion strictly inside it.
        // A pure insertion at either boundary must NOT invalidate — it shifts.
        let invalid = false
        tr.changes.iterChanges((fromA, toA) => {
          if (toA > fromA) {
            if (fromA < h.to && toA > h.from) invalid = true
          } else if (fromA > h.from && fromA < h.to) {
            invalid = true
          }
        })
        if (invalid) return { ...h, status: 'invalidated' }
        if (h.from === h.to) {
          const p = tr.changes.mapPos(h.from, 1)
          return { ...h, from: p, to: p }
        }
        // Inner association: `from` assoc +1 and `to` assoc -1 so text typed at
        // either boundary lands OUTSIDE the deletion span (never swallowed).
        return { ...h, from: tr.changes.mapPos(h.from, 1), to: tr.changes.mapPos(h.to, -1) }
      })
    }
    for (const e of tr.effects) {
      if (e.is(setDiffHunks)) hunks = e.value
      else if (e.is(removeHunk)) hunks = hunks.filter((h) => h.id !== e.value)
      else if (e.is(clearHunks)) hunks = []
    }
    return hunks
  },
  provide: (f) => EditorView.decorations.from(f, (hunks) => buildDecorations(hunks)),
})

// ---- annotations field: span-anchored notes (AI feedback or user notes) ----

export const annotationField = StateField.define<Annotation[]>({
  create: () => [],
  update(annotations, tr) {
    if (tr.docChanged && annotations.length) {
      annotations = annotations.map((a): Annotation => {
        if (a.status !== 'open') return a
        // Same anchoring rule as hunks: a deletion/replacement overlapping the
        // span, or an insertion strictly inside it, invalidates; boundary edits
        // just shift it (inner association).
        let invalid = false
        tr.changes.iterChanges((fromA, toA) => {
          if (toA > fromA) {
            if (fromA < a.to && toA > a.from) invalid = true
          } else if (fromA > a.from && fromA < a.to) {
            invalid = true
          }
        })
        if (invalid) return { ...a, status: 'invalidated' }
        return { ...a, from: tr.changes.mapPos(a.from, 1), to: tr.changes.mapPos(a.to, -1) }
      })
    }
    for (const e of tr.effects) {
      if (e.is(addAnnotation)) annotations = [...annotations, e.value]
      else if (e.is(removeAnnotation)) annotations = annotations.filter((a) => a.id !== e.value)
      else if (e.is(clearAnnotations)) annotations = []
    }
    return annotations
  },
  provide: (f) => EditorView.decorations.from(f, (anns) => buildAnnotationDecorations(anns)),
})

// ---- widgets --------------------------------------------------------------

class InsertWidget extends WidgetType {
  text: string
  constructor(text: string) {
    super()
    this.text = text
  }
  eq(other: WidgetType) {
    return other instanceof InsertWidget && other.text === this.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-sug-ins'
    span.textContent = this.text
    return span
  }
}

class ControlWidget extends WidgetType {
  hunkId: string
  constructor(hunkId: string) {
    super()
    this.hunkId = hunkId
  }
  eq(other: WidgetType) {
    return other instanceof ControlWidget && other.hunkId === this.hunkId
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = 'cm-sug-controls'
    wrap.contentEditable = 'false'

    const mkBtn = (label: string, cls: string, ariaLabel: string, run: (cb: SuggestionCallbacks) => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = cls
      b.textContent = label
      b.setAttribute('aria-label', ariaLabel)
      b.onmousedown = (ev) => {
        ev.preventDefault() // keep editor selection/focus
        const cb = view.state.facet(suggestionCallbacks)
        if (cb) run(cb)
      }
      return b
    }

    wrap.appendChild(mkBtn('✓', 'cm-sug-accept', 'Accept change', (cb) => cb.accept(this.hunkId, view)))
    wrap.appendChild(mkBtn('✗', 'cm-sug-reject', 'Reject change', (cb) => cb.reject(this.hunkId, view)))
    wrap.appendChild(mkBtn('Discuss', 'cm-sug-discuss', 'Discuss change', (cb) => cb.discuss?.(this.hunkId, view)))
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

// ---- decorations ----------------------------------------------------------

function buildDecorations(hunks: Hunk[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const h of hunks) {
    if (h.status !== 'pending') continue
    if (h.to > h.from) {
      ranges.push(Decoration.mark({ class: 'cm-sug-del' }).range(h.from, h.to))
    }
    if (h.insert) {
      ranges.push(Decoration.widget({ widget: new InsertWidget(h.insert), side: 1 }).range(h.to))
    }
    ranges.push(Decoration.widget({ widget: new ControlWidget(h.id), side: 1 }).range(h.to))
  }
  // Decoration.set sorts the ranges for us.
  return Decoration.set(ranges, true)
}

class AnnotationCardWidget extends WidgetType {
  ann: Annotation
  constructor(ann: Annotation) {
    super()
    this.ann = ann
  }
  eq(other: WidgetType) {
    return (
      other instanceof AnnotationCardWidget &&
      other.ann.id === this.ann.id &&
      other.ann.note === this.ann.note &&
      other.ann.suggestedReplacement === this.ann.suggestedReplacement
    )
  }
  toDOM(view: EditorView) {
    const card = document.createElement('span')
    card.className = 'cm-annot-card'
    card.contentEditable = 'false'

    const head = document.createElement('span')
    head.className = 'cm-annot-author'
    head.textContent = this.ann.author
    card.appendChild(head)

    const body = document.createElement('span')
    body.className = 'cm-annot-note'
    body.textContent = this.ann.note
    card.appendChild(body)

    const actions = document.createElement('span')
    actions.className = 'cm-annot-actions'
    const mkBtn = (label: string, cls: string, run: (cb: SuggestionCallbacks) => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = cls
      b.textContent = label
      b.onmousedown = (ev) => {
        ev.preventDefault()
        const cb = view.state.facet(suggestionCallbacks)
        if (cb) run(cb)
      }
      return b
    }
    if (this.ann.suggestedReplacement != null) {
      actions.appendChild(mkBtn('Accept', 'cm-annot-accept', (cb) => cb.acceptAnnotation?.(this.ann.id, view)))
    }
    actions.appendChild(mkBtn('Dismiss', 'cm-annot-dismiss', (cb) => cb.dismissAnnotation?.(this.ann.id, view)))
    actions.appendChild(mkBtn('Discuss', 'cm-annot-discuss', (cb) => cb.discuss?.(this.ann.id, view)))
    card.appendChild(actions)
    return card
  }
  ignoreEvent() {
    return false
  }
}

// ---- edit-preview widgets -------------------------------------------------

class EditPreviewControlWidget extends WidgetType {
  callId: string
  constructor(callId: string) {
    super()
    this.callId = callId
  }
  eq(other: WidgetType) {
    return (
      other instanceof EditPreviewControlWidget &&
      other.callId === this.callId
    )
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = 'cm-editprev-controls'
    wrap.contentEditable = 'false'

    const mkBtn = (label: string, cls: string, ariaLabel: string, run: (cb: SuggestionCallbacks) => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = cls
      b.textContent = label
      b.setAttribute('aria-label', ariaLabel)
      b.onmousedown = (ev) => {
        ev.preventDefault()
        const cb = view.state.facet(suggestionCallbacks)
        if (cb) run(cb)
      }
      return b
    }

    wrap.appendChild(mkBtn('✓', 'cm-sug-accept', 'Accept chat edit', (cb) => cb.approveEdit?.(this.callId, view)))
    wrap.appendChild(mkBtn('✗', 'cm-sug-reject', 'Reject chat edit', (cb) => cb.rejectEdit?.(this.callId, view)))
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

function buildEditPreviewDecorations(preview: EditPreviewState | null): DecorationSet {
  if (!preview || preview.hunks.length === 0) return Decoration.none
  const ranges: Range<Decoration>[] = []

  for (const hunk of preview.hunks) {
    if (hunk.to > hunk.from) {
      ranges.push(Decoration.mark({ class: 'cm-sug-del' }).range(hunk.from, hunk.to))
    }
    if (hunk.rewrite) {
      ranges.push(Decoration.widget({ widget: new InsertWidget(hunk.rewrite), side: 1 }).range(hunk.to))
    }
  }

  // Single control widget anchored at the last hunk's `to` — one approve/deny
  // for the whole call (apply_edits is a single atomic approval).
  const lastHunk = preview.hunks[preview.hunks.length - 1]
  ranges.push(
    Decoration.widget({
      widget: new EditPreviewControlWidget(preview.callId),
      side: 1,
    }).range(lastHunk.to),
  )
  return Decoration.set(ranges, true)
}

function buildAnnotationDecorations(anns: Annotation[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const a of anns) {
    if (a.status !== 'open') continue
    if (a.to > a.from) {
      ranges.push(Decoration.mark({ class: 'cm-annot' }).range(a.from, a.to))
    }
    ranges.push(Decoration.widget({ widget: new AnnotationCardWidget(a), side: 1 }).range(a.to))
  }
  return Decoration.set(ranges, true)
}

// ---- view-level helpers (used by widgets and the store) -------------------

export function findHunk(view: EditorView, hunkId: string): Hunk | undefined {
  return view.state.field(suggestionField).find((h) => h.id === hunkId)
}

/** Apply a single hunk's change and drop it from the field, in one dispatch. */
export function applyHunkInView(view: EditorView, hunkId: string) {
  const h = findHunk(view, hunkId)
  if (!h || h.status !== 'pending') return
  view.dispatch({
    changes: { from: h.from, to: h.to, insert: h.insert },
    effects: removeHunk.of(hunkId),
    scrollIntoView: true,
  })
}

/** Drop a single hunk without changing the document. */
export function rejectHunkInView(view: EditorView, hunkId: string) {
  view.dispatch({ effects: removeHunk.of(hunkId) })
}

export function findAnnotation(view: EditorView, id: string): Annotation | undefined {
  return view.state.field(annotationField).find((a) => a.id === id)
}

/** Apply an annotation's suggested replacement (if any) and drop the annotation. */
export function acceptAnnotationInView(view: EditorView, id: string) {
  const a = findAnnotation(view, id)
  if (!a || a.status !== 'open' || a.suggestedReplacement == null) return
  view.dispatch({
    changes: { from: a.from, to: a.to, insert: a.suggestedReplacement },
    effects: removeAnnotation.of(id),
    scrollIntoView: true,
  })
}

/** Drop an annotation without changing the document. */
export function dismissAnnotationInView(view: EditorView, id: string) {
  view.dispatch({ effects: removeAnnotation.of(id) })
}

// ---- styling --------------------------------------------------------------

// Theme-adaptive: all colors come from the app's design-token CSS vars
// (defined in src/index.css per theme). The `--*-soft` vars are full
// color-mix() values; the others are `R G B` triplets used via rgb(var(...)).
const suggestionTheme = EditorView.baseTheme({
  '.cm-sug-del': {
    backgroundColor: 'var(--danger-soft)',
    textDecoration: 'line-through',
    textDecorationColor: 'rgb(var(--danger-fg))',
    opacity: '0.7',
  },
  '.cm-sug-ins': {
    backgroundColor: 'var(--success-soft)',
    borderRadius: '2px',
  },
  '.cm-sug-controls': {
    display: 'inline-flex',
    gap: '2px',
    margin: '0 4px',
    verticalAlign: 'baseline',
  },
  '.cm-sug-controls button': {
    cursor: 'pointer',
    border: '1px solid rgb(var(--border-default))',
    borderRadius: '4px',
    background: 'rgb(var(--bg-panel))',
    fontSize: '11px',
    lineHeight: '1',
    padding: '1px 5px',
  },
  '.cm-sug-accept': { color: 'rgb(var(--success-fg))' },
  '.cm-sug-reject': { color: 'rgb(var(--danger-fg))' },
  '.cm-sug-discuss': { color: 'rgb(var(--accent))' },
  '.cm-annot': {
    backgroundColor: 'color-mix(in oklab, rgb(var(--accent)) 12%, transparent)',
    borderBottom: '2px dotted rgb(var(--accent))',
  },
  '.cm-annot-card': {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '6px',
    margin: '0 0 0 6px',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid rgb(var(--border-default))',
    borderLeft: '3px solid rgb(var(--accent))',
    background: 'rgb(var(--bg-panel))',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '12px',
    lineHeight: '1.45',
    whiteSpace: 'normal',
    verticalAlign: 'text-top',
    maxWidth: '34em',
  },
  '.cm-annot-author': { fontWeight: '600', color: 'rgb(var(--accent))', whiteSpace: 'nowrap' },
  '.cm-annot-note': { color: 'rgb(var(--text-default))' },
  '.cm-annot-actions': { display: 'inline-flex', gap: '8px', whiteSpace: 'nowrap' },
  '.cm-annot-card button': {
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    padding: '0',
    fontSize: '12px',
  },
  '.cm-annot-accept': { color: 'rgb(var(--success-fg))', fontWeight: '600' },
  '.cm-annot-dismiss': { color: 'rgb(var(--text-subtle))' },
  '.cm-annot-discuss': { color: 'rgb(var(--accent))' },
})

/** The full extension to add to an editor. */
export function suggestionExtension(): Extension {
  return [suggestionField, annotationField, editPreviewField, suggestionTheme]
}
