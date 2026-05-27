import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { adapterList, configuredProviders } from '../../../adapters'
import { ollamaAdapter } from '../../../adapters/ollama'
import { PRICING, pricingKey, type ModelPricing } from '../../../config/pricing'
import { useModes } from '../../../hooks/useModes'
import type { Provider, Settings } from '../../../hooks/useSettings'
import { importBackup } from '../../../lib/backup'
import { useDialogs } from '../../../lib/dialogs'
import { getTts, isTtsAvailable } from '../../../lib/tts'
import { AppearanceSection } from '../AppearanceSection'
import { SchemaSettingsForm } from '../../settings/SchemaSettingsForm'
import { SettingsSchema } from '../../../hooks/settingsSchema'

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

  type OllamaStatus =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; count: number }
    | { kind: 'error'; message: string }

  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ kind: 'idle' })

  const refreshOllamaModels = useCallback(async () => {
    const url = settings.baseUrls?.ollama
    if (!url) {
      setOllamaStatus({ kind: 'error', message: 'Set a base URL first.' })
      return
    }
    setOllamaStatus({ kind: 'loading' })
    try {
      const names = await ollamaAdapter.listModels!(url)
      onUpdate({ ollamaModels: names })
      setOllamaStatus({ kind: 'ok', count: names.length })
    } catch (err) {
      setOllamaStatus({ kind: 'error', message: (err as Error).message || String(err) })
    }
  }, [settings.baseUrls?.ollama, onUpdate])

  const provider = settings.provider

  const handleFactoryReset = useCallback(async () => {
    const ok = await dialogs.confirm({
      title: 'Factory reset Canv?',
      message:
        'This wipes ALL settings, API keys, chat history, runs, recent workspaces, and your custom modes/actions. The app reloads as if freshly installed. This cannot be undone — export a backup first if you want a way back.',
      confirmLabel: 'Wipe everything',
      danger: true,
    })
    if (!ok) return
    const confirmation = await dialogs.prompt({
      title: 'Type RESET to confirm',
      message: 'Final check. Type RESET (capitals) to erase everything.',
      submitLabel: 'Erase',
      validate: (v) => (v.trim() === 'RESET' ? null : 'Type RESET exactly.'),
    })
    if (confirmation === null) return
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k) keys.push(k)
      }
      for (const k of keys) localStorage.removeItem(k)
      try { sessionStorage.clear() } catch { /* sessionStorage may be unavailable */ }
      if (typeof window !== 'undefined' && window.canvConfig?.factoryReset) {
        await window.canvConfig.factoryReset()
      }
    } finally {
      location.reload()
    }
  }, [dialogs])

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
      title: 'API keys & endpoints',
      keywords: ['api', 'key', 'anthropic', 'openai', 'ollama', 'url', 'endpoint', 'base url', 'refresh', 'tts', 'elevenlabs', 'voice', 'read aloud', 'speech'],
      body: (
        <>
          <p className="text-xs text-muted mb-3">
            Switch the active provider and model from the workspace menu in the sidebar.
          </p>

          <Field label="Anthropic API key">
            <div className="flex gap-2">
              <input
                type={keyVisible ? 'text' : 'password'}
                className="input flex-1"
                value={settings.apiKeys.anthropic ?? ''}
                placeholder="sk-ant-…"
                onChange={(e) =>
                  onUpdate({ apiKeys: { ...settings.apiKeys, anthropic: e.target.value } })
                }
              />
              <button type="button" className="btn-secondary" onClick={() => setKeyVisible((v) => !v)}>
                {keyVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              Stored in browser localStorage. Calls go directly from your browser to Anthropic.
            </p>
          </Field>

          <Field label="OpenAI API key">
            <div className="flex gap-2">
              <input
                type={keyVisible ? 'text' : 'password'}
                className="input flex-1"
                value={settings.apiKeys.openai ?? ''}
                placeholder="sk-…"
                onChange={(e) =>
                  onUpdate({ apiKeys: { ...settings.apiKeys, openai: e.target.value } })
                }
              />
              <button type="button" className="btn-secondary" onClick={() => setKeyVisible((v) => !v)}>
                {keyVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              Stored in browser localStorage. Calls go directly from your browser to OpenAI.
            </p>
          </Field>

          {/* Read aloud (ElevenLabs) */}
          <Field label="Read aloud (ElevenLabs) — API key">
            <div className="flex gap-2">
              <input
                type={keyVisible ? 'text' : 'password'}
                className="input flex-1"
                value={settings.tts.apiKey ?? ''}
                placeholder="ElevenLabs API key"
                onChange={(e) => onUpdate({ tts: { ...settings.tts, apiKey: e.target.value } })}
              />
              <button type="button" className="btn-secondary" onClick={() => setKeyVisible((v) => !v)}>
                {keyVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              Stored in browser localStorage. Calls go through the desktop app to ElevenLabs.
            </p>
          </Field>

          <TtsVoiceModelFields settings={settings} onUpdate={onUpdate} />

          <Field label="Ollama base URL">
            <input
              type="text"
              className="input"
              placeholder="http://localhost:11434"
              value={settings.baseUrls?.ollama ?? ''}
              onChange={(e) =>
                onUpdate({ baseUrls: { ...settings.baseUrls, ollama: e.target.value } })
              }
            />
            <p className="text-xs text-muted mt-1">
              If Ollama is running locally but Canv can't reach it, set{' '}
              <code>OLLAMA_ORIGINS=*</code> in the environment where you launch{' '}
              <code>ollama serve</code>.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={refreshOllamaModels}
                disabled={ollamaStatus.kind === 'loading' || !settings.baseUrls?.ollama}
              >
                {ollamaStatus.kind === 'loading' ? 'Refreshing…' : 'Refresh models'}
              </button>
              <span className="text-xs text-muted">
                {ollamaStatus.kind === 'ok' && `Connected · ${ollamaStatus.count} models`}
                {ollamaStatus.kind === 'error' &&
                  `Could not reach Ollama at ${settings.baseUrls?.ollama ?? ''} — ${ollamaStatus.message}`}
              </span>
            </div>
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
          {!settings.useDefaultModelForAll && (
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
                        {mode.actions.map((a) => {
                          const ref = settings.perAgentModel[mode.id]?.[a.id]
                            ?? { provider, model: settings.defaultModel[provider] }
                          const configuredIds = new Set<Provider>(configuredProviders(settings))
                          const visibleAdapters = configuredIds.size > 0
                            ? adapterList.filter((ad) => configuredIds.has(ad.id as Provider))
                            : adapterList
                          // Clamp the picker's value to a visible option so React doesn't warn
                          // about a value with no matching <option>. The underlying ref in
                          // perAgentModel is never overwritten here — only the displayed value.
                          const refVisible = visibleAdapters.some((ad) => ad.id === ref.provider)
                          const fallbackAdapter = visibleAdapters[0]
                          const fallbackModels = fallbackAdapter?.id === 'ollama'
                            ? settings.ollamaModels
                            : (fallbackAdapter?.models ?? [])
                          const selectValue = refVisible
                            ? `${ref.provider}/${ref.model}`
                            : (fallbackAdapter ? `${fallbackAdapter.id}/${fallbackModels[0] ?? ref.model}` : `${ref.provider}/${ref.model}`)
                          return (
                          <Field key={a.id} label={<span className="flex items-center gap-1"><a.icon aria-hidden className="w-3.5 h-3.5" />{a.label}</span>}>
                            <select
                              className="input"
                              value={selectValue}
                              onChange={(e) => {
                                const slash = e.target.value.indexOf('/')
                                const nextRef = slash > 0
                                  ? { provider: e.target.value.slice(0, slash) as Provider, model: e.target.value.slice(slash + 1) }
                                  : ref
                                onUpdate({
                                  perAgentModel: {
                                    ...settings.perAgentModel,
                                    [mode.id]: {
                                      ...(settings.perAgentModel[mode.id] ?? {}),
                                      [a.id]: nextRef,
                                    },
                                  },
                                })
                              }}
                            >
                              {visibleAdapters.map((ad) => {
                                const opts = ad.id === 'ollama'
                                  ? settings.ollamaModels
                                  : ad.models
                                return (
                                  <optgroup key={ad.id} label={ad.name}>
                                    {opts.map((m) => (
                                      <option key={`${ad.id}/${m}`} value={`${ad.id}/${m}`}>
                                        {ad.name} — {m}
                                      </option>
                                    ))}
                                  </optgroup>
                                )
                              })}
                            </select>
                          </Field>
                          )
                        })}
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
          <div className="space-y-3">
            {adapterList.map((ad) => {
              const models = ad.id === 'ollama' ? settings.ollamaModels : ad.models
              if (models.length === 0) return null
              return (
                <div key={ad.id}>
                  <div className="text-[11px] font-medium text-muted mb-1">{ad.name}</div>
                  <div className="space-y-1.5">
                    {models.map((m) => {
                      const key = pricingKey(ad.id as Provider, m)
                      const def: ModelPricing = PRICING[key] ?? { input: 0, output: 0 }
                      const ov = settings.pricingOverrides[key]
                      const cur: ModelPricing = ov ?? def
                      const isOverride = !!ov
                      const setField = (field: 'input' | 'output', val: number) => {
                        const next: ModelPricing = { ...cur, [field]: val }
                        onUpdate({ pricingOverrides: { ...settings.pricingOverrides, [key]: next } })
                      }
                      const reset = () => {
                        const rest = { ...settings.pricingOverrides }
                        delete rest[key]
                        onUpdate({ pricingOverrides: rest })
                      }
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 font-mono truncate">{m}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input w-20 text-right"
                            value={cur.input}
                            onChange={(e) => setField('input', Number(e.target.value))}
                            aria-label={`${ad.name} ${m} input price per 1M`}
                          />
                          <span className="text-subtle">in</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input w-20 text-right"
                            value={cur.output}
                            onChange={(e) => setField('output', Number(e.target.value))}
                            aria-label={`${ad.name} ${m} output price per 1M`}
                          />
                          <span className="text-subtle">out</span>
                          {isOverride ? (
                            <button type="button" className="btn-ghost text-xs" onClick={reset} aria-label={`reset ${ad.name} ${m} pricing`}>reset</button>
                          ) : (
                            <span className="w-12" />
                          )}
                        </div>
                      )
                    })}
                  </div>
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
                      ? 'bg-inverse text-inverse-fg'
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
      title: 'Generation',
      keywords: ['streaming', 'slow', 'mode', 'chunk', 'delay', 'auto', 'scroll', 'follow', 'tokens', 'max', 'output', 'generation', 'budget', 'tool', 'rounds'],
      body: (
        <div data-testid="streaming-controls" className="space-y-3">
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
                      ? 'bg-inverse text-inverse-fg'
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
          {(['anthropic', 'openai', 'ollama'] as const).map((p) => (
            <Field key={p} label={`Max output tokens · ${p}: ${settings.maxOutputTokens[p]}`}>
              <input
                type="range"
                min={1024}
                max={32768}
                step={512}
                value={settings.maxOutputTokens[p]}
                onChange={(e) =>
                  onUpdate({
                    maxOutputTokens: { ...settings.maxOutputTokens, [p]: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </Field>
          ))}
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
        </div>
      ),
    },
    {
      id: 'mcp-servers',
      title: 'MCP servers',
      keywords: ['mcp', 'model context protocol', 'tools', 'server', 'integration', 'stdio', 'http'],
      body: (
        <SchemaSettingsForm
          schema={SettingsSchema}
          value={settings}
          // `Settings` narrows perAgentModel / pricingOverrides post-process; the
          // schema's raw inferred shape is wider. The auto-gen form only ever
          // emits patches for fields with meta.ui === 'auto', which are all in
          // the structurally compatible subset — cast is safe.
          onChange={(patch) => onUpdate(patch as Partial<Settings>)}
          sectionFilter={(section) => section === 'mcp'}
        />
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
      id: 'factory-reset',
      title: 'Factory reset',
      keywords: ['factory', 'reset', 'wipe', 'erase', 'clear', 'danger', 'fresh', 'install', 'nuke'],
      body: (
        <>
          <p className="text-xs text-muted mb-2">
            Erase ALL settings, API keys, chats, runs, recent workspaces, and custom modes/actions.
            Canv reloads as if freshly installed. Export a backup first if you want a way back.
          </p>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-danger text-white hover:opacity-90"
            onClick={handleFactoryReset}
            data-testid="factory-reset-button"
          >
            Factory reset Canv
          </button>
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
  ], [settings, onUpdate, provider, keyVisible, modes, onExportBackup, openModes, setOpenModes, handleImportFile, handleFactoryReset, ollamaStatus, refreshOllamaModels])

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
            settings={{
              theme: settings.theme as import('../../../lib/themes').ThemeId,
              fontSize: settings.fontSize,
              chatFontSize: settings.chatFontSize,
            }}
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

function TtsVoiceModelFields({ settings, onUpdate }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => void }) {
  const [voices, setVoices] = useState<{ voiceId: string; name: string }[]>([])
  const [models, setModels] = useState<{ modelId: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const key = settings.tts.apiKey
  const provider = settings.tts.provider

  const load = useCallback(async () => {
    if (!isTtsAvailable() || !key) return
    setLoading(true)
    try {
      const [v, m] = await Promise.all([getTts().voices(provider, key), getTts().models(provider, key)])
      setVoices(v); setModels(m)
    } catch { /* surfaced on next generate */ } finally { setLoading(false) }
  }, [provider, key])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- setState calls are inside an async callback, not synchronously in the effect body
  useEffect(() => { void load() }, [load])

  if (!key) return <p className="text-xs text-muted">Enter a key to load voices and models.</p>
  return (
    <>
      <Field label="Default voice">
        <select className="input" value={settings.tts.defaultVoiceId}
          onChange={(e) => {
            const v = voices.find((x) => x.voiceId === e.target.value)
            onUpdate({ tts: { ...settings.tts, defaultVoiceId: e.target.value, defaultVoiceName: v?.name ?? '' } })
          }}>
          <option value="">{loading ? 'Loading…' : 'Select a voice'}</option>
          {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="Default model">
        <select className="input" value={settings.tts.defaultModelId}
          onChange={(e) => onUpdate({ tts: { ...settings.tts, defaultModelId: e.target.value } })}>
          {models.length === 0 && <option value="eleven_multilingual_v2">eleven_multilingual_v2</option>}
          {models.map((m) => <option key={m.modelId} value={m.modelId}>{m.name}</option>)}
        </select>
        <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => void load()}>Refresh voices</button>
      </Field>
    </>
  )
}
