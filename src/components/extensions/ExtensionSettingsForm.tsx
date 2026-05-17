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
    return <div style={{ padding: '8px 12px', color: 'var(--text-color-subtle)', fontSize: 12 }}>No settings</div>
  }
  return (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      <label htmlFor={id} style={rowStyle}>
        <span style={labelStyle}>{label}</span>
        <input id={id} type="checkbox" checked={v} onChange={(e) => onChange(def.key, e.target.checked)} />
      </label>
    )
  }
  if (def.type === 'enum') {
    const v = typeof value === 'string' ? value : (def.default ?? def.options[0])
    return (
      <label htmlFor={id} style={rowStyle}>
        <span style={labelStyle}>{label}</span>
        <select id={id} value={v} onChange={(e) => onChange(def.key, e.target.value)} style={inputStyle}>
          {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    )
  }
  if (def.type === 'color') {
    const v = typeof value === 'string' ? value : (def.default ?? '#000000')
    return (
      <label htmlFor={id} style={rowStyle}>
        <span style={labelStyle}>{label}</span>
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
    <label htmlFor={id} style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        id={id} type="number"
        min={def.min} max={def.max} step={def.step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { const n = Number(local); if (!Number.isNaN(n)) onChange(def.key, n) }}
        style={inputStyle}
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
    <label htmlFor={id} style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        id={id} type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(def.key, local)}
        style={inputStyle}
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
    <label htmlFor={id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
      <span style={labelStyle}>{label}</span>
      <textarea
        id={id} rows={3}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(def.key, local)}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
    </label>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
}
const labelStyle: React.CSSProperties = {
  flex: 1, color: 'var(--text-color-muted)',
}
const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--bg-app, var(--color-panel))',
  color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)',
  borderRadius: 4, padding: '4px 6px', font: 'inherit',
}
