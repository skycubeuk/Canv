import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Strikethrough, Code, Heading, Link, MessageSquarePlus, Volume2, ChevronDown } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { toggleInline, cycleHeading } from '../lib/cm/markdownFormat'
import { getTts, isTtsAvailable } from '../lib/tts'

interface Props {
  /** The active editor, or null when none is focused. */
  view: EditorView | null
  /** Open the link-URL input (owned by the parent toolbar). The parent owns
   *  focus management for this path — unlike the inline commands, FormatRow
   *  does not refocus the editor here. */
  onLink: () => void
  /** Create a user-authored annotation on the selection. */
  onAddNote: () => void
  /**
   * Read the selection aloud. Primary click passes undefined (use the default
   * voice); the voice-override popover passes {voiceId, voiceName}.
   *
   * NOTE: this triggers an ElevenLabs TTS call — a paid API request — not a
   * text-transform agent. The parent (FloatingToolbar) is responsible for
   * wiring this to recordings.readAloud(...).
   */
  onReadAloud: (voice?: { voiceId: string; voiceName: string }) => void
  /** TTS provider string (e.g. 'elevenlabs') — passed from FloatingToolbar so
   *  FormatRow needs no service access at render time. */
  ttsProvider?: string
  /** TTS API key — used to load the voice list when the chevron popover opens. */
  ttsApiKey?: string
}

interface VoiceOption { voiceId: string; name: string }

/** Row 2 of the FloatingToolbar: non-AI actions (no model call). */
export function FormatRow({ view, onLink, onAddNote, onReadAloud, ttsProvider, ttsApiKey }: Props) {
  const run = (cmd: (v: EditorView) => boolean) => {
    if (!view) return
    cmd(view)
    view.focus()
  }

  const [voicePopoverOpen, setVoicePopoverOpen] = useState(false)
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [loadingVoices, setLoadingVoices] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  // Cache the fetched voice list so re-opening the popover doesn't re-hit the API.
  const voicesLoadedRef = useRef(false)

  const openVoicePopover = async () => {
    const willOpen = !voicePopoverOpen
    setVoicePopoverOpen(willOpen)
    if (willOpen && !voicesLoadedRef.current && isTtsAvailable() && ttsProvider && ttsApiKey) {
      setLoadingVoices(true)
      try {
        const list = await getTts().voices(ttsProvider as import('../lib/tts').TtsProvider, ttsApiKey)
        setVoices(list)
        voicesLoadedRef.current = true
      } catch {
        setVoices([])
      } finally {
        setLoadingVoices(false)
      }
    }
  }

  const selectVoice = (voice: VoiceOption) => {
    setVoicePopoverOpen(false)
    onReadAloud({ voiceId: voice.voiceId, voiceName: voice.name })
  }

  // Dismiss the voice popover on an outside click (mirrors DocumentAgentMenu).
  useEffect(() => {
    if (!voicePopoverOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const root = popoverRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setVoicePopoverOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [voicePopoverOpen])

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
      <div className="w-px h-5 bg-border-default mx-1" />
      {/* Read aloud — primary click uses default voice; chevron opens voice override */}
      <button
        type="button"
        aria-label="Read aloud"
        title="Read aloud"
        onClick={() => onReadAloud(undefined)}
        className="btn-icon"
      >
        <Volume2 aria-hidden className="w-4 h-4" />
      </button>
      <div ref={popoverRef} className="relative">
        <button
          type="button"
          aria-label="Choose voice"
          title="Choose voice"
          onClick={() => { void openVoicePopover() }}
          className={`btn-icon ${voicePopoverOpen ? 'bg-active' : ''}`}
        >
          <ChevronDown aria-hidden className="w-3 h-3" />
        </button>
        {voicePopoverOpen && (
          <div className="absolute right-0 top-full mt-1 bg-elev border border-default rounded-lg shadow-lg p-1 min-w-[180px] z-10">
            {loadingVoices ? (
              <p className="px-2 py-1.5 text-xs text-muted">Loading voices…</p>
            ) : voices.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted">No voices available</p>
            ) : (
              voices.map((v) => (
                <button
                  key={v.voiceId}
                  type="button"
                  onClick={() => selectVoice(v)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-hover text-default text-left"
                >
                  {v.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
