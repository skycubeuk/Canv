import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Zap, Link } from 'lucide-react'
import type { Action } from '../config/types'
import { useContextMenu } from '../lib/contextMenu'
import { useService } from '../services/useService'
import { FormatRow } from './FormatRow'
import { insertLink } from '../lib/cm/markdownFormat'
import { placeToolbarTop } from '../lib/floatingToolbarPlacement'

interface Props {
  onAgent: (agent: Action, range: { from: number; to: number }, text: string, instruction?: string) => void
  /** Non-AI tools row: create a user-authored annotation on the selection. */
  onAddNote: (range: { from: number; to: number }, text: string) => void
}

interface Pos {
  /** Viewport-relative top/bottom of the selected line(s); placement is derived in a layout effect. */
  selTop: number
  selBottom: number
  left: number
}

type Mode = { kind: 'idle' } | { kind: 'presets' } | { kind: 'instruction'; agent: Action } | { kind: 'link' }

/** Delay before the toolbar appears after a selection settles — kills mid-drag flicker
 * and gives double-click a tidy pause instead of popping instantly. */
const SHOW_DELAY_MS = 200

export function FloatingToolbar(props: Props) {
  const { onAgent, onAddNote } = props
  const editorRegistry = useService('editorRegistry')
  const view = editorRegistry.getActiveEditor()
  const modesSvc = useService('modes')
  const activeProfileId = modesSvc.profile ?? modesSvc.defaultModeId
  const profile =
    modesSvc.modes.find((m) => m.id === activeProfileId) ??
    modesSvc.modes.find((m) => m.id === modesSvc.defaultModeId)!
  const [pos, setPos] = useState<Pos | null>(null)
  const [selection, setSelection] = useState<{ from: number; to: number; text: string } | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [instructionText, setInstructionText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [presetsAbove, setPresetsAbove] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const presetsRef = useRef<HTMLDivElement>(null)
  const pointerDownRef = useRef(false)
  const showTimerRef = useRef<number | null>(null)

  const { isOpen: ctxOpen } = useContextMenu()

  // eslint-disable-next-line react-hooks/set-state-in-effect -- dismiss toolbar when context menu opens; all three setters are intentional responses to the external ctxOpen signal
  useEffect(() => { if (ctxOpen) { setPos(null); setSelection(null); setMode({ kind: 'idle' }) } }, [ctxOpen])

  const { core, presets } = useMemo(() => {
    const visible = profile.actions.filter((a) => a.inputMode !== 'document')
    return {
      core: visible.filter((a) => a.group === 'core'),
      presets: visible.filter((a) => a.group === 'presets'),
    }
  }, [profile])

  const recompute = useCallback(() => {
    if (!view) {
      setPos(null); setSelection(null); setMode({ kind: 'idle' })
      return
    }
    const sel = view.state.selection.main
    if (sel.empty) {
      setPos(null); setSelection(null); setMode({ kind: 'idle' })
      return
    }
    const text = view.state.sliceDoc(sel.from, sel.to)
    if (!text.trim()) {
      setPos(null); setSelection(null)
      return
    }
    const startCoords = view.coordsAtPos(sel.from)
    const endCoords = view.coordsAtPos(sel.to)
    if (!startCoords || !endCoords) { setPos(null); return }
    const selTop = Math.min(startCoords.top, endCoords.top)
    const selBottom = Math.max(startCoords.bottom, endCoords.bottom)
    const left = (startCoords.left + endCoords.right) / 2
    setPos({ selTop, selBottom, left })
    setSelection({ from: sel.from, to: sel.to, text })
  }, [view])

  // Hide without churning renders: setPos/setSelection bail on null; setMode bails when
  // already idle. Lets us call hide() every rAF frame during a drag without re-rendering.
  const hide = useCallback(() => {
    setPos(null)
    setSelection(null)
    setMode((m) => (m.kind === 'idle' ? m : { kind: 'idle' }))
  }, [])

  // Debounced show — the "tidy delay". Resets on each call so rapid selection changes
  // (drag, shift+arrow) only resolve once the selection settles.
  const requestShow = useCallback(() => {
    if (showTimerRef.current !== null) clearTimeout(showTimerRef.current)
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null
      recompute()
    }, SHOW_DELAY_MS)
  }, [recompute])

  // Self-subscribe to selection changes via a rAF poll on the view's selection
  // range. Previously the parent (App.tsx) held a `selectionTick` useState that
  // bumped on every CM selection event and re-rendered the entire 782-LOC App
  // tree just so the toolbar could see the new selection. Polling locally
  // keeps the render contained to this component.
  useEffect(() => {
    if (!view) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear toolbar state when the active editor goes away
      hide()
      return
    }
    let raf = 0
    let lastKey = `${view.state.selection.main.from}-${view.state.selection.main.to}-${view.state.doc.length}`
    // On mount/editor-swap there's no in-flight drag, so reflect any existing selection now.
    recompute()
    const tick = () => {
      const key = `${view.state.selection.main.from}-${view.state.selection.main.to}-${view.state.doc.length}`
      if (key !== lastKey) {
        lastKey = key
        const sel = view.state.selection.main
        const hasText = !sel.empty && view.state.sliceDoc(sel.from, sel.to).trim().length > 0
        // While the mouse is held (drag-selecting) keep it hidden — the toolbar would
        // otherwise pop up over the text and chase the cursor. mouseup shows it.
        if (pointerDownRef.current || !hasText) hide()
        else requestShow() // keyboard / programmatic selection: debounced show
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      if (showTimerRef.current !== null) { clearTimeout(showTimerRef.current); showTimerRef.current = null }
    }
  }, [view, recompute, requestShow, hide])

  // Gate showing on pointer state: hide while dragging, reveal (after the tidy delay) on
  // release. mouseup is on window so a drag that ends outside the editor still resolves.
  useEffect(() => {
    if (!view) return
    const editorEl = view.dom
    const onDown = () => {
      pointerDownRef.current = true
      if (showTimerRef.current !== null) { clearTimeout(showTimerRef.current); showTimerRef.current = null }
      hide()
    }
    const onUp = () => {
      if (!pointerDownRef.current) return
      pointerDownRef.current = false
      const sel = view.state.selection.main
      const hasText = !sel.empty && view.state.sliceDoc(sel.from, sel.to).trim().length > 0
      if (hasText) requestShow()
      else hide()
    }
    editorEl.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      editorEl.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [view, requestShow, hide])

  // Layout-only events (window resize, scroll) — same as before.
  useEffect(() => {
    const onLayout = () => recompute()
    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, { capture: true, passive: true } as AddEventListenerOptions)
    return () => {
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, { capture: true } as EventListenerOptions)
    }
  }, [recompute])

  // Drop the toolbar when focus leaves the editor and the toolbar.
  useEffect(() => {
    if (!view) return
    const editorEl = view.dom
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget
      if (next instanceof Node && (ref.current?.contains(next) || editorEl.contains(next))) return
      setPos(null); setSelection(null); setMode({ kind: 'idle' })
    }
    editorEl.addEventListener('focusout', onFocusOut)
    return () => editorEl.removeEventListener('focusout', onFocusOut)
  }, [view])

  // Clamp the toolbar to the viewport. The base transform centers it on `left`,
  // so when selecting near an edge the half away from the cursor would drift
  // off-screen. We measure the rendered rect and apply an extra horizontal
  // shift to keep both edges inside the viewport.
  useLayoutEffect(() => {
    if (!ref.current || !pos) return
    const el = ref.current
    const margin = 8
    // Vertical: anchor by the measured toolbar height so a multi-row toolbar clears the
    // selection instead of sitting on top of it; flip below when there's no room above.
    el.style.top = `${placeToolbarTop({
      selTop: pos.selTop,
      selBottom: pos.selBottom,
      toolbarHeight: el.offsetHeight,
      viewportHeight: window.innerHeight,
    })}px`
    el.style.transform = 'translateX(-50%)'
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    let shift = 0
    if (rect.left < margin) shift = margin - rect.left
    else if (rect.right > vw - margin) shift = vw - margin - rect.right
    if (shift !== 0) {
      el.style.transform = `translateX(calc(-50% + ${shift}px))`
    }
  }, [pos, mode, instructionText])

  // Flip the presets popover above the toolbar if it would overflow the
  // viewport bottom. Measured against the popover's intrinsic height so the
  // decision is stable across re-renders (no flip-flop).
  useLayoutEffect(() => {
    if (mode.kind !== 'presets' || !ref.current || !presetsRef.current) return
    const toolbarRect = ref.current.getBoundingClientRect()
    const popHeight = presetsRef.current.offsetHeight
    const margin = 8
    const gap = 4
    const wouldOverflow = toolbarRect.bottom + gap + popHeight > window.innerHeight - margin
    setPresetsAbove(wouldOverflow)
  }, [mode])

  if (!pos || !selection) return null

  const fire = (agent: Action, instruction?: string) => {
    onAgent(agent, { from: selection.from, to: selection.to }, selection.text, instruction)
    setMode({ kind: 'idle' })
    setInstructionText('')
    setPos(null)
    setSelection(null)
  }

  const handleClick = (agent: Action) => {
    if (agent.needsInstruction) {
      setMode({ kind: 'instruction', agent })
      setInstructionText('')
      return
    }
    fire(agent)
  }

  const handleInstructionSubmit = () => {
    if (mode.kind !== 'instruction') return
    if (!instructionText.trim()) return
    fire(mode.agent, instructionText.trim())
  }

  const addNote = () => {
    onAddNote({ from: selection.from, to: selection.to }, selection.text)
    setMode({ kind: 'idle' })
    setInstructionText('')
    setPos(null)
    setSelection(null)
  }

  const submitLink = () => {
    if (!view || !selection) return
    insertLink(view, linkUrl.trim())
    view.focus()
    setMode({ kind: 'idle' })
    setLinkUrl('')
    setPos(null)
    setSelection(null)
  }

  return (
    <div
      ref={ref}
      data-testid="floating-toolbar"
      style={{ top: pos.selTop, left: pos.left, transform: 'translateX(-50%)' }}
      className="fixed z-40 bg-elev border border-default rounded-lg shadow-lg p-1"
      onMouseDown={(e) => e.preventDefault()}
    >
      {mode.kind === 'link' ? (
        <div className="flex items-center gap-2 p-1 min-w-[320px]">
          <Link aria-hidden className="w-4 h-4" />
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && linkUrl.trim()) submitLink()
              if (e.key === 'Escape') setMode({ kind: 'idle' })
            }}
            placeholder="https://…"
            className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-hidden"
          />
          <button
            type="button"
            onClick={submitLink}
            disabled={!linkUrl.trim()}
            className="btn-primary btn-sm disabled:opacity-50"
          >
            Add link
          </button>
        </div>
      ) : mode.kind === 'instruction' ? (
        <div className="flex items-center gap-2 p-1 min-w-[320px]">
          <mode.agent.icon aria-hidden className="w-4 h-4" />
          <input
            autoFocus
            value={instructionText}
            onChange={(e) => setInstructionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && instructionText.trim()) handleInstructionSubmit()
              if (e.key === 'Escape') setMode({ kind: 'idle' })
            }}
            placeholder={mode.agent.instructionPlaceholder ?? 'Instruction'}
            className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-hidden"
          />
          <button
            type="button"
            onClick={handleInstructionSubmit}
            disabled={!instructionText.trim()}
            className="btn-primary btn-sm disabled:opacity-50"
          >
            Run
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Row 1 — AI tools */}
          <div className="flex items-center gap-0.5">
            {core.map((agent) => (
              <button
                key={agent.id}
                type="button"
                title={agent.label}
                onClick={() => handleClick(agent)}
                className="btn-icon"
              >
                <agent.icon aria-hidden className="w-4 h-4" />
              </button>
            ))}
            {presets.length > 0 && <div className="w-px h-5 bg-border-default mx-1" />}
            {presets.length > 0 && <div className="relative">
              <button
                type="button"
                title="Quick presets"
                onClick={() => setMode((m) => (m.kind === 'presets' ? { kind: 'idle' } : { kind: 'presets' }))}
                className={`btn-icon ${mode.kind === 'presets' ? 'bg-active' : ''}`}
              >
                <Zap aria-hidden className="w-4 h-4" />
              </button>
              {mode.kind === 'presets' && (
                <div
                  ref={presetsRef}
                  className={`absolute left-1/2 -translate-x-1/2 bg-elev border border-default rounded-lg shadow-lg p-1 min-w-[200px] z-10 ${
                    presetsAbove ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}
                >
                  {presets.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => handleClick(agent)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-hover text-default text-left"
                    >
                      <agent.icon aria-hidden className="w-4 h-4" />
                      <span>{agent.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>}
          </div>

          {/* Divider + Row 2 — non-AI tools (no model call) */}
          <div className="border-t border-default -mx-1" />
          <FormatRow
            view={view}
            onLink={() => { setLinkUrl(''); setMode({ kind: 'link' }) }}
            onAddNote={addNote}
          />
        </div>
      )}
    </div>
  )
}
