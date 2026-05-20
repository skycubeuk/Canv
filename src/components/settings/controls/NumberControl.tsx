interface Props {
  value: number
  onChange: (v: number) => void
  label: string
  help?: string
  min?: number
  max?: number
  step?: number
}

export function NumberControl({ value, onChange, label, help, min, max, step = 1 }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {help && <span className="text-xs text-muted">{help}</span>}
      <input
        type="number"
        className="input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}
