import { Bold, Italic, Strikethrough, Code, Heading, Link, MessageSquarePlus } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { toggleInline, cycleHeading } from '../lib/cm/markdownFormat'

interface Props {
  /** The active editor, or null when none is focused. */
  view: EditorView | null
  /** Open the link-URL input (owned by the parent toolbar). The parent owns
   *  focus management for this path — unlike the inline commands, FormatRow
   *  does not refocus the editor here. */
  onLink: () => void
  /** Create a user-authored annotation on the selection. */
  onAddNote: () => void
}

/** Row 2 of the FloatingToolbar: non-AI actions (no model call). */
export function FormatRow({ view, onLink, onAddNote }: Props) {
  const run = (cmd: (v: EditorView) => boolean) => {
    if (!view) return
    cmd(view)
    view.focus()
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Bold"
        title="Bold (⌘B)"
        onClick={() => run((v) => toggleInline(v, '**'))}
        className="btn-icon"
      >
        <Bold aria-hidden className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="Italic"
        title="Italic (⌘I)"
        onClick={() => run((v) => toggleInline(v, '*'))}
        className="btn-icon"
      >
        <Italic aria-hidden className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="Strikethrough"
        title="Strikethrough"
        onClick={() => run((v) => toggleInline(v, '~~'))}
        className="btn-icon"
      >
        <Strikethrough aria-hidden className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="Inline code"
        title="Inline code"
        onClick={() => run((v) => toggleInline(v, '`'))}
        className="btn-icon"
      >
        <Code aria-hidden className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-border-default mx-1" />
      <button
        type="button"
        aria-label="Heading"
        title="Heading"
        onClick={() => run(cycleHeading)}
        className="btn-icon"
      >
        <Heading aria-hidden className="w-4 h-4" />
      </button>
      {/* onLink (not run()) — the parent opens a URL input and owns focus,
          so we deliberately do not refocus the editor here. */}
      <button
        type="button"
        aria-label="Link"
        title="Link (⌘K)"
        onClick={onLink}
        className="btn-icon"
      >
        <Link aria-hidden className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-border-default mx-1" />
      <button
        type="button"
        data-testid="floating-toolbar-add-note"
        aria-label="Add note"
        title="Add note"
        onClick={onAddNote}
        className="btn-icon flex items-center gap-1 px-1.5 w-auto"
      >
        <MessageSquarePlus aria-hidden className="w-4 h-4" />
        <span className="text-xs">Note</span>
      </button>
    </div>
  )
}
