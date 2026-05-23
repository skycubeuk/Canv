import { useState, useEffect } from 'react'

type SettingDef =
  | { key: string; type: 'string'; default?: string; label?: string; description?: string; max?: number }
  | { key: string; type: 'number'; default?: number; label?: string; description?: string; min?: number; max?: number; step?: number }
  | { key: string; type: 'boolean'; default?: boolean; label?: string; description?: string }
  | { key: string; type: 'enum'; options: string[]; default?: string; label?: string; description?: string }
  | { key: string; type: 'color'; default?: string; label?: string; description?: string }
  | { key: string; type: 'multiline'; default?: string; label?: string; description?: string }
  | { key: string; type: 'path'; default?: string; label?: string; description?: string }

interface Props {
  settings: SettingDef[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}

export function ExtensionSettingsForm({ settings, values, onChange }: Props) {
  if (settings.length === 0) {
    return <div className="px-3 py-2 text-subtle text-xs">No settings</div>
  }
  return (
    <div className="px-3 py-2 flex flex-col gap-3">
      {settings.map((s) => <SettingField key={s.key} def={s} value={values[s.key]} onChange={onChange} />)}
    </div>
  )
}

function SettingField({ def, value, onChange }: { def: SettingDef; value: unknown; onChange: (key: string, value: unknown) => void }) {
  const label = def.label || def.key
  const id = `ext-setting-${def.key}`

  if (def.type === 'boolean') {
    const v = typeof value === 'boolean' ? value : (def.default ?? false)
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-xs">
        <span className="flex-1 text-muted">{label}</span>
        <input id={id} type="checkbox" checked={v} onChange={(e) => onChange(def.key, e.target.checked)} />
      </label>
    )
  }
  if (def.type === 'enum') {
    const v = typeof value === 'string' ? value : (def.default ?? def.options[0])
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-xs">
        <span className="flex-1 text-muted">{label}</span>
        <select id={id} value={v} onChange={(e) => onChange(def.key, e.target.value)} className="input flex-1">
          {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    )
  }
  if (def.type === 'color') {
    const v = typeof value === 'string' ? value : (def.default ?? '#000000')
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-xs">
        <span className="flex-1 text-muted">{label}</span>
        <input id={id} type="color" value={v} onChange={(e) => onChange(def.key, e.target.value)} />
      </label>
    )
  }
  if (def.type === 'number') {
    return <NumberField id={id} label={label} def={def} value={value} onChange={onChange} />
  }
  if (def.type === 'multiline') {
    return <MultilineField id={id} label={label} def={def} value={value} onChange={onChange} />
  }
  // string, path
  return <TextField id={id} label={label} def={def} value={value} onChange={onChange} />
}

function NumberField({ id, label, def, value, onChange }: { id: string; label: string; def: Extract<SettingDef, { type: 'number' }>; value: unknown; onChange: (key: string, value: unknown) => void }) {
  const initial = typeof value === 'number' ? value : (def.default ?? 0)
  const [local, setLocal] = useState<string>(String(initial))
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop→local when value changes
  useEffect(() => { setLocal(String(typeof value === 'number' ? value : (def.default ?? 0))) }, [value, def.default])
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs">
      <span className="flex-1 text-muted">{label}</span>
      <input
        id={id} type="number"
        min={def.min} max={def.max} step={def.step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { const n = Number(local); if (!Number.isNaN(n)) onChange(def.key, n) }}
        className="input flex-1"
      />
    </label>
  )
}

function TextField({ id, label, def, value, onChange }: { id: string; label: string; def: Extract<SettingDef, { type: 'string' | 'path' }>; value: unknown; onChange: (key: string, value: unknown) => void }) {
  const initial = typeof value === 'string' ? value : (def.default ?? '')
  const [local, setLocal] = useState(initial)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop→local when value changes
  useEffect(() => { setLocal(typeof value === 'string' ? value : (def.default ?? '')) }, [value, def.default])
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs">
      <span className="flex-1 text-muted">{label}</span>
      <input
        id={id} type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(def.key, local)}
        className="input flex-1"
      />
    </label>
  )
}

function MultilineField({ id, label, def, value, onChange }: { id: string; label: string; def: Extract<SettingDef, { type: 'multiline' }>; value: unknown; onChange: (key: string, value: unknown) => void }) {
  const initial = typeof value === 'string' ? value : (def.default ?? '')
  const [local, setLocal] = useState(initial)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop→local when value changes
  useEffect(() => { setLocal(typeof value === 'string' ? value : (def.default ?? '')) }, [value, def.default])
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-xs">
      <span className="flex-1 text-muted">{label}</span>
      <textarea
        id={id} rows={3}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(def.key, local)}
        className="input flex-1 resize-y"
      />
    </label>
  )
}
