import { useEffect, useState, useCallback, useRef } from 'react'

type PromptRequest =
  | { kind: 'quickPick'; extensionId: string; items: { label: string; description?: string; value: unknown }[]; placeholder?: string }
  | { kind: 'input'; extensionId: string; prompt: string; placeholder?: string; defaultValue?: string }

interface Pending {
  reqId: number
  req: PromptRequest
}

export function ExtensionPromptModal() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [inputText, setInputText] = useState('')
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.canvExtensions?.onPromptRequest?.((reqId, req) => {
      setPending({ reqId, req })
      setInputText(req.kind === 'input' ? (req.defaultValue ?? '') : '')
      setHighlight(0)
    })
    return () => { off?.() }
  }, [])

  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => {
      containerRef.current?.querySelector<HTMLElement>('input,button')?.focus()
    }, 10)
    return () => clearTimeout(t)
  }, [pending])

  const resolve = useCallback((value: { value: unknown } | null) => {
    if (!pending) return
    window.canvExtensions?.promptResolve?.(pending.reqId, value)
    setPending(null)
    setInputText('')
    setHighlight(0)
  }, [pending])

  if (!pending) return null

  return (
    <div
      data-testid="extension-prompt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Extension prompt (${pending.req.extensionId})`}
      onKeyDown={(e) => { if (e.key === 'Escape') resolve(null) }}
      className="fixed inset-0 z-[9998] bg-black/50 flex items-start justify-center pt-[100px]"
      tabIndex={-1}
    >
      <div ref={containerRef} className="bg-panel border border-default rounded-lg p-4 shadow-[var(--overlay-shadow)] min-w-[420px] max-w-[600px]">
        <div className="text-[11px] text-subtle mb-2">
          {pending.req.extensionId}
        </div>
        {pending.req.kind === 'quickPick' ? <QuickPick
          req={pending.req}
          inputText={inputText}
          setInputText={setInputText}
          highlight={highlight}
          setHighlight={setHighlight}
          onChoose={(value) => resolve({ value })}
          onCancel={() => resolve(null)}
        /> : <Input
          req={pending.req}
          inputText={inputText}
          setInputText={setInputText}
          onConfirm={() => resolve({ value: inputText })}
          onCancel={() => resolve(null)}
        />}
      </div>
    </div>
  )
}

function QuickPick({ req, inputText, setInputText, highlight, setHighlight, onChoose, onCancel: _onCancel }: {
  req: Extract<PromptRequest, { kind: 'quickPick' }>
  inputText: string
  setInputText: (s: string) => void
  highlight: number
  setHighlight: (h: number) => void
  onChoose: (v: unknown) => void
  onCancel: () => void
}) {
  const filtered = req.items.filter((it) => it.label.toLowerCase().includes(inputText.toLowerCase()))
  return (
    <>
      <input
        type="text"
        placeholder={req.placeholder ?? 'Type to filter…'}
        value={inputText}
        onChange={(e) => { setInputText(e.target.value); setHighlight(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(Math.min(highlight + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(Math.max(highlight - 1, 0)) }
          else if (e.key === 'Enter') {
            const chosen = filtered[highlight]
            if (chosen) onChoose(chosen.value)
          }
        }}
        className="input"
      />
      <ul className="list-none mt-2 p-0 max-h-80 overflow-y-auto">
        {filtered.map((it, i) => (
          <li
            key={`${it.label}-${i}`}
            onClick={() => onChoose(it.value)}
            onMouseEnter={() => setHighlight(i)}
            className={`px-2.5 py-1.5 cursor-pointer rounded-sm text-[13px] ${i === highlight ? 'bg-accent/25' : 'bg-transparent'}`}
          >
            <div>{it.label}</div>
            {it.description && <div className="text-[11px] text-subtle">{it.description}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}

function Input({ req, inputText, setInputText, onConfirm, onCancel }: {
  req: Extract<PromptRequest, { kind: 'input' }>
  inputText: string
  setInputText: (s: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="mb-2">{req.prompt}</div>
      <input
        type="text"
        placeholder={req.placeholder}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm() }}
        className="input"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
        <button type="button" onClick={onConfirm} className="btn-primary btn-sm">OK</button>
      </div>
    </>
  )
}

