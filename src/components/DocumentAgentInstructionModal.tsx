import { useEffect, useState } from 'react'
import type { Action } from '../config/types'

interface Props {
  agent: Action
  canRun: boolean
  onSubmit: (instruction: string) => void
  onCancel: () => void
}

export function DocumentAgentInstructionModal({ agent, canRun, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const trimmed = text.trim()
  const runEnabled = canRun && !!trimmed

  const submit = () => {
    if (!runEnabled) return
    onSubmit(trimmed)
  }

  return (
    <div
      data-testid="agent-modal-backdrop"
      onMouseDown={(e) => {
        // Only treat clicks on the backdrop itself as cancel; clicks inside the card stop here.
        if (e.target === e.currentTarget) onCancel()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-label={`Run ${agent.label} on document`}
        className="w-full max-w-md rounded-lg border border-default bg-elev shadow-lg p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <agent.icon aria-hidden className="w-4 h-4" />
          <h2 className="text-sm font-medium text-default">
            Run {agent.label} on document
          </h2>
        </div>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={agent.instructionPlaceholder ?? 'Instruction'}
          className="w-full px-2 py-1.5 text-sm rounded-sm border border-default bg-transparent focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs rounded-sm border border-default hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!runEnabled}
            className="btn-primary py-1! px-3! text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
