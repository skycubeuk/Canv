import { useEffect, useState, useCallback, useRef } from 'react'
import type React from 'react'

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
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => { if (e.key === 'Escape') resolve(null) }}
      style={overlayStyle}
      tabIndex={-1}
    >
      <div ref={containerRef} style={modalStyle}>
        <div style={{ fontSize: 11, color: 'var(--text-color-subtle)', marginBottom: 8 }}>
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
        style={inputStyle}
      />
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, maxHeight: 320, overflowY: 'auto' }}>
        {filtered.map((it, i) => (
          <li
            key={`${it.label}-${i}`}
            onClick={() => onChoose(it.value)}
            onMouseEnter={() => setHighlight(i)}
            style={{
              padding: '6px 10px', cursor: 'pointer',
              background: i === highlight ? 'rgb(99 102 241 / 25%)' : 'transparent',
              borderRadius: 4, fontSize: 13,
            }}
          >
            <div>{it.label}</div>
            {it.description && <div style={{ fontSize: 11, color: 'var(--text-color-subtle)' }}>{it.description}</div>}
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
      <div style={{ marginBottom: 8 }}>{req.prompt}</div>
      <input
        type="text"
        placeholder={req.placeholder}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm() }}
        style={inputStyle}
      />
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={secondaryBtn}>Cancel</button>
        <button type="button" onClick={onConfirm} style={primaryBtn}>OK</button>
      </div>
    </>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: 100,
}
const modalStyle: React.CSSProperties = {
  background: 'var(--color-panel)', border: '1px solid var(--border-color-default)',
  borderRadius: 8, padding: 16, minWidth: 420, maxWidth: 600,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-app, var(--color-panel))', color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)', borderRadius: 4,
  padding: '6px 10px', font: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  background: 'rgb(99 102 241)', color: 'white', border: 'none',
  borderRadius: 4, padding: '6px 12px', cursor: 'pointer', font: 'inherit', fontSize: 12,
}
const secondaryBtn: React.CSSProperties = {
  background: 'var(--color-elev)', color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)', borderRadius: 4,
  padding: '6px 12px', cursor: 'pointer', font: 'inherit', fontSize: 12,
}
