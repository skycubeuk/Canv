import type { EditorView } from '@codemirror/view'
import { annotationField, findAnnotation } from '../lib/cm/suggestionLayer'
import { resolveUniqueQuote } from '../lib/suggestions/quoteResolve'
import type { AnnotationsCapability, AnnotationView } from './types'

/** The slice of the suggestions service the annotation tools need. */
export interface SuggestionsForTools {
  addAnnotation: (range: { from: number; to: number }, note: string, author: string, suggestedReplacement?: string, quote?: string) => string
  updateAnnotation: (id: string, patch: { note?: string; suggestedReplacement?: string }) => void
  dismissAnnotation: (id: string) => void
}

interface Deps {
  getActiveEditor: () => EditorView | null
  getActiveDocPath: () => string | null
  getSuggestions: () => SuggestionsForTools | null
}

const ASSISTANT_AUTHOR = 'Assistant'

export function createAnnotationsCapability(deps: Deps): AnnotationsCapability {
  /** Resolve the active view for `path`, or throw a model-readable error. */
  const requireActive = (path: string): EditorView => {
    const active = deps.getActiveDocPath()
    if (active === null) throw new Error('no document is open')
    if (path !== active) {
      throw new Error(`annotations can only be edited on the open document (${active}); open ${path} first`)
    }
    const view = deps.getActiveEditor()
    if (!view) throw new Error('editor is not ready')
    return view
  }

  const requireSuggestions = (): SuggestionsForTools => {
    const s = deps.getSuggestions()
    if (!s) throw new Error('suggestions service is not ready')
    return s
  }

  return {
    list: (path) => {
      if (path !== deps.getActiveDocPath()) return null
      const view = deps.getActiveEditor()
      if (!view) return null
      return view.state.field(annotationField)
        .filter((a) => a.status === 'open')
        .map((a): AnnotationView => ({
          id: a.id,
          quote: a.from < a.to ? view.state.sliceDoc(a.from, a.to) : (a.quote ?? ''),
          note: a.note,
          author: a.author,
          status: a.status,
          ...(a.suggestedReplacement !== undefined ? { suggestedReplacement: a.suggestedReplacement } : {}),
        }))
    },

    add: (path, { quote, note, suggestedReplacement }) => {
      const view = requireActive(path)
      const range = resolveUniqueQuote(view.state.doc.toString(), quote)
      const id = requireSuggestions().addAnnotation(range, note, ASSISTANT_AUTHOR, suggestedReplacement, quote)
      return { id }
    },

    update: (path, { id, note, suggestedReplacement }) => {
      const view = requireActive(path)
      if (!findAnnotation(view, id)) throw new Error(`no annotation with id ${id} on ${path}`)
      requireSuggestions().updateAnnotation(id, { note, suggestedReplacement })
    },

    remove: (path, id) => {
      const view = requireActive(path)
      if (!findAnnotation(view, id)) throw new Error(`no annotation with id ${id} on ${path}`)
      requireSuggestions().dismissAnnotation(id)
    },
  }
}
