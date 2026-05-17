import { useState } from 'react'

export interface ProfileOption { id: string; label: string }

export interface WorkspaceSetupResult {
  defaultProfile: string
  enableRA: boolean
}

export interface WorkspaceSetupModalProps {
  modes: ProfileOption[]
  defaultProfile: string
  remote: boolean
  onConfirm: (r: WorkspaceSetupResult) => void
  onCancel: () => void
}

export function WorkspaceSetupModal(p: WorkspaceSetupModalProps) {
  const [profile, setProfile] = useState(p.defaultProfile)
  const [enableRA, setEnableRA] = useState(!p.remote)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) p.onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="canv-setup-title"
        className="w-full max-w-md rounded-lg border border-default bg-elev shadow-lg p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="canv-setup-title" className="text-sm font-medium text-default mb-4">
          Set up workspace
        </h2>

        <fieldset className="mb-4">
          <legend className="text-[10.5px] font-semibold tracking-wider uppercase text-subtle mb-2">
            Default profile
          </legend>
          <div className="space-y-0.5">
            {p.modes.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 text-sm text-default px-2 py-1 rounded-sm hover:bg-hover cursor-pointer"
              >
                <input
                  type="radio"
                  name="canv-default-profile"
                  value={m.id}
                  checked={profile === m.id}
                  onChange={() => setProfile(m.id)}
                  className="accent-[rgb(var(--accent))]"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-1">
          <label className="flex items-center gap-2 text-sm text-default px-2 py-1 rounded-sm hover:bg-hover cursor-pointer">
            <input
              type="checkbox"
              checked={enableRA}
              disabled={p.remote}
              onChange={(e) => setEnableRA(e.target.checked)}
              className="accent-[rgb(var(--accent))] disabled:opacity-50"
            />
            Enable Revision Archaeology
          </label>
          {p.remote && (
            <p className="text-xs text-subtle mt-1 px-2">
              Remote workspaces are not yet supported.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={p.onCancel}
            className="px-3 py-1 text-xs rounded-sm border border-default text-default hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => p.onConfirm({ defaultProfile: profile, enableRA })}
            className="btn-primary py-1! px-3! text-xs"
          >
            Set up workspace
          </button>
        </div>
      </div>
    </div>
  )
}
