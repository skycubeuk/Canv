import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface PromptOpts {
  title: string
  message?: string
  initialValue?: string
  placeholder?: string
  submitLabel?: string
  cancelLabel?: string
  validate?: (value: string) => string | null
}

export interface ConfirmOpts {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface DialogContextValue {
  prompt: (opts: PromptOpts) => Promise<string | null>
  confirm: (opts: ConfirmOpts) => Promise<boolean>
}

const DialogContext = createContext<DialogContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components -- co-locating the hook with the provider keeps dialog usage in one import; HMR cost is negligible for this leaf module.
export function useDialogs(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>')
  return ctx
}

interface PromptState {
  opts: PromptOpts
  resolve: (value: string | null) => void
}

interface ConfirmState {
  opts: ConfirmOpts
  resolve: (value: boolean) => void
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setPromptState({ opts, resolve })
      }),
    [],
  )

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ opts, resolve })
      }),
    [],
  )

  const closePrompt = (value: string | null) => {
    promptState?.resolve(value)
    setPromptState(null)
  }
  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value)
    setConfirmState(null)
  }

  return (
    <DialogContext.Provider value={{ prompt, confirm }}>
      {children}
      {promptState && (
        <PromptDialog
          key={`prompt-${promptState.opts.title}`}
          opts={promptState.opts}
          onSubmit={(value) => closePrompt(value)}
          onCancel={() => closePrompt(null)}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          key={`confirm-${confirmState.opts.message}`}
          opts={confirmState.opts}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
      )}
    </DialogContext.Provider>
  )
}

function PromptDialog({
  opts,
  onSubmit,
  onCancel,
}: {
  opts: PromptOpts
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(opts.initialValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const error = opts.validate ? opts.validate(value) : null
  const canSubmit = !error

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

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const submit = () => {
    if (!canSubmit) return
    onSubmit(value)
  }

  return (
    <div
      data-testid="prompt-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-label={opts.title}
        className="w-full max-w-md rounded-lg border border-default bg-elev shadow-lg p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-default mb-2">
          {opts.title}
        </h2>
        {opts.message && (
          <p className="text-xs text-muted mb-3">{opts.message}</p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={opts.placeholder}
          className="w-full px-3 py-2 text-sm rounded-md border border-default bg-elev text-default focus:outline-hidden focus:ring-2 focus:ring-accent"
        />
        {error && (
          <p className="mt-2 text-xs text-danger-fg">{error}</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className="btn-primary text-sm disabled:opacity-50"
            onClick={submit}
            disabled={!canSubmit}
          >
            {opts.submitLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOpts
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  const confirmClassName = opts.danger
    ? 'btn-danger text-sm focus:ring-danger'
    : 'btn-primary text-sm'

  return (
    <div
      data-testid="confirm-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-label={opts.title ?? 'Confirm'}
        className="w-full max-w-md rounded-lg border border-default bg-elev shadow-lg p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {opts.title && (
          <h2 className="text-sm font-medium text-default mb-2">
            {opts.title}
          </h2>
        )}
        <p className="text-sm text-default">{opts.message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={confirmClassName}
            onClick={onConfirm}
          >
            {opts.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
