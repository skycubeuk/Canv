interface Props {
  value: boolean
  onChange: (v: boolean) => void
  label: string
  help?: string
}

export function SwitchControl({ value, onChange, label, help }: Props) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm py-1">
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {help && <span className="text-xs text-muted">{help}</span>}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
