import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, ChevronDown, ArrowLeft } from 'lucide-react'
import type { Action, Mode } from '../config/types'

interface Props {
  profile: Mode
  hasMarkdownTab: boolean
  onRunAgent: (agent: Action, instruction?: string) => void
}

type MenuState =
  | { kind: 'closed' }
  | { kind: 'list' }
  | { kind: 'instruction'; agent: Action }

export function DocumentAgentMenu({ profile, hasMarkdownTab, onRunAgent }: Props) {
  const [state, setState] = useState<MenuState>({ kind: 'closed' })
  const [instructionText, setInstructionText] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  const documentAgents = useMemo(() => {
    return profile.actions.filter(
      (a) => a.inputMode === 'document' || a.inputMode === 'selection-or-document',
    )
  }, [profile])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset popover when active profile rotates so a stale agent list isn't shown
    setState({ kind: 'closed' })
    setInstructionText('')
  }, [profile.id])

  useEffect(() => {
    if (state.kind === 'closed') return
    const onDocMouseDown = (e: MouseEvent) => {
      const root = containerRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setState({ kind: 'closed' })
      setInstructionText('')
    }
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (state.kind === 'instruction') {
        e.preventDefault()
        setState({ kind: 'list' })
        setInstructionText('')
      } else if (state.kind === 'list') {
        e.preventDefault()
        setState({ kind: 'closed' })
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [state.kind])

  if (documentAgents.length === 0) return null

  const triggerDisabled = !hasMarkdownTab

  const handleTriggerClick = () => {
    if (triggerDisabled) return
    setState((s) => (s.kind === 'closed' ? { kind: 'list' } : { kind: 'closed' }))
  }

  const handleAgentClick = (agent: Action) => {
    if (agent.needsInstruction) {
      setInstructionText('')
      setState({ kind: 'instruction', agent })
      return
    }
    onRunAgent(agent, undefined)
    setState({ kind: 'closed' })
  }

  const handleInstructionSubmit = () => {
    if (state.kind !== 'instruction') return
    const trimmed = instructionText.trim()
    if (!trimmed) return
    onRunAgent(state.agent, trimmed)
    setState({ kind: 'closed' })
    setInstructionText('')
  }

  const handleInstructionKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInstructionSubmit()
    }
    // Escape is handled by the document-level listener so it works when the
    // input doesn't have focus too (defence-in-depth).
  }

  return (
    <div ref={containerRef} className="relative shrink-0 flex items-stretch">
      <button
        type="button"
        data-testid="document-agent-menu-trigger"
        onClick={handleTriggerClick}
        disabled={triggerDisabled}
        title={triggerDisabled ? 'Open a document to run agents' : 'Run on document'}
        aria-haspopup="menu"
        aria-expanded={state.kind !== 'closed'}
        className="inline-flex items-center gap-1 px-3 text-xs text-muted hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed border-l border-default"
      >
        <Play aria-hidden className="w-3 h-3" />
        <span className="hidden sm:inline">Run on document</span>
        <ChevronDown aria-hidden className="w-3 h-3" />
      </button>

      {state.kind === 'list' && (
        <div
          role="menu"
          data-testid="document-agent-menu"
          tabIndex={-1}
          className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-md border border-default bg-elev shadow-md py-1"
        >
          {documentAgents.map((agent) => (
            <button
              key={agent.id}
              role="menuitem"
              type="button"
              onClick={() => handleAgentClick(agent)}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-hover"
            >
              <agent.icon aria-hidden className="w-4 h-4" />
              <span>{agent.label}</span>
            </button>
          ))}
        </div>
      )}

      {state.kind === 'instruction' && (
        <div
          role="menu"
          tabIndex={-1}
          className="absolute right-0 top-full mt-1 z-30 min-w-[260px] rounded-md border border-default bg-elev shadow-md p-2 flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => { setState({ kind: 'list' }); setInstructionText('') }}
            className="text-xs text-muted hover:text-default"
            aria-label="Back to agent list"
          >
            <ArrowLeft aria-hidden className="w-3 h-3" />
          </button>
          <state.agent.icon aria-hidden className="w-4 h-4" />
          <input
            autoFocus
            value={instructionText}
            onChange={(e) => setInstructionText(e.target.value)}
            onKeyDown={handleInstructionKey}
            placeholder={state.agent.instructionPlaceholder ?? 'Instruction'}
            className="flex-1 px-1 py-0.5 text-xs bg-transparent focus:outline-none min-w-[160px]"
          />
          <button
            type="button"
            onClick={handleInstructionSubmit}
            disabled={!instructionText.trim()}
            className="btn-primary !py-0.5 !px-2 text-xs disabled:opacity-50"
          >
            Run
          </button>
        </div>
      )}
    </div>
  )
}
