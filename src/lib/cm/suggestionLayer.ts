import {
  StateField,
  StateEffect,
  Facet,
  type Range,
  type Extension,
} from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { Hunk } from '../suggestions/types'

// ---- callbacks facet: the editor calls back into the React store ----------

export interface SuggestionCallbacks {
  accept: (hunkId: string, view: EditorView) => void
  reject: (hunkId: string, view: EditorView) => void
  acceptAll: (view: EditorView) => void
  rejectAll: (view: EditorView) => void
}

export const suggestionCallbacks = Facet.define<SuggestionCallbacks, SuggestionCallbacks | null>({
  combine: (values) => (values.length ? values[0] : null),
})

// ---- effects --------------------------------------------------------------

export const setDiffHunks = StateEffect.define<Hunk[]>()
export const removeHunk = StateEffect.define<string>()
export const clearHunks = StateEffect.define<null>()

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

    const mkBtn = (label: string, cls: string, run: (cb: SuggestionCallbacks) => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = cls
      b.textContent = label
      b.setAttribute('aria-label', cls === 'cm-sug-accept' ? 'Accept change' : 'Reject change')
      b.onmousedown = (ev) => {
        ev.preventDefault() // keep editor selection/focus
        const cb = view.state.facet(suggestionCallbacks)
        if (cb) run(cb)
      }
      return b
    }

    wrap.appendChild(mkBtn('✓', 'cm-sug-accept', (cb) => cb.accept(this.hunkId, view)))
    wrap.appendChild(mkBtn('✗', 'cm-sug-reject', (cb) => cb.reject(this.hunkId, view)))
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

// ---- styling --------------------------------------------------------------

const suggestionTheme = EditorView.baseTheme({
  '.cm-sug-del': {
    backgroundColor: 'rgba(243, 139, 168, 0.18)',
    textDecoration: 'line-through',
    textDecorationColor: '#f38ba8',
    opacity: '0.7',
  },
  '.cm-sug-ins': {
    backgroundColor: 'rgba(166, 227, 161, 0.20)',
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
    border: '1px solid var(--border-default, #45475a)',
    borderRadius: '4px',
    background: 'var(--bg-panel, #313244)',
    fontSize: '11px',
    lineHeight: '1',
    padding: '1px 5px',
  },
  '.cm-sug-accept': { color: '#a6e3a1' },
  '.cm-sug-reject': { color: '#f38ba8' },
})

/** The full extension to add to an editor. */
export function suggestionExtension(): Extension {
  return [suggestionField, suggestionTheme]
}
