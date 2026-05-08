import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { adapterList } from '../../../adapters'
import { PRICING, type ModelPricing } from '../../../config/pricing'
import { useModes } from '../../../hooks/useModes'
import type { Provider, Settings } from '../../../hooks/useSettings'
import { importBackup } from '../../../lib/backup'
import { useDialogs } from '../../../lib/dialogs'
import { AppearanceSection } from '../AppearanceSection'

interface Props {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
  onExportBackup: () => void
}

interface SectionDef {
  id: string
  title: string
  keywords: string[]
  body: ReactNode
}

export function SettingsTab(props: Props) {
  const { settings, onUpdate, onExportBackup } = props
  const { modes } = useModes()

  const [keyVisible, setKeyVisible] = useState(false)
  const [filter, setFilter] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const dialogs = useDialogs()
  const [openModes, setOpenModes] = useState<Record<string, boolean>>({})

  const provider = settings.provider
  const adapter = adapterList.find((a) => a.id === provider)

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ok = await dialogs.confirm({
      title: 'Import backup?',
      message: 'Importing will overwrite all current settings, document, history, and API keys. Continue?',
      confirmLabel: 'Import',
      danger: true,
    })
    if (!ok) return
    try {
      await importBackup(file)
      alert('Backup restored. Reloading…')
      location.reload()
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [dialogs])

  const sections: SectionDef[] = useMemo(() => [
    {
      id: 'provider-keys',
      title: 'Provider & Keys',
      keywords: ['provider', 'api', 'key', 'anthropic', 'openai', 'streaming', 'tokens', 'model'],
      body: (
        <>
          <Field label="Provider">
            <select
              className="input"
              value={settings.provider}
              onChange={(e) => onUpdate({ provider: e.target.value as Provider })}
            >
              {adapterList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>

          <Field label={`${adapter?.name ?? ''} API key`}>
            <div className="flex gap-2">
              <input
                type={keyVisible ? 'text' : 'password'}
                className="input flex-1"
                value={settings.apiKeys[provider] ?? ''}
                placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                onChange={(e) =>
                  onUpdate({ apiKeys: { ...settings.apiKeys, [provider]: e.target.value } })
                }
              />
              <button type="button" className="btn-secondary" onClick={() => setKeyVisible((v) => !v)}>
                {keyVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              Stored in browser localStorage. Calls go directly from your browser to {adapter?.name}.
            </p>
          </Field>

          <Field label="Default model">
            <select
              className="input"
              value={settings.defaultModel[provider]}
              onChange={(e) =>
                onUpdate({ defaultModel: { ...settings.defaultModel, [provider]: e.target.value } })
              }
            >
              {adapter?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>

          <Field label="Streaming">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.streaming}
                onChange={(e) => onUpdate({ streaming: e.target.checked })}
              />
              Enable streaming responses
            </label>
          </Field>

          <Field label="Stream chunk delay">
            <select
              className="input"
              value={settings.streamChunkDelayMs}
              onChange={(e) => onUpdate({ streamChunkDelayMs: Number(e.target.value) as 0 | 50 | 100 | 200 })}
            >
              <option value={0}>Off</option>
              <option value={50}>Slow (50ms)</option>
              <option value={100}>Slower (100ms)</option>
              <option value={200}>Slowest (200ms)</option>
            </select>
            <p className="text-xs text-muted mt-1">
              Pace streaming output for reading along. Off by default.
            </p>
          </Field>

          <Field label={`Max output tokens: ${settings.maxOutputTokens[provider]}`}>
            <input
              type="range"
              min={1024}
              max={32768}
              step={512}
              value={settings.maxOutputTokens[provider]}
              onChange={(e) =>
                onUpdate({
                  maxOutputTokens: {
                    ...settings.maxOutputTokens,
                    [provider]: Number(e.target.value),
                  },
                })
              }
              className="w-full"
            />
            <p className="text-xs text-muted mt-1">
              Bigger selections need a bigger budget. If responses get cut off, raise this.
            </p>
          </Field>

          <Field label="Chat tool budget per message">
            <input
              type="number"
              min={1}
              max={50}
              value={settings.chatToolBudget}
              onChange={(e) => {
                const n = Math.max(1, Math.min(50, Number(e.target.value) || 10))
                onUpdate({ chatToolBudget: n })
              }}
              className="input w-24"
            />
            <p className="text-xs text-muted mt-1">
              How many tool rounds the model may take per chat message before being asked to finalise. Default 10.
            </p>
          </Field>
        </>
      ),
    },
    {
      id: 'modes-actions',
      title: 'Modes & actions',
      keywords: ['mode', 'action', 'config', 'yaml', 'edit', 'prompt', 'profile'],
      body: (
        <>
          <p className="text-sm text-muted mb-2">
            Edit, add, or remove modes by editing the YAML files in your config folder.
            Restart Canv after editing.
          </p>
          {typeof window !== 'undefined' && window.canvConfig && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void window.canvConfig!.revealFolder()}
            >
              Open config folder
            </button>
          )}
        </>
      ),
    },
    {
      id: 'agent-models',
      title: 'Per-action model overrides',
      keywords: ['agent', 'action', 'model', 'mode', 'override'],
      body: (
        <div data-testid="per-agent-model">
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={settings.useDefaultModelForAll}
              onChange={(e) => onUpdate({ useDefaultModelForAll: e.target.checked })}
            />
            Use default model for all actions
          </label>
          {!settings.useDefaultModelForAll && adapter && (
            <div className="space-y-4">
              {modes.map((mode) => {
                const open = openModes[mode.id] ?? false
                return (
                  <div key={mode.id}>
                    <button
                      type="button"
                      onClick={() => setOpenModes((prev) => ({ ...prev, [mode.id]: !open }))}
                      aria-expanded={open}
                      className="w-full flex items-center gap-1 text-sm font-medium mb-2 hover:text-default"
                    >
                      {open ? <ChevronDown aria-hidden className="w-3 h-3" /> : <ChevronRight aria-hidden className="w-3 h-3" />}
                      <mode.icon aria-hidden className="w-3.5 h-3.5" />
                      {mode.label}
                    </button>
                    {open && (
                      <div className="space-y-2">
                        {mode.actions.map((a) => (
                          <Field key={a.id} label={<span className="flex items-center gap-1"><a.icon aria-hidden className="w-3.5 h-3.5" />{a.label}</span>}>
                            <select
                              className="input"
                              value={settings.perAgentModel[mode.id]?.[a.id] ?? settings.defaultModel[provider]}
                              onChange={(e) =>
                                onUpdate({
                                  perAgentModel: {
                                    ...settings.perAgentModel,
                                    [mode.id]: {
                                      ...(settings.perAgentModel[mode.id] ?? {}),
                                      [a.id]: e.target.value,
                                    },
                                  },
                                })
                              }
                            >
                              {adapter.models.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </Field>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'model-pricing',
      title: 'Model pricing',
      keywords: ['cost', 'pricing', 'price', 'tokens', 'model', 'override'],
      body: (
        <>
          <p className="text-xs text-muted mb-2">
            USD per 1M tokens. Edit to override the default for a model. Reset removes the override.
          </p>
          <div className="space-y-1.5">
            {(adapter?.models ?? []).map((m) => {
              const def: ModelPricing = PRICING[m] ?? { input: 0, output: 0 }
              const ov = settings.pricingOverrides[m]
              const cur: ModelPricing = ov ?? def
              const isOverride = !!ov
              const setField = (field: 'input' | 'output', val: number) => {
                const next: ModelPricing = { ...cur, [field]: val }
                onUpdate({ pricingOverrides: { ...settings.pricingOverrides, [m]: next } })
              }
              const reset = () => {
                const rest = { ...settings.pricingOverrides }
                delete rest[m]
                onUpdate({ pricingOverrides: rest })
              }
              return (
                <div key={m} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 font-mono truncate">{m}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-20 text-right"
                    value={cur.input}
                    onChange={(e) => setField('input', Number(e.target.value))}
                    aria-label={`${m} input price per 1M`}
                  />
                  <span className="text-subtle">in</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-20 text-right"
                    value={cur.output}
                    onChange={(e) => setField('output', Number(e.target.value))}
                    aria-label={`${m} output price per 1M`}
                  />
                  <span className="text-subtle">out</span>
                  {isOverride ? (
                    <button type="button" className="btn-ghost text-xs" onClick={reset} aria-label={`reset ${m} pricing`}>reset</button>
                  ) : (
                    <span className="w-12" />
                  )}
                </div>
              )
            })}
          </div>
        </>
      ),
    },
    {
      id: 'editor',
      title: 'Editor',
      keywords: ['editor', 'line', 'width'],
      body: (
        <div data-testid="typography-controls">
          <Field label="Line width">
            <div className="flex gap-1">
              {(['narrow', 'normal', 'wide'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onUpdate({ lineWidth: w })}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-md ${
                    settings.lineWidth === w
                      ? 'bg-[rgb(var(--text-default))] text-[rgb(var(--bg-app))]'
                      : 'bg-active hover:bg-hover'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </Field>
        </div>
      ),
    },
    {
      id: 'streaming',
      title: 'Streaming',
      keywords: ['streaming', 'slow', 'mode', 'chunk', 'delay', 'auto', 'scroll', 'follow'],
      body: (
        <div data-testid="streaming-controls" className="space-y-3">
          <Field label="Slow-mode delay">
            <div className="flex gap-1" role="radiogroup" aria-label="Stream chunk delay">
              {([0, 50, 100, 200] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={settings.streamChunkDelayMs === d}
                  onClick={() => onUpdate({ streamChunkDelayMs: d })}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-md ${
                    settings.streamChunkDelayMs === d
                      ? 'bg-[rgb(var(--text-default))] text-[rgb(var(--bg-app))]'
                      : 'bg-active hover:bg-hover'
                  }`}
                >
                  {d}ms
                </button>
              ))}
            </div>
            <p className="text-xs text-subtle mt-1">
              Optional pause between streamed chunks. 0 = stream as fast as the model emits.
            </p>
          </Field>
          <Field label="Auto-scroll chat">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoScroll}
                aria-label="Auto-scroll chat to latest message"
                onClick={() => onUpdate({ autoScroll: !settings.autoScroll })}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                  settings.autoScroll ? 'bg-accent' : 'bg-hover'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-elev transition-transform ${
                    settings.autoScroll ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm text-muted">
                {settings.autoScroll ? 'Following latest message during streaming' : 'Viewport stays put'}
              </span>
            </div>
          </Field>
        </div>
      ),
    },
    {
      id: 'backup',
      title: 'Backup & Restore',
      keywords: ['backup', 'restore', 'export', 'import', 'json'],
      body: (
        <>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={onExportBackup}>
              Export backup
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => importInputRef.current?.click()}
            >
              Import backup
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            Saves all settings, document, history and chat to a JSON file. Includes API keys — keep the file secure.
          </p>
        </>
      ),
    },
    {
      id: 'problems',
      title: 'Problems',
      keywords: ['problems', 'lint', 'broken', 'links', 'front', 'matter', 'heading', 'image'],
      body: (
        <>
          <p className="text-xs text-muted mb-3">
            Toggle which structural lint rules run over open files and the workspace.
          </p>
          {([
            ['brokenLinks',  'Broken markdown links'],
            ['frontMatter',  'Front-matter (malformed YAML)'],
            ['headingSkip',  'Heading-level skips'],
            ['deadImages',   'Dead image references'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={settings.lintRules[key]}
                onChange={(e) => onUpdate({
                  lintRules: { ...settings.lintRules, [key]: e.target.checked },
                })}
              />
              <span>{label}</span>
            </label>
          ))}
        </>
      ),
    },
  ], [settings, onUpdate, adapter, provider, keyVisible, modes, onExportBackup, openModes, setOpenModes, handleImportFile])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return sections
    return sections.filter((s) =>
      s.title.toLowerCase().includes(q) || s.keywords.some((k) => k.includes(q)),
    )
  }, [sections, filter])

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <header className="shrink-0 px-6 pt-5 pb-3 border-b border-default">
        <h1 className="text-base font-semibold mb-3">Settings</h1>
        <input
          type="search"
          className="input w-full"
          placeholder="Search settings (e.g. api key, font, theme)…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <section className="panel-section" data-testid="settings-section-appearance">
          <AppearanceSection
            settings={{ theme: settings.theme, accent: settings.accent, fontSize: settings.fontSize }}
            onUpdate={onUpdate}
          />
        </section>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted">No settings match "{filter}".</p>
        ) : (
          filtered.map((s) => (
            <Section key={s.id} id={s.id} title={s.title}>
              {s.body}
            </Section>
          ))
        )}
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="panel-section" data-testid={`settings-section-${id}`}>
      <h3 className="text-xs uppercase tracking-wide text-muted mb-3">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}
