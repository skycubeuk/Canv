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

/** Resolve the "what gets used right now" provider+model pair from the settings
 *  shape. Falls back to the first configured provider when the user's chosen
 *  default provider has no API key. Returns the provider's model from
 *  `defaultModel`, clamped to the adapter's models list when it's stale (e.g.
 *  a previously-saved Anthropic model name still sitting on the openai entry
 *  before postProcess catches up). */
function resolveEffectivePair(settings: Settings): { provider: Provider; model: string; configured: boolean } {
  const configuredIds = new Set<Provider>(configuredProviders(settings))
  const configured = configuredIds.has(settings.provider)
  const provider: Provider = configured
    ? settings.provider
    : ((adapterList.find((a) => configuredIds.has(a.id as Provider))?.id as Provider | undefined) ?? settings.provider)
  const models = provider === 'ollama' ? settings.ollamaModels : getAdapter(provider).models
  const candidate = settings.defaultModel[provider]
  const model = models.length === 0
    ? candidate
    : (models.includes(candidate) ? candidate : (models[0] ?? candidate))
  return { provider, model, configured }
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
  const effective = resolveEffectivePair(settings)
  const currentModel = effective.model
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
        const visibleProviders = adapterList.filter((a) => configuredIds.has(a.id as Provider))
        const nothingConfigured = visibleProviders.length === 0
        // settings.provider may point at an unconfigured provider (e.g. user
        // removed the API key after first run). Dropdown displays the
        // effective provider's pair so the controls reflect what's actually
        // in use; the chosen provider is left intact in settings so the user's
        // earlier preference is remembered if they re-add the key.
        const displayProvider: Provider = effective.provider
        const displayModels = nothingConfigured
          ? []
          : (displayProvider === 'ollama'
              ? settings.ollamaModels
              : getAdapter(displayProvider).models)
        // The <select> `value` must read from defaultModel[displayProvider] so
        // user clicks in the dropdown are reflected back. Reading from a
        // hard-coded `displayModels[0]` previously made every click look like
        // a no-op even though the update persisted correctly.
        const persistedForProvider = settings.defaultModel[displayProvider]
        const displayModel = displayModels.length === 0
          ? ''
          : (displayModels.includes(persistedForProvider) ? persistedForProvider : displayModels[0])
        return (
          <div className="absolute left-0 right-0 bottom-full mb-1 bg-elev border border-default rounded-lg shadow-lg z-30 p-3 space-y-2">
            <div>
              <label htmlFor="sidebar-footer-provider" className="block text-xs uppercase tracking-wide text-subtle mb-1">Provider</label>
              <select
                id="sidebar-footer-provider"
                className="input w-full"
                value={nothingConfigured ? '' : displayProvider}
                disabled={nothingConfigured}
                onChange={(e) => onUpdate({ provider: e.target.value as Provider })}
              >
                {nothingConfigured ? (
                  <option disabled value="">Add a key in Settings</option>
                ) : (
                  visibleProviders.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label htmlFor="sidebar-footer-model" className="block text-xs uppercase tracking-wide text-subtle mb-1">Model</label>
              <select
                id="sidebar-footer-model"
                className="input w-full"
                value={displayModel}
                disabled={nothingConfigured}
                onChange={(e) =>
                  onUpdate({
                    defaultModel: { ...settings.defaultModel, [displayProvider]: e.target.value },
                  })
                }
              >
                {displayModels.length === 0 ? (
                  <option disabled value="">
                    {nothingConfigured ? 'Add a key in Settings' : 'Refresh in Settings'}
                  </option>
                ) : (
                  displayModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))
                )}
              </select>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
