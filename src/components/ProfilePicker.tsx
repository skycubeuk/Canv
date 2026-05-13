import { useModes } from '../hooks/useModes'

interface Props {
  open: boolean
  mode: 'first-launch' | 'new'
  onPick: (profileId: string) => void
  onCancel?: () => void
}

export function ProfilePicker({ open, mode, onPick, onCancel }: Props) {
  const { modes } = useModes()

  if (!open) return null

  const heading = mode === 'first-launch' ? 'Welcome to Canv' : 'Start a new document'
  const subheading =
    mode === 'first-launch'
      ? 'What kind of writing is this? You can choose a different one when you start your next document.'
      : 'What kind of writing is this? The toolbar and editing prompts will adapt to your choice.'

  return (
    <div data-testid="profile-picker" className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
      <div className="w-[680px] max-w-[95vw] bg-elev rounded-xl shadow-2xl border border-default">
        <div className="px-6 pt-6 pb-3">
          <h2 className="text-xl font-semibold">{heading}</h2>
          <p className="text-sm text-muted mt-1">{subheading}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 pb-6">
          {modes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className="text-left p-4 rounded-lg border border-default hover:border-strong hover:bg-hover transition-colors flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <p.icon aria-hidden className="w-7 h-7" />
                <span className="font-medium text-base">{p.label}</span>
              </div>
              <p className="text-xs text-muted leading-snug">{p.description}</p>
              <p className="text-[11px] text-subtle mt-auto">{p.examples}</p>
            </button>
          ))}
        </div>

        {mode === 'new' && onCancel && (
          <div className="px-6 pb-4 flex justify-end">
            <button type="button" onClick={onCancel} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
