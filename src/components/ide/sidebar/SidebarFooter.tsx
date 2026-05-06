import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Settings as SettingsIcon, ChevronDown } from 'lucide-react'
import type { Settings, Provider } from '../../../hooks/useSettings'
import { adapterList, getAdapter } from '../../../adapters'

interface Props {
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
  chatOpen: boolean
  onToggleChat: () => void
  onOpenSettings: () => void
}

export function SidebarFooter({ settings, onUpdateSettings, chatOpen, onToggleChat, onOpenSettings }: Props) {
  return (
    <div className="shrink-0 border-t border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-900 flex flex-col">
      <ModelSwitcher settings={settings} onUpdate={onUpdateSettings} />
      <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-t border-stone-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          aria-label={chatOpen ? 'Close chat' : 'Open chat'}
          className={`btn-icon ${chatOpen ? 'bg-stone-200 dark:bg-neutral-800' : ''}`}
          title={chatOpen ? 'Close chat' : 'Open chat'}
        >
          <MessageSquare aria-hidden className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open Settings"
          className="btn-icon"
          title="Open Settings (Ctrl+,)"
        >
          <SettingsIcon aria-hidden className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ModelSwitcher({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const adapter = getAdapter(settings.provider)
  const currentModel = settings.defaultModel[settings.provider]

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const root = containerRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setOpen(false)
    }
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex w-full justify-between items-center px-2 py-1.5 text-xs hover:bg-stone-200/50 dark:hover:bg-neutral-800/50"
        onClick={() => setOpen((v) => !v)}
        title="Quick model switcher"
      >
        <span className="truncate">{currentModel}</span>
        <ChevronDown aria-hidden className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-white dark:bg-neutral-900 border border-stone-200 dark:border-neutral-800 rounded-lg shadow-lg z-30 p-3 space-y-2">
          <div>
            <label htmlFor="sidebar-footer-provider" className="block text-xs uppercase tracking-wide opacity-60 mb-1">Provider</label>
            <select
              id="sidebar-footer-provider"
              className="input w-full"
              value={settings.provider}
              onChange={(e) => onUpdate({ provider: e.target.value as Provider })}
            >
              {adapterList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sidebar-footer-model" className="block text-xs uppercase tracking-wide opacity-60 mb-1">Model</label>
            <select
              id="sidebar-footer-model"
              className="input w-full"
              value={currentModel}
              onChange={(e) =>
                onUpdate({
                  defaultModel: { ...settings.defaultModel, [settings.provider]: e.target.value },
                })
              }
            >
              {adapter.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <p className="text-xs opacity-60 pt-1">
            Sets the default for this provider. Per-agent overrides (in Settings) are kept.
          </p>
        </div>
      )}
    </div>
  )
}
