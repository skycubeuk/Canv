import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Settings, Provider } from '../../../hooks/useSettings'
import { adapterList, getAdapter, configuredProviders } from '../../../adapters'

interface Props {
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
  workspaceName: string | null
}

export function SidebarFooter({ settings, onUpdateSettings, workspaceName }: Props) {
  return (
    <div className="shrink-0 border-t border-default bg-elev">
      <WorkspaceSwitcherButton
        settings={settings}
        onUpdate={onUpdateSettings}
        workspaceName={workspaceName}
      />
    </div>
  )
}

function WorkspaceSwitcherButton({
  settings,
  onUpdate,
  workspaceName,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
  workspaceName: string | null
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const adapter = getAdapter(settings.provider)
  const currentModel = settings.defaultModel[settings.provider]
  const rawName = workspaceName
    ? (Math.max(workspaceName.lastIndexOf('/'), workspaceName.lastIndexOf('\\')) >= 0
        ? workspaceName.slice(Math.max(workspaceName.lastIndexOf('/'), workspaceName.lastIndexOf('\\')) + 1)
        : workspaceName)
    : null
  const displayName = rawName || 'No workspace'
  const initial = (displayName[0] || '?').toUpperCase()

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
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-default hover:bg-hover transition-colors"
        title="Workspace and model"
      >
        <span
          aria-hidden
          className="w-[22px] h-[22px] rounded-md bg-accent-soft text-accent grid place-items-center font-semibold text-[11px]"
        >
          {initial}
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block truncate font-medium">{displayName}</span>
          <span className="block truncate text-[10.5px] text-subtle">{currentModel}</span>
        </span>
        <ChevronDown aria-hidden className="w-3 h-3 shrink-0 text-subtle" />
      </button>
      {open && (() => {
        const configuredIds = new Set<Provider>(configuredProviders(settings))
        configuredIds.add(settings.provider) // keep the current selection visible even if its key was removed
        const visibleProviders = configuredIds.size > 0
          ? adapterList.filter((a) => configuredIds.has(a.id as Provider))
          : adapterList // empty-state fallback so the picker isn't empty
        return (
          <div className="absolute left-0 right-0 bottom-full mb-1 bg-elev border border-default rounded-lg shadow-lg z-30 p-3 space-y-2">
            <div>
              <label htmlFor="sidebar-footer-provider" className="block text-xs uppercase tracking-wide text-subtle mb-1">Provider</label>
              <select
                id="sidebar-footer-provider"
                className="input w-full"
                value={settings.provider}
                onChange={(e) => onUpdate({ provider: e.target.value as Provider })}
              >
                {visibleProviders.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sidebar-footer-model" className="block text-xs uppercase tracking-wide text-subtle mb-1">Model</label>
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
                {(settings.provider === 'ollama' && settings.ollamaModels.length
                  ? settings.ollamaModels
                  : adapter.models
                ).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
