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
      role="dialog"
      aria-modal="true"
      aria-labelledby="canv-setup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-[420px] shadow-xl">
        <h2 id="canv-setup-title" className="text-lg font-semibold mb-4">
          Set up workspace
        </h2>

        <fieldset className="mb-4">
          <legend className="text-sm font-medium mb-2">Default profile</legend>
          <div className="space-y-1">
            {p.modes.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="canv-default-profile"
                  value={m.id}
                  checked={profile === m.id}
                  onChange={() => setProfile(m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enableRA}
              disabled={p.remote}
              onChange={(e) => setEnableRA(e.target.checked)}
            />
            Enable Revision Archaeology
          </label>
          {p.remote && (
            <p className="text-xs text-zinc-500 mt-1">Remote workspaces are not yet supported.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="px-3 py-1.5 text-sm rounded border" onClick={p.onCancel}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
            onClick={() => p.onConfirm({ defaultProfile: profile, enableRA })}
          >
            Set up workspace
          </button>
        </div>
      </div>
    </div>
  )
}
