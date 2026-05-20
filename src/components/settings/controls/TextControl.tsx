interface Props {
  value: string
  onChange: (v: string) => void
  label: string
  help?: string
  placeholder?: string
  type?: 'text' | 'url' | 'password'
}

export function TextControl({ value, onChange, label, help, placeholder, type = 'text' }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {help && <span className="text-xs text-muted">{help}</span>}
      <input
        type={type}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
