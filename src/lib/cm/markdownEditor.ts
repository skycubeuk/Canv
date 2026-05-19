import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, indentUnit } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { searchKeymap } from '@codemirror/search'

/**
 * Shared compartment instance for the language extension.
 * Exported so callers can dispatch a reconfigure after an async language load
 * (e.g. from a workspace extension).
 *
 * One compartment is enough because only one EditorView is active per Canvas
 * mount; when Canvas unmounts it destroys the view and recreates it, which
 * always seeds a fresh compartment slot from the same singleton.
 */
export const languageCompartment = new Compartment()

export interface ActiveEditorUpdateInfo {
  rel: string | null
  text: string
  selection: { from: number; to: number; text: string }
  docChanged: boolean
}

export interface MarkdownEditorOptions {
  initialDoc: string
  onDocChange: (doc: string) => void
  /** Optional: called whenever the selection moves (any change). */
  onSelectionChange?: (view: EditorView) => void
  /** Optional: called when focus state changes. */
  onFocusChange?: (focused: boolean) => void
  /** When true, adds line numbers to the gutter. Default: false. */
  showLineNumbers?: boolean
  /**
   * When set, called on every doc/selection change for the active editor only.
   * The caller is responsible for only passing this when `isActive` is true —
   * it is wired through Canvas via the onActiveEditorUpdate prop.
   */
  onActiveEditorUpdate?: (info: ActiveEditorUpdateInfo) => void
  /** Rel path of the current file — forwarded verbatim in ActiveEditorUpdateInfo. */
  activeRel?: string | null
}

/**
 * Build the standard extension list for a markdown source editor.
 * Pure — does not mount or own the EditorView.
 */
export function markdownEditorExtensions(opts: MarkdownEditorOptions): Extension[] {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      opts.onDocChange(update.state.doc.toString())
    }
    if (update.selectionSet && opts.onSelectionChange) {
      opts.onSelectionChange(update.view)
    }
    if (update.focusChanged && opts.onFocusChange) {
      opts.onFocusChange(update.view.hasFocus)
    }
    if (opts.onActiveEditorUpdate && (update.docChanged || update.selectionSet)) {
      const sel = update.state.selection.main
      opts.onActiveEditorUpdate({
        rel: opts.activeRel ?? null,
        text: update.state.doc.toString(),
        selection: { from: sel.from, to: sel.to, text: update.state.sliceDoc(sel.from, sel.to) },
        docChanged: update.docChanged,
      })
    }
  })

  return [
    history(),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    languageCompartment.of(markdown({ codeLanguages: languages })),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    indentUnit.of('  '),
    EditorState.allowMultipleSelections.of(true),
    ...(opts.showLineNumbers ? [lineNumbers()] : []),
    updateListener,
  ]
}

/**
 * Construct a fresh EditorState seeded with `doc`, using the standard
 * markdown extensions plus any caller-provided extras (e.g. theme).
 */
export function makeMarkdownState(opts: MarkdownEditorOptions, extras: Extension[] = []): EditorState {
  return EditorState.create({
    doc: opts.initialDoc,
    extensions: [...markdownEditorExtensions(opts), ...extras],
  })
}
