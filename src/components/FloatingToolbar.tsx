import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Zap } from 'lucide-react'
import type { Action } from '../config/types'
import { useContextMenu } from '../lib/contextMenu'
import { useService } from '../services/useService'

interface Props {
  onAgent: (agent: Action, range: { from: number; to: number }, text: string, instruction?: string) => void
}

interface Pos {
  top: number
  left: number
}

type Mode = { kind: 'idle' } | { kind: 'presets' } | { kind: 'instruction'; agent: Action }

export function FloatingToolbar(props: Props) {
  const { onAgent } = props
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
  const [presetsAbove, setPresetsAbove] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const presetsRef = useRef<HTMLDivElement>(null)

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
    const top = Math.min(startCoords.top, endCoords.top) - 48
    const left = (startCoords.left + endCoords.right) / 2
    setPos({ top: Math.max(top, 8), left })
    setSelection({ from: sel.from, to: sel.to, text })
  }, [view])

  // Self-subscribe to selection changes via a rAF poll on the view's selection
  // range. Previously the parent (App.tsx) held a `selectionTick` useState that
  // bumped on every CM selection event and re-rendered the entire 782-LOC App
  // tree just so the toolbar could see the new selection. Polling locally
  // keeps the render contained to this component.
  useEffect(() => {
    if (!view) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear toolbar state when the active editor goes away
      recompute()
      return
    }
    let raf = 0
    let lastKey = `${view.state.selection.main.from}-${view.state.selection.main.to}-${view.state.doc.length}`
    recompute()
    const tick = () => {
      const key = `${view.state.selection.main.from}-${view.state.selection.main.to}-${view.state.doc.length}`
      if (key !== lastKey) {
        lastKey = key
        recompute()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [view, recompute])

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

  return (
    <div
      ref={ref}
      data-testid="floating-toolbar"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
      className="fixed z-40 bg-elev border border-default rounded-lg shadow-lg p-1"
      onMouseDown={(e) => e.preventDefault()}
    >
      {mode.kind === 'instruction' ? (
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
      )}
    </div>
  )
}
